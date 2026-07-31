from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime

from app.database.mongo import reviews, products
from app.models.review import ReviewCreate, UpdateReview

router = APIRouter(
    prefix="/reviews",
    tags=["Reviews"]
)

@router.post("/")
def add_review(request: ReviewCreate):

    product = products.find_one({
        "_id": ObjectId(request.productId),
        "tenantId": request.tenantId,
        "isActive": True
    })

    if not product:
        raise HTTPException(
            status_code=404,
            detail="Product not found."
        )

    existing = reviews.find_one({
        "tenantId": request.tenantId,
        "userId": ObjectId(request.userId),
        "productId": ObjectId(request.productId)
    })

    if existing:
        raise HTTPException(
            status_code=409,
            detail="You have already reviewed this product."
        )

    review = {
        "tenantId": request.tenantId,
        "userId": ObjectId(request.userId),
        "productId": ObjectId(request.productId),
        "rating": request.rating,
        "title": request.title,
        "comment": request.comment,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }

    result = reviews.insert_one(review)

    return {
        "success": True,
        "reviewId": str(result.inserted_id),
        "message": "Review added successfully."
    }

@router.get("/product/{productId}")
def get_reviews(productId: str, tenantId: str):

    cursor = reviews.find({
        "tenantId": tenantId,
        "productId": ObjectId(productId)
    }).sort("createdAt", -1)

    data = []

    for review in cursor:
        review["_id"] = str(review["_id"])
        review["productId"] = str(review["productId"])
        review["userId"] = str(review["userId"])
        data.append(review)

    return {
        "success": True,
        "count": len(data),
        "data": data
    }

@router.put("/update-review/{id}")
def update_review(id: str, tenantId: str, userId: str, request: UpdateReview):

    review = reviews.find_one({
        "_id": ObjectId(id),
        "tenantId": tenantId,
        "userId": ObjectId(userId)
    })

    if not review:
        raise HTTPException(
            status_code=404,
            detail="Review not found."
        )

    reviews.update_one(
        {
            "_id": ObjectId(id)
        },
        {
            "$set": {
                "rating": request.rating,
                "title": request.title,
                "comment": request.comment,
                "images": request.images,
                "updatedAt": datetime.utcnow()
            }
        }
    )

    # Recalculate product rating
    pipeline = [
        {
            "$match": {
                "tenantId": tenantId,
                "productId": review["productId"]
            }
        },
        {
            "$group": {
                "_id": "$productId",
                "averageRating": {
                    "$avg": "$rating"
                },
                "reviewCount": {
                    "$sum": 1
                }
            }
        }
    ]

    stats = list(reviews.aggregate(pipeline))

    if stats:
        products.update_one(
            {
                "_id": review["productId"]
            },
            {
                "$set": {
                    "averageRating": round(stats[0]["averageRating"], 1),
                    "reviewCount": stats[0]["reviewCount"]
                }
            }
        )

    return {
        "success": True,
        "message": "Review updated successfully."
    }

@router.delete("/delete-review/{id}")
def delete_review(id: str, tenantId: str, userId: str):

    review = reviews.find_one({
        "_id": ObjectId(id),
        "tenantId": tenantId,
        "userId": ObjectId(userId)
    })

    if not review:
        raise HTTPException(
            status_code=404,
            detail="Review not found."
        )

    reviews.delete_one({
        "_id": ObjectId(id)
    })

    pipeline = [
        {
            "$match": {
                "tenantId": tenantId,
                "productId": review["productId"]
            }
        },
        {
            "$group": {
                "_id": "$productId",
                "averageRating": {
                    "$avg": "$rating"
                },
                "reviewCount": {
                    "$sum": 1
                }
            }
        }
    ]

    stats = list(reviews.aggregate(pipeline))

    if stats:
        products.update_one(
            {
                "_id": review["productId"]
            },
            {
                "$set": {
                    "averageRating": round(stats[0]["averageRating"], 1),
                    "reviewCount": stats[0]["reviewCount"]
                }
            }
        )
    else:
        products.update_one(
            {
                "_id": review["productId"]
            },
            {
                "$set": {
                    "averageRating": 0,
                    "reviewCount": 0
                }
            }
        )

    return {
        "success": True,
        "message": "Review deleted successfully."
    }