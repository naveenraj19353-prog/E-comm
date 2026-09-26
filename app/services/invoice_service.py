"""Tax invoice and credit-note issuance.

Numbering is financial-year scoped and allocated with a single atomic Mongo
counter increment, so two concurrent checkouts can never be handed the same
number. Issuance is idempotent: the unique index on (tenantId, orderId) is the
real guarantee, and a duplicate-key race simply re-reads the existing invoice.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.database.mongo import counters, credit_notes, invoices, tax_profiles


def financial_year(now: datetime) -> str:
    """Indian financial year label, rolling over on 1 April."""
    year = now.year if now.month >= 4 else now.year - 1
    return f"{year}-{str(year + 1)[-2:]}"


def _next_number(tenant_id: str, prefix: str, kind: str, now: datetime) -> str:
    """Allocate the next document number, e.g. INV/2026-27/000001.

    The counter is scoped per store, per kind and per financial year, and is
    incremented atomically so numbers are unique under concurrency.
    """
    fy = financial_year(now)
    counter = counters.find_one_and_update(
        {"_id": f"{kind}:{tenant_id}:{fy}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f"{prefix}/{fy}/{int(counter['seq']):06d}"


def issue_invoice(order: dict) -> dict:
    """Issue (or return the already-issued) tax invoice for an order.

    Issuance is explicit rather than automatic: only the merchant knows when an
    order has reached the legal point at which they want to raise the invoice.
    """
    tenant_id = str(order.get("tenantId") or "").strip().lower()
    existing = invoices.find_one({"tenantId": tenant_id, "orderId": order["_id"]})
    if existing:
        return existing

    tax = order.get("tax") or {}
    if not tax.get("enabled"):
        raise HTTPException(
            status_code=409, detail="GST is not enabled for this store/order."
        )
    profile = tax_profiles.find_one({"tenantId": tenant_id})
    if not profile or not profile.get("gstin"):
        raise HTTPException(
            status_code=409,
            detail="Complete the store GST profile before issuing tax invoices.",
        )

    now = datetime.now(timezone.utc)
    invoice = {
        "tenantId": tenant_id,
        "orderId": order["_id"],
        "orderNumber": order.get("orderNumber"),
        "invoiceNumber": _next_number(
            tenant_id, profile.get("invoicePrefix") or "INV", "invoice", now
        ),
        "financialYear": financial_year(now),
        "issuedAt": now,
        "status": "issued",
        "supplier": {
            "legalName": profile.get("legalName"),
            "gstin": profile.get("gstin"),
            "address": profile.get("registeredAddress"),
            "state": profile.get("state"),
            "stateCode": profile.get("stateCode"),
        },
        "recipient": order.get("address") or {},
        "items": order.get("items") or [],
        "subtotal": order.get("subtotal", 0),
        "discount": order.get("discount", 0),
        "shipping": order.get("shipping", 0),
        "totalAmount": order.get("totalAmount", 0),
        # The immutable tax snapshot, copied rather than recalculated.
        "tax": tax,
        "reverseCharge": bool(profile.get("reverseCharge", False)),
        "createdAt": now,
    }
    try:
        result = invoices.insert_one(invoice)
        invoice["_id"] = result.inserted_id
        return invoice
    except DuplicateKeyError:
        # Another request issued it between our read and write.
        return invoices.find_one({"tenantId": tenant_id, "orderId": order["_id"]})


def create_credit_note(
    invoice: dict, reason: str, amount: float | None = None
) -> dict:
    """Raise a credit note against an issued invoice."""
    tenant_id = invoice["tenantId"]
    now = datetime.now(timezone.utc)
    max_amount = float(invoice.get("totalAmount") or 0)
    credit_amount = max_amount if amount is None else round(float(amount), 2)
    if credit_amount <= 0 or credit_amount > max_amount:
        raise HTTPException(
            status_code=400,
            detail="Credit note amount must be positive and cannot exceed invoice total.",
        )
    note = {
        "tenantId": tenant_id,
        "invoiceId": invoice["_id"],
        "orderId": invoice["orderId"],
        "creditNoteNumber": _next_number(tenant_id, "CN", "credit-note", now),
        "financialYear": financial_year(now),
        "invoiceNumber": invoice["invoiceNumber"],
        "reason": reason.strip(),
        "amount": credit_amount,
        "issuedAt": now,
        "supplier": invoice.get("supplier"),
        "recipient": invoice.get("recipient"),
        "createdAt": now,
    }
    result = credit_notes.insert_one(note)
    note["_id"] = result.inserted_id
    return note


def serialize_document(doc: dict | None) -> dict | None:
    """Make a stored document JSON-safe, leaving the stored value untouched."""
    if not doc:
        return None

    def convert(value):
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, dict):
            return {key: convert(item) for key, item in value.items()}
        if isinstance(value, list):
            return [convert(item) for item in value]
        return value

    return convert(doc)
