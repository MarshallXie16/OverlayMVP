"""
S3 storage utilities for screenshot uploads.

IMPORTANT: This is a MOCKED implementation for MVP.
In production, replace with real boto3 S3 calls.

Expected S3 Bucket Structure:
    companies/{company_id}/workflows/{workflow_id}/screenshots/{screenshot_id}.jpg

Real Implementation Notes:
    - Use boto3.client('s3') for real S3 operations
    - Configure bucket name via environment variable (S3_BUCKET_NAME)
    - Use AWS credentials from environment or IAM role
    - Enable S3 versioning for screenshot history
    - Set appropriate CORS policies for browser access
    - Configure lifecycle policies for old screenshot cleanup
    - Use server-side encryption (AES-256 or KMS)

Example Real Implementation:
    import boto3
    from botocore.exceptions import ClientError

    s3_client = boto3.client('s3')
    bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')

    def upload_to_s3(file_content: bytes, key: str) -> str:
        try:
            s3_client.put_object(
                Bucket=bucket_name,
                Key=key,
                Body=file_content,
                ContentType='image/jpeg',
                ServerSideEncryption='AES256'
            )
            return f"https://{bucket_name}.s3.amazonaws.com/{key}"
        except ClientError as e:
            raise Exception(f"S3 upload failed: {e}")
"""
import hashlib
import logging
import os
from io import BytesIO
from typing import Tuple

from PIL import Image

logger = logging.getLogger(__name__)


def calculate_hash(file_content: bytes) -> str:
    """
    Calculate SHA-256 hash of file content.

    Args:
        file_content: Raw bytes of the file

    Returns:
        SHA-256 hash string with 'sha256:' prefix
    """
    hash_obj = hashlib.sha256(file_content)
    return f"sha256:{hash_obj.hexdigest()}"


def get_image_dimensions(file_content: bytes) -> Tuple[int, int]:
    """
    Extract image dimensions from file content.

    Args:
        file_content: Raw bytes of the image file

    Returns:
        Tuple of (width, height) in pixels

    Raises:
        ValueError: If file is not a valid image
    """
    try:
        image = Image.open(BytesIO(file_content))
        return image.size
    except Exception as e:
        raise ValueError(f"Invalid image file: {e}")


def validate_image_format(file_content: bytes, allowed_formats: Tuple[str, ...] = ("JPEG", "PNG")) -> str:
    """
    Validate image format and return normalized format name.

    Args:
        file_content: Raw bytes of the image file
        allowed_formats: Tuple of allowed PIL format names

    Returns:
        Lowercase format name (e.g., "jpeg", "png")

    Raises:
        ValueError: If format is not allowed
    """
    try:
        image = Image.open(BytesIO(file_content))
        format_name = image.format

        if format_name not in allowed_formats:
            raise ValueError(
                f"Unsupported image format: {format_name}. "
                f"Allowed formats: {', '.join(allowed_formats)}"
            )

        return format_name.lower()
    except Exception as e:
        raise ValueError(f"Invalid image file: {e}")


def upload_to_s3(file_content: bytes, key: str) -> str:
    """
    Upload file to local storage (MVP) or S3 (production).

    For MVP, saves files to local filesystem under screenshots/ directory.
    In production, this will use boto3 to upload to real S3 bucket.

    Expected Storage Structure:
        screenshots/companies/{company_id}/workflows/{workflow_id}/{screenshot_id}.jpg

    Args:
        file_content: Raw bytes of the file to upload
        key: Storage key (path within bucket/directory)

    Returns:
        Storage URL (local path for MVP, S3 URL for production)

    Real S3 Implementation:
        import boto3
        s3 = boto3.client('s3')
        bucket = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
        s3.put_object(Bucket=bucket, Key=key, Body=file_content)
        return f"https://{bucket}.s3.amazonaws.com/{key}"
    """
    # MVP: Use local file storage
    use_local_storage = os.getenv('USE_LOCAL_STORAGE', 'true').lower() == 'true'
    
    if use_local_storage:
        # Save to local filesystem
        import pathlib
        
        # Create storage directory in project root
        base_dir = pathlib.Path(__file__).parent.parent.parent  # backend/
        storage_dir = base_dir / "screenshots"
        file_path = storage_dir / key
        
        # Create parent directories
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write file
        file_path.write_bytes(file_content)
        
        # Return local URL (served via static files endpoint)
        return f"/screenshots/{key}"
    else:
        # Production: Use real S3 (not implemented yet)
        bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
        # TODO: Implement real boto3 upload
        return f"https://{bucket_name}.s3.amazonaws.com/{key}"


