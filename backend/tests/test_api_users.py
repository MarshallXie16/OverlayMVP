"""
Tests for user profile management API endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import get_db
from app.db.base import Base

# Create in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def db_session():
    """Create test database session."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    """Create test client with database override."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_user(client):
    """Create a user and return their auth token."""
    response = client.post(
        "/api/auth/signup",
        json={
            "email": "test@example.com",
            "password": "TestPass123",
            "name": "Test User",
            "company_name": "Test Company",
        },
    )
    assert response.status_code == 201
    return response.json()


class TestUpdateProfile:
    """Test user profile update endpoint."""

    def test_update_profile_name(self, client, auth_user):
        """Test updating display name successfully."""
        token = auth_user["access_token"]

        response = client.patch(
            "/api/users/me",
            json={"name": "New Name"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"
        assert data["email"] == "test@example.com"

    def test_update_profile_empty_request(self, client, auth_user):
        """Test updating profile with empty request (no changes)."""
        token = auth_user["access_token"]

        response = client.patch(
            "/api/users/me",
            json={},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test User"  # Unchanged

    def test_update_profile_unauthorized(self, client):
        """Test update profile without auth token."""
        response = client.patch("/api/users/me", json={"name": "New Name"})
        assert response.status_code == 401

    def test_update_profile_invalid_token(self, client):
        """Test update profile with invalid token."""
        response = client.patch(
            "/api/users/me",
            json={"name": "New Name"},
            headers={"Authorization": "Bearer invalid_token"},
        )
        assert response.status_code == 401

    def test_update_profile_name_too_long(self, client, auth_user):
        """Test updating profile with name exceeding max length."""
        token = auth_user["access_token"]

        response = client.patch(
            "/api/users/me",
            json={"name": "x" * 256},  # Exceeds 255 max
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422  # Validation error

    def test_update_profile_empty_name(self, client, auth_user):
        """Test updating profile with empty name."""
        token = auth_user["access_token"]

        response = client.patch(
            "/api/users/me",
            json={"name": ""},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422  # Validation error (min_length=1)


class TestChangePassword:
    """Test password change endpoint."""

    def test_change_password_success(self, client, auth_user):
        """Test successful password change."""
        token = auth_user["access_token"]

        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "NewSecure456",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "successfully" in data["message"].lower()

    def test_change_password_can_login_with_new(self, client, auth_user):
        """Test that user can login with new password after change."""
        token = auth_user["access_token"]

        # Change password
        client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "NewSecure456",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        # Login with new password
        response = client.post(
            "/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "NewSecure456",
            },
        )

        assert response.status_code == 200
        assert "access_token" in response.json()

    def test_change_password_old_password_fails(self, client, auth_user):
        """Test that old password no longer works after change."""
        token = auth_user["access_token"]

        # Change password
        client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "NewSecure456",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        # Try login with old password
        response = client.post(
            "/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "TestPass123",
            },
        )

        assert response.status_code == 401

    def test_change_password_wrong_current(self, client, auth_user):
        """Test password change fails with wrong current password."""
        token = auth_user["access_token"]

        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "WrongPassword123",
                "new_password": "NewSecure456",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == "INVALID_CURRENT_PASSWORD"

    def test_change_password_same_as_current(self, client, auth_user):
        """Test password change fails when new password is same as current."""
        token = auth_user["access_token"]

        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "TestPass123",  # Same password
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert detail["code"] == "SAME_PASSWORD"

    def test_change_password_too_short(self, client, auth_user):
        """Test password change fails with short new password."""
        token = auth_user["access_token"]

        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "short1",  # Less than 8 chars
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422  # Pydantic validation error

    def test_change_password_no_letter(self, client, auth_user):
        """Test password change fails without letter in new password."""
        token = auth_user["access_token"]

        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "12345678",  # No letters
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422  # Pydantic validation error

    def test_change_password_no_number(self, client, auth_user):
        """Test password change fails without number in new password."""
        token = auth_user["access_token"]

        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "onlyletters",  # No numbers
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 422  # Pydantic validation error

    def test_change_password_unauthorized(self, client):
        """Test password change without auth token."""
        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "NewSecure456",
            },
        )
        assert response.status_code == 401

    def test_change_password_invalid_token(self, client):
        """Test password change with invalid token."""
        response = client.post(
            "/api/users/me/change-password",
            json={
                "current_password": "TestPass123",
                "new_password": "NewSecure456",
            },
            headers={"Authorization": "Bearer invalid_token"},
        )
        assert response.status_code == 401
