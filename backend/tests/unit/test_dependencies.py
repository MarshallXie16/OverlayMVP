"""
Unit tests for JWT authentication dependencies.

Tests JWT validation logic, user extraction, and role-based access control.
"""
import pytest
from datetime import timedelta
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.utils.dependencies import get_current_user, get_current_admin
from app.utils.jwt import create_access_token
from app.models.user import User
from app.models.company import Company


class TestGetCurrentUser:
    """Test cases for get_current_user dependency."""

    def test_valid_token_returns_user(self, db: Session):
        """Test that a valid JWT token returns the correct user."""
        # Create test company
        company = Company(
            name="Test Company",
            invite_token="test-invite-123",
        )
        db.add(company)
        db.commit()

        # Create test user
        user = User(
            email="test@example.com",
            password_hash="hashed_password",
            company_id=company.id,
            role="editor",
            name="Test User",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create valid token
        token = create_access_token(
            data={
                "user_id": user.id,
                "company_id": user.company_id,
                "role": user.role,
                "email": user.email,
            }
        )

        # Create credentials
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        # Call dependency
        result = get_current_user(credentials=credentials, db=db)

        # Assertions
        assert result.id == user.id
        assert result.email == user.email
        assert result.role == user.role
        assert result.company_id == user.company_id

    def test_missing_token_raises_401(self, db: Session):
        """Test that missing Authorization header returns 401."""
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials=None, db=db)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "MISSING_TOKEN"
        assert "Authorization header missing" in exc_info.value.detail["message"]

    def test_invalid_token_raises_401(self, db: Session):
        """Test that an invalid JWT token returns 401."""
        # Create invalid token
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="invalid.token.here",
        )

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials=credentials, db=db)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "INVALID_TOKEN"

    def test_expired_token_raises_401(self, db: Session):
        """Test that an expired JWT token returns 401."""
        # Create test company
        company = Company(
            name="Test Company",
            invite_token="test-invite-123",
        )
        db.add(company)
        db.commit()

        # Create test user
        user = User(
            email="test@example.com",
            password_hash="hashed_password",
            company_id=company.id,
            role="editor",
        )
        db.add(user)
        db.commit()

        # Create expired token (expired 1 day ago)
        token = create_access_token(
            data={
                "user_id": user.id,
                "company_id": user.company_id,
                "role": user.role,
                "email": user.email,
            },
            expires_delta=timedelta(days=-1),  # Already expired
        )

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials=credentials, db=db)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "INVALID_TOKEN"
        assert "expired" in exc_info.value.detail["message"].lower()

    def test_user_not_found_raises_401(self, db: Session):
        """Test that token with non-existent user_id returns 401."""
        # Create token with non-existent user_id
        token = create_access_token(
            data={
                "user_id": 99999,  # User doesn't exist
                "company_id": 1,
                "role": "regular",
                "email": "deleted@example.com",
            }
        )

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials=credentials, db=db)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "USER_NOT_FOUND"
        assert "no longer exists" in exc_info.value.detail["message"]

    def test_token_without_user_id_raises_401(self, db: Session):
        """Test that token without user_id claim returns 401."""
        # Create token missing user_id
        token = create_access_token(
            data={
                "company_id": 1,
                "role": "editor",
                "email": "test@example.com",
                # Missing user_id
            }
        )

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials=credentials, db=db)

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail["code"] == "INVALID_TOKEN_PAYLOAD"
        assert "missing user_id" in exc_info.value.detail["message"]

    def test_suspended_user_raises_403(self, db: Session):
        """Test that suspended user with valid token returns 403."""
        # Create test company
        company = Company(
            name="Test Company",
            invite_token="test-invite-123",
        )
        db.add(company)
        db.commit()

        # Create suspended user
        user = User(
            email="suspended@example.com",
            password_hash="hashed_password",
            company_id=company.id,
            role="editor",
            name="Suspended User",
            status="suspended",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Create valid token for suspended user
        token = create_access_token(
            data={
                "user_id": user.id,
                "company_id": user.company_id,
                "role": user.role,
                "email": user.email,
            }
        )

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        # Call dependency
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(credentials=credentials, db=db)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "ACCOUNT_SUSPENDED"
        assert "suspended" in exc_info.value.detail["message"].lower()


class TestGetCurrentAdmin:
    """Test cases for get_current_admin dependency."""

    def test_admin_user_passes(self, db: Session):
        """Test that admin user passes admin check."""
        # Create test company
        company = Company(
            name="Test Company",
            invite_token="test-invite-123",
        )
        db.add(company)
        db.commit()

        # Create admin user
        admin = User(
            email="admin@example.com",
            password_hash="hashed_password",
            company_id=company.id,
            role="admin",
            name="Admin User",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        # Call dependency directly with user object
        result = get_current_admin(current_user=admin)

        # Should return the same user
        assert result.id == admin.id
        assert result.role == "admin"

    def test_regular_user_raises_403(self, db: Session):
        """Test that regular user fails admin check with 403."""
        # Create test company
        company = Company(
            name="Test Company",
            invite_token="test-invite-123",
        )
        db.add(company)
        db.commit()

        # Create regular user
        user = User(
            email="user@example.com",
            password_hash="hashed_password",
            company_id=company.id,
            role="editor",
            name="Regular User",
        )
        db.add(user)
        db.commit()

        # Call dependency
        with pytest.raises(HTTPException) as exc_info:
            get_current_admin(current_user=user)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail["code"] == "INSUFFICIENT_PERMISSIONS"
        assert "admin privileges" in exc_info.value.detail["message"]

    def test_admin_dependency_chains_with_get_current_user(self, db: Session):
        """Test that get_current_admin properly chains with get_current_user."""
        # Create test company
        company = Company(
            name="Test Company",
            invite_token="test-invite-123",
        )
        db.add(company)
        db.commit()

        # Create admin user
        admin = User(
            email="admin@example.com",
            password_hash="hashed_password",
            company_id=company.id,
            role="admin",
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

        # Create valid token
        token = create_access_token(
            data={
                "user_id": admin.id,
                "company_id": admin.company_id,
                "role": admin.role,
                "email": admin.email,
            }
        )

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        # First get current user
        current_user = get_current_user(credentials=credentials, db=db)

        # Then check admin
        result = get_current_admin(current_user=current_user)

        assert result.id == admin.id
        assert result.role == "admin"
