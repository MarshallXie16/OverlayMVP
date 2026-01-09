"""
Integration tests for screenshot upload API endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from io import BytesIO
from PIL import Image

from app.models.company import Company
from app.models.user import User
from app.models.workflow import Workflow
from app.models.screenshot import Screenshot
from app.utils.security import hash_password
from app.utils.jwt import create_access_token


def create_test_image(width: int = 100, height: int = 100, color: str = "red") -> bytes:
    """
    Create a test image in memory.

    Args:
        width: Image width in pixels
        height: Image height in pixels
        color: Image color (PIL color name)

    Returns:
        JPEG image bytes
    """
    image = Image.new("RGB", (width, height), color)
    buffer = BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture
def auth_headers(db: Session) -> dict:
    """
    Create authenticated user and return authorization headers.

    Returns:
        Dict with Authorization header
    """
    # Create company
    company = Company(name="Test Corp", invite_token="test-token-123")
    db.add(company)
    db.flush()

    # Create user
    user = User(
        email="test@test.com",
        password_hash=hash_password("TestPass123"),
        name="Test User",
        role="admin",
        company_id=company.id,
    )
    db.add(user)
    db.commit()

    # Generate token
    token = create_access_token(
        data={
            "user_id": user.id,
            "company_id": company.id,
            "role": user.role,
            "email": user.email,
        }
    )

    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def workflow(db: Session) -> Workflow:
    """
    Create a test workflow.

    Returns:
        Workflow object
    """
    company = db.query(Company).first()

    workflow = Workflow(
        company_id=company.id,
        name="Test Workflow",
        description="Test workflow for screenshot upload",
        starting_url="https://example.com",
        status="active",
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)

    return workflow


class TestScreenshotUploadEndpoint:
    """Test POST /api/screenshots endpoint."""

    def test_upload_screenshot_success(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test successful screenshot upload."""
        image_data = create_test_image(width=1920, height=1080, color="blue")

        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )

        assert response.status_code == 201
        data = response.json()

        # Check response structure
        assert "screenshot_id" in data
        assert "storage_url" in data
        assert "storage_key" in data
        assert "hash" in data
        assert "file_size" in data
        assert "width" in data
        assert "height" in data
        assert "format" in data
        assert "created_at" in data
        assert "deduplicated" in data

        # Check values
        assert data["width"] == 1920
        assert data["height"] == 1080
        assert data["format"] == "jpeg"
        assert data["deduplicated"] is False
        assert data["hash"].startswith("sha256:")
        assert len(data["hash"]) > 10

        # Verify storage key structure
        storage_key = data["storage_key"]
        assert storage_key.startswith(f"companies/{workflow.company_id}/workflows/{workflow.id}/screenshots/")
        assert storage_key.endswith(".jpg")

        # Verify storage URL contains the key
        assert storage_key in data["storage_url"]

        # Verify screenshot was saved in database
        screenshot = db.query(Screenshot).filter(Screenshot.id == data["screenshot_id"]).first()
        assert screenshot is not None
        assert screenshot.workflow_id == workflow.id
        assert screenshot.company_id == workflow.company_id
        assert screenshot.hash == data["hash"]

    def test_upload_screenshot_deduplication(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test that duplicate screenshots are deduplicated."""
        # Create identical image
        image_data = create_test_image(width=800, height=600, color="green")

        # First upload
        response1 = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot1.jpg", image_data, "image/jpeg")},
        )

        assert response1.status_code == 201
        data1 = response1.json()
        assert data1["deduplicated"] is False
        screenshot_id_1 = data1["screenshot_id"]

        # Second upload (same image)
        response2 = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot2.jpg", image_data, "image/jpeg")},
        )

        assert response2.status_code == 201
        data2 = response2.json()

        # Should return same screenshot_id
        assert data2["screenshot_id"] == screenshot_id_1
        assert data2["deduplicated"] is True
        assert data2["hash"] == data1["hash"]

        # Verify only one screenshot in database
        screenshots = db.query(Screenshot).filter(Screenshot.hash == data1["hash"]).all()
        assert len(screenshots) == 1

    def test_upload_screenshot_different_images_not_deduplicated(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test that different images create separate screenshots."""
        image1 = create_test_image(color="red")
        image2 = create_test_image(color="blue")

        # Upload first image
        response1 = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot1.jpg", image1, "image/jpeg")},
        )

        assert response1.status_code == 201
        data1 = response1.json()

        # Upload second image
        response2 = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot2.jpg", image2, "image/jpeg")},
        )

        assert response2.status_code == 201
        data2 = response2.json()

        # Should have different IDs and hashes
        assert data2["screenshot_id"] != data1["screenshot_id"]
        assert data2["hash"] != data1["hash"]
        assert data1["deduplicated"] is False
        assert data2["deduplicated"] is False

    def test_upload_screenshot_png_format(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test PNG format upload."""
        # Create PNG image
        image = Image.new("RGB", (640, 480), "yellow")
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        png_data = buffer.getvalue()

        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot.png", png_data, "image/png")},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["format"] == "png"
        assert data["width"] == 640
        assert data["height"] == 480

    def test_upload_screenshot_with_step_id(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test upload with optional step_id parameter."""
        image_data = create_test_image()

        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={
                "workflow_id": workflow.id,
                "step_id": "temp-step-12345",
            },
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["screenshot_id"] > 0

    def test_upload_screenshot_unauthorized(
        self, client: TestClient, db: Session
    ):
        """Test upload without authentication fails."""
        # Create workflow without auth_headers dependency
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        workflow = Workflow(
            company_id=company.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="active",
        )
        db.add(workflow)
        db.commit()

        image_data = create_test_image()

        response = client.post(
            "/api/screenshots",
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )

        assert response.status_code == 401  # Unauthorized (no auth header)

    def test_upload_screenshot_invalid_token(
        self, client: TestClient, db: Session
    ):
        """Test upload with invalid token fails."""
        # Create workflow without auth_headers dependency
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        workflow = Workflow(
            company_id=company.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="active",
        )
        db.add(workflow)
        db.commit()

        image_data = create_test_image()

        response = client.post(
            "/api/screenshots",
            headers={"Authorization": "Bearer invalid-token-xyz"},
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )

        assert response.status_code == 401
        data = response.json()
        assert data["detail"]["code"] == "INVALID_TOKEN"

    def test_upload_screenshot_workflow_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Test upload to non-existent workflow fails."""
        image_data = create_test_image()

        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": 99999},  # Non-existent workflow
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )

        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "WORKFLOW_NOT_FOUND"

    def test_upload_screenshot_file_too_large(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test upload with file > 5MB fails."""
        # Create fake file data that's > 5MB
        # (Actual large image would be too slow to generate in tests)
        large_data = b"x" * (5 * 1024 * 1024 + 1)  # 5MB + 1 byte

        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("large.jpg", large_data, "image/jpeg")},
        )

        assert response.status_code == 413
        data = response.json()
        assert data["detail"]["code"] == "FILE_TOO_LARGE"

    def test_upload_screenshot_empty_file(
        self, client: TestClient, auth_headers: dict, workflow: Workflow
    ):
        """Test upload with empty file fails."""
        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("empty.jpg", b"", "image/jpeg")},
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "EMPTY_FILE"

    def test_upload_screenshot_invalid_image_format(
        self, client: TestClient, auth_headers: dict, workflow: Workflow
    ):
        """Test upload with non-image file fails."""
        # Create text file pretending to be image
        text_data = b"This is not an image file"

        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("fake.jpg", text_data, "image/jpeg")},
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "INVALID_IMAGE_FORMAT"

    def test_upload_screenshot_unsupported_format(
        self, client: TestClient, auth_headers: dict, workflow: Workflow
    ):
        """Test upload with unsupported image format (e.g., GIF) fails."""
        # Create GIF image
        image = Image.new("RGB", (100, 100), "purple")
        buffer = BytesIO()
        image.save(buffer, format="GIF")
        gif_data = buffer.getvalue()

        response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("animation.gif", gif_data, "image/gif")},
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "INVALID_IMAGE_FORMAT"
        assert "GIF" in data["detail"]["message"]


