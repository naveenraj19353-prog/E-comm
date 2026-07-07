from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime

from app.database.mongo import categories
from app.models.category import CreateCategory, UpdateCategory

router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)


# --------------------------------------------------
# Create Category
# --------------------------------------------------
@router.post("/")
def create_category(category: CreateCategory):

    existing = categories.find_one({
        "tenantId": category.tenantId,
        "name": category.name
    })

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Category already exists."
        )

    payload = {
        "tenantId": category.tenantId,
        "name": category.name,
        "description": category.description,
        "image": category.image,
        "isActive": True,
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow()
    }

    result = categories.insert_one(payload)

    return {
        "success": True,
        "message": "Category created successfully.",
        "categoryId": str(result.inserted_id)
    }


# --------------------------------------------------
# Get All Categories
# --------------------------------------------------
@router.get("/")
def get_all_categories(tenantId: str):

    data = []

    cursor = categories.find({
        "tenantId": tenantId,
        "isActive": True
    })

    for category in cursor:
        category["_id"] = str(category["_id"])
        data.append(category)

    return {
        "success": True,
        "count": len(data),
        "data": data
    }


# --------------------------------------------------
# Get Category By Id
# --------------------------------------------------
@router.get("/{id}")
def get_category_by_id(id: str, tenantId: str):

    category = categories.find_one({
        "_id": ObjectId(id),
        "tenantId": tenantId,
        "isActive": True
    })

    if not category:
        raise HTTPException(
            status_code=404,
            detail="Category not found."
        )

    category["_id"] = str(category["_id"])

    return {
        "success": True,
        "data": category
    }


# --------------------------------------------------
# Update Category
# --------------------------------------------------
@router.put("/{id}")
def update_category(id: str, category: UpdateCategory):

    update_data = category.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(
            status_code=400,
            detail="No fields provided for update."
        )

    update_data["updatedAt"] = datetime.utcnow()

    result = categories.update_one(
        {
            "_id": ObjectId(id),
            "tenantId": category.tenantId
        },
        {
            "$set": update_data
        }
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Category not found."
        )

    updated = categories.find_one({
        "_id": ObjectId(id),
        "tenantId": category.tenantId
    })

    updated["_id"] = str(updated["_id"])

    return {
        "success": True,
        "message": "Category updated successfully.",
        "data": updated
    }


# --------------------------------------------------
# Delete Category
# --------------------------------------------------
@router.delete("/{id}")
def delete_category(id: str, tenantId: str):

    result = categories.delete_one({
        "_id": ObjectId(id),
        "tenantId": tenantId
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Category not found."
        )

    return {
        "success": True,
        "message": "Category deleted successfully."
    }