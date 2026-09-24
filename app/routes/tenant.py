from datetime import datetime, timezone
from typing import Annotated
from urllib.parse import unquote, urlparse

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo.errors import DuplicateKeyError

from app.database.mongo import products, tenants
from app.services.store_currency import currency_fields_for_tenant
from app.services.store_schedule import normalize_store_hours, resolve_store_hours
from app.services.storefront_layout import build_storefront_layout
from app.services.cache import invalidate_tenant
from app.models.tenant import (
    CreateTenant,
    RegisterStore,
    SendStoreSignupOtpRequest,
    UpdateTenant,
    UpdateTenantTheme,
)
from app.routes.detail_messages import (
    INVALID_TENANT_ID,
    NO_UPDATE_FIELDS,
    TENANT_NOT_FOUND,
)
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    FORBIDDEN_RESPONSE,
    INTERNAL_SERVER_ERROR_RESPONSE,
    NOT_FOUND_RESPONSE,
)
from app.services.store_signup_otp_service import (
    consume_store_signup_otp,
    send_store_signup_otp,
)
from app.services import rate_limit
from app.services.billing_service import is_store_operational
from app.services.store_analytics import public_store_analytics
from app.services.tenant_service import (
    NOT_DELETED,
    TENANT_SECRET_PROJECTION,
    available_tenant_id,
    create_tenant_document,
    soft_delete_tenant,
    strip_tenant_secrets,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    require_admin,
    require_permission,
    require_store_owner,
    require_super_admin,
)
from app.utils.category_catalog import _first_product_image
from app.utils.hash import hash_password
from app.utils.phone_normalization import (
    PhoneNormalizationError,
    normalize_phone,
)
from app.utils.jwt_handler import create_token
from app.utils.product_serialize import _resolve_image_for_response

VALID_BUSINESS_TYPES = frozenset({"retail", "service", "menu"})


def _safe_resolve_image(value: str | None) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        resolved = _resolve_image_for_response(value.strip())
    except Exception:
        return value.strip()
    return resolved or None


def _normalize_business_type(value: object) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in VALID_BUSINESS_TYPES:
        return normalized
    return "retail"


def _normalize_tenant_phone(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        return normalize_phone(raw, country="India")
    except PhoneNormalizationError as error:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid WhatsApp number with country code, for example 9198XXXXXXXX.",
        ) from error


def _normalize_stored_logo(value: object) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    from app.services.s3_service import is_s3_object_key

    if is_s3_object_key(raw):
        return raw
    if raw.startswith("http://") or raw.startswith("https://"):
        path = unquote(urlparse(raw).path).lstrip("/")
        if is_s3_object_key(path):
            return path
        return raw
    return raw


def _serialize_tenant(tenant: dict) -> dict:
    """Public tenant payload: strip secrets and always expose businessType."""
    payload = strip_tenant_secrets(tenant)
    if "_id" in payload:
        payload["_id"] = str(payload["_id"])
    payload["businessType"] = _normalize_business_type(payload.get("businessType"))
    payload["phone"] = str(payload.get("phone") or "").strip()
    payload["email"] = str(payload.get("email") or "").strip()
    raw_logo = payload.get("logo") if isinstance(payload.get("logo"), str) else ""
    payload["logo"] = _safe_resolve_image(raw_logo) or ""
    payload.update(currency_fields_for_tenant(payload))
    hours = resolve_store_hours(payload.get("storeHours"))
    hours["images"] = [
        resolved
        for item in hours.get("images") or []
        if (resolved := _safe_resolve_image(item) or item)
    ]
    payload["storeHours"] = hours
    return payload


# Admin-only fields that `_serialize_tenant` includes but shoppers must never
# see: what the store pays the platform, and its subscription standing.
_STOREFRONT_PRIVATE_FIELDS = ("billing", "platformCommissionPercent")


def _public_storefront_tenant(tenant: dict) -> dict:
    """Tenant payload for the public storefront (no auth).

    Shoppers only learn whether the store is currently available — not why
    it isn't (a trial that ended, an unpaid subscription, etc.).
    """
    payload = _serialize_tenant(tenant)
    for field in _STOREFRONT_PRIVATE_FIELDS:
        payload.pop(field, None)
    payload["storeAvailable"] = is_store_operational(tenant)
    payload["analytics"] = public_store_analytics(tenant)
    return payload


