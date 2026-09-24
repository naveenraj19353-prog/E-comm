import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request
from pymongo.errors import DuplicateKeyError
from app.database.mongo import users, tenants
from app.models.user import (
    RegisterUser,
    LoginUser,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    CustomerOtpSendRequest,
    CustomerOtpVerifyRequest,
)
from app.models.menu import MenuLoginRequest
from app.services import customer_otp_service
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
from app.services.menu_service import (
    normalize_counter_number,
    normalize_phone,
    require_menu_tenant,
    upsert_menu_guest,
    verify_daily_password,
)
from app.services import rate_limit
from app.services.store_permissions import permissions_for_staff_doc
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
    UNAUTHORIZED_RESPONSE,
)
from app.routes.detail_messages import (
    INVALID_CREDENTIALS,
    TENANT_NOT_FOUND_OR_INACTIVE,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/register",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def register(
    user: RegisterUser,
    request: Request,
):
    rate_limit.hit(
        "register_ip",
        rate_limit.client_ip(request),
        limit=20,
        window_seconds=rate_limit.HOUR,
    )
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
            detail=TENANT_NOT_FOUND_OR_INACTIVE,
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


    now = datetime.now(timezone.utc)
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
    try:
        result = users.insert_one(
            payload
        )
    except DuplicateKeyError as exc:
        duplicate_fields = (exc.details or {}).get("keyPattern") or {}
        if "phone" in duplicate_fields:
            raise HTTPException(
                status_code=409,
                detail="This phone number is already registered. Sign in with your phone instead.",
            ) from exc
        raise HTTPException(
            status_code=400,
            detail="Email already exists.",
        ) from exc
    return {
        "success": True,
        "message": "Registration successful.",
        "userId": str(
            result.inserted_id
        ),
    }


LOGIN_WINDOW_SECONDS = 15 * rate_limit.MINUTE
LOGIN_FAILURES_PER_ACCOUNT = 10
LOGIN_FAILURES_PER_IP = 50


@router.post(
    "/login",
    responses={401: UNAUTHORIZED_RESPONSE[401], 429: {"description": "Too many failed attempts."}},
)
def login(
    user: LoginUser,
    request: Request,
):
    """Only *failed* attempts count toward the limits.

    Counting every attempt would let anyone who knows a store owner's email
    lock them out by typing wrong passwords, and would also block a real
    user who signs in often from several devices.
    """
    email = str(user.email).strip().lower()
    ip_key = rate_limit.client_ip(request)
    account_key = f"{str(user.tenantId or '').strip()}:{email}"
    rate_limit.ensure_not_blocked(
        "login_ip", ip_key, limit=LOGIN_FAILURES_PER_IP, window_seconds=LOGIN_WINDOW_SECONDS
    )
    rate_limit.ensure_not_blocked(
        "login_account", account_key, limit=LOGIN_FAILURES_PER_ACCOUNT, window_seconds=LOGIN_WINDOW_SECONDS
    )
    try:
        return _authenticate(user, email)
    except HTTPException as error:
        if error.status_code == 401:
            rate_limit.record_failure("login_ip", ip_key, window_seconds=LOGIN_WINDOW_SECONDS)
            rate_limit.record_failure("login_account", account_key, window_seconds=LOGIN_WINDOW_SECONDS)
        raise


