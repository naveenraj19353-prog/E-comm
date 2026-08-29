from contextlib import asynccontextmanager
import json
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo.errors import PyMongoError

from app.config import CORS_ORIGINS
from app.database.indexes import ensure_indexes
from app.database.mongo import client
from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.product import router as create_product_router
from app.routes.category import router as create_category_router
from app.routes.wishlist import router as wishlist_router
from app.routes.cart import router as cart_router
from app.routes.address import router as address_router
from app.routes.checkout import router as checkout_router
from app.routes.coupon import router as coupn_router
from app.routes.payment import router as payment_router
from app.routes.review import router as review_router
from app.routes.profile import router as profile_router
from app.routes.orders import router as orders_router
from app.routes.home import router as home_router
from app.routes.banner import router as banner_router
from app.routes.tenant import router as tenant_router
from app.routes.super_admin import router as super_admin_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_indexes()
        logger.info("Database indexes ensured.")
    except PyMongoError as error:
        logger.error("Database index setup failed: %s", error)
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(create_product_router)
app.include_router(create_category_router)
app.include_router(wishlist_router)
app.include_router(cart_router)
app.include_router(address_router)
app.include_router(checkout_router)
app.include_router(coupn_router)
app.include_router(payment_router)
app.include_router(review_router)
app.include_router(profile_router)
app.include_router(orders_router)
app.include_router(home_router)
app.include_router(banner_router)
app.include_router(tenant_router)
app.include_router(super_admin_router)


@app.get("/")
def health():
    database_status = "disconnected"
    try:
        client.admin.command("ping")
        database_status = "connected"
    except PyMongoError as error:
        logger.error("Database health check failed: %s", error)
    overall = "UP" if database_status == "connected" else "DEGRADED"
    return {
        "status": overall,
        "database": database_status,
    }
