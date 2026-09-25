"""Request/response models for the receiving-stock preview
(POST /inventory/receiving/preview). The preview is read-only."""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator

from app.services.stock_movements import MAX_ADJUSTMENT

MAX_RECEIVING_LINES = 200


class ReceivingVariantInput(BaseModel):
    """One incoming line: an existing variantId, and/or a color + size.

    incomingStock is always given by the admin and never inferred."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    variantId: Optional[str] = Field(default=None, max_length=120)
    color: Optional[str] = Field(default=None, max_length=100)
    size: Optional[str] = Field(default=None, max_length=100)
    incomingStock: StrictInt = Field(ge=0, le=MAX_ADJUSTMENT)

    @field_validator("variantId", "color", "size")
    @classmethod
    def blank_to_none(cls, value: Optional[str]) -> Optional[str]:
        return value or None

    @model_validator(mode="after")
    def _needs_variant_or_color_and_size(self):
        if not self.variantId and not (self.color and self.size):
            raise ValueError("Each line needs a variantId, or both color and size.")
        return self


class ReceivingPreviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    tenantId: Optional[str] = None
    productId: Optional[str] = None
    # Used only when no product matches by productId or variantId.
    name: Optional[str] = Field(default=None, max_length=200)
    categoryId: Optional[str] = Field(default=None, max_length=120)
    categoryName: Optional[str] = Field(default=None, max_length=120)
    # Only affects the preview-only proposedVariantId of a new product.
    brand: Optional[str] = Field(default=None, max_length=120)
    variants: list[ReceivingVariantInput] = Field(min_length=1, max_length=MAX_RECEIVING_LINES)

    @field_validator("tenantId", "productId", "name", "categoryId", "categoryName", "brand")
    @classmethod
    def blank_to_none(cls, value: Optional[str]) -> Optional[str]:
        return value or None


class ReceivingProduct(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    categoryId: Optional[str] = None
    categoryName: Optional[str] = None
    isActive: Optional[bool] = None
    isDraft: Optional[bool] = None


class ReceivingCategory(BaseModel):
    categoryId: Optional[str] = None
    categoryName: Optional[str] = None
    status: Literal["existing", "new_to_store"]


class ReceivingVariantPreview(BaseModel):
    variantId: Optional[str] = None
    # Shown for new variants only; the save step assigns the real variantId.
    proposedVariantId: Optional[str] = None
    color: Optional[str] = None
    size: Optional[str] = None
    matchedBy: Literal["variant_id", "color_size", "new"]
    existingStock: int
    incomingStock: int
    finalStock: int
    action: Literal["ADD_TO_EXISTING_VARIANT", "CREATE_NEW_VARIANT"]


class ReceivingTotals(BaseModel):
    existingStock: int
    incomingStock: int
    finalStock: int


class ReceivingPreviewResponse(BaseModel):
    success: bool = True
    action: Literal["NEW_PRODUCT", "EXISTING_PRODUCT"]
    matchType: Literal["explicit_product_id", "variant_id", "candidate", "none"]
    matchReason: str
    requiresConfirmation: bool
    product: ReceivingProduct
    category: ReceivingCategory
    variants: list[ReceivingVariantPreview]
    totals: ReceivingTotals
    warnings: list[str] = Field(default_factory=list)
