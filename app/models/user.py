from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterUser(BaseModel):
    tenantId: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )
    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
    )
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
    )


class LoginUser(BaseModel):
    """
    tenantId is required for tenant users.
    For Super Admin login:
        tenantId = null
    Example customer/admin:
    {
        "tenantId": "TENANT001",
        "email": "user@gmail.com",
        "password": "password123"
    }
    Example Super Admin:
    {
        "tenantId": null,
        "email": "superadmin@gmail.com",
        "password": "password123"
    }
    """
    tenantId: Optional[str] = None
    email: EmailStr
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
    )


class CreateAdminUser(BaseModel):
    tenantId: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )
    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
    )
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
    )


class ForgotPasswordRequest(BaseModel):
    """
    For tenant customer/admin:
        tenantId = TENANT001
    For Super Admin:
        tenantId = null
    """
    tenantId: Optional[str] = None
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(
        ...,
        min_length=1,
    )
    password: str = Field(
        ...,
        min_length=6,
        max_length=128,
    )


class UpdateUser(BaseModel):
    name: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=100,
    )
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    isActive: Optional[bool] = None