class TestGetScreenshotUrlEndpoint:
    """Test GET /api/screenshots/{screenshot_id}/url endpoint."""

    def test_get_screenshot_url_success(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test getting pre-signed URL for existing screenshot."""
        # Upload screenshot first
        image_data = create_test_image()
        upload_response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )
        screenshot_id = upload_response.json()["screenshot_id"]

        # Get URL
        response = client.get(
            f"/api/screenshots/{screenshot_id}/url",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["screenshot_id"] == screenshot_id
        assert "url" in data
        # URL should be a valid storage path (local or S3)
        assert "/screenshots/" in data["url"] or "amazonaws.com" in data["url"]

    def test_get_screenshot_url_not_found(
        self, client: TestClient, auth_headers: dict
    ):
        """Test getting URL for non-existent screenshot fails."""
        response = client.get(
            "/api/screenshots/99999/url",
            headers=auth_headers,
        )

        assert response.status_code == 404
        data = response.json()
        assert data["detail"]["code"] == "SCREENSHOT_NOT_FOUND"

    def test_get_screenshot_url_unauthorized(
        self, client: TestClient, db: Session
    ):
        """Test getting URL without authentication fails."""
        # Create company and workflow without auth_headers dependency
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        workflow = Workflow(
            company_id=company.id,
            name="Test Workflow",
            starting_url="https://example.com",
            status="active",
        )
        db.add(workflow)
        db.flush()

        # Create screenshot
        screenshot = Screenshot(
            company_id=company.id,
            workflow_id=workflow.id,
            hash="sha256:test123",
            storage_key="test/key.jpg",
            storage_url="https://test.com/image.jpg",
            format="jpeg",
        )
        db.add(screenshot)
        db.commit()

        response = client.get(f"/api/screenshots/{screenshot.id}/url")

        assert response.status_code == 401  # Unauthorized (no auth header)


class TestScreenshotEndToEnd:
    """End-to-end screenshot workflow tests."""

    def test_upload_and_retrieve_url_flow(
        self, client: TestClient, db: Session, auth_headers: dict, workflow: Workflow
    ):
        """Test complete flow: upload → get URL → verify."""
        # 1. Upload screenshot
        image_data = create_test_image(width=1024, height=768, color="cyan")
        upload_response = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow.id},
            files={"image": ("test.jpg", image_data, "image/jpeg")},
        )

        assert upload_response.status_code == 201
        upload_data = upload_response.json()
        screenshot_id = upload_data["screenshot_id"]
        original_url = upload_data["storage_url"]

        # 2. Get fresh URL
        url_response = client.get(
            f"/api/screenshots/{screenshot_id}/url",
            headers=auth_headers,
        )

        assert url_response.status_code == 200
        url_data = url_response.json()
        fresh_url = url_data["url"]

        # 3. Both URLs should be valid storage paths
        # (local file paths or S3 URLs)
        assert "/screenshots/" in original_url or "amazonaws.com" in original_url
        assert "/screenshots/" in fresh_url or "amazonaws.com" in fresh_url

    def test_deduplication_across_workflows(
        self, client: TestClient, db: Session, auth_headers: dict
    ):
        """Test deduplication works across different workflows."""
        company = db.query(Company).first()

        # Create two workflows
        workflow1 = Workflow(
            company_id=company.id,
            name="Workflow 1",
            starting_url="https://example1.com",
            status="active",
        )
        workflow2 = Workflow(
            company_id=company.id,
            name="Workflow 2",
            starting_url="https://example2.com",
            status="active",
        )
        db.add(workflow1)
        db.add(workflow2)
        db.commit()

        # Upload same image to both workflows
        image_data = create_test_image(color="magenta")

        response1 = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow1.id},
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )

        response2 = client.post(
            "/api/screenshots",
            headers=auth_headers,
            data={"workflow_id": workflow2.id},
            files={"image": ("screenshot.jpg", image_data, "image/jpeg")},
        )

        # Should be deduplicated (same screenshot_id)
        data1 = response1.json()
        data2 = response2.json()

        assert data1["screenshot_id"] == data2["screenshot_id"]
        assert data1["hash"] == data2["hash"]
        assert data2["deduplicated"] is True
