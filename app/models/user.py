from pydantic import BaseModel, EmailStr, StrictStr

class RegisterUser(BaseModel):
    name:StrictStr
    email:EmailStr
    phone:str
    password:str

class LoginUser(BaseModel):
    email:EmailStr
    password:str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str