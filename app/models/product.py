from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


class CreateProduct(BaseModel):
    model_config = ConfigDict(
        str_strip_whitespace=True
    )


    name: str = Field(
        ...,
        min_length=3,
        max_length=100,
        description='Product Name'
    )
    description: str = Field(
        ...,
        min_length=10,
        max_length=1000
    )

    categoryId:str = Field(
        ...,
        min_length=3
    )

    price: float = Field(
        ...,
        gt=0
    )

    discountPercentage:float =Field(
        ...,
        gt= 0,
        lt=100
    )

    stock: int = Field(
        ...,
        ge=0
    )

    sizes: List[str] = Field(
        ...,
        min_length=1
    )

    colors:List[str] = Field(
        ...,
        min_length=1
    )

    images:List[str] = Field(
        ...,
        min_length=1
    )

    @field_validator('sizes')
    @classmethod
    def validate_size(cls, value):
        allowed = {"XS", "S", "M", "L", "XL", "XXL"}
        for size in value:
            if(size not in allowed):
                raise ValueError(f'invalid size: {size}')
        return value
    
    @field_validator('colors')
    @classmethod
    def validate_color(cls, value):
        for color in value:
            if(len(color.strip()) == 0):
                raise ValueError('Color cannot be empyt')
        return value
    
    @field_validator('images')
    @classmethod
    def validate_images(cls, value):
        for image in value:
            if not image.startswith(("http://", "https://")):
                raise ValueError("Image must be a valid URL")
        return value
    
class ProductSearchRequest(BaseModel):
    search: Optional[str] = None
    categoryIds: Optional[List[str]] = None
    sizes: Optional[List[str]] = None
    colors: Optional[List[str]] = None
    minPrice: Optional[float] = None
    maxPrice: Optional[float] = None
    inStock: Optional[bool] = None
    sortBy: Optional[str] = "createdAt"
    sortOrder: Optional[str] = "desc"
    page: Optional[int] = 1
    limit: Optional[int] = 10