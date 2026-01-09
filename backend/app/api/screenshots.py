"""
Screenshot upload and retrieval API endpoints.
"""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
from app.db.session import get_db
from app.models.user import User
from app.models.screenshot import Screenshot
from app.utils.dependencies import get_current_user
from app.services.screenshot import upload_screenshot, get_screenshot_url
from app.schemas.screenshot import ScreenshotResponse
from app.utils.s3 import generate_presigned_url
import logging
from typing import Optional

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/screenshots", response_model=ScreenshotResponse, status_code=status.HTTP_201_CREATED)
async def upload_screenshot_endpoint(
    workflow_id: int = Form(..., description="Workflow ID this screenshot belongs to"),
    step_id: Optional[str] = Form(None, description="Temporary client-side step ID"),
    image: UploadFile = File(..., description="Screenshot image file (JPEG or PNG, max 5MB)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a screenshot with automatic deduplication.
    
    **Authentication Required:**
    - Must include valid JWT token in Authorization header: `Bearer <token>`
    - Token must not be expired (check token expiration)
    - User must belong to a valid company

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
    - 401: Invalid or missing authentication token (check Authorization header)
    - 400: Invalid image format or empty file
    - 404: Workflow not found or doesn't belong to your company
    - 413: File size exceeds 5MB limit
    """
    # Read file content
    file_content = await image.read()

    # Get company_id from User object
    company_id = current_user.company_id

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
    current_user: User = Depends(get_current_user),
):
    """
    Get a fresh pre-signed URL for an existing screenshot.

    Useful when the previous pre-signed URL has expired (15-minute lifetime).

    **Returns:**
    - screenshot_id: Screenshot ID
    - url: New pre-signed URL with 15-minute expiration

    **Errors:**
    - 404: Screenshot not found or does not belong to your company
    - 401: Invalid or missing authentication token
    """
    company_id = current_user.company_id
    
    # Query screenshot with authorization check (avoiding redundant service call)
    screenshot = db.query(Screenshot).filter(
        Screenshot.id == screenshot_id,
        Screenshot.company_id == company_id
    ).first()
    
    if not screenshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SCREENSHOT_NOT_FOUND",
                "message": f"Screenshot {screenshot_id} not found or does not belong to your company",
            },
        )
    
    # Generate pre-signed URL
    url = generate_presigned_url(screenshot.storage_key, expiration=900)

    # Return consistent response format (no nested 'data' wrapper)
    return {
        "screenshot_id": screenshot_id,
        "url": url,
    }


@router.get("/screenshots/{screenshot_id}/image")
async def get_screenshot_image(
    screenshot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the actual screenshot image file.
    
    Returns the image file directly for display in the browser.
    
    **Multi-tenant Security:**
    - Users can only access screenshots from their own company
    - Returns 403 Forbidden if screenshot belongs to another company
    - Returns 404 if screenshot doesn't exist
    
    **Returns:**
    - Image file (JPEG/PNG) with appropriate Content-Type
    
    **Errors:**
    - 404: Screenshot not found or does not belong to your company
    - 401: Invalid or missing authentication token
    """
    company_id = current_user.company_id
    
    # Fetch screenshot with multi-tenant check
    screenshot = db.query(Screenshot).filter(
        Screenshot.id == screenshot_id,
        Screenshot.company_id == company_id
    ).first()
    
    if not screenshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Screenshot {screenshot_id} not found or does not belong to your company"
        )
    
    # Build file path from storage_url
    # storage_url format: /screenshots/companies/1/workflows/10/123.jpg
    # OR old format: https://fake-s3.amazonaws.com/...
    
    if screenshot.storage_url.startswith('http'):
        # Old fake S3 URL - screenshot doesn't exist
        logger.warning(f"Screenshot {screenshot_id} has fake S3 URL: {screenshot.storage_url}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Screenshot file not available (old workflow, please re-record)"
        )
    
    if screenshot.storage_url.startswith('/screenshots/'):
        relative_path = screenshot.storage_url[len('/screenshots/'):]
    else:
        relative_path = screenshot.storage_url

    # Build absolute path
    base_dir = Path(__file__).parent.parent.parent  # backend/
    screenshots_dir = (base_dir / "screenshots").resolve()
    file_path = (screenshots_dir / relative_path).resolve()

    # SECURITY: Validate path stays within screenshots directory (prevent path traversal)
    if not str(file_path).startswith(str(screenshots_dir)):
        logger.error(f"Path traversal attempt detected: {relative_path}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid screenshot path"
        )

    if not file_path.exists():
        logger.error(f"Screenshot file not found on disk: {file_path}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Screenshot file not found on disk"
        )
    
    # Determine media type from file extension
    suffix = file_path.suffix.lower()
    media_type_map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    media_type = media_type_map.get(suffix, 'image/jpeg')
    
    # Return file
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=f"screenshot_{screenshot_id}{suffix}"
    )
