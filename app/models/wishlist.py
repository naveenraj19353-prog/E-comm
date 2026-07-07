from pydantic import BaseModel

class WishList(BaseModel):
    userId:str
    productId:str