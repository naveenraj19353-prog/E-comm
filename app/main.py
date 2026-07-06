from fastapi import FastAPI

from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.product import router as create_product
from app.routes.category import router as create_category

app = FastAPI()

app.include_router(auth_router)

app.include_router(users_router)

app.include_router(create_product)

app.include_router(create_category)

@app.get('/')
def health():
    return {
         "status": "UP",
        "database": "MongoDB Connected"
    }