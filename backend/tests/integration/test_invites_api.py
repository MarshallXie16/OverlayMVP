"""
Integration tests for Invites API endpoints.

Tests:
- GET /api/invites/me/invites - List pending invites
- POST /api/invites/me/invites - Create invite
- DELETE /api/invites/me/invites/{id} - Revoke invite
- GET /api/invites/verify/{token} - Verify invite token (public)
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.company import Company
from app.models.invite import Invite
from app.utils.jwt import create_access_token


@pytest.fixture
def company(db: Session) -> Company:
    """Create test company."""
    company = Company(name="Test Company", invite_token="test-invite-token-123")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def admin_user(db: Session, company: Company) -> User:
    """Create admin user."""
    user = User(
        email="admin@company.com",
        password_hash="hashed_password",
        name="Admin User",
        role="admin",
        company_id=company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def regular_user(db: Session, company: Company) -> User:
    """Create editor (non-admin) user."""
    user = User(
        email="regular@company.com",
        password_hash="hashed_password",
        name="Regular User",
        role="editor",
        company_id=company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user: User) -> str:
    """Generate JWT token for admin user."""
    return create_access_token(
        data={
            "user_id": admin_user.id,
            "company_id": admin_user.company_id,
            "role": admin_user.role,
            "email": admin_user.email,
        }
    )


@pytest.fixture
def regular_token(regular_user: User) -> str:
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
def pending_invite(db: Session, company: Company, admin_user: User) -> Invite:
    """Create a pending invite."""
    invite = Invite(
        token="test-invite-token-abc",
        email="invited@example.com",
        role="editor",
        company_id=company.id,
        invited_by_id=admin_user.id,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


class TestListPendingInvites:
    """Test GET /api/invites/me/invites endpoint."""

    def test_admin_can_list_invites(
        self, client: TestClient, admin_token: str, pending_invite: Invite
    ):
        """Test admin can list pending invites."""
        response = client.get(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["invites"]) == 1
        assert data["invites"][0]["email"] == "invited@example.com"

    def test_regular_user_cannot_list_invites(
        self, client: TestClient, regular_token: str, pending_invite: Invite
    ):
        """Test non-admin cannot list invites."""
        response = client.get(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {regular_token}"},
        )

        assert response.status_code == 403

    def test_accepted_invites_not_shown(
        self, client: TestClient, db: Session, admin_token: str, pending_invite: Invite
    ):
        """Test accepted invites are not listed."""
        pending_invite.accepted_at = datetime.utcnow()
        db.commit()

        response = client.get(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        assert response.json()["total"] == 0


class TestCreateInvite:
    """Test POST /api/invites/me/invites endpoint."""

    def test_admin_can_create_invite(
        self, client: TestClient, db: Session, admin_token: str, company: Company
    ):
        """Test admin can create an invite."""
        response = client.post(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": "newuser@example.com", "role": "viewer"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["role"] == "viewer"
        assert "token" in data
        assert len(data["token"]) > 0

        # Verify in database
        invite = db.query(Invite).filter(Invite.email == "newuser@example.com").first()
        assert invite is not None
        assert invite.company_id == company.id

    def test_regular_user_cannot_create_invite(
        self, client: TestClient, regular_token: str
    ):
        """Test non-admin cannot create invites."""
        response = client.post(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {regular_token}"},
            json={"email": "newuser@example.com", "role": "viewer"},
        )

        assert response.status_code == 403

    def test_cannot_invite_existing_user(
        self, client: TestClient, admin_token: str, regular_user: User
    ):
        """Test cannot invite email that's already a user."""
        response = client.post(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": regular_user.email, "role": "viewer"},
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "USER_ALREADY_EXISTS"

    def test_cannot_create_duplicate_invite(
        self, client: TestClient, admin_token: str, pending_invite: Invite
    ):
        """Test cannot create invite for email with pending invite."""
        response = client.post(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": pending_invite.email, "role": "viewer"},
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "INVITE_ALREADY_EXISTS"

    def test_default_role_is_viewer(
        self, client: TestClient, admin_token: str
    ):
        """Test default role is viewer when not specified."""
        response = client.post(
            "/api/invites/me/invites",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"email": "default@example.com"},
        )

        assert response.status_code == 201
        assert response.json()["role"] == "viewer"


class TestRevokeInvite:
    """Test DELETE /api/invites/me/invites/{id} endpoint."""

    def test_admin_can_revoke_invite(
        self, client: TestClient, db: Session, admin_token: str, pending_invite: Invite
    ):
        """Test admin can revoke a pending invite."""
        invite_id = pending_invite.id

        response = client.delete(
            f"/api/invites/me/invites/{invite_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 204

        # Verify invite was deleted
        invite = db.query(Invite).filter(Invite.id == invite_id).first()
        assert invite is None

    def test_regular_user_cannot_revoke_invite(
        self, client: TestClient, regular_token: str, pending_invite: Invite
    ):
        """Test non-admin cannot revoke invites."""
        response = client.delete(
            f"/api/invites/me/invites/{pending_invite.id}",
            headers={"Authorization": f"Bearer {regular_token}"},
        )

        assert response.status_code == 403

    def test_cannot_revoke_nonexistent_invite(
        self, client: TestClient, admin_token: str
    ):
        """Test revoking non-existent invite returns 404."""
        response = client.delete(
            "/api/invites/me/invites/99999",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 404

    def test_cannot_revoke_accepted_invite(
        self, client: TestClient, db: Session, admin_token: str, pending_invite: Invite
    ):
        """Test cannot revoke an already accepted invite."""
        pending_invite.accepted_at = datetime.utcnow()
        db.commit()

        response = client.delete(
            f"/api/invites/me/invites/{pending_invite.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 404


class TestVerifyInvite:
    """Test GET /api/invites/verify/{token} endpoint (public)."""

    def test_valid_invite_returns_info(
        self, client: TestClient, pending_invite: Invite, company: Company
    ):
        """Test valid invite token returns full info."""
        response = client.get(f"/api/invites/verify/{pending_invite.token}")

        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is True
        assert data["company_name"] == company.name
        assert data["role"] == pending_invite.role
        assert data["email"] == pending_invite.email
        assert data["expired"] is False

    def test_invalid_token_returns_invalid(self, client: TestClient):
        """Test invalid token returns valid=false."""
        response = client.get("/api/invites/verify/invalid-token-xyz")

        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert data["company_name"] is None
        assert data["expired"] is False

    def test_expired_invite_returns_expired(
        self, client: TestClient, db: Session, pending_invite: Invite
    ):
        """Test expired invite returns expired=true."""
        pending_invite.expires_at = datetime.utcnow() - timedelta(days=1)
        db.commit()

        response = client.get(f"/api/invites/verify/{pending_invite.token}")

        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert data["expired"] is True

    def test_accepted_invite_returns_invalid(
        self, client: TestClient, db: Session, pending_invite: Invite
    ):
        """Test already accepted invite returns valid=false."""
        pending_invite.accepted_at = datetime.utcnow()
        db.commit()

        response = client.get(f"/api/invites/verify/{pending_invite.token}")

        assert response.status_code == 200
        data = response.json()
        assert data["valid"] is False
        assert data["expired"] is False

    def test_verify_endpoint_is_public(
        self, client: TestClient, pending_invite: Invite
    ):
        """Test verify endpoint does not require authentication."""
        # No Authorization header
        response = client.get(f"/api/invites/verify/{pending_invite.token}")

        assert response.status_code == 200
        assert response.json()["valid"] is True