def _authenticate(user: LoginUser, email: str) -> dict:
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
                detail=INVALID_CREDENTIALS,
            )
        if not verify_password(
            user.password,
            existing["password"],
        ):
            raise HTTPException(
                status_code=401,
                detail=INVALID_CREDENTIALS,
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
    # Nobody signs in to a deactivated store — not the owner, staff or
    # customers. Same message as a wrong password, so this can't be used to
    # probe which stores exist.
    if not tenants.find_one({"tenantId": tenant_id, "isActive": True}, {"_id": 1}):
        raise HTTPException(
            status_code=401,
            detail=INVALID_CREDENTIALS,
        )
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
                detail=INVALID_CREDENTIALS,
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

    manager = users.find_one({
        "tenantId": tenant_id,
        "email": email,
        "role": "store_manager",
        "isActive": True,
    })
    if manager:
        if not verify_password(
            user.password,
            manager["password"],
        ):
            raise HTTPException(
                status_code=401,
                detail=INVALID_CREDENTIALS,
            )
        manager_permissions = permissions_for_staff_doc(manager)
        token = create_token({
            "userId": str(
                manager["_id"]
            ),
            "tenantId": manager.get(
                "tenantId"
            ),
            "email": email,
            "role": "store_manager",
            "name": manager.get(
                "name"
            ),
            "permissions": manager_permissions,
        })
        return {
            "success": True,
            "access_token": token,
            "token_type": "Bearer",
            "user": {
                "userId": str(
                    manager["_id"]
                ),
                "name": manager.get(
                    "name"
                ),
                "email": email,
                "tenantId": manager.get(
                    "tenantId"
                ),
                "role": "store_manager",
                "permissions": manager_permissions,
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
            detail=INVALID_CREDENTIALS,
        )
    if not verify_password(
        user.password,
        existing["password"],
    ):
        raise HTTPException(
            status_code=401,
            detail=INVALID_CREDENTIALS,
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


@router.post(
    "/menu-login",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        401: UNAUTHORIZED_RESPONSE[401],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def menu_login(payload: MenuLoginRequest, request: Request):
    tenant_id = payload.tenantId.strip().lower()
    rate_limit.hit(
        "menu_login_ip",
        f"{tenant_id}:{rate_limit.client_ip(request)}",
        limit=15,
        window_seconds=15 * rate_limit.MINUTE,
    )
    rate_limit.hit(
        "menu_login_phone",
        f"{tenant_id}:{payload.phone}",
        limit=10,
        window_seconds=15 * rate_limit.MINUTE,
    )
    require_menu_tenant(tenant_id)
    phone = normalize_phone(payload.phone)
    counter_number = normalize_counter_number(payload.counterNumber)
    verify_daily_password(tenant_id, payload.password.strip())
    guest = upsert_menu_guest(tenant_id, phone, counter_number)
    token = create_token(
        {
            "userId": str(guest["_id"]),
            "tenantId": tenant_id,
            "email": guest.get("email"),
            "role": "customer",
            "name": guest.get("name") or f"Guest {phone[-4:]}",
            "phone": phone,
            "counterNumber": counter_number,
        }
    )
    return {
        "success": True,
        "access_token": token,
        "token_type": "Bearer",
        "user": {
            "userId": str(guest["_id"]),
            "name": guest.get("name"),
            "email": guest.get("email"),
            "tenantId": tenant_id,
            "role": "customer",
            "phone": phone,
            "counterNumber": counter_number,
        },
    }


OTP_SEND_PER_IP_PER_HOUR = 30
OTP_SEND_PER_PHONE_PER_HOUR = 10
OTP_VERIFY_WINDOW_SECONDS = 15 * rate_limit.MINUTE
OTP_VERIFY_PER_IP = 40
OTP_VERIFY_PER_PHONE = 15


@router.post(
    "/otp/send",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        402: {"description": "Store unavailable."},
        404: NOT_FOUND_RESPONSE[404],
        429: {"description": "Too many requests."},
    },
)
def send_customer_otp(payload: CustomerOtpSendRequest, request: Request):
    """Send a 6-digit WhatsApp code for storefront phone sign-in / guest checkout."""
    tenant_id = customer_otp_service.normalize_tenant(payload.tenantId)
    phone = customer_otp_service.normalize_customer_phone(payload.phone)
    rate_limit.hit(
        "customer_otp_send_ip",
        rate_limit.client_ip(request),
        limit=OTP_SEND_PER_IP_PER_HOUR,
        window_seconds=rate_limit.HOUR,
    )
    # Across every store, so one number can't be flooded via many storefronts.
    rate_limit.hit(
        "customer_otp_send_phone",
        phone,
        limit=OTP_SEND_PER_PHONE_PER_HOUR,
        window_seconds=rate_limit.HOUR,
    )
    return customer_otp_service.send_customer_otp(tenant_id, phone)


@router.post(
    "/otp/verify",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        402: {"description": "Store unavailable."},
        403: {"description": "Account disabled."},
        404: NOT_FOUND_RESPONSE[404],
        409: {"description": "Number belongs to a non-customer account."},
        429: {"description": "Too many requests."},
    },
)
def verify_customer_otp(payload: CustomerOtpVerifyRequest, request: Request):
    """Check the code and sign the customer in, creating their account if new.

    Response matches a customer `/auth/login`, plus `isNewCustomer`.
    """
    tenant_id = customer_otp_service.normalize_tenant(payload.tenantId)
    phone = customer_otp_service.normalize_customer_phone(payload.phone)
    rate_limit.hit(
        "customer_otp_verify_ip",
        rate_limit.client_ip(request),
        limit=OTP_VERIFY_PER_IP,
        window_seconds=OTP_VERIFY_WINDOW_SECONDS,
    )
    rate_limit.hit(
        "customer_otp_verify_phone",
        f"{tenant_id}:{phone}",
        limit=OTP_VERIFY_PER_PHONE,
        window_seconds=OTP_VERIFY_WINDOW_SECONDS,
    )
    customer_otp_service.require_otp_tenant(tenant_id)
    customer_otp_service.consume_customer_otp(tenant_id, phone, payload.otp)
    customer, created = customer_otp_service.find_or_create_phone_customer(
        tenant_id,
        phone,
        payload.name,
    )
    user_id = str(customer["_id"])
    email = customer.get("email")
    token = create_token({
        "userId": user_id,
        "tenantId": tenant_id,
        "email": email,
        "role": "customer",
        "name": customer.get("name"),
        "phone": phone,
    })
    return {
        "success": True,
        "access_token": token,
        "token_type": "Bearer",
        "isNewCustomer": created,
        "user": {
            "userId": user_id,
            "name": customer.get("name"),
            "email": email,
            "tenantId": tenant_id,
            "role": "customer",
            "phone": phone,
        },
    }


@router.post("/forgot-password", responses={404: NOT_FOUND_RESPONSE[404]})
def forgot_password(
    user: ForgotPasswordRequest,
    request: Request,
):
    rate_limit.hit(
        "forgot_password_ip",
        rate_limit.client_ip(request),
        limit=20,
        window_seconds=rate_limit.HOUR,
    )
    rate_limit.hit(
        "forgot_password_email",
        str(user.email),
        limit=5,
        window_seconds=rate_limit.HOUR,
    )
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


@router.post(
    "/reset-password",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
):
    rate_limit.hit(
        "reset_password_ip",
        rate_limit.client_ip(request),
        limit=20,
        window_seconds=15 * rate_limit.MINUTE,
    )
    try:
        result = reset_password_with_token(
            payload.token.strip(),
            payload.password,
        )
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Reset password error")
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
