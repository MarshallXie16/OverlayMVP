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
from typing import Tuple
from PIL import Image
from io import BytesIO
import os


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
    MOCK: Upload file to S3 and return storage URL.

    This is a mocked implementation for MVP. Returns a fake S3 URL.
    In production, this will use boto3 to upload to real S3 bucket.

    Expected S3 Key Structure:
        companies/{company_id}/workflows/{workflow_id}/screenshots/{screenshot_id}.jpg

    Args:
        file_content: Raw bytes of the file to upload
        key: S3 object key (path within bucket)

    Returns:
        Full S3 URL to the uploaded file

    Real Implementation:
        import boto3
        s3 = boto3.client('s3')
        bucket = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
        s3.put_object(Bucket=bucket, Key=key, Body=file_content)
        return f"https://{bucket}.s3.amazonaws.com/{key}"
    """
    # MOCK: Just return a fake URL for now
    bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
    return f"https://fake-s3.amazonaws.com/{bucket_name}/{key}"


def generate_presigned_url(storage_key: str, expiration: int = 900) -> str:
    """
    MOCK: Generate pre-signed URL for temporary access to S3 object.

    This is a mocked implementation for MVP. Returns the same fake S3 URL.
    In production, this will generate real pre-signed URLs with expiration.

    Args:
        storage_key: S3 object key
        expiration: URL expiration time in seconds (default: 900 = 15 minutes)

    Returns:
        Pre-signed URL with temporary access token

    Real Implementation:
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
    # MOCK: Just return a fake presigned URL
    bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
    return f"https://fake-s3.amazonaws.com/{bucket_name}/{storage_key}?expires={expiration}"


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
