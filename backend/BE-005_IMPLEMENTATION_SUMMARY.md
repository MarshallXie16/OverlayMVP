# BE-005: Screenshot Upload Endpoint - Implementation Summary

## Overview
Successfully implemented screenshot upload endpoint with S3 storage (mocked for MVP) and SHA-256 deduplication.

## Files Created

### 1. Pydantic Schemas
**File**: `/home/user/OverlayMVP/packages/backend/app/schemas/screenshot.py`
- `ScreenshotUploadRequest` - Request schema for multipart form data
- `ScreenshotResponse` - Response schema with screenshot metadata

### 2. S3 Utilities (Mocked)
**File**: `/home/user/OverlayMVP/packages/backend/app/utils/s3.py`
- `calculate_hash()` - SHA-256 hash calculation
- `get_image_dimensions()` - Extract image width/height
- `validate_image_format()` - Validate JPEG/PNG formats
- `upload_to_s3()` - **MOCKED** S3 upload (returns fake URL)
- `generate_presigned_url()` - **MOCKED** pre-signed URL generation
- `build_storage_key()` - Build S3 key with proper structure

**S3 Bucket Structure**:
```
companies/{company_id}/workflows/{workflow_id}/screenshots/{screenshot_id}.jpg
```

**Mock Implementation Notes**:
- All S3 functions are mocked for MVP
- Detailed documentation in docstrings for real boto3 implementation
- Returns fake URLs: `https://fake-s3.amazonaws.com/bucket/{key}`
- Real implementation will use `boto3.client('s3')` for actual uploads

### 3. Screenshot Service
**File**: `/home/user/OverlayMVP/packages/backend/app/services/screenshot.py`
- `upload_screenshot()` - Main upload logic with deduplication
  - Validates file size (max 5MB)
  - Validates image format (JPEG, PNG only)
  - Calculates SHA-256 hash
  - Checks for existing hash (deduplication)
  - If duplicate: returns existing screenshot
  - If new: uploads to S3, stores record
- `get_screenshot_url()` - Generate fresh pre-signed URL

### 4. API Router
**File**: `/home/user/OverlayMVP/packages/backend/app/api/screenshots.py`
- `POST /api/screenshots` - Upload screenshot (multipart/form-data)
- `GET /api/screenshots/{screenshot_id}/url` - Get fresh pre-signed URL

### 5. Integration Tests
**File**: `/home/user/OverlayMVP/packages/backend/tests/integration/test_screenshots_api.py`
- 17 comprehensive tests covering:
  - Successful upload
  - Deduplication (same hash returns same ID)
  - Different images not deduplicated
  - PNG format support
  - Authentication/authorization
  - File size validation (5MB limit)
  - Empty file rejection
  - Invalid image format rejection
  - Unsupported format (GIF) rejection
  - Pre-signed URL generation
  - End-to-end workflows

**Test Results**: ✅ All 17 tests passing

## API Endpoints

### POST /api/screenshots
Upload a screenshot with automatic deduplication.

**Request**:
- Content-Type: `multipart/form-data`
- Authentication: Bearer token required
- Body:
  - `workflow_id` (required): Workflow ID
  - `step_id` (optional): Temporary client-side step ID
  - `image` (required): Image file (JPEG or PNG, max 5MB)

**Response** (201 Created):
```json
{
  "screenshot_id": 1,
  "storage_url": "https://fake-s3.amazonaws.com/workflow-screenshots/companies/1/workflows/123/screenshots/1.jpg?expires=900",
  "storage_key": "companies/1/workflows/123/screenshots/1.jpg",
  "hash": "sha256:abc123def456...",
  "file_size": 245678,
  "width": 1920,
  "height": 1080,
  "format": "jpeg",
  "created_at": "2025-11-19T10:30:00Z",
  "deduplicated": false
}
```

**Errors**:
- `400 BAD_REQUEST` - Invalid image format or empty file
- `401 UNAUTHORIZED` - Invalid or missing token
- `404 NOT_FOUND` - Workflow not found
- `413 REQUEST_ENTITY_TOO_LARGE` - File exceeds 5MB

### GET /api/screenshots/{screenshot_id}/url
Get a fresh pre-signed URL for an existing screenshot.

**Response** (200 OK):
```json
{
  "data": {
    "screenshot_id": 1,
    "url": "https://fake-s3.amazonaws.com/workflow-screenshots/companies/1/workflows/123/screenshots/1.jpg?expires=900"
  }
}
```

## cURL Examples

### 1. Upload Screenshot (First Time)
```bash
# First, authenticate to get token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@company.com",
    "password": "SecurePass123"
  }'

# Response: { "access_token": "eyJhbGc...", ... }

# Upload screenshot
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer eyJhbGc..." \
  -F "workflow_id=123" \
  -F "image=@/path/to/screenshot.jpg"

# Response:
# {
#   "screenshot_id": 1,
#   "storage_url": "https://fake-s3.amazonaws.com/...",
#   "hash": "sha256:abc123...",
#   "deduplicated": false
# }
```

### 2. Upload Duplicate Screenshot (Deduplication)
```bash
# Upload the SAME image again
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer eyJhbGc..." \
  -F "workflow_id=123" \
  -F "image=@/path/to/screenshot.jpg"

# Response:
# {
#   "screenshot_id": 1,  # <-- SAME ID as before
#   "storage_url": "https://fake-s3.amazonaws.com/...",
#   "hash": "sha256:abc123...",
#   "deduplicated": true  # <-- Marked as deduplicated!
# }
```

