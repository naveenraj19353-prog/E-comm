from fastapi import FastAPI

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

from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()


origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
    return {"status": "UP", "database": "MongoDB Connected"}
