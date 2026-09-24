from contextlib import asynccontextmanager
import json
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from starlette.concurrency import run_in_threadpool

from app.config import (
    CORS_ORIGIN_REGEX,
    CORS_ORIGINS,
    IS_PRODUCTION,
    RAZORPAY_WEBHOOK_SECRET,
    STORE_REQUESTS_PER_MINUTE,
    TRUSTED_PROXY_HOPS,
)
from app.database.indexes import ensure_indexes
from app.services import store_rate_limit
from app.database.mongo import client, tenants
from app.upload_limits import MAX_UPLOAD_BODY_BYTES, configure_upload_limits
from app import observability
from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.product import router as create_product_router
from app.routes.category import router as create_category_router
from app.routes.wishlist import router as wishlist_router
from app.routes.cart import router as cart_router
from app.routes.address import router as address_router
from app.routes.checkout import router as checkout_router
from app.routes.coupon import router as coupon_router
from app.routes.payment import router as payment_router
from app.routes.review import router as review_router
from app.routes.profile import router as profile_router
from app.routes.orders import router as orders_router
from app.routes.home import router as home_router
from app.routes.banner import router as banner_router
from app.routes.upload import router as upload_router
from app.routes.tenant import router as tenant_router
from app.routes.super_admin import router as super_admin_router
from app.routes.og import router as og_router
from app.routes.seo import router as seo_router
from app.routes.delhivery import router as delhivery_router
from app.routes.menu import router as menu_router
from app.routes.periskope import router as periskope_router
from app.routes.periskope_webhook import router as periskope_webhook_router
from app.routes.contact import router as contact_router
from app.routes.ledger import router as ledger_router
from app.routes.billing import router as billing_router

logger = logging.getLogger(__name__)

configure_upload_limits()
# Logging format/level + Sentry (no-op without SENTRY_DSN). Before FastAPI().
observability.setup()


def _warn_about_risky_production_config() -> None:
    """Loud startup warnings for settings that break things only in production."""
    if not IS_PRODUCTION:
        return
    if TRUSTED_PROXY_HOPS == 0:
        logger.warning(
            "TRUSTED_PROXY_HOPS is 0 in production. Behind Nginx/Render every visitor "
            "shares the proxy's IP, so per-IP login limits apply to the whole platform. "
            "Set it to the number of proxies that append to X-Forwarded-For."
        )
    if not RAZORPAY_WEBHOOK_SECRET:
        logger.warning(
            "RAZORPAY_WEBHOOK_SECRET is empty: /payments/webhook will reject every "
            "Razorpay event, so orders paid by customers who close the tab never get created."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _warn_about_risky_production_config()
    try:
        ensure_indexes()
        logger.info("Database indexes ensured.")
    except PyMongoError:
        logger.exception("Database index setup failed.")
    stop_shipment_sync = None
    try:
        from app.services.shipment_sync import start_shipment_sync_loop

        stop_shipment_sync = start_shipment_sync_loop()
    except Exception:
        logger.exception("Could not start the Delhivery shipment sync loop.")
    yield
    if stop_shipment_sync is not None:
        await stop_shipment_sync()


app = FastAPI(lifespan=lifespan)
if hasattr(app.router, "max_body_size"):
    app.router.max_body_size = MAX_UPLOAD_BODY_BYTES

def _tenant_is_inactive(tenant_id: str) -> bool:
    tenant = tenants.find_one(
        {"tenantId": tenant_id.strip().lower()}, {"isActive": 1}
    )
    return bool(tenant) and tenant.get("isActive") is False


@app.middleware("http")
async def hide_deactivated_stores(request: Request, call_next):
    """Anonymous catalog reads for a deactivated store get a 404.

    Public routes (products, home, categories, banners, reviews, ...) all take
    `tenantId` from the query string. Signed-in requests are left alone:
    customers and staff of an inactive store are already rejected by
    get_current_user, and a super admin may still inspect the store.
    """
    tenant_id = request.query_params.get("tenantId")
    if (
        tenant_id
        and request.method == "GET"
        and "authorization" not in request.headers
        and await run_in_threadpool(_tenant_is_inactive, tenant_id)
    ):
        return JSONResponse(
            status_code=404,
            content={"detail": "Store not found or inactive."},
        )
    return await call_next(request)


@app.middleware("http")
async def limit_requests_per_store(request: Request, call_next):
    """Cap each store's request rate so one busy store can't slow the rest."""
    if STORE_REQUESTS_PER_MINUTE > 0:
        store_key = store_rate_limit.store_key_for(request)
        if store_key:
            allowed, retry_after = store_rate_limit.limiter.allow(store_key)
            if not allowed:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "This store is getting too many requests. Please try again shortly."},
                    headers={"Retry-After": str(retry_after)},
                )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Request id + tenant context, access log, /metrics numbers. Added last so it is
# the outermost middleware and every other middleware sees the request id.
app.add_middleware(observability.ObservabilityMiddleware)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(create_product_router)
app.include_router(create_category_router)
app.include_router(wishlist_router)
app.include_router(cart_router)
app.include_router(address_router)
app.include_router(checkout_router)
app.include_router(coupon_router)
app.include_router(payment_router)
app.include_router(review_router)
app.include_router(profile_router)
app.include_router(orders_router)
app.include_router(home_router)
app.include_router(banner_router)
app.include_router(upload_router)
app.include_router(tenant_router)
app.include_router(super_admin_router)
app.include_router(og_router)
app.include_router(seo_router)
app.include_router(delhivery_router)
app.include_router(menu_router)
app.include_router(periskope_router)
app.include_router(periskope_webhook_router)
app.include_router(contact_router)
app.include_router(ledger_router)
app.include_router(billing_router)
app.include_router(observability.metrics_router)


def _database_status() -> tuple[str, str | None]:
    try:
        client.admin.command("ping")
        return "connected", None
    except PyMongoError as error:
        logger.exception("Database health check failed.")
        message = str(error)
        hint = None
        if "TLSV1_ALERT_INTERNAL_ERROR" in message:
            hint = "Atlas blocked the connection. In MongoDB Atlas → Network Access, add 0.0.0.0/0 (and ::/0), wait 2–3 minutes, redeploy Render. Use a mongodb+srv:// URI with URL-encoded password."
        return "disconnected", hint


@app.get("/healthcheck")
@app.head("/healthcheck")
def healthcheck():
    """Lightweight liveness probe for Render (no database call)."""
    return {"status": "ok"}


@app.get("/")
@app.head("/")
@app.get("/health")
@app.head("/health")
def health():
    database_status, database_hint = _database_status()
    overall = "UP" if database_status == "connected" else "DEGRADED"
    payload = {
        "status": overall,
        "database": database_status,
    }
    if database_hint:
        payload["databaseHint"] = database_hint
    return payload