### 3. Get Fresh Pre-signed URL
```bash
curl -X GET http://localhost:8000/api/screenshots/1/url \
  -H "Authorization: Bearer eyJhbGc..."

# Response:
# {
#   "data": {
#     "screenshot_id": 1,
#     "url": "https://fake-s3.amazonaws.com/...?expires=900"
#   }
# }
```

## Deduplication Verification

### How It Works
1. When an image is uploaded, we calculate its SHA-256 hash
2. We check if this hash already exists in the database
3. If it exists:
   - Return the existing screenshot record
   - Set `deduplicated: true` in response
   - **No S3 upload occurs** (saves storage & bandwidth)
4. If it's new:
   - Upload to S3
   - Store new record in database
   - Set `deduplicated: false` in response

### Testing Deduplication
```bash
# Step 1: Upload an image
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer TOKEN" \
  -F "workflow_id=1" \
  -F "image=@test.jpg"

# Note the screenshot_id and hash from response

# Step 2: Upload the SAME image (identical bytes)
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer TOKEN" \
  -F "workflow_id=1" \
  -F "image=@test.jpg"

# Verify:
# - screenshot_id matches first upload
# - hash matches first upload
# - deduplicated: true
# - Only ONE record in database
```

### Deduplication Works Across Workflows
The same screenshot can be used by multiple workflows without duplication:

```bash
# Upload to workflow 1
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer TOKEN" \
  -F "workflow_id=1" \
  -F "image=@test.jpg"
# Returns screenshot_id: 1

# Upload same image to workflow 2
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer TOKEN" \
  -F "workflow_id=2" \
  -F "image=@test.jpg"
# Returns screenshot_id: 1 (SAME ID!)
```

## S3 Mock Documentation

### Current Implementation (MVP)
All S3 operations are **mocked** for MVP development:

```python
# Mock upload - returns fake URL
def upload_to_s3(file_content: bytes, key: str) -> str:
    bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
    return f"https://fake-s3.amazonaws.com/{bucket_name}/{key}"

# Mock pre-signed URL - returns fake URL with expiration
def generate_presigned_url(storage_key: str, expiration: int = 900) -> str:
    bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')
    return f"https://fake-s3.amazonaws.com/{bucket_name}/{storage_key}?expires={expiration}"
```

### Real S3 Implementation (Future)

Replace mock functions with real boto3 implementation:

```python
import boto3
from botocore.exceptions import ClientError
import os

s3_client = boto3.client('s3')
bucket_name = os.getenv('S3_BUCKET_NAME', 'workflow-screenshots')

def upload_to_s3(file_content: bytes, key: str) -> str:
    """Upload file to S3 bucket."""
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

def generate_presigned_url(storage_key: str, expiration: int = 900) -> str:
    """Generate pre-signed URL for temporary access."""
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': storage_key},
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        raise Exception(f"Failed to generate presigned URL: {e}")
```

### S3 Configuration Requirements

1. **Environment Variables**:
   ```bash
   S3_BUCKET_NAME=workflow-screenshots
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=us-east-1
   ```

2. **S3 Bucket Setup**:
   - Enable versioning (for screenshot history)
   - Enable server-side encryption (AES-256 or KMS)
   - Configure CORS for browser access from extension/dashboard
   - Set lifecycle policies for cleanup (e.g., delete after 90 days)

3. **IAM Permissions**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject"
         ],
         "Resource": "arn:aws:s3:::workflow-screenshots/*"
       }
     ]
   }
   ```

## Dependencies Added

Updated `/home/user/OverlayMVP/packages/backend/requirements.txt`:
```
# Image Processing
Pillow==10.1.0
```

Install with:
```bash
pip install Pillow==10.1.0
```

## Integration with Workflow Steps

Screenshots can be referenced in workflow steps:

```python
# Example: Creating a step with screenshot
from app.models.step import Step

step = Step(
    workflow_id=123,
    step_number=1,
    action_type="click",
    screenshot_id=1,  # Reference uploaded screenshot
    # ... other fields
)
```

## Next Steps

1. **Real S3 Integration** (Future Sprint):
   - Set up AWS S3 bucket
   - Configure IAM credentials
   - Replace mock functions with boto3 implementation
   - Test uploads to real S3

2. **Image Optimization** (Optional):
   - Compress images before upload (reduce to ~80% JPEG quality)
   - Resize large images (e.g., max 1920px width)
   - Convert PNG to JPEG for smaller size

3. **Monitoring** (Production):
   - Track S3 upload failures
   - Monitor storage usage
   - Alert on deduplication rate (should be >30% for efficiency)

## Success Metrics

- ✅ All 17 integration tests passing
- ✅ Deduplication working (same hash returns same ID)
- ✅ File size validation (5MB limit enforced)
- ✅ Format validation (JPEG/PNG only)
- ✅ Authentication/authorization working
- ✅ Pre-signed URLs generated (15-min expiration)
- ✅ S3 mock documented for future replacement

## Files Modified

1. `/home/user/OverlayMVP/packages/backend/app/main.py` - Registered screenshot router
2. `/home/user/OverlayMVP/packages/backend/requirements.txt` - Added Pillow dependency

## Total Implementation

- **New Files Created**: 5
- **Tests Written**: 17
- **Test Coverage**: Upload, deduplication, validation, authentication, error handling
- **Lines of Code**: ~800 (including tests and documentation)

---

**Status**: ✅ Complete - Ready for integration with workflow creation flow
**Next Ticket**: BE-006 or FE-005 (depending on priority)
