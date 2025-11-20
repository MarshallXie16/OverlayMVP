"""
Integration tests for authentication API endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.company import Company
from app.utils.security import hash_password
from app.utils.jwt import decode_token


class TestSignupEndpoint:
    """Test POST /api/auth/signup endpoint."""

    def test_signup_creates_new_company_admin(self, client: TestClient, db: Session):
        """Test signup with company_name creates new company and admin user."""
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "sarah@acme.com",
                "password": "SecurePass123",
                "name": "Sarah Johnson",
                "company_name": "Acme Corp",
            },
        )

        assert response.status_code == 201
        data = response.json()

        # Check response structure
        assert "access_token" in data
        assert "token_type" in data
        assert "user" in data
        assert data["token_type"] == "bearer"

        # Check user data
        user_data = data["user"]
        assert user_data["email"] == "sarah@acme.com"
        assert user_data["name"] == "Sarah Johnson"
        assert user_data["role"] == "admin"
        assert user_data["company_name"] == "Acme Corp"

        # Verify company was created
        company = db.query(Company).filter(Company.name == "Acme Corp").first()
        assert company is not None
        assert len(company.invite_token) > 0

        # Verify user was created
        user = db.query(User).filter(User.email == "sarah@acme.com").first()
        assert user is not None
        assert user.role == "admin"
        assert user.company_id == company.id

        # Verify token contains correct claims
        token = data["access_token"]
        decoded = decode_token(token)
        assert decoded["user_id"] == user.id
        assert decoded["company_id"] == company.id
        assert decoded["role"] == "admin"
        assert decoded["email"] == "sarah@acme.com"

    def test_signup_joins_existing_company_regular_user(
        self, client: TestClient, db: Session
    ):
        """Test signup with invite_token joins existing company as regular user."""
        # Create existing company
        company = Company(name="Existing Corp", invite_token="test-invite-token-123")
        db.add(company)
        db.commit()

        response = client.post(
            "/api/auth/signup",
            json={
                "email": "alex@existing.com",
                "password": "SecurePass123",
                "name": "Alex Smith",
                "invite_token": "test-invite-token-123",
            },
        )

        assert response.status_code == 201
        data = response.json()

        # Check user data
        user_data = data["user"]
        assert user_data["email"] == "alex@existing.com"
        assert user_data["name"] == "Alex Smith"
        assert user_data["role"] == "regular"
        assert user_data["company_name"] == "Existing Corp"

        # Verify user was created with correct role and company
        user = db.query(User).filter(User.email == "alex@existing.com").first()
        assert user is not None
        assert user.role == "regular"
        assert user.company_id == company.id

    def test_signup_duplicate_email_fails(self, client: TestClient, db: Session):
        """Test signup with existing email returns error."""
        # Create existing user
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        user = User(
            email="existing@test.com",
            password_hash=hash_password("password123"),
            name="Existing User",
            role="admin",
            company_id=company.id,
        )
        db.add(user)
        db.commit()

        # Try to signup with same email
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "existing@test.com",
                "password": "NewPass123",
                "name": "New User",
                "company_name": "New Corp",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "EMAIL_EXISTS"

    def test_signup_invalid_invite_token_fails(self, client: TestClient):
        """Test signup with invalid invite token returns error."""
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@test.com",
                "password": "SecurePass123",
                "name": "Test User",
                "invite_token": "invalid-token-xyz",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "INVALID_INVITE_TOKEN"

    def test_signup_missing_company_info_fails(self, client: TestClient):
        """Test signup without company_name or invite_token fails."""
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@test.com",
                "password": "SecurePass123",
                "name": "Test User",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert data["detail"]["code"] == "MISSING_COMPANY_INFO"

    def test_signup_password_validation(self, client: TestClient):
        """Test signup password validation requirements."""
        # Password too short
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@test.com",
                "password": "short1",
                "name": "Test User",
                "company_name": "Test Corp",
            },
        )
        assert response.status_code == 422  # Validation error

        # Password missing number
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@test.com",
                "password": "NoNumberHere",
                "name": "Test User",
                "company_name": "Test Corp",
            },
        )
        assert response.status_code == 422

        # Password missing letter
        response = client.post(
            "/api/auth/signup",
            json={
                "email": "test@test.com",
                "password": "12345678",
                "name": "Test User",
                "company_name": "Test Corp",
            },
        )
        assert response.status_code == 422

    def test_signup_email_validation(self, client: TestClient):
        """Test signup email format validation."""
        invalid_emails = [
            "notanemail",
            "@nodomain.com",
            "missing@domain",
            "spaces in@email.com",
        ]

        for invalid_email in invalid_emails:
            response = client.post(
                "/api/auth/signup",
                json={
                    "email": invalid_email,
                    "password": "SecurePass123",
                    "name": "Test User",
                    "company_name": "Test Corp",
                },
            )
            assert response.status_code == 422  # Validation error


class TestLoginEndpoint:
    """Test POST /api/auth/login endpoint."""

    def test_login_success(self, client: TestClient, db: Session):
        """Test successful login with valid credentials."""
        # Create user
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        user = User(
            email="user@test.com",
            password_hash=hash_password("SecurePass123"),
            name="Test User",
            role="admin",
            company_id=company.id,
        )
        db.add(user)
        db.commit()

        # Login
        response = client.post(
            "/api/auth/login",
            json={
                "email": "user@test.com",
                "password": "SecurePass123",
            },
        )

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "access_token" in data
        assert "token_type" in data
        assert "user" in data
        assert data["token_type"] == "bearer"

        # Check user data
        user_data = data["user"]
        assert user_data["email"] == "user@test.com"
        assert user_data["name"] == "Test User"
        assert user_data["role"] == "admin"

        # Verify token
        token = data["access_token"]
        decoded = decode_token(token)
        assert decoded["user_id"] == user.id
        assert decoded["email"] == "user@test.com"

        # Verify last_login_at was updated
        db.refresh(user)
        assert user.last_login_at is not None

    def test_login_wrong_password(self, client: TestClient, db: Session):
        """Test login with incorrect password."""
        # Create user
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        user = User(
            email="user@test.com",
            password_hash=hash_password("CorrectPass123"),
            name="Test User",
            role="admin",
            company_id=company.id,
        )
        db.add(user)
        db.commit()

        # Login with wrong password
        response = client.post(
            "/api/auth/login",
            json={
                "email": "user@test.com",
                "password": "WrongPass123",
            },
        )

        assert response.status_code == 401
        data = response.json()
        assert data["detail"]["code"] == "INVALID_CREDENTIALS"

    def test_login_nonexistent_user(self, client: TestClient):
        """Test login with non-existent email."""
        response = client.post(
            "/api/auth/login",
            json={
                "email": "nonexistent@test.com",
                "password": "SomePass123",
            },
        )

        assert response.status_code == 401
        data = response.json()
        assert data["detail"]["code"] == "INVALID_CREDENTIALS"

    def test_login_case_sensitive_email(self, client: TestClient, db: Session):
        """Test that email matching is case sensitive."""
        # Create user with lowercase email
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        user = User(
            email="user@test.com",
            password_hash=hash_password("SecurePass123"),
            name="Test User",
            role="admin",
            company_id=company.id,
        )
        db.add(user)
        db.commit()

        # Try login with uppercase email
        response = client.post(
            "/api/auth/login",
            json={
                "email": "USER@TEST.COM",
                "password": "SecurePass123",
            },
        )

        # Should fail (email is case sensitive in our implementation)
        assert response.status_code == 401

    def test_login_updates_last_login_timestamp(self, client: TestClient, db: Session):
        """Test that login updates last_login_at timestamp."""
        # Create user
        company = Company(name="Test Corp", invite_token="token123")
        db.add(company)
        db.flush()

        user = User(
            email="user@test.com",
            password_hash=hash_password("SecurePass123"),
            name="Test User",
            role="admin",
            company_id=company.id,
        )
        db.add(user)
        db.commit()

        initial_login_at = user.last_login_at
        assert initial_login_at is None

        # Login
        response = client.post(
            "/api/auth/login",
            json={
                "email": "user@test.com",
                "password": "SecurePass123",
            },
        )

        assert response.status_code == 200

        # Check last_login_at was updated
        db.refresh(user)
        assert user.last_login_at is not None
        assert user.last_login_at != initial_login_at


class TestAuthEndToEnd:
    """End-to-end authentication flow tests."""

    def test_signup_and_login_flow(self, client: TestClient, db: Session):
        """Test complete flow: signup → login → verify token."""
        # 1. Signup
        signup_response = client.post(
            "/api/auth/signup",
            json={
                "email": "newuser@test.com",
                "password": "SecurePass123",
                "name": "New User",
                "company_name": "New Corp",
            },
        )

        assert signup_response.status_code == 201
        signup_data = signup_response.json()
        signup_token = signup_data["access_token"]

        # 2. Login with same credentials
        login_response = client.post(
            "/api/auth/login",
            json={
                "email": "newuser@test.com",
                "password": "SecurePass123",
            },
        )

        assert login_response.status_code == 200
        login_data = login_response.json()
        login_token = login_data["access_token"]

        # 3. Both tokens should be valid (though different)
        assert signup_token != login_token  # Different timestamps
        signup_decoded = decode_token(signup_token)
        login_decoded = decode_token(login_token)

        # But they should contain the same user info
        assert signup_decoded["user_id"] == login_decoded["user_id"]
        assert signup_decoded["email"] == login_decoded["email"]
        assert signup_decoded["company_id"] == login_decoded["company_id"]

    def test_multi_user_same_company(self, client: TestClient, db: Session):
        """Test multiple users joining the same company."""
        # 1. First user creates company
        admin_response = client.post(
            "/api/auth/signup",
            json={
                "email": "admin@company.com",
                "password": "AdminPass123",
                "name": "Admin User",
                "company_name": "Shared Company",
            },
        )

        assert admin_response.status_code == 201
        admin_data = admin_response.json()
        invite_token = (
            db.query(Company)
            .filter(Company.name == "Shared Company")
            .first()
            .invite_token
        )

        # 2. Second user joins with invite token
        user_response = client.post(
            "/api/auth/signup",
            json={
                "email": "user@company.com",
                "password": "UserPass123",
                "name": "Regular User",
                "invite_token": invite_token,
            },
        )

        assert user_response.status_code == 201
        user_data = user_response.json()

        # 3. Verify both users in same company
        assert admin_data["user"]["company_id"] == user_data["user"]["company_id"]
        assert admin_data["user"]["role"] == "admin"
        assert user_data["user"]["role"] == "regular"

        # 4. Verify company has 2 users
        company = db.query(Company).filter(Company.name == "Shared Company").first()
        assert len(company.users) == 2
