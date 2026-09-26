"""GST profile and tax invoicing endpoints.

Gating differs from the reference, which used a blanket require_admin. This app
has a finer-grained store-permission model, so the GST profile (store pricing
configuration) is gated on products_update and the invoice/credit-note lifecycle
on orders. require_permission already implies an admin-level account.
"""

from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database.mongo import credit_notes, invoices, orders, tax_profiles
from app.models.tax import (
    CreateCreditNoteRequest,
    IssueInvoiceRequest,
    TaxProfileUpsert,
)
from app.services.invoice_service import (
    create_credit_note,
    issue_invoice,
    serialize_document,
)
from app.utils.auth_dependencies import (
    admin_tenant_id,
    customer_scope,
    require_customer,
    require_permission,
)

router = APIRouter(prefix="/tax", tags=["Tax & Invoicing"])

ProfileAdmin = Annotated[dict, Depends(require_permission("products_update"))]
OrdersAdmin = Annotated[dict, Depends(require_permission("orders"))]


@router.get("/profile")
def get_profile(
    current_user: ProfileAdmin,
    tenantId: str | None = Query(default=None),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    return serialize_document(tax_profiles.find_one({"tenantId": tenant_id})) or {
        "tenantId": tenant_id,
        "enabled": False,
    }


@router.put("/profile")
def upsert_profile(body: TaxProfileUpsert, current_user: ProfileAdmin):
    tenant_id = admin_tenant_id(current_user, body.tenantId)
    payload = body.model_dump(exclude={"tenantId"})
    # A registration the tax invoice cannot legally carry is worse than no
    # registration, so these become mandatory the moment GST is switched on.
    if payload["enabled"] and (
        not payload["gstin"]
        or not payload["legalName"]
        or not (payload["stateCode"] or payload["state"])
    ):
        raise HTTPException(
            status_code=400,
            detail="legalName, GSTIN and supplier state are required when GST is enabled.",
        )
    tax_profiles.update_one(
        {"tenantId": tenant_id},
        {"$set": {**payload, "tenantId": tenant_id}},
        upsert=True,
    )
    return {
        "success": True,
        "profile": serialize_document(tax_profiles.find_one({"tenantId": tenant_id})),
    }


def _admin_order(order_id: str, tenant_id: str) -> dict:
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=400, detail="Invalid order id.")
    order = orders.find_one({"_id": ObjectId(order_id), "tenantId": tenant_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    return order


@router.post("/invoices/{order_id}")
def issue_order_invoice(
    order_id: str, body: IssueInvoiceRequest, current_user: OrdersAdmin
):
    tenant_id = admin_tenant_id(current_user, body.tenantId)
    return serialize_document(issue_invoice(_admin_order(order_id, tenant_id)))


@router.get("/invoices/{order_id}/admin")
def get_order_invoice_admin(
    order_id: str,
    current_user: OrdersAdmin,
    tenantId: str | None = Query(default=None),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    order = _admin_order(order_id, tenant_id)
    return serialize_document(
        invoices.find_one({"tenantId": tenant_id, "orderId": order["_id"]})
    ) or {"issued": False}


@router.get("/invoices/{order_id}")
def get_order_invoice_customer(
    order_id: str,
    current_user: Annotated[dict, Depends(require_customer)],
):
    tenant_id, user_id = customer_scope(current_user)
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=400, detail="Invalid order id.")
    user_oid = ObjectId(user_id) if ObjectId.is_valid(user_id) else user_id
    order = orders.find_one(
        {"_id": ObjectId(order_id), "tenantId": tenant_id, "userId": user_oid}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found.")
    invoice = invoices.find_one({"tenantId": tenant_id, "orderId": order["_id"]})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice has not been issued yet.")
    return serialize_document(invoice)


@router.post("/invoices/{order_id}/credit-notes")
def issue_credit_note(
    order_id: str, body: CreateCreditNoteRequest, current_user: OrdersAdmin
):
    tenant_id = admin_tenant_id(current_user, body.tenantId)
    order = _admin_order(order_id, tenant_id)
    invoice = invoices.find_one({"tenantId": tenant_id, "orderId": order["_id"]})
    if not invoice:
        raise HTTPException(
            status_code=409,
            detail="Issue the tax invoice before creating a credit note.",
        )
    return serialize_document(create_credit_note(invoice, body.reason, body.amount))


@router.get("/credit-notes/{order_id}")
def list_credit_notes(
    order_id: str,
    current_user: OrdersAdmin,
    tenantId: str | None = Query(default=None),
):
    tenant_id = admin_tenant_id(current_user, tenantId)
    order = _admin_order(order_id, tenant_id)
    return [
        serialize_document(note)
        for note in credit_notes.find(
            {"tenantId": tenant_id, "orderId": order["_id"]}
        ).sort("issuedAt", -1)
    ]
