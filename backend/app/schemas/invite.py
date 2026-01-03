"""
Pydantic schemas for invite management endpoints.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class InviteCreateRequest(BaseModel):
    """Request schema for creating a new invite."""

    email: EmailStr = Field(..., description="Email address of the invitee")
    role: str = Field(
        default="viewer",
        pattern="^(admin|editor|viewer)$",
        description="Role to assign when the invite is accepted"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "email": "newuser@company.com",
                "role": "editor",
            }
        }


class InviteResponse(BaseModel):
    """Response schema for invite data."""

    id: int
    token: str = Field(..., description="Unique invite token")
    email: str
    role: str = Field(..., description="Role assigned on acceptance")
    company_id: int
    invited_by_id: Optional[int] = None
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "token": "550e8400-e29b-41d4-a716-446655440000",
                "email": "newuser@company.com",
                "role": "editor",
                "company_id": 1,
                "invited_by_id": 1,
                "expires_at": "2025-12-31T23:59:59Z",
                "accepted_at": None,
                "created_at": "2025-12-24T10:30:00Z",
            }
        }


class InviteVerifyResponse(BaseModel):
    """Response schema for verifying an invite token (public endpoint)."""

    valid: bool = Field(..., description="Whether the invite is valid and can be used")
    company_name: Optional[str] = Field(None, description="Company name if valid")
    role: Optional[str] = Field(None, description="Role that will be assigned")
    email: Optional[str] = Field(None, description="Email the invite was sent to")
    expired: bool = Field(default=False, description="True if invite has expired")

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "summary": "Valid invite",
                    "value": {
                        "valid": True,
                        "company_name": "Acme Corp",
                        "role": "editor",
                        "email": "newuser@company.com",
                        "expired": False,
                    }
                },
                {
                    "summary": "Expired invite",
                    "value": {
                        "valid": False,
                        "company_name": "Acme Corp",
                        "role": None,
                        "email": None,
                        "expired": True,
                    }
                },
                {
                    "summary": "Invalid token",
                    "value": {
                        "valid": False,
                        "company_name": None,
                        "role": None,
                        "email": None,
                        "expired": False,
                    }
                }
            ]
        }


class InviteListResponse(BaseModel):
    """Response schema for listing invites."""

    invites: list[InviteResponse]
    total: int = Field(..., description="Total number of pending invites")

    class Config:
        json_schema_extra = {
            "example": {
                "invites": [
                    {
                        "id": 1,
                        "token": "550e8400-e29b-41d4-a716-446655440000",
                        "email": "user1@company.com",
                        "role": "editor",
                        "company_id": 1,
                        "invited_by_id": 1,
                        "expires_at": "2025-12-31T23:59:59Z",
                        "accepted_at": None,
                        "created_at": "2025-12-24T10:30:00Z",
                    }
                ],
                "total": 1,
            }
        }
