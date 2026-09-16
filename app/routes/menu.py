from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.services.menu_service import (
    get_daily_password_status,
    list_menu_carts,
    mark_menu_payment_done,
    rotate_daily_password,
    settle_menu_cart,
)
from app.routes.orders import _serialize_order
from app.routes.response_metadata import (
    BAD_REQUEST_RESPONSE,
    CONFLICT_RESPONSE,
    FORBIDDEN_RESPONSE,
    NOT_FOUND_RESPONSE,
    UNAUTHORIZED_RESPONSE,
)
from app.utils.auth_dependencies import admin_tenant_id, require_admin

router = APIRouter(prefix="/menu", tags=["Menu"])


@router.get(
    "/daily-password",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def daily_password_status(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    return get_daily_password_status(scoped)


@router.post(
    "/daily-password/rotate",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def daily_password_rotate(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    return rotate_daily_password(scoped)


@router.get(
    "/carts",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
    },
)
def menu_carts(
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    return list_menu_carts(scoped)


@router.post(
    "/carts/{user_id}/payment-done",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        409: CONFLICT_RESPONSE[409],
        401: UNAUTHORIZED_RESPONSE[401],
    },
)
def menu_cart_payment_done(
    user_id: str,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    result = settle_menu_cart(scoped, user_id)
    order = result.get("order") or {}
    return {
        "success": True,
        "message": result.get("message"),
        "order": _serialize_order(order),
    }


@router.post(
    "/orders/{order_id}/payment-done",
    responses={
        400: BAD_REQUEST_RESPONSE[400],
        403: FORBIDDEN_RESPONSE[403],
        404: NOT_FOUND_RESPONSE[404],
        401: UNAUTHORIZED_RESPONSE[401],
    },
)
def payment_done(
    order_id: str,
    current_user: Annotated[dict, Depends(require_admin)],
    tenant_id: Annotated[str | None, Query(alias="tenantId")] = None,
):
    scoped = admin_tenant_id(current_user, tenant_id)
    result = mark_menu_payment_done(scoped, order_id)
    order = result.get("order") or {}
    return {
        "success": True,
        "message": result.get("message"),
        "order": _serialize_order(order),
    }
