from pydantic import BaseModel
from typing import List, Optional


class Banner(BaseModel):
    id: str
    title: str
    subtitle: Optional[str] = None
    image: str
    buttonText: Optional[str] = None
    buttonLink: Optional[str] = None
    isActive: bool = True


class HomeProduct(BaseModel):
    id: str
    name: str
    description: str
    categoryId: str
    price: float
    discountPercentage: float
    finalPrice: float
    stock: int
    images: List[str]
    averageRating: float
    reviewCount: int


class HomeCategory(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None


class HomeData(BaseModel):

    banners: List[Banner]

    categories: List[HomeCategory]

    trendingProducts: List[HomeProduct]

    bestDiscountProducts: List[HomeProduct]

    mostSellingProducts: List[HomeProduct]

    newArrivals: List[HomeProduct]

    topRatedProducts: List[HomeProduct]


class HomeResponse(BaseModel):

    success: bool

    data: HomeData
