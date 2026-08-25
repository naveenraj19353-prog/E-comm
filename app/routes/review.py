from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime
from app.database.mongo import reviews, products
from app.models.review import ReviewCreate, UpdateReview
from app.utils.auth_dependencies import customer_scope, require_customer

router = APIRouter(prefix="/reviews", tags=["Reviews"])


def recalculate_product_rating(tenant_id: str, product_id: ObjectId):
    pipeline = [
        {"$match": {"tenantId": tenant_id, "productId": product_id}},
        {
            "$group": {
                "_id": "$productId",
                "averageRating": {"$avg": "$rating"},
                "reviewCount": {"$sum": 1},
            }
        },
    ]
    stats = list(reviews.aggregate(pipeline))
    if stats:
        products.update_one(
            {"_id": product_id, "tenantId": tenant_id},
            {
                "$set": {
                    "averageRating": round(stats[0]["averageRating"], 1),
                    "reviewCount": stats[0]["reviewCount"],
                }
            },
        )
    else:
        products.update_one(
            {"_id": product_id, "tenantId": tenant_id},
            {"$set": {"averageRating": 0, "reviewCount": 0}},
        )


@router.post("/")
def add_review(
    request: ReviewCreate,
    current_user: dict = Depends(require_customer),
):
    tenant_id, user_id = customer_scope(current_user)
    product = products.find_one(
        {
            "_id": ObjectId(request.productId),
            "tenantId": tenant_id,
            "isActive": True,
        }
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    existing = reviews.find_one(
        {
            "tenantId": tenant_id,
            "userId": ObjectId(user_id),
            "productId": ObjectId(request.productId),
        }
    )
    if existing:
        raise HTTPException(
            status_code=409, detail="You have already reviewed this product."
        )
    review = {
        "tenantId": tenant_id,
        "userId": ObjectId(user_id),
        "userName": current_user.get("name") or request.userName,
        "productId": ObjectId(request.productId),
        "rating": request.rating,
        "title": request.title,
        "comment": request.comment,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
    }
    result = reviews.insert_one(review)
    recalculate_product_rating(tenant_id, ObjectId(request.productId))
    return {
        "success": True,
        "reviewId": str(result.inserted_id),
        "message": "Review added successfully.",
    }


@router.get("/product/{productId}")
def get_reviews(productId: str, tenantId: str):
    cursor = reviews.find(
        {"tenantId": tenantId, "productId": ObjectId(productId)}
    ).sort("createdAt", -1)
    data = []
    for review in cursor:
        review["_id"] = str(review["_id"])
        review["productId"] = str(review["productId"])
        review["userId"] = str(review["userId"])
        data.append(review)
    return {"success": True, "count": len(data), "data": data}


@router.put("/update-review/{id}")
def update_review(
    id: str,
    request: UpdateReview,
    tenantId: str | None = None,
    userId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    review = reviews.find_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenant_id,
            "userId": ObjectId(token_user_id),
        }
    )
    if not review:
        raise HTTPException(status_code=404, detail="Review not found.")
    reviews.update_one(
        {"_id": ObjectId(id)},
        {
            "$set": {
                "rating": request.rating,
                "title": request.title,
                "comment": request.comment,
                "images": request.images,
                "updatedAt": datetime.utcnow(),
            }
        },
    )
    recalculate_product_rating(tenant_id, review["productId"])
    return {"success": True, "message": "Review updated successfully."}


@router.delete("/delete-review/{id}")
def delete_review(
    id: str,
    tenantId: str | None = None,
    userId: str | None = None,
    current_user: dict = Depends(require_customer),
):
    tenant_id, token_user_id = customer_scope(current_user)
    review = reviews.find_one(
        {
            "_id": ObjectId(id),
            "tenantId": tenant_id,
            "userId": ObjectId(token_user_id),
        }
    )
    if not review:
        raise HTTPException(status_code=404, detail="Review not found.")
    reviews.delete_one({"_id": ObjectId(id)})
    recalculate_product_rating(tenant_id, review["productId"])
    return {"success": True, "message": "Review deleted successfully."}
