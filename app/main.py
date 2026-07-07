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


app = FastAPI()

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


@app.get('/')
def health():
    return {
         "status": "UP",
        "database": "MongoDB Connected"
    }