def generate_presigned_url(storage_key: str, expiration: int = 900) -> str:
    """
    Generate URL for accessing screenshot.

    For MVP with local storage, returns the local URL.
    In production, generates real pre-signed S3 URLs with expiration.

    Args:
        storage_key: Storage key (S3 object key or local path)
        expiration: URL expiration time in seconds (default: 900 = 15 minutes)

    Returns:
        Access URL (local path for MVP, pre-signed S3 URL for production)

    Real S3 Implementation:
        import boto3
        s3 = boto3.client('s3')
        bucket = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': storage_key},
            ExpiresIn=expiration
        )
        return url
    """
    # MVP: Use local file storage (no expiration needed)
    use_local_storage = os.getenv('USE_LOCAL_STORAGE', 'true').lower() == 'true'
    
    if use_local_storage:
        # Return local URL (no expiration for local files)
        return f"/screenshots/{storage_key}"
    else:
        # Production: Generate real pre-signed URL (not implemented yet)
        bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
        # TODO: Implement real boto3 presigned URL generation
        return f"https://{bucket_name}.s3.amazonaws.com/{storage_key}?expires={expiration}"


def build_storage_key(company_id: int, workflow_id: int, screenshot_id: int, format: str = "jpg") -> str:
    """
    Build S3 object key following the expected structure.

    Structure: companies/{company_id}/workflows/{workflow_id}/screenshots/{screenshot_id}.{ext}

    Args:
        company_id: Company ID
        workflow_id: Workflow ID
        screenshot_id: Screenshot ID
        format: File extension (default: "jpg")

    Returns:
        S3 object key string
    """
    return f"companies/{company_id}/workflows/{workflow_id}/screenshots/{screenshot_id}.{format}"


def delete_file(storage_key: str) -> bool:
    """
    Delete file from local storage (MVP) or S3 (production).

    For MVP, deletes files from local filesystem.
    In production, this will use boto3 to delete from S3 bucket.

    Args:
        storage_key: Storage key (path within bucket/directory)

    Returns:
        True if file was deleted or didn't exist, False if deletion failed

    Real S3 Implementation:
        import boto3
        s3 = boto3.client('s3')
        bucket = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
        s3.delete_object(Bucket=bucket, Key=storage_key)
        return True
    """
    use_local_storage = os.getenv('USE_LOCAL_STORAGE', 'true').lower() == 'true'

    if use_local_storage:
        import pathlib

        # Build the full path
        base_dir = pathlib.Path(__file__).parent.parent.parent  # backend/
        storage_dir = base_dir / "screenshots"
        file_path = storage_dir / storage_key

        try:
            if file_path.exists():
                file_path.unlink()
            return True
        except Exception as e:
            logger.warning(f"Failed to delete file {storage_key}: {e}")
            return False
    else:
        # Production: Use real S3 (not implemented yet)
        # TODO: Implement real boto3 delete
        # import boto3
        # s3 = boto3.client('s3')
        # bucket = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
        # s3.delete_object(Bucket=bucket, Key=storage_key)
        return True


def delete_directory(storage_key_prefix: str) -> bool:
    """
    Delete a directory and all its contents from local storage (MVP) or S3 (production).

    Useful for cleaning up all screenshots for a workflow at once.

    Args:
        storage_key_prefix: Directory path prefix (e.g., "companies/1/workflows/5/")

    Returns:
        True if directory was deleted or didn't exist, False if deletion failed
    """
    use_local_storage = os.getenv('USE_LOCAL_STORAGE', 'true').lower() == 'true'

    if use_local_storage:
        import pathlib
        import shutil

        base_dir = pathlib.Path(__file__).parent.parent.parent  # backend/
        storage_dir = base_dir / "screenshots"
        dir_path = storage_dir / storage_key_prefix

        try:
            if dir_path.exists() and dir_path.is_dir():
                shutil.rmtree(dir_path)
            return True
        except Exception as e:
            logger.warning(f"Failed to delete directory {storage_key_prefix}: {e}")
            return False
    else:
        # Production: Use real S3 (list and delete objects with prefix)
        # TODO: Implement real boto3 list_objects_v2 + delete_objects
        return True
