from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from jose import JWTError, jwt
from bson import ObjectId
from app.database.mongo import users, tenants
from app.utils.jwt_handler import (
    SECRET_KEY,
    ALGORITHM,
)
security = HTTPBearer()
# ==========================================================
# GET CURRENT USER
# ==========================================================
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(
        security
    ),
):
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )
    role = payload.get("role")
    # ======================================================
    # SUPER ADMIN / CUSTOMER
    # ======================================================
    if role in [
        "super_admin",
        "customer",
    ]:
        user_id = payload.get(
            "userId"
        )
        if not user_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token.",
            )
        if not ObjectId.is_valid(
            user_id
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid user ID.",
            )
        user = users.find_one({
            "_id": ObjectId(user_id),
            "isActive": True,
        })
        if not user:
            raise HTTPException(
                status_code=401,
                detail="User not found or inactive.",
            )
        return {
            "userId": str(
                user["_id"]
            ),
            "tenantId": user.get(
                "tenantId"
            ),
            "name": user.get(
                "name"
            ),
            "email": user.get(
                "email"
            ),
            "phone": user.get(
                "phone"
            ),
            "role": user.get(
                "role"
            ),
            "isActive": user.get(
                "isActive",
                False,
            ),
        }
    # ======================================================
    # TENANT ADMIN
    # ======================================================
    if role == "admin":
        tenant_id = payload.get(
            "tenantId"
        )
        if not tenant_id:
            raise HTTPException(
                status_code=401,
                detail="Invalid tenant authentication.",
            )
        tenant = tenants.find_one({
            "tenantId": tenant_id,
            "isActive": True,
        })
        if not tenant:
            raise HTTPException(
                status_code=401,
                detail="Tenant not found or inactive.",
            )
        return {
            "userId": str(
                tenant["_id"]
            ),
            "tenantId": tenant[
                "tenantId"
            ],
            "name": tenant[
                "name"
            ],
            "email": tenant[
                "email"
            ],
            "role": "admin",
            "isActive": True,
        }
    raise HTTPException(
        status_code=401,
        detail="Invalid user role.",
    )
# ==========================================================
# REQUIRE SUPER ADMIN
# ==========================================================
def require_super_admin(
    current_user: dict = Depends(
        get_current_user
    ),
):
    if current_user.get(
        "role"
    ) != "super_admin":
        raise HTTPException(
            status_code=403,
            detail="Super Admin access required.",
        )
    if current_user.get(
        "tenantId"
    ) is not None:
        raise HTTPException(
            status_code=403,
            detail="Invalid Super Admin account.",
        )
    return current_user
# ==========================================================
# REQUIRE ADMIN
#
# Allows:
# super_admin
# tenant admin
# ==========================================================
def require_admin(
    current_user: dict = Depends(
        get_current_user
    ),
):
    if current_user.get(
        "role"
    ) not in [
        "admin",
        "super_admin",
    ]:
        raise HTTPException(
            status_code=403,
            detail="Admin access required.",
        )
    return current_user
# ==========================================================
# REQUIRE TENANT ADMIN
# ==========================================================
def require_tenant_admin(
    current_user: dict = Depends(
        get_current_user
    ),
):
    if current_user.get(
        "role"
    ) != "admin":
        raise HTTPException(
            status_code=403,
            detail="Tenant Admin access required.",
        )
    if not current_user.get(
        "tenantId"
    ):
        raise HTTPException(
            status_code=403,
            detail="Admin must belong to a tenant.",
        )
    return current_user
# ==========================================================
# REQUIRE CUSTOMER
# ==========================================================
def require_customer(
    current_user: dict = Depends(
        get_current_user
    ),
):
    if current_user.get(
        "role"
    ) != "customer":
        raise HTTPException(
            status_code=403,
            detail="Customer access required.",
        )
    if not current_user.get(
        "tenantId"
    ):
        raise HTTPException(
            status_code=403,
            detail="Customer must belong to a tenant.",
        )
    return current_user
