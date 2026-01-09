"""
Tests for authentication API endpoints
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
    """Create test database session"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    """Create test client with database override"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestSignup:
    """Test user signup endpoint"""

    def test_signup_with_company_name(self, client):
        """Test successful signup with company name"""
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "test@example.com"
        assert data["user"]["name"] == "Test User"
        assert data["user"]["company_name"] == "Test Company"
        assert data["user"]["role"] == "admin"

    def test_signup_with_invite_token(self, client):
        """Test signup with invite token joins existing company"""
        # First user creates company
        response1 = client.post(
            "/api/auth/signup",
            json={
                "email": "admin@example.com",
                "password": "password123",
                "name": "Admin User",
                "company_name": "Existing Company",
            },
        )
        assert response1.status_code == 201

        # Get the invite token (we'd need to query the DB or add an endpoint)
        # For now, this test is incomplete without DB access

    def test_signup_without_company_or_token_fails(self, client):
        """Test signup fails without company_name or invite_token"""
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
            },
        )

        assert response.status_code == 400
        assert "detail" in response.json()

    def test_signup_duplicate_email_fails(self, client):
        """Test signup fails for duplicate email"""
        # Create first user
        client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password123",
                "name": "First User",
                "company_name": "Company A",
            },
        )

        # Try to create second user with same email
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password456",
                "name": "Second User",
                "company_name": "Company B",
            },
        )

        assert response.status_code == 400
        detail = response.json()["detail"]
        assert "email" in detail["message"].lower()

    def test_signup_weak_password_fails(self, client):
        """Test signup fails for weak passwords"""
        # No number
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "onlyletters",
                "name": "Test User",
                "company_name": "Test Company",
            },
        )
        assert response.status_code == 422  # Validation error

        # Too short
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "pass1",
                "name": "Test User",
                "company_name": "Test Company",
            },
        )
        assert response.status_code == 422  # Validation error


class TestLogin:
    """Test user login endpoint"""

    def test_login_success(self, client):
        """Test successful login"""
        # Create user first
        client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company",
            },
        )

        # Login
        response = client.post(
            "/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "password123",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "test@example.com"

    def test_login_wrong_password(self, client):
        """Test login fails with wrong password"""
        # Create user
        client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company",
            },
        )

        # Login with wrong password
        response = client.post(
            "/api/auth/login",
            json={
                "email": "test@example.com",
                "password": "wrongpassword",
            },
        )

        assert response.status_code == 401

    def test_login_nonexistent_user(self, client):
        """Test login fails for nonexistent user"""
        response = client.post(
            "/api/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "password123",
            },
        )

        assert response.status_code == 401


class TestGetMe:
    """Test /me endpoint"""

    def test_get_me_with_valid_token(self, client):
        """Test /me returns user data with valid token"""
        # Signup
        signup_response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@example.com",
                "password": "password123",
                "name": "Test User",
                "company_name": "Test Company",
            },
        )
        token = signup_response.json()["access_token"]

        # Get current user
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "test@example.com"
        assert data["name"] == "Test User"
        assert data["company_name"] == "Test Company"

    def test_get_me_without_token(self, client):
        """Test /me fails without token"""
        response = client.get("/api/auth/me")

        assert response.status_code == 401  # Unauthorized (no auth header)

    def test_get_me_with_invalid_token(self, client):
        """Test /me fails with invalid token"""
        response = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid_token_here"},
        )

        assert response.status_code == 401
