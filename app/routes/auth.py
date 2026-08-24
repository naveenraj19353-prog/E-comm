from datetime import datetime, timedelta
from secrets import token_urlsafe
from fastapi import APIRouter, HTTPException
from app.database.mongo import users, tenants
from app.models.user import (
    RegisterUser,
    LoginUser,
    ForgotPasswordRequest,
)
from app.utils.hash import (
    hash_password,
    verify_password,
)
from app.utils.jwt_handler import create_token
from app.utils.email_service import send_reset_email
router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)
# ==========================================================
# REGISTER CUSTOMER
# ==========================================================
@router.post("/register")
def register(
    user: RegisterUser,
):
    tenant_id = user.tenantId.strip().lower()
    email = str(
        user.email
    ).strip().lower()
    # ------------------------------------------------------
    # CHECK TENANT
    # ------------------------------------------------------
    tenant = tenants.find_one({
        "tenantId": tenant_id,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found or inactive.",
        )
    # ------------------------------------------------------
    # CHECK CUSTOMER
    # ------------------------------------------------------
    existing = users.find_one({
        "tenantId": tenant_id,
        "email": email,
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already exists.",
        )
    # ------------------------------------------------------
    # CREATE CUSTOMER
    # ------------------------------------------------------
    now = datetime.utcnow()
    payload = {
        "tenantId": tenant_id,
        "name": user.name.strip(),
        "email": email,
        "phone": user.phone,
        "password": hash_password(
            user.password
        ),
        "role": "customer",
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    }
    result = users.insert_one(
        payload
    )
    return {
        "success": True,
        "message": "Registration successful.",
        "userId": str(
            result.inserted_id
        ),
    }
# ==========================================================
# LOGIN
#
# SUPER ADMIN
# TENANT ADMIN
# CUSTOMER
# ==========================================================
@router.post("/login")
def login(
    user: LoginUser,
):
    email = str(
        user.email
    ).strip().lower()
    # ======================================================
    # SUPER ADMIN LOGIN
    #
    # tenantId = null
    # ======================================================
    if not user.tenantId:
        existing = users.find_one({
            "email": email,
            "tenantId": None,
            "role": "super_admin",
            "isActive": True,
        })
        if not existing:
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials.",
            )
        if not verify_password(
            user.password,
            existing["password"],
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials.",
            )
        token = create_token({
            "userId": str(
                existing["_id"]
            ),
            "tenantId": None,
            "email": email,
            "role": "super_admin",
            "name": existing.get(
                "name"
            ),
        })
        return {
            "success": True,
            "access_token": token,
            "token_type": "Bearer",
            "user": {
                "userId": str(
                    existing["_id"]
                ),
                "name": existing.get(
                    "name"
                ),
                "email": email,
                "tenantId": None,
                "role": "super_admin",
            },
        }
    # ======================================================
    # TENANT LOGIN
    #
    # Tenant credentials are stored in tenants collection
    # ======================================================
    tenant_id = user.tenantId.strip().lower()
    tenant = tenants.find_one({
        "tenantId": tenant_id,
        "email": email,
        "isActive": True,
    })
    if tenant:
        if not verify_password(
            user.password,
            tenant["password"],
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials.",
            )
        token = create_token({
            # Tenant doesn't have a user ObjectId.
            # Use tenant MongoDB ID.
            "tenantId": tenant["tenantId"],
            "tenantMongoId": str(
                tenant["_id"]
            ),
            "email": tenant["email"],
            "role": "admin",
            "name": tenant["name"],
        })
        return {
            "success": True,
            "access_token": token,
            "token_type": "Bearer",
            "user": {
                "userId": str(
                    tenant["_id"]
                ),
                "name": tenant["name"],
                "email": tenant["email"],
                "tenantId": tenant["tenantId"],
                "role": "admin",
            },
        }
    # ======================================================
    # CUSTOMER LOGIN
    # ======================================================
    existing = users.find_one({
        "tenantId": tenant_id,
        "email": email,
        "role": "customer",
        "isActive": True,
    })
    if not existing:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials.",
        )
    if not verify_password(
        user.password,
        existing["password"],
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials.",
        )
    token = create_token({
        "userId": str(
            existing["_id"]
        ),
        "tenantId": existing.get(
            "tenantId"
        ),
        "email": email,
        "role": "customer",
        "name": existing.get(
            "name"
        ),
    })
    return {
        "success": True,
        "access_token": token,
        "token_type": "Bearer",
        "user": {
            "userId": str(
                existing["_id"]
            ),
            "name": existing.get(
                "name"
            ),
            "email": email,
            "tenantId": existing.get(
                "tenantId"
            ),
            "role": "customer",
        },
    }
# ==========================================================
# FORGOT PASSWORD
# ==========================================================
@router.post("/forgot-password")
def forgot_password(
    user: ForgotPasswordRequest,
):
    email = str(
        user.email
    ).strip().lower()
    query = {
        "email": email,
        "isActive": True,
    }
    if user.tenantId:
        query["tenantId"] = (
            user.tenantId.strip().lower()
        )
    else:
        query["tenantId"] = None
    existing = users.find_one(
        query
    )
    if not existing:
        raise HTTPException(
            status_code=404,
            detail="User does not exist.",
        )
    token = token_urlsafe(32)
    expiry = (
        datetime.utcnow()
        + timedelta(minutes=15)
    )
    users.update_one(
        {
            "_id": existing["_id"]
        },
        {
            "$set": {
                "resetToken": token,
                "resetTokenExpiry": expiry,
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    reset_link = (
        f"http://localhost:5173/"
        f"reset-password?token={token}"
    )
    send_reset_email(
        existing["email"],
        reset_link,
    )
    return {
        "success": True,
        "message": "Password reset link sent successfully.",
    }
# ==========================================================
# CREATE SUPER ADMIN
# ==========================================================
@router.post("/create-super-admin")
def create_super_admin(
    user: RegisterUser,
):
    email = str(
        user.email
    ).strip().lower()
    existing = users.find_one({
        "email": email
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already exists.",
        )
    now = datetime.utcnow()
    payload = {
        "tenantId": None,
        "name": user.name.strip(),
        "email": email,
        "phone": user.phone,
        "password": hash_password(
            user.password
        ),
        "role": "super_admin",
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    }
    result = users.insert_one(
        payload
    )
    return {
        "success": True,
        "message": "Super Admin created successfully.",
        "userId": str(
            result.inserted_id
        ),
    }
