"""
Screenshot service layer for upload and deduplication.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from typing import Tuple

from app.models.screenshot import Screenshot
from app.models.workflow import Workflow
from app.utils.s3 import (
    calculate_hash,
    get_image_dimensions,
    validate_image_format,
    upload_to_s3,
    generate_presigned_url,
    build_storage_key,
)


MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB in bytes


def upload_screenshot(
    db: Session,
    workflow_id: int,
    file_content: bytes,
    filename: str,
) -> Tuple[Screenshot, bool]:
    """
    Upload screenshot with deduplication.

    Process:
    1. Validate file size and format
    2. Calculate SHA-256 hash
    3. Check if hash exists in database (deduplication)
    4. If exists: return existing screenshot
    5. If new: upload to S3, store record, return new screenshot

    Args:
        db: Database session
        workflow_id: Workflow ID this screenshot belongs to
        file_content: Raw bytes of the image file
        filename: Original filename (for validation)

    Returns:
        Tuple of (Screenshot object, deduplicated: bool)

    Raises:
        HTTPException: If validation fails or workflow not found
    """
    # Validate workflow exists
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id
    ).first()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "WORKFLOW_NOT_FOUND",
                "message": f"Workflow {workflow_id} not found",
            },
        )

    # Validate file size
    file_size = len(file_content)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "code": "FILE_TOO_LARGE",
                "message": f"File size {file_size} bytes exceeds maximum {MAX_FILE_SIZE} bytes (5MB)",
            },
        )

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "EMPTY_FILE",
                "message": "Uploaded file is empty",
            },
        )

    # Validate image format
    try:
        image_format = validate_image_format(file_content, allowed_formats=("JPEG", "PNG"))
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE_FORMAT",
                "message": str(e),
            },
        )

    # Get image dimensions
    try:
        width, height = get_image_dimensions(file_content)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_IMAGE",
                "message": str(e),
            },
        )

    # Calculate hash for deduplication
    image_hash = calculate_hash(file_content)

    # Check if hash already exists (deduplication)
    existing_screenshot = db.query(Screenshot).filter(
        Screenshot.hash == image_hash
    ).first()

    if existing_screenshot:
        # Return existing screenshot (deduplicated)
        return existing_screenshot, True

    # Create new screenshot record (need ID for S3 key)
    screenshot = Screenshot(
        workflow_id=workflow_id,
        hash=image_hash,
        storage_key="",  # Will update after we have the ID
        storage_url="",  # Will update after we have the ID
        file_size=file_size,
        width=width,
        height=height,
        format=image_format,
    )

    db.add(screenshot)
    db.flush()  # Get screenshot.id before uploading to S3

    # Build S3 key and upload
    storage_key = build_storage_key(
        workflow_id=workflow_id,
        screenshot_id=screenshot.id,
        format="jpg" if image_format == "jpeg" else image_format,
    )

    storage_url = upload_to_s3(file_content, storage_key)

    # Update screenshot with storage info
    screenshot.storage_key = storage_key
    screenshot.storage_url = storage_url

    db.commit()
    # No need to refresh - all values are already set

    return screenshot, False


def get_screenshot_url(db: Session, screenshot_id: int) -> str:
    """
    Get pre-signed URL for screenshot access.

    Args:
        db: Database session
        screenshot_id: Screenshot ID

    Returns:
        Pre-signed URL (15-minute expiration)

    Raises:
        HTTPException: If screenshot not found
    """
    screenshot = db.query(Screenshot).filter(
        Screenshot.id == screenshot_id
    ).first()

    if not screenshot:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "SCREENSHOT_NOT_FOUND",
                "message": f"Screenshot {screenshot_id} not found",
            },
        )

    # Generate pre-signed URL with 15-minute expiration
    return generate_presigned_url(screenshot.storage_key, expiration=900)