def _public_tenant_preview(tenant: dict) -> dict:
    tenant_id = str(tenant.get("tenantId") or "")
    product_query = {
        "tenantId": tenant_id,
        "isActive": True,
    }
    product_count = products.count_documents(product_query)
    preview_images: list[str] = []
    for product in products.find(product_query).sort("createdAt", -1).limit(8):
        raw = _first_product_image(product.get("images"))
        resolved = _safe_resolve_image(raw)
        if resolved and resolved not in preview_images:
            preview_images.append(resolved)
        if len(preview_images) >= 4:
            break

    theme_colors = tenant.get("themeColors") or {}
    accent = None
    if isinstance(theme_colors, dict):
        accent = theme_colors.get("primary") or theme_colors.get("secondary")

    logo = _safe_resolve_image(tenant.get("logo") if isinstance(tenant.get("logo"), str) else None)
    cover = preview_images[0] if preview_images else logo

    return {
        "tenantId": tenant_id,
        "slug": tenant.get("slug"),
        "name": tenant.get("name"),
        "businessType": _normalize_business_type(tenant.get("businessType")),
        "logo": logo,
        "theme": tenant.get("theme") or "Custom",
        "accent": accent or "#7c3aed",
        "productCount": int(product_count),
        "coverImage": cover,
        "previewImages": preview_images,
        "dataIsolation": "Fully Isolated",
    }


router = APIRouter(
    prefix="/tenants",
    tags=["Tenants"],
)


