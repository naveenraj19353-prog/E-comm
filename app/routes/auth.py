from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from secrets import token_urlsafe

from app.database.mongo import users
from app.models.user import RegisterUser, LoginUser, ForgotPasswordRequest
from app.utils.hash import hash_password, verify_password
from app.utils.jwt_handler import create_token
from app.utils.email_service import send_reset_email

router = APIRouter(prefix="/auth", tags=["Authentication"])


# -----------------------------------
# Register
# -----------------------------------
@router.post("/register")
def register(user: RegisterUser):

    existing = users.find_one({"tenantId": user.tenantId, "email": user.email})

    if existing:
        raise HTTPException(status_code=400, detail="Email already exists.")

    payload = {
        "tenantId": user.tenantId,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "password": hash_password(user.password),
        "role": "customer",
        "isActive": True,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }

    users.insert_one(payload)

    return {"success": True, "message": "Registration successful."}


# -----------------------------------
# Login
# -----------------------------------
@router.post("/login")
def login(user: LoginUser):

    print("LOGIN REQUEST RECEIVED")
    print("Email:", user.email)
    print("Tenant ID:", user.tenantId)

    if user.tenantId:
        print("TENANT LOGIN")

        existing = users.find_one({
            "tenantId": user.tenantId,
            "email": user.email,
            "isActive": True
        })

    else:
        print("SUPER ADMIN LOGIN")

        existing = users.find_one({
            "email": user.email,
            "tenantId": None,
            "role": "super_admin",
            "isActive": True
        })

    print("USER FOUND:", bool(existing))

    if not existing:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials."
        )

    print("VERIFYING PASSWORD")

    if not verify_password(
        user.password,
        existing["password"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials."
        )

    print("PASSWORD VERIFIED")

    token = create_token({
        "userId": str(existing["_id"]),
        "tenantId": existing.get("tenantId"),
        "email": existing["email"],
        "role": existing["role"],
    })

    print("TOKEN CREATED")

    return {
        "success": True,
        "access_token": token,
        "token_type": "Bearer",
        "user": {
            "userId": str(existing["_id"]),
            "name": existing.get("name"),
            "email": existing["email"],
            "tenantId": existing.get("tenantId"),
            "role": existing["role"],
        }
    }

# -----------------------------------
# Forgot Password
# -----------------------------------
@router.post("/forgot-password")
def forgot_password(user: ForgotPasswordRequest):

    existing = users.find_one(
        {"tenantId": user.tenantId, "email": user.email, "isActive": True}
    )

    if not existing:
        raise HTTPException(status_code=404, detail="User does not exist.")

    token = token_urlsafe(32)

    expiry = datetime.utcnow() + timedelta(minutes=15)

    users.update_one(
        {"_id": existing["_id"]},
        {
            "$set": {
                "resetToken": token,
                "resetTokenExpiry": expiry,
                "updatedAt": datetime.utcnow(),
            }
        },
    )

    reset_link = f"http://localhost:3000/reset-password?token={token}"

    send_reset_email(existing["email"], reset_link)

    return {"success": True, "message": "Password reset link sent successfully."}


@router.post("/create-super-admin")
def create_super_admin(user: RegisterUser):

    existing = users.find_one({
        "email": user.email
    })

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already exists."
        )

    payload = {
        "tenantId": None,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "password": hash_password(user.password),
        "role": "super_admin",
        "isActive": True,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }

    users.insert_one(payload)

    return {
        "success": True,
        "message": "Super Admin created successfully."
    }