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
    # Signed, stateless reference for POST /inventory/receiving/commit.
    # None for "candidate" matches: the admin must choose the product first.
    previewToken: Optional[str] = None
    expiresAt: Optional[str] = None


class ReceivingTokenLine(BaseModel):
    """One line inside a signed preview token (short keys keep the token small)."""

    model_config = ConfigDict(extra="forbid")

    a: Literal["ADD_TO_EXISTING_VARIANT", "CREATE_NEW_VARIANT"]
    v: Optional[str] = None  # existing variantId
    c: str  # color
    s: str  # size
    e: Optional[StrictInt] = Field(default=None, ge=0)  # stock seen by the preview
    i: StrictInt = Field(ge=0, le=MAX_ADJUSTMENT)  # incoming stock
    p: Optional[str] = None  # proposed variantId for a new variant

    @model_validator(mode="after")
    def _complete_for_action(self):
        if self.a == "ADD_TO_EXISTING_VARIANT" and (not self.v or self.e is None):
            raise ValueError("Existing-variant lines need a variantId and the previewed stock.")
        if self.a == "CREATE_NEW_VARIANT" and (self.v or not self.p):
            raise ValueError("New-variant lines need a proposed variantId and no existing one.")
        return self


class ReceivingTokenNewProduct(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    categoryId: str = Field(min_length=1)
    categoryName: str = Field(min_length=1)
    brand: Optional[str] = None


class ReceivingTokenClaims(BaseModel):
    model_config = ConfigDict(extra="forbid")

    typ: Literal["inventory_receiving_preview"]
    rid: str = Field(min_length=16, max_length=64)  # receivingId (idempotency key)
    tid: str = Field(min_length=1)
    iat: int
    exp: int
    act: Literal["EXISTING_PRODUCT", "NEW_PRODUCT"]
    pid: Optional[str] = None
    new: Optional[ReceivingTokenNewProduct] = None
    conf: bool
    lines: list[ReceivingTokenLine] = Field(min_length=1, max_length=MAX_RECEIVING_LINES)

    @model_validator(mode="after")
    def _complete_for_action(self):
        if self.act == "EXISTING_PRODUCT" and (not self.pid or self.new is not None):
            raise ValueError("Existing-product tokens need a productId.")
        if self.act == "NEW_PRODUCT":
            if self.pid or self.new is None:
                raise ValueError("New-product tokens need the new product's details.")
            if any(line.a != "CREATE_NEW_VARIANT" for line in self.lines):
                raise ValueError("A new product can only have new variants.")
        return self


class ReceivingCommitRequest(BaseModel):
    """Only the signed token and the admin's confirmation. Stock amounts are
    never accepted from the browser; they come from the signed token."""

    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    previewToken: str = Field(min_length=1, max_length=65536)
    confirm: bool = False
    note: Optional[str] = Field(default=None, max_length=200)


class ReceivingCommitVariant(BaseModel):
    variantId: str
    color: Optional[str] = None
    size: Optional[str] = None
    beforeStock: int
    receivedStock: int
    afterStock: int
    action: Literal["STOCK_INCREASED", "VARIANT_CREATED", "UNCHANGED"]


class ReceivingCommitTotals(BaseModel):
    beforeStock: int
    receivedStock: int
    afterStock: int


class ReceivingCommitResponse(BaseModel):
    success: bool = True
    receivingId: str
    productId: str
    action: Literal["EXISTING_PRODUCT", "PRODUCT_CREATED"]
    # True when this receivingId was already committed and the original result is returned.
    replayed: bool
    variants: list[ReceivingCommitVariant]
    totals: ReceivingCommitTotals
