"""
Pydantic schemas for notification management endpoints.

Notifications alert admins about workflow health issues,
healing events, and situations requiring manual review.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class NotificationResponse(BaseModel):
    """Response schema for a single notification."""

    id: int
    type: str = Field(
        ...,
        description="Notification type: workflow_broken, workflow_healed, low_confidence, high_failure_rate"
    )
    severity: str = Field(..., description="Severity level: info, warning, error")
    title: str
    message: Optional[str] = None
    action_url: Optional[str] = Field(
        None, description="URL to navigate to for action (e.g., '/workflows/123')"
    )
    workflow_id: Optional[int] = None
    read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "type": "workflow_broken",
                "severity": "error",
                "title": "Invoice Processing workflow is broken",
                "message": "3 consecutive failures detected. Last error: Element not found.",
                "action_url": "/workflows/123",
                "workflow_id": 123,
                "read": False,
                "created_at": "2025-12-25T10:30:00Z",
            }
        }


class NotificationListResponse(BaseModel):
    """Response schema for paginated notification list."""

    notifications: List[NotificationResponse]
    unread_count: int = Field(..., description="Total unread notifications for the company")
    total: int = Field(..., description="Total notifications matching the filter")

    class Config:
        json_schema_extra = {
            "example": {
                "notifications": [
                    {
                        "id": 1,
                        "type": "workflow_broken",
                        "severity": "error",
                        "title": "Invoice Processing is broken",
                        "message": "3 consecutive failures",
                        "action_url": "/workflows/123",
                        "workflow_id": 123,
                        "read": False,
                        "created_at": "2025-12-25T10:30:00Z",
                    }
                ],
                "unread_count": 5,
                "total": 12,
            }
        }


class MarkAsReadRequest(BaseModel):
    """Request schema for marking notification(s) as read."""

    read: bool = Field(True, description="Set to true to mark as read")

    class Config:
        json_schema_extra = {"example": {"read": True}}


class MarkAllAsReadRequest(BaseModel):
    """Request schema for marking all notifications as read."""

    notification_ids: Optional[List[int]] = Field(
        None,
        description="Specific notification IDs to mark as read. If omitted, marks all unread."
    )

    class Config:
        json_schema_extra = {"example": {"notification_ids": [1, 2, 3]}}
