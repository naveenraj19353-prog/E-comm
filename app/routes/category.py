from fastapi import APIRouter, HTTPException
from app.models.category import CreateCategory, UpdateCategory
from datetime import datetime
from app.database.mongo import categories
from bson import ObjectId

router = APIRouter(
    prefix='/category',
    tags=['Category']
)

@router.post('/create-category')
def create_category(category: CreateCategory):

    existingCategory= categories.find_one({
        'name' : category.name,
    })
        
    if(existingCategory):
        raise HTTPException(status_code=400, detail="Category already exist")
    else:

        category_data = {
            "name": category.name,
            "description": category.description,
            "image": category.image,
            "isActive": True,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow()
        }

        result = categories.insert_one(category_data)

        return str(result.inserted_id)
    
@router.get("/get-all-categories")
def get_all_categories():

    category_list = []

    for category in categories.find({"isActive": True}):
        category["_id"] = str(category["_id"])
        category_list.append(category)
    return {
        "success": True,
        'statusCode':200,
        "count": len(category_list),
        "data": category_list
    }

@router.get('/id')
def get_category_by_id(id):

    category = []

    for category in categories.find({"name": id}):
        category["_id"] = str(category["_id"])

    if(len(category)):
        return {
            "success": True,
            'statusCode':200,
            "data": category
        }
    else:
         return {
            'statusCode':400,
            'message':'Category does not exist'
        } 
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
        {"_id": ObjectId(id)},
        {
            "$set": update_data
        }
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Category not found."
        )

    updated_category = categories.find_one({"_id": ObjectId(id)})
    updated_category["_id"] = str(updated_category["_id"])

    return {
        "success": True,
        "message": "Category updated successfully.",
        "data": updated_category
    }

@router.delete("/{id}")
def delete_category(id: str):

    result = categories.delete_one({"_id": ObjectId(id)})

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Category not found."
        )

    return {
        "success": True,
        "message": "Category deleted successfully."
    }
