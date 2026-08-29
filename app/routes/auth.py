from datetime import datetime
from fastapi import APIRouter, HTTPException
from app.database.mongo import users, tenants
from app.models.user import (
    RegisterUser,
    LoginUser,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.utils.hash import (
    hash_password,
    verify_password,
)
from app.utils.jwt_handler import create_token
from app.utils.email_service import send_reset_email
from app.services.password_reset_service import (
    build_reset_link,
    create_reset_token,
    reset_password_with_token,
    resolve_reset_account,
    save_reset_token,
)
router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post("/register")
def register(
    user: RegisterUser,
):
    tenant_id = user.tenantId.strip().lower()
    email = str(
        user.email
    ).strip().lower()


    tenant = tenants.find_one({
        "tenantId": tenant_id,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail="Tenant not found or inactive.",
        )


    existing = users.find_one({
        "tenantId": tenant_id,
        "email": email,
    })
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Email already exists.",
        )


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


@router.post("/login")
def login(
    user: LoginUser,
):
    email = str(
        user.email
    ).strip().lower()


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
            "userId": str(
                tenant["_id"]
            ),
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


@router.post("/forgot-password")
def forgot_password(
    user: ForgotPasswordRequest,
):
    account = resolve_reset_account(
        email=str(user.email),
        tenant_id=user.tenantId,
    )
    if not account:
        raise HTTPException(
            status_code=404,
            detail="User does not exist.",
        )

    token, expiry = create_reset_token()
    save_reset_token(
        account["collection"],
        account["document"]["_id"],
        token,
        expiry,
    )
    reset_link = build_reset_link(
        account["account_kind"],
        token,
        account.get("tenant_slug"),
    )
    send_reset_email(account["document"]["email"], reset_link)
    return {
        "success": True,
        "message": "Password reset link sent successfully.",
    }


@router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
):
    try:
        result = reset_password_with_token(
            payload.token.strip(),
            payload.password,
        )
    except HTTPException:
        raise
    except Exception as error:
        print("Reset password error:", str(error))
        raise HTTPException(
            status_code=500,
            detail="Unable to reset password.",
        )

    login_path = "/admin/login"
    if result["account_kind"] == "customer" and result.get("tenant_slug"):
        login_path = f"/{result['tenant_slug']}/login"

    return {
        "success": True,
        "message": "Password updated successfully.",
        "loginPath": login_path,
    }
