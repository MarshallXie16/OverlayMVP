"""
Pydantic schemas for screenshot upload endpoints.
"""
from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional


class ScreenshotUploadRequest(BaseModel):
    """Request schema for screenshot upload (multipart form data)."""

    workflow_id: int = Field(..., description="Workflow ID this screenshot belongs to")
    step_id: Optional[str] = Field(None, description="Temporary client-side step ID for reference")

    class Config:
        json_schema_extra = {
            "example": {
                "workflow_id": 123,
                "step_id": "temp-step-456",
            }
        }


class ScreenshotResponse(BaseModel):
    """Response schema for screenshot upload."""

    screenshot_id: int = Field(..., description="Database ID of the screenshot")
    storage_url: str = Field(..., description="URL to access the screenshot (pre-signed)")
    storage_key: str = Field(..., description="S3 object key")
    hash: str = Field(..., description="SHA-256 hash of the image")
    file_size: Optional[int] = Field(None, description="File size in bytes")
    width: Optional[int] = Field(None, description="Image width in pixels")
    height: Optional[int] = Field(None, description="Image height in pixels")
    format: str = Field(..., description="Image format (jpeg, png)")
    created_at: datetime = Field(..., description="Upload timestamp")
    deduplicated: bool = Field(False, description="Whether this was a deduplicated upload")

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "screenshot_id": 1,
                "storage_url": "https://fake-s3.amazonaws.com/bucket/companies/1/workflows/123/screenshots/1.jpg",
                "storage_key": "companies/1/workflows/123/screenshots/1.jpg",
                "hash": "sha256:abc123def456...",
                "file_size": 245678,
                "width": 1920,
                "height": 1080,
                "format": "jpeg",
                "created_at": "2025-11-19T10:30:00Z",
                "deduplicated": False,
            }
        }
