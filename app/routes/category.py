from fastapi import APIRouter, HTTPException
from app.models.category import CreateCategory
from datetime import datetime
from app.database.mongo import categories

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