@router.post(
    "/",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def create_tenant(
    tenant: CreateTenant,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    try:
        response_data = create_tenant_document(
            tenant_id=tenant.tenantId,
            name=tenant.name,
            slug=tenant.slug,
            email=str(tenant.email),
            password=tenant.password,
            business_type=tenant.businessType,
            logo=_normalize_stored_logo(tenant.logo or ""),
            theme=tenant.theme or "green",
            phone=tenant.phone or "",
            display_currency=tenant.displayCurrency or "INR",
            inr_per_unit=tenant.inrPerUnit,
        )
        return {
            "success": True,
            "message": "Tenant created successfully.",
            "tenantId": response_data["tenantId"],
            "id": response_data["_id"],
            "data": _serialize_tenant(response_data),
        }
    except HTTPException:
        raise
    except Exception as e:
        print("CREATE TENANT ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create tenant.",
        )


@router.post(
    "/register/send-otp",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def send_store_register_otp(payload: SendStoreSignupOtpRequest, request: Request):
    """WhatsApp a one-time code before public store signup."""
    rate_limit.hit(
        "store_otp_ip",
        rate_limit.client_ip(request),
        limit=10,
        window_seconds=rate_limit.HOUR,
    )
    rate_limit.hit(
        "store_otp_email",
        str(payload.email),
        limit=5,
        window_seconds=rate_limit.HOUR,
    )
    return send_store_signup_otp(str(payload.email), payload.phone)


@router.post(
    "/register",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        500: INTERNAL_SERVER_ERROR_RESPONSE[500],
    },
)
def register_store(payload: RegisterStore, request: Request):
    """Public self-serve store creation (no super-admin required)."""
    rate_limit.hit(
        "store_register_ip",
        rate_limit.client_ip(request),
        limit=20,
        window_seconds=rate_limit.HOUR,
    )
    try:
        consume_store_signup_otp(str(payload.email), payload.otp, payload.phone)
        slug = payload.slug.strip().lower()
        # Self-serve: tenantId matches slug for simple storefront URLs, unless a
        # deleted store already used that tenantId.
        response_data = create_tenant_document(
            tenant_id=available_tenant_id(slug),
            name=payload.name,
            slug=slug,
            email=str(payload.email),
            password=payload.password,
            business_type=payload.businessType,
            logo="",
            theme="green",
            phone=payload.phone or "",
        )
        token = create_token(
            {
                "userId": response_data["_id"],
                "tenantId": response_data["tenantId"],
                "tenantMongoId": response_data["_id"],
                "email": response_data["email"],
                "role": "admin",
                "name": response_data["name"],
            }
        )
        return {
            "success": True,
            "message": "Store created successfully.",
            "access_token": token,
            "token_type": "Bearer",
            "tenantId": response_data["tenantId"],
            "slug": response_data["slug"],
            "data": _serialize_tenant(response_data),
            "user": {
                "userId": response_data["_id"],
                "name": response_data["name"],
                "email": response_data["email"],
                "tenantId": response_data["tenantId"],
                "role": "admin",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print("REGISTER STORE ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to create store.",
        )


@router.get("/", responses={403: FORBIDDEN_RESPONSE[403]})
def get_tenants(
    current_user: Annotated[dict, Depends(require_admin)],
):


    if current_user.get("role") == "super_admin":
        query = dict(NOT_DELETED)


    else:
        tenant_id = current_user.get(
            "tenantId"
        )
        if not tenant_id:
            raise HTTPException(
                status_code=403,
                detail="Tenant ID missing.",
            )
        query = {
            "tenantId": tenant_id
        }
    cursor = tenants.find(
        query
    ).sort(
        "createdAt",
        -1,
    )
    data = []
    for tenant in cursor:
        data.append(_serialize_tenant(tenant))
    return {
        "success": True,
        "count": len(data),
        "data": data,
    }


@router.get(
    "/tenant-id/{tenant_id}",
    responses={
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_tenant_by_tenant_id(
    tenant_id: str,
    current_user: Annotated[dict, Depends(require_admin)],
):
    normalized_tenant_id = tenant_id.strip().lower()


    if (
        current_user.get("role") != "super_admin"
        and current_user.get("tenantId") != normalized_tenant_id
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot access another tenant.",
        )
    tenant = tenants.find_one({
        "tenantId": normalized_tenant_id,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    return {
        "success": True,
        "data": _serialize_tenant(tenant),
    }


@router.get("/slug/{slug}", responses={404: NOT_FOUND_RESPONSE[404]})
def get_tenant_by_slug(
    slug: str,
):
    normalized_slug = slug.strip().lower()
    tenant = tenants.find_one({
        "slug": normalized_slug,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    serialized = _public_storefront_tenant(tenant)
    storefront_layout = build_storefront_layout(tenant)
    return {
        "success": True,
        "data": {
            **serialized,
            "storefrontLayout": storefront_layout,
        },
    }


@router.get(
    "/slug/{slug}/storefront-layout",
    responses={404: NOT_FOUND_RESPONSE[404]},
)
def get_storefront_layout_by_slug(
    slug: str,
):
    normalized_slug = slug.strip().lower()
    tenant = tenants.find_one({
        "slug": normalized_slug,
        "isActive": True,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    tenant = strip_tenant_secrets(tenant)
    tenant["_id"] = str(tenant["_id"])
    layout = build_storefront_layout(tenant)
    return {
        "success": True,
        "data": {
            "tenantId": tenant.get("tenantId"),
            "slug": tenant.get("slug"),
            "name": tenant.get("name"),
            "businessType": _normalize_business_type(tenant.get("businessType")),
            "_id": tenant["_id"],
            **layout,
        },
    }


@router.get("/public")
def get_public_tenants():
    """Active tenants for marketing / welcome demos (no auth, no secrets)."""
    try:
        cursor = tenants.find(
            {"isActive": True},
            {
                **TENANT_SECRET_PROJECTION,
                "email": 0,
                "adminEmail": 0,
            },
        ).sort("createdAt", -1)

        data = []
        for tenant in cursor:
            if not is_store_operational(tenant):
                continue
            try:
                data.append(_public_tenant_preview(tenant))
            except Exception as preview_error:
                print("PUBLIC TENANT PREVIEW ERROR:", str(preview_error))
                data.append(
                    {
                        "tenantId": str(tenant.get("tenantId") or ""),
                        "slug": tenant.get("slug"),
                        "name": tenant.get("name") or "Store",
                        "businessType": _normalize_business_type(
                            tenant.get("businessType")
                        ),
                        "logo": None,
                        "theme": tenant.get("theme") or "Custom",
                        "accent": "#7c3aed",
                        "productCount": 0,
                        "coverImage": None,
                        "previewImages": [],
                        "dataIsolation": "Fully Isolated",
                    }
                )

        return {
            "success": True,
            "count": len(data),
            "data": data,
        }
    except Exception as e:
        print("PUBLIC TENANTS ERROR:", str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to load public tenants.",
        )


@router.get(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def get_tenant_by_id(
    id: str,
    current_user: Annotated[dict, Depends(require_admin)],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )
    tenant = tenants.find_one({
        "_id": object_id,
        **NOT_DELETED,
    })
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )


    if (
        current_user.get("role") != "super_admin"
        and current_user.get("tenantId") != tenant.get("tenantId")
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot access another tenant.",
        )
    return {
        "success": True,
        "data": _serialize_tenant(tenant),
    }


@router.put(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_tenant(
    id: str,
    tenant: UpdateTenant,
    current_user: Annotated[dict, Depends(require_store_owner)],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )
    existing_tenant = tenants.find_one({"_id": object_id, **NOT_DELETED})
    if not existing_tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    if (
        current_user.get("role") != "super_admin"
        and current_user.get("tenantId") != existing_tenant.get("tenantId")
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot update another tenant.",
        )
    update_data = tenant.model_dump(
        exclude_unset=True
    )
    if "isActive" in update_data and current_user.get("role") != "super_admin":
        # Only the platform can switch a store on or off. An owner who
        # deactivated their own store would be locked out of it (their
        # login stops working), so the edit form's unchanged value is
        # ignored and an actual change is refused.
        if bool(update_data["isActive"]) != bool(existing_tenant.get("isActive", True)):
            raise HTTPException(
                status_code=403,
                detail="Only the platform admin can activate or deactivate a store.",
            )
        update_data.pop("isActive")
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail=NO_UPDATE_FIELDS,
        )


    if "name" in update_data:
        update_data["name"] = (
            update_data["name"].strip()
        )
    if "slug" in update_data:
        update_data["slug"] = (
            update_data["slug"]
            .strip()
            .lower()
        )
    if "email" in update_data:
        update_data["email"] = (
            str(update_data["email"])
            .strip()
            .lower()
        )
    if "phone" in update_data:
        update_data["phone"] = _normalize_tenant_phone(update_data.get("phone"))
    if "logo" in update_data:
        update_data["logo"] = _normalize_stored_logo(update_data.get("logo"))
    if "storeHours" in update_data:
        hours = normalize_store_hours(update_data.get("storeHours"))
        hours["images"] = [
            _normalize_stored_logo(item) for item in hours.get("images") or []
        ]
        hours["images"] = [item for item in hours["images"] if item]
        update_data["storeHours"] = hours
    if "analytics" in update_data:
        # Merge so a partial update keeps the other id; values were
        # already validated by the StoreAnalytics model.
        current_analytics = existing_tenant.get("analytics")
        current_analytics = current_analytics if isinstance(current_analytics, dict) else {}
        update_data["analytics"] = {
            "ga4MeasurementId": current_analytics.get("ga4MeasurementId"),
            "metaPixelId": current_analytics.get("metaPixelId"),
            **(update_data.get("analytics") or {}),
        }
    if "displayCurrency" in update_data or "inrPerUnit" in update_data:
        merged = {**existing_tenant, **update_data}
        update_data.update(currency_fields_for_tenant(merged))


    if "businessType" in update_data:
        update_data["businessType"] = _normalize_business_type(
            update_data.get("businessType")
        )

    if "slug" in update_data:
        existing = tenants.find_one({
            "slug": update_data["slug"],
            "_id": {
                "$ne": object_id
            },
        })
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Tenant slug already exists.",
            )


    if "email" in update_data:
        existing = tenants.find_one({
            "email": update_data["email"],
            "_id": {
                "$ne": object_id
            },
        })
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Tenant email already exists.",
            )


    if "password" in update_data:
        update_data["password"] = hash_password(
            update_data["password"]
        )


    update_data["updatedAt"] = datetime.now(timezone.utc)


    try:
        result = tenants.update_one(
            {
                "_id": object_id
            },
            {
                "$set": update_data
            },
        )
    except DuplicateKeyError:
        raise HTTPException(
            status_code=400,
            detail="That store URL or email is already taken.",
        )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    invalidate_tenant(existing_tenant.get("tenantId"))
    updated = tenants.find_one({
        "_id": object_id
    })
    return {
        "success": True,
        "message": "Tenant updated successfully.",
        "data": _serialize_tenant(updated),
    }


@router.patch(
    "/{id}/theme",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def update_tenant_theme(
    id: str,
    payload: UpdateTenantTheme,
    current_user: Annotated[dict, Depends(require_permission("layout"))],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )

    tenant = tenants.find_one({"_id": object_id, **NOT_DELETED})
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )

    if (
        current_user.get("role") != "super_admin"
        and current_user.get("tenantId") != tenant.get("tenantId")
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot update another tenant's theme.",
        )

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No theme fields provided for update.",
        )

    update_data["updatedAt"] = datetime.now(timezone.utc)

    result = tenants.update_one(
        {"_id": object_id},
        {"$set": update_data},
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )

    invalidate_tenant(tenant.get("tenantId"))
    updated = tenants.find_one({"_id": object_id})
    return {
        "success": True,
        "message": "Theme updated successfully.",
        "data": _serialize_tenant(updated),
    }


@router.delete(
    "/{id}",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def delete_tenant(
    id: str,
    current_user: Annotated[dict, Depends(require_super_admin)],
):
    try:
        object_id = ObjectId(id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail=INVALID_TENANT_ID,
        )
    if not soft_delete_tenant(object_id):
        raise HTTPException(
            status_code=404,
            detail=TENANT_NOT_FOUND,
        )
    return {
        "success": True,
        "message": "Tenant deleted successfully.",
    }
