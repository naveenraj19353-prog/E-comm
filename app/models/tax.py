"""GST profile, product tax configuration and invoicing request models.

Rates are deliberately free numbers rather than a fixed slab enum: the merchant
(or their CA) owns tax classification, so stale tax law cannot silently change
an invoice. See TAX_INVOICING_README.md in the reference package.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.services.store_profile import normalize_gstin

TaxStatus = Literal["taxable", "exempt", "nil_rated", "non_gst"]


class TaxProfileUpsert(BaseModel):
    """The store's GST registration and invoice defaults."""

    model_config = ConfigDict(str_strip_whitespace=True)

    tenantId: Optional[str] = None
    # Master switch. Off means checkout stays exactly as it was and tax is zero.
    enabled: bool = False
    legalName: str = Field(default="", max_length=200)
    gstin: str = Field(default="", max_length=15)
    registeredAddress: str = Field(default="", max_length=1000)
    state: str = Field(default="", max_length=100)
    stateCode: str = Field(default="", max_length=2)
    invoicePrefix: str = Field(default="INV", min_length=1, max_length=8)
    priceIncludesTax: bool = True
    defaultTaxRate: float = Field(default=0, ge=0, le=100)
    # Charged on the delivery line at this rate, independently of the items.
    shippingTaxRate: float = Field(default=0, ge=0, le=100)
    reverseCharge: bool = False

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, value: str) -> str:
        # Reuses the app-wide normaliser so a GSTIN is validated identically
        # here and on the store profile screen.
        return normalize_gstin(value) or ""

    @field_validator("stateCode")
    @classmethod
    def validate_state_code(cls, value: str) -> str:
        value = (value or "").strip()
        if value and (len(value) != 2 or not value.isdigit()):
            raise ValueError("stateCode must be a two-digit GST state code.")
        return value


class ProductTaxConfig(BaseModel):
    """Per-product GST classification."""

    model_config = ConfigDict(str_strip_whitespace=True)

    hsnSac: Optional[str] = Field(default=None, max_length=20)
    # None means "fall back to the store default rate".
    taxRate: Optional[float] = Field(default=None, ge=0, le=100)
    cessRate: float = Field(default=0, ge=0, le=100)
    # exempt / nil_rated / non_gst are distinct on a GST return, so they are
    # kept apart rather than all collapsed into a zero rate.
    taxStatus: TaxStatus = "taxable"


class IssueInvoiceRequest(BaseModel):
    tenantId: Optional[str] = None


class CreateCreditNoteRequest(BaseModel):
    tenantId: Optional[str] = None
    reason: str = Field(min_length=3, max_length=500)
    # Omitted means credit the whole invoice.
    amount: Optional[float] = Field(default=None, gt=0)
