from fastapi import APIRouter
from bson import ObjectId
from app.database.mongo import users

router = APIRouter(
    prefix="/users",
    tags=["Users"]
)

@router.get("/")
def get_users():

    result = []

    for user in users.find({}, {"password": 0}):
        user["_id"] = str(user["_id"])
        result.append(user)

    return result

@router.get('/id')
def get_user(id):
    print(id, "//////")
    user = users.find_one({
        '_id': ObjectId(id)
    }, {"password": 0})

    # print('useronly', user)
    
    if(user):
        user["_id"] = str(user["_id"])
        return user
    else:
        raise {'message':'Not found'}
    
@router.get('/{id}')
def delete_user(id):
    user = users.delete_one({
        '_id': ObjectId(id)
    })
    print("deletedUser ", user)
    return {'message':'User Deleted Successfully'}