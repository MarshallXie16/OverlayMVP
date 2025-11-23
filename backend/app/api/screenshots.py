"""
Screenshot upload API endpoints.
"""
from fastapi import APIRouter, Depends, File, Form, UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.schemas.screenshot import ScreenshotResponse
from app.services.screenshot import upload_screenshot, get_screenshot_url
from app.utils.jwt import decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

router = APIRouter()
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Extract user context from JWT token.

    Args:
        credentials: Bearer token from Authorization header

    Returns:
        Decoded token payload with user_id, company_id, role, email

    Raises:
        HTTPException: If token is invalid or expired
    """
    token = credentials.credentials
    try:
        payload = decode_token(token)
        return payload
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN",
                "message": "Invalid or expired authentication token",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.post("/screenshots", response_model=ScreenshotResponse, status_code=status.HTTP_201_CREATED)
async def upload_screenshot_endpoint(
    workflow_id: int = Form(..., description="Workflow ID this screenshot belongs to"),
    step_id: Optional[str] = Form(None, description="Temporary client-side step ID"),
    image: UploadFile = File(..., description="Screenshot image file (JPEG or PNG, max 5MB)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a screenshot with automatic deduplication.

    **Process:**
    1. Validates image format (JPEG, PNG only) and size (max 5MB)
    2. Calculates SHA-256 hash of image
    3. Checks if hash exists in database (deduplication)
    4. If exists: returns existing screenshot_id
    5. If new: uploads to S3, stores record, returns new screenshot_id

    **Deduplication:**
    - Screenshots with identical content (same hash) are stored only once
    - Subsequent uploads of the same image return the existing screenshot_id
    - Saves storage space and upload time

    **S3 Storage Structure:**
    ```
    companies/{company_id}/workflows/{workflow_id}/screenshots/{screenshot_id}.jpg
    ```

    **Returns:**
    - screenshot_id: Database ID to reference in workflow steps
    - storage_url: Pre-signed URL for temporary access (15-min expiration)
    - hash: SHA-256 hash for verification
    - deduplicated: true if this was a duplicate upload

    **Errors:**
    - 400: Invalid image format or empty file
    - 404: Workflow not found
    - 413: File size exceeds 5MB limit
    - 401: Invalid or missing authentication token
    """
    # Read file content
    file_content = await image.read()

    # Get company_id from JWT token
    company_id = current_user["company_id"]

    # Upload screenshot (with deduplication)
    screenshot, deduplicated = upload_screenshot(
        db=db,
        company_id=company_id,
        workflow_id=workflow_id,
        file_content=file_content,
        filename=image.filename or "upload.jpg",
    )

    # Generate pre-signed URL for response
    presigned_url = get_screenshot_url(db, screenshot.id, company_id)

    # Return response
    return ScreenshotResponse(
        screenshot_id=screenshot.id,
        storage_url=presigned_url,
        storage_key=screenshot.storage_key,
        hash=screenshot.hash,
        file_size=screenshot.file_size,
        width=screenshot.width,
        height=screenshot.height,
        format=screenshot.format,
        created_at=screenshot.created_at,
        deduplicated=deduplicated,
    )


@router.get("/screenshots/{screenshot_id}/url")
async def get_screenshot_url_endpoint(
    screenshot_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Get a fresh pre-signed URL for an existing screenshot.

    Useful when the previous pre-signed URL has expired (15-minute lifetime).

    **Returns:**
    - url: New pre-signed URL with 15-minute expiration

    **Errors:**
    - 404: Screenshot not found or does not belong to your company
    - 401: Invalid or missing authentication token
    """
    company_id = current_user["company_id"]
    url = get_screenshot_url(db, screenshot_id, company_id)

    return {
        "data": {
            "screenshot_id": screenshot_id,
            "url": url,
        }
    }
