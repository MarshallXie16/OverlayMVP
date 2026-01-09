"""
Pydantic schemas for user profile management endpoints.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import re


class UpdateProfileRequest(BaseModel):
    """Request schema for updating user profile."""

    name: Optional[str] = Field(
        None, min_length=1, max_length=255, description="Display name"
    )

    class Config:
        json_schema_extra = {"example": {"name": "Sarah Johnson"}}


class ChangePasswordRequest(BaseModel):
    """Request schema for changing password."""

    current_password: str = Field(
        ..., description="Current password for verification"
    )
    new_password: str = Field(
        ..., min_length=8, description="New password (min 8 characters)"
    )

    @field_validator("new_password")
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
                "current_password": "OldPass123",
                "new_password": "NewSecure456",
            }
        }


class ChangePasswordResponse(BaseModel):
    """Response schema for password change."""

    success: bool = Field(
        ..., description="Whether password was changed successfully"
    )
    message: str = Field(..., description="Result message")
