"""
Integration tests for protected endpoints with JWT authentication.

Tests actual HTTP requests to endpoints protected by get_current_user and get_current_admin.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.company import Company
from app.utils.jwt import create_access_token


@pytest.fixture
def test_company(db: Session) -> Company:
    """Create a test company."""
    company = Company(
        name="Test Company",
        invite_token="test-invite-123",
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def regular_user(db: Session, test_company: Company) -> User:
    """Create a regular (non-admin) user."""
    user = User(
        email="user@example.com",
        password_hash="hashed_password",
        company_id=test_company.id,
        role="regular",
        name="Regular User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_user(db: Session, test_company: Company) -> User:
    """Create an admin user."""
    user = User(
        email="admin@example.com",
        password_hash="hashed_password",
        company_id=test_company.id,
        role="admin",
        name="Admin User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def regular_user_token(regular_user: User) -> str:
    """Generate JWT token for regular user."""
    return create_access_token(
        data={
            "user_id": regular_user.id,
            "company_id": regular_user.company_id,
            "role": regular_user.role,
            "email": regular_user.email,
        }
    )


@pytest.fixture
def admin_user_token(admin_user: User) -> str:
    """Generate JWT token for admin user."""
    return create_access_token(
        data={
            "user_id": admin_user.id,
            "company_id": admin_user.company_id,
            "role": admin_user.role,
            "email": admin_user.email,
        }
    )


class TestProtectedEndpointAuthentication:
    """Test authentication on protected endpoints."""

    def test_endpoint_without_token_returns_401(self, client: TestClient):
        """Test that accessing protected endpoint without token returns 401."""
        # Try to access a protected endpoint (we'll use a test endpoint)
        # Since we don't have a real protected endpoint yet, we'll test
        # by creating a temporary endpoint in the test

        from fastapi import APIRouter, Depends
        from app.utils.dependencies import get_current_user
        from app.main import app

        # Create test router
        test_router = APIRouter()

        @test_router.get("/test/protected")
        def protected_endpoint(current_user: User = Depends(get_current_user)):
            return {"user_id": current_user.id, "email": current_user.email}

        # Register router
        app.include_router(test_router, prefix="/api", tags=["Test"])

        # Make request without Authorization header
        response = client.get("/api/test/protected")

        # Assertions
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "MISSING_TOKEN"

    def test_endpoint_with_invalid_token_returns_401(self, client: TestClient):
        """Test that accessing protected endpoint with invalid token returns 401."""
        from fastapi import APIRouter, Depends
        from app.utils.dependencies import get_current_user
        from app.main import app

        # Create test router
        test_router = APIRouter()

        @test_router.get("/test/protected-invalid")
        def protected_endpoint(current_user: User = Depends(get_current_user)):
            return {"user_id": current_user.id}

        # Register router
        app.include_router(test_router)

        # Make request with invalid token
        response = client.get(
            "/test/protected-invalid",
            headers={"Authorization": "Bearer invalid.token.here"},
        )

        # Assertions
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "INVALID_TOKEN"

    def test_endpoint_with_valid_token_returns_200(
        self, client: TestClient, regular_user: User, regular_user_token: str
    ):
        """Test that accessing protected endpoint with valid token succeeds."""
        from fastapi import APIRouter, Depends
        from app.utils.dependencies import get_current_user
        from app.main import app

        # Create test router
        test_router = APIRouter()

        @test_router.get("/test/protected-valid")
        def protected_endpoint(current_user: User = Depends(get_current_user)):
            return {
                "user_id": current_user.id,
                "email": current_user.email,
                "role": current_user.role,
            }

        # Register router
        app.include_router(test_router)

        # Make request with valid token
        response = client.get(
            "/test/protected-valid",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == regular_user.id
        assert data["email"] == regular_user.email
        assert data["role"] == regular_user.role


class TestAdminProtectedEndpoints:
    """Test admin-only protected endpoints."""

    def test_admin_endpoint_with_regular_user_returns_403(
        self, client: TestClient, regular_user_token: str
    ):
        """Test that regular user accessing admin endpoint returns 403."""
        from fastapi import APIRouter, Depends
        from app.utils.dependencies import get_current_admin
        from app.main import app

        # Create test router
        test_router = APIRouter()

        @test_router.delete("/test/admin-only")
        def admin_only_endpoint(current_admin: User = Depends(get_current_admin)):
            return {"message": "Admin operation successful"}

        # Register router
        app.include_router(test_router)

        # Make request with regular user token
        response = client.delete(
            "/test/admin-only",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )

        # Assertions
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_admin_endpoint_with_admin_user_returns_200(
        self, client: TestClient, admin_user: User, admin_user_token: str
    ):
        """Test that admin user accessing admin endpoint succeeds."""
        from fastapi import APIRouter, Depends
        from app.utils.dependencies import get_current_admin
        from app.main import app

        # Create test router
        test_router = APIRouter()

        @test_router.post("/test/admin-action")
        def admin_action_endpoint(current_admin: User = Depends(get_current_admin)):
            return {
                "message": "Admin operation successful",
                "admin_id": current_admin.id,
                "admin_email": current_admin.email,
            }

        # Register router
        app.include_router(test_router)

        # Make request with admin token
        response = client.post(
            "/test/admin-action",
            headers={"Authorization": f"Bearer {admin_user_token}"},
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Admin operation successful"
        assert data["admin_id"] == admin_user.id
        assert data["admin_email"] == admin_user.email

    def test_admin_endpoint_without_token_returns_401(self, client: TestClient):
        """Test that admin endpoint without token returns 401 (not 403)."""
        from fastapi import APIRouter, Depends
        from app.utils.dependencies import get_current_admin
        from app.main import app

        # Create test router
        test_router = APIRouter()

        @test_router.get("/test/admin-no-token")
        def admin_endpoint(current_admin: User = Depends(get_current_admin)):
            return {"message": "Success"}

        # Register router
        app.include_router(test_router)

        # Make request without token
        response = client.get("/test/admin-no-token")

        # Should return 401 (missing token), not 403
        assert response.status_code == 401
        assert response.json()["detail"]["code"] == "MISSING_TOKEN"


class TestMultiTenantIsolation:
    """Test multi-tenant isolation with JWT tokens."""

    def test_user_context_includes_company_id(
        self, client: TestClient, regular_user: User, regular_user_token: str
    ):
        """Test that user context includes company_id for multi-tenant filtering."""
        from fastapi import APIRouter, Depends
        from app.utils.dependencies import get_current_user
        from app.main import app

        # Create test router
        test_router = APIRouter()

        @test_router.get("/test/user-context")
        def user_context_endpoint(current_user: User = Depends(get_current_user)):
            return {
                "user_id": current_user.id,
                "company_id": current_user.company_id,
                "email": current_user.email,
            }

        # Register router
        app.include_router(test_router)

        # Make request
        response = client.get(
            "/test/user-context",
            headers={"Authorization": f"Bearer {regular_user_token}"},
        )

        # Assertions
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == regular_user.id
        assert data["company_id"] == regular_user.company_id
        assert data["company_id"] is not None  # Verify company_id is present
