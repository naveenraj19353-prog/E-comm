from fastapi import APIRouter, HTTPException
from app.models.user import RegisterUser, LoginUser, ForgotPasswordRequest
from app.database.mongo import users
from app.utils.hash import hash_password, verify_password
from app.utils.jwt_handler import create_token
from secrets import token_urlsafe
from datetime import datetime, timedelta
from app.utils.email_service import send_reset_email


router = APIRouter(
    prefix='/auth',
    tags=["Authentication"]
)

@router.post('/register')
def register(user: RegisterUser):

    existing = users.find_one({
        "email": user.email
    })

    # print(existing, ": existing")

    if(existing):
        raise HTTPException(status_code=400, detail="Email already exist")
    else:
        payload= {
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "password": hash_password(user.password),
            "role": "customer",
            "isActive": True 
        }
        users.insert_one(payload)
        # print(payload)
        return {
            'message':'Regestraion Successful',
            'statusCode':200
        }

@router.post('/login')
def login(user:LoginUser):

    existing = users.find_one({
        "email": user.email
    })
    if(not existing):
        # print('Invalid Credentials email')
        raise HTTPException(
                status_code=401,
                detail="Invalid Credentials"
            )
    if(existing and (not verify_password(user.password, existing['password']))):
        # print('Invalid Credentials password')

        raise HTTPException(
                status_code=401,
                detail="Invalid Credentials"
            )
    token = create_token({
        'userId' : str(existing['_id']),
        'email' : existing['email']
    })
    
    return {
        'access_token': token,
        'token_type': 'bearer'
    }

@router.post('/forgot-password')
def forgot_password(user:ForgotPasswordRequest):
    existing = users.find_one({
        'email':user.email
    })

    if(not existing):
        raise HTTPException(
            message = 'user does not exist'
        )
    else:
        token = token_urlsafe(32)
        expiry = (datetime.utcnow()+ timedelta(minutes=15))

        users.update_one({
            '$set' :{
                'resetToken':token,
                'resetTokenExpiry':expiry
            }
        })

        reset_link = (
            f"http://localhost:3000/"
            f"reset-password?token={token}"
        )


        send_reset_email(existing.email, reset_link)

        raise HTTPException(
            message='reset link to to email '
        )