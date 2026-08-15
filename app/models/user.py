from pydantic import BaseModel, EmailStr, StrictStr
from typing import Optional


class RegisterUser(BaseModel):
    tenantId: StrictStr
    name: StrictStr
    email: EmailStr
    phone: str
    password: str


class LoginUser(BaseModel):
    tenantId: Optional[str] = None
    email: EmailStr
    password: str


class UpdateUser(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    isActive: Optional[bool] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str
