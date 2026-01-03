"""
Pydantic schemas for company management endpoints.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CompanyResponse(BaseModel):
    """Response schema for company data."""

    id: int
    name: str
    invite_token: str
    created_at: datetime
    member_count: int = Field(..., description="Number of team members in the company")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "Acme Corp",
                "invite_token": "abc123def456...",
                "created_at": "2025-11-19T10:30:00Z",
                "member_count": 5,
            }
        }


class TeamMemberResponse(BaseModel):
    """Response schema for team member data."""

    id: int
    name: Optional[str] = None
    email: str
    role: str = Field(..., description="User role: 'admin', 'editor', or 'viewer'")
    status: str = Field(default="active", description="Account status: 'active' or 'suspended'")
    created_at: datetime
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "name": "Sarah Johnson",
                "email": "sarah@company.com",
                "role": "admin",
                "status": "active",
                "created_at": "2025-11-19T10:30:00Z",
                "last_login_at": "2025-11-20T09:00:00Z",
            }
        }


class UpdateMemberRoleRequest(BaseModel):
    """Request schema for updating a member's role."""

    role: str = Field(..., pattern="^(admin|editor|viewer)$", description="New role for the user")

    class Config:
        json_schema_extra = {
            "example": {
                "role": "editor",
            }
        }


class UpdateMemberStatusRequest(BaseModel):
    """Request schema for updating a member's status (suspend/reactivate)."""

    status: str = Field(..., pattern="^(active|suspended)$", description="Account status")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "suspended",
            }
        }


class UpdateCompanyRequest(BaseModel):
    """Request schema for updating company details."""

    name: str = Field(..., min_length=1, max_length=255, description="Company name")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Acme Corporation",
            }
        }


class InviteInfoResponse(BaseModel):
    """Response schema for public invite info (no auth required)."""

    company_name: str = Field(..., description="Name of the company being joined")

    class Config:
        json_schema_extra = {
            "example": {
                "company_name": "Acme Corp",
            }
        }


# ============================================================================
# Slack Integration Schemas
# ============================================================================


class SlackSettingsRequest(BaseModel):
    """Request schema for updating Slack integration settings."""

    webhook_url: Optional[str] = Field(
        None,
        description="Slack Incoming Webhook URL. Set to null to disable."
    )
    enabled: bool = Field(True, description="Whether Slack notifications are enabled")
    notify_on: list[str] = Field(
        default=["workflow_broken", "high_failure_rate"],
        description="Notification types to send to Slack"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "webhook_url": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX",
                "enabled": True,
                "notify_on": ["workflow_broken", "high_failure_rate", "low_confidence"],
            }
        }


class SlackSettingsResponse(BaseModel):
    """Response schema for Slack integration settings."""

    enabled: bool = Field(..., description="Whether Slack notifications are enabled")
    webhook_configured: bool = Field(
        ..., description="Whether a webhook URL is configured (URL not exposed for security)"
    )
    notify_on: list[str] = Field(..., description="Notification types sent to Slack")

    class Config:
        json_schema_extra = {
            "example": {
                "enabled": True,
                "webhook_configured": True,
                "notify_on": ["workflow_broken", "high_failure_rate"],
            }
        }


class SlackTestResponse(BaseModel):
    """Response schema for Slack webhook test."""

    success: bool = Field(..., description="Whether the test message was sent successfully")
    message: str = Field(..., description="Result message")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Test message sent successfully to Slack",
            }
        }
