from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class InventoryItem(BaseModel):
    """
    Represents one product variant.
    Example:
    {
        "variantId": "green-xl",
        "color": "Green",
        "size": "XL",
        "stock": 42
    }
    """
    model_config = ConfigDict(
        str_strip_whitespace=True
    )
    variantId: str = Field(
        min_length=1,
        description="Unique variant ID",
    )
    color: str = Field(
        min_length=1,
        description="Variant color",
    )
    size: str = Field(
        min_length=1,
        description="Variant size",
    )
    stock: int = Field(
        default=0,
        ge=0,
        description="Available stock",
    )


class CreateProduct(BaseModel):
    """
    Create product request.
    Example:
    {
        "tenantId": "shopsphere",
        "name": "Levis Casual Top",
        "description": "...",
        "categoryId": "WOMENS_FASHION",
        "categoryName": "Women's Fashion",
        "brand": "Levis",
        "price": 2709,
        "discountPercentage": 24,
        "inventory": [
            {
                "variantId": "green-xl",
                "color": "Green",
                "size": "XL",
                "stock": 42
            },
            {
                "variantId": "green-s",
                "color": "Green",
                "size": "S",
                "stock": 1
            }
        ],
        "images": {
            "Green": [
                "https://example.com/green-1.jpg",
                "https://example.com/green-2.jpg",
                "https://example.com/green-3.jpg"
            ]
        }
    }
    """
    model_config = ConfigDict(
        str_strip_whitespace=True
    )
    tenantId: str = Field(
        min_length=1
    )
    name: str = Field(
        min_length=1
    )
    description: str = ""
    categoryId: str = Field(
        min_length=1
    )
    categoryName: Optional[str] = None
    brand: Optional[str] = None
    price: float = Field(
        ge=0
    )
    discountPercentage: float = Field(
        default=0,
        ge=0,
        le=100
    )


    inventory: list[InventoryItem] = Field(
        default_factory=list
    )


    images: dict[str, list[str]] = Field(
        default_factory=dict
    )


class UpdateProduct(BaseModel):
    """
    Update product request.
    All product fields except tenantId are optional.
    """
    model_config = ConfigDict(
        str_strip_whitespace=True
    )
    tenantId: str = Field(
        min_length=1
    )
    name: Optional[str] = Field(
        default=None,
        min_length=1
    )
    description: Optional[str] = None
    categoryId: Optional[str] = None
    categoryName: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = Field(
        default=None,
        ge=0
    )
    discountPercentage: Optional[float] = Field(
        default=None,
        ge=0,
        le=100
    )


    inventory: Optional[list[InventoryItem]] = None


    images: Optional[dict[str, list[str]]] = None


    isActive: Optional[bool] = None


class ProductSearchRequest(BaseModel):
    """
    Product search/filter request.
    """
    model_config = ConfigDict(
        str_strip_whitespace=True
    )
    tenantId: str = Field(
        min_length=1
    )


    search: Optional[str] = None


    categoryIds: Optional[list[str]] = None


    minPrice: Optional[float] = Field(
        default=None,
        ge=0
    )
    maxPrice: Optional[float] = Field(
        default=None,
        ge=0
    )


    sizes: Optional[list[str]] = None
    colors: Optional[list[str]] = None


    rating: Optional[float] = Field(
        default=None,
        ge=0,
        le=5
    )


    inStock: bool = True


    sortBy: str = "createdAt"
    sortOrder: str = "desc"


    page: int = Field(
        default=1,
        ge=1
    )
    limit: int = Field(
        default=20,
        ge=1,
        le=100
    )


class BulkImportProductItem(BaseModel):
    productId: Optional[str] = None
    name: str = Field(min_length=1)
    description: str = ""
    categoryId: str = Field(min_length=1)
    categoryName: Optional[str] = None
    brand: Optional[str] = None
    price: float = Field(ge=0)
    discountPercentage: float = Field(default=0, ge=0, le=100)
    inventory: list[InventoryItem] = Field(default_factory=list)
    images: dict[str, list[str]] = Field(default_factory=dict)
    isActive: Optional[bool] = True


class BulkImportRequest(BaseModel):
    tenantId: str = Field(min_length=1)
    products: list[BulkImportProductItem] = Field(min_length=1, max_length=500)


class VariantStockRequest(BaseModel):
    """
    Request used to check stock for a particular variant.
    Example:
    {
        "tenantId": "shopsphere",
        "variantId": "green-xl"
    }
    """
    model_config = ConfigDict(
        str_strip_whitespace=True
    )
    tenantId: str = Field(
        min_length=1
    )
    variantId: str = Field(
        min_length=1
    )
