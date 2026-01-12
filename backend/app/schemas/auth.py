"""
Pydantic schemas for authentication endpoints.
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime
import re


class SignupRequest(BaseModel):
    """Request schema for user signup."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=8, description="User password (min 8 characters)")
    name: str = Field(..., min_length=1, max_length=255, description="User full name")
    company_name: Optional[str] = Field(None, max_length=255, description="Company name (for first user)")
    invite_token: Optional[str] = Field(None, description="Company invite token (for joining existing company)")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password contains at least one letter and one number."""
        if not re.search(r"[a-zA-Z]", v):
            raise ValueError("Password must contain at least one letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one number")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "email": "sarah@company.com",
                "password": "SecurePass123",
                "name": "Sarah Johnson",
                "company_name": "Acme Corp",
            }
        }


class LoginRequest(BaseModel):
    """Request schema for user login."""

    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")

    class Config:
        json_schema_extra = {
            "example": {
                "email": "sarah@company.com",
                "password": "SecurePass123",
            }
        }


class UserResponse(BaseModel):
    """Response schema for user data."""

    id: int
    email: str
    name: str
    role: str
    company_id: int
    company_name: str
    timezone: Optional[str] = None  # IANA timezone identifier
    created_at: datetime
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True  # Pydantic v2 (was orm_mode in v1)


class TokenResponse(BaseModel):
    """Response schema for authentication endpoints."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    user: UserResponse = Field(..., description="Authenticated user data")

    class Config:
        json_schema_extra = {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "user": {
                    "id": 1,
                    "email": "sarah@company.com",
                    "name": "Sarah Johnson",
                    "role": "admin",
                    "company_id": 1,
                    "company_name": "Acme Corp",
                    "created_at": "2025-11-19T10:30:00Z",
                },
            }
        }
