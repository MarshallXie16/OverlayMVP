"""
Tests for screenshot linking functionality.

Verifies that screenshots can be linked to steps after upload.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.company import Company
from app.models.user import User
from app.models.workflow import Workflow
from app.models.step import Step
from app.models.screenshot import Screenshot
from app.utils.jwt import create_access_token


@pytest.fixture
def client(db: Session):
    """Test client with database override."""
    from app.db.session import get_db
    
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_company(db: Session):
    """Create a test company."""
    company = Company(
        name="Test Company",
        invite_token="test_token_123"
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def test_user(db: Session, test_company: Company):
    """Create a test user."""
    user = User(
        email="test@test.com",
        password_hash="hashed_password",
        name="Test User",
        role="admin",
        company_id=test_company.id
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User):
    """Generate auth headers for test user."""
    token = create_access_token(
        data={
            "user_id": test_user.id,
            "email": test_user.email,
            "company_id": test_user.company_id,
            "role": test_user.role
        }
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_workflow(db: Session, test_company: Company, test_user: User):
    """Create a test workflow."""
    workflow = Workflow(
        company_id=test_company.id,
        created_by=test_user.id,
        name="Test Workflow",
        starting_url="https://example.com",
        status="processing"
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


@pytest.fixture
def test_step(db: Session, test_workflow: Workflow):
    """Create a test step without screenshot."""
    step = Step(
        workflow_id=test_workflow.id,
        step_number=1,
        action_type="click",
        selectors='{"primary": "#btn"}',
        element_meta='{"tag_name": "button"}',
        page_context='{"url": "https://example.com", "title": "Test"}',
        screenshot_id=None  # No screenshot yet
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return step


@pytest.fixture
def test_screenshot(db: Session, test_company: Company, test_workflow: Workflow):
    """Create a test screenshot."""
    screenshot = Screenshot(
        company_id=test_company.id,
        workflow_id=test_workflow.id,
        hash="test_hash_123",
        storage_key="test/screenshot.jpg",
        storage_url="https://s3.amazonaws.com/test/screenshot.jpg",
        file_size=12345,
        format="jpeg",
        width=1920,
        height=1080
    )
    db.add(screenshot)
    db.commit()
    db.refresh(screenshot)
    return screenshot


def test_link_screenshot_to_step_success(
    client: TestClient,
    db: Session,
    test_step: Step,
    test_screenshot: Screenshot,
    auth_headers: dict
):
    """Test successfully linking screenshot to step."""
    # Verify step has no screenshot initially
    assert test_step.screenshot_id is None
    
    # Link screenshot to step
    response = client.patch(
        f"/api/steps/{test_step.id}/screenshot?screenshot_id={test_screenshot.id}",
        headers=auth_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    
    # Verify response contains updated step
    assert data["id"] == test_step.id
    assert data["screenshot_id"] == test_screenshot.id
    
    # Verify database was updated
    db.refresh(test_step)
    assert test_step.screenshot_id == test_screenshot.id


def test_link_screenshot_step_not_found(
    client: TestClient,
    test_screenshot: Screenshot,
    auth_headers: dict
):
    """Test linking screenshot to non-existent step."""
    response = client.patch(
        f"/api/steps/99999/screenshot?screenshot_id={test_screenshot.id}",
        headers=auth_headers
    )
    
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_link_screenshot_unauthorized(
    client: TestClient,
    db: Session,
    test_step: Step,
    test_screenshot: Screenshot,
    test_company: Company
):
    """Test linking screenshot from different company (multi-tenant isolation)."""
    # Create another company and user
    other_company = Company(name="Other Company", invite_token="other_token_456")
    db.add(other_company)
    db.commit()
    
    other_user = User(
        email="other@other.com",
        password_hash="hashed_password",
        name="Other User",
        role="admin",
        company_id=other_company.id
    )
    db.add(other_user)
    db.commit()
    
    # Create token for other user
    token = create_access_token(
        data={
            "user_id": other_user.id,
            "email": other_user.email,
            "company_id": other_user.company_id,
            "role": other_user.role
        }
    )
    other_headers = {"Authorization": f"Bearer {token}"}
    
    # Try to link screenshot (should fail - different company)
    response = client.patch(
        f"/api/steps/{test_step.id}/screenshot?screenshot_id={test_screenshot.id}",
        headers=other_headers
    )
    
    assert response.status_code == 403
    assert "permission" in response.json()["detail"].lower()


def test_link_screenshot_no_auth(
    client: TestClient,
    test_step: Step,
    test_screenshot: Screenshot
):
    """Test linking screenshot without authentication."""
    response = client.patch(
        f"/api/steps/{test_step.id}/screenshot?screenshot_id={test_screenshot.id}"
    )
    
    assert response.status_code == 401
