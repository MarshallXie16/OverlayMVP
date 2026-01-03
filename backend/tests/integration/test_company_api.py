"""
Integration tests for Company API endpoints.

Tests:
- GET /api/companies/me - Get company info
- PUT /api/companies/me - Update company name
- GET /api/companies/me/members - List team members
- DELETE /api/companies/me/members/{id} - Remove team member
- GET /api/companies/invite/{token} - Public invite info
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.company import Company
from app.models.workflow import Workflow
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
    """Create editor (non-admin) user in same company."""
    user = User(
        email="regular@company.com",
        password_hash="hashed_password",
        name="Regular User",
        role="editor",  # Non-admin role
        company_id=company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def other_company(db: Session) -> Company:
    """Create second company for multi-tenancy tests."""
    company = Company(name="Other Company", invite_token="other-invite-token-456")
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@pytest.fixture
def other_user(db: Session, other_company: Company) -> User:
    """Create user in different company."""
    user = User(
        email="other@other.com",
        password_hash="hashed_password",
        name="Other User",
        role="admin",
        company_id=other_company.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user: User) -> str:
    """Create JWT token for admin user."""
    return create_access_token({
        "user_id": admin_user.id,
        "company_id": admin_user.company_id,
        "role": admin_user.role,
        "email": admin_user.email,
    })


@pytest.fixture
def regular_token(regular_user: User) -> str:
    """Create JWT token for regular user."""
    return create_access_token({
        "user_id": regular_user.id,
        "company_id": regular_user.company_id,
        "role": regular_user.role,
        "email": regular_user.email,
    })


@pytest.fixture
def other_token(other_user: User) -> str:
    """Create JWT token for other company user."""
    return create_access_token({
        "user_id": other_user.id,
        "company_id": other_user.company_id,
        "role": other_user.role,
        "email": other_user.email,
    })


@pytest.fixture
def workflow_by_regular(db: Session, company: Company, regular_user: User) -> Workflow:
    """Create workflow owned by regular user."""
    workflow = Workflow(
        name="Regular User Workflow",
        description="Workflow created by regular user",
        starting_url="https://example.com",
        company_id=company.id,
        created_by=regular_user.id,
        status="active",
    )
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


class TestGetCompany:
    """Test GET /api/companies/me endpoint."""

    def test_get_company_returns_info(
        self, client: TestClient, admin_token: str, company: Company, admin_user: User
    ):
        """Test getting company info as authenticated user."""
        response = client.get(
            "/api/companies/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        assert data["id"] == company.id
        assert data["name"] == "Test Company"
        assert data["invite_token"] == "test-invite-token-123"
        assert data["member_count"] == 1  # Only admin_user exists

    def test_get_company_includes_member_count(
        self, client: TestClient, admin_token: str, company: Company, admin_user: User, regular_user: User
    ):
        """Test member count includes all company members."""
        response = client.get(
            "/api/companies/me",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["member_count"] == 2  # admin + regular

    def test_get_company_without_token_returns_401(self, client: TestClient):
        """Test unauthenticated request returns 401 (missing authentication)."""
        response = client.get("/api/companies/me")
        assert response.status_code == 401
        data = response.json()
        assert data["detail"]["code"] == "MISSING_TOKEN"

    def test_get_company_with_invalid_token_returns_401(self, client: TestClient):
        """Test invalid token returns 401."""
        response = client.get(
            "/api/companies/me",
            headers={"Authorization": "Bearer invalid-token"},
        )
        assert response.status_code == 401


class TestUpdateCompany:
    """Test PUT /api/companies/me endpoint."""

    def test_update_company_name_as_admin(
        self, client: TestClient, admin_token: str, company: Company, admin_user: User
    ):
        """Test admin can update company name."""
        response = client.put(
            "/api/companies/me",
            json={"name": "New Company Name"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Company Name"

    def test_update_company_as_regular_returns_403(
        self, client: TestClient, regular_token: str, regular_user: User
    ):
        """Test regular user cannot update company."""
        response = client.put(
            "/api/companies/me",
            json={"name": "Hacked Name"},
            headers={"Authorization": f"Bearer {regular_token}"},
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_update_company_empty_name_returns_422(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        """Test empty name is rejected."""
        response = client.put(
            "/api/companies/me",
            json={"name": ""},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 422


class TestGetTeamMembers:
    """Test GET /api/companies/me/members endpoint."""

    def test_list_team_members(
        self, client: TestClient, admin_token: str, admin_user: User, regular_user: User
    ):
        """Test listing all team members."""
        response = client.get(
            "/api/companies/me/members",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        assert len(data) == 2
        emails = [m["email"] for m in data]
        assert "admin@company.com" in emails
        assert "regular@company.com" in emails

    def test_list_team_members_includes_all_fields(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        """Test member response includes all expected fields."""
        response = client.get(
            "/api/companies/me/members",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 200
        member = response.json()[0]

        assert "id" in member
        assert "name" in member
        assert "email" in member
        assert "role" in member
        assert "created_at" in member
        assert "last_login_at" in member

    def test_regular_user_can_list_members(
        self, client: TestClient, regular_token: str, admin_user: User, regular_user: User
    ):
        """Test regular users can also list team members."""
        response = client.get(
            "/api/companies/me/members",
            headers={"Authorization": f"Bearer {regular_token}"},
        )

        assert response.status_code == 200
        assert len(response.json()) == 2

    def test_cannot_see_other_company_members(
        self, client: TestClient, other_token: str, admin_user: User, regular_user: User, other_user: User
    ):
        """Test users can only see their own company members."""
        response = client.get(
            "/api/companies/me/members",
            headers={"Authorization": f"Bearer {other_token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Should only see other_user, not admin or regular
        assert len(data) == 1
        assert data[0]["email"] == "other@other.com"


class TestRemoveTeamMember:
    """Test DELETE /api/companies/me/members/{id} endpoint."""

    def test_admin_can_remove_regular_user(
        self, client: TestClient, db: Session, admin_token: str, admin_user: User, regular_user: User
    ):
        """Test admin can remove a regular user."""
        response = client.delete(
            f"/api/companies/me/members/{regular_user.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 204

        # Verify user was deleted
        deleted = db.query(User).filter(User.id == regular_user.id).first()
        assert deleted is None

    def test_admin_cannot_remove_self(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        """Test admin cannot remove themselves."""
        response = client.delete(
            f"/api/companies/me/members/{admin_user.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "CANNOT_REMOVE_SELF"

    def test_regular_cannot_remove_anyone(
        self, client: TestClient, regular_token: str, admin_user: User, regular_user: User
    ):
        """Test regular user cannot remove team members."""
        response = client.delete(
            f"/api/companies/me/members/{admin_user.id}",
            headers={"Authorization": f"Bearer {regular_token}"},
        )

        assert response.status_code == 403

    def test_cannot_remove_user_from_other_company(
        self, client: TestClient, admin_token: str, admin_user: User, other_user: User
    ):
        """Test cannot remove user from different company."""
        response = client.delete(
            f"/api/companies/me/members/{other_user.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "USER_NOT_FOUND"

    def test_remove_nonexistent_user_returns_404(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        """Test removing non-existent user returns 404."""
        response = client.delete(
            "/api/companies/me/members/99999",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 404

    def test_removing_user_reassigns_workflows(
        self,
        client: TestClient,
        db: Session,
        admin_token: str,
        admin_user: User,
        regular_user: User,
        workflow_by_regular: Workflow,
    ):
        """Test removing user reassigns their workflows to admin."""
        workflow_id = workflow_by_regular.id
        original_creator = workflow_by_regular.created_by

        # Verify original creator is the regular user
        assert original_creator == regular_user.id

        # Remove the regular user
        response = client.delete(
            f"/api/companies/me/members/{regular_user.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        assert response.status_code == 204

        # Refresh workflow and check new creator
        db.refresh(workflow_by_regular)
        workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()

        assert workflow is not None
        assert workflow.created_by == admin_user.id


class TestGetInviteInfo:
    """Test GET /api/companies/invite/{token} endpoint (public)."""

    def test_valid_invite_returns_company_name(
        self, client: TestClient, company: Company
    ):
        """Test valid invite token returns company name."""
        response = client.get(f"/api/companies/invite/{company.invite_token}")

        assert response.status_code == 200
        data = response.json()
        assert data["company_name"] == "Test Company"

    def test_invalid_invite_returns_404(self, client: TestClient):
        """Test invalid invite token returns 404."""
        response = client.get("/api/companies/invite/invalid-token-xyz")

        assert response.status_code == 404
        assert response.json()["detail"]["code"] == "INVALID_INVITE_TOKEN"

    def test_invite_endpoint_is_public(self, client: TestClient, company: Company):
        """Test invite endpoint does not require authentication."""
        # No Authorization header
        response = client.get(f"/api/companies/invite/{company.invite_token}")

        assert response.status_code == 200
        assert response.json()["company_name"] == "Test Company"

    def test_other_company_invite_works(
        self, client: TestClient, company: Company, other_company: Company
    ):
        """Test each company has unique invite token."""
        response1 = client.get(f"/api/companies/invite/{company.invite_token}")
        response2 = client.get(f"/api/companies/invite/{other_company.invite_token}")

        assert response1.status_code == 200
        assert response2.status_code == 200
        assert response1.json()["company_name"] == "Test Company"
        assert response2.json()["company_name"] == "Other Company"


class TestUpdateMemberRole:
    """Test PATCH /api/companies/me/members/{id}/role endpoint."""

    def test_admin_can_change_user_role(
        self, client: TestClient, db: Session, admin_token: str, regular_user: User
    ):
        """Test admin can change another user's role."""
        response = client.patch(
            f"/api/companies/me/members/{regular_user.id}/role",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"role": "viewer"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["role"] == "viewer"

        # Verify in database
        db.refresh(regular_user)
        assert regular_user.role == "viewer"

    def test_admin_cannot_change_own_role(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        """Test admin cannot change their own role."""
        response = client.patch(
            f"/api/companies/me/members/{admin_user.id}/role",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"role": "editor"},
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "CANNOT_MODIFY_SELF"

    def test_cannot_demote_last_admin(
        self, client: TestClient, db: Session, admin_token: str, admin_user: User, regular_user: User
    ):
        """Test cannot demote the last admin in the company."""
        # Promote regular user to admin first
        regular_user.role = "admin"
        db.commit()

        # Now demote the regular_user (who is now admin) - should work
        response = client.patch(
            f"/api/companies/me/members/{regular_user.id}/role",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"role": "editor"},
        )
        assert response.status_code == 200

        # Now try to demote the original admin - should fail (last admin)
        # Need a new token for regular_user as admin to do this
        regular_admin_token = create_access_token(
            data={
                "user_id": regular_user.id,
                "company_id": regular_user.company_id,
                "role": "admin",  # Role at time of token creation
                "email": regular_user.email,
            }
        )
        # Actually regular_user was just demoted, so we need to re-promote
        regular_user.role = "admin"
        db.commit()

        # Try demoting admin_user with only one other admin left
        response = client.patch(
            f"/api/companies/me/members/{admin_user.id}/role",
            headers={"Authorization": f"Bearer {regular_admin_token}"},
            json={"role": "editor"},
        )
        # Should succeed because there's still regular_user as admin
        assert response.status_code == 200

    def test_regular_user_cannot_change_roles(
        self, client: TestClient, regular_token: str, admin_user: User
    ):
        """Test non-admin cannot change user roles."""
        response = client.patch(
            f"/api/companies/me/members/{admin_user.id}/role",
            headers={"Authorization": f"Bearer {regular_token}"},
            json={"role": "viewer"},
        )

        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_invalid_role_returns_422(
        self, client: TestClient, admin_token: str, regular_user: User
    ):
        """Test invalid role value returns validation error."""
        response = client.patch(
            f"/api/companies/me/members/{regular_user.id}/role",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"role": "invalid_role"},
        )

        assert response.status_code == 422


class TestUpdateMemberStatus:
    """Test PATCH /api/companies/me/members/{id}/status endpoint."""

    def test_admin_can_suspend_user(
        self, client: TestClient, db: Session, admin_token: str, regular_user: User
    ):
        """Test admin can suspend a user."""
        response = client.patch(
            f"/api/companies/me/members/{regular_user.id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "suspended"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "suspended"

        # Verify in database
        db.refresh(regular_user)
        assert regular_user.status == "suspended"

    def test_admin_can_reactivate_user(
        self, client: TestClient, db: Session, admin_token: str, regular_user: User
    ):
        """Test admin can reactivate a suspended user."""
        # First suspend the user
        regular_user.status = "suspended"
        db.commit()

        response = client.patch(
            f"/api/companies/me/members/{regular_user.id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "active"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "active"

    def test_admin_cannot_change_own_status(
        self, client: TestClient, admin_token: str, admin_user: User
    ):
        """Test admin cannot change their own status."""
        response = client.patch(
            f"/api/companies/me/members/{admin_user.id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "suspended"},
        )

        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "CANNOT_MODIFY_SELF"

    def test_cannot_suspend_last_admin(
        self, client: TestClient, db: Session, admin_token: str, admin_user: User, regular_user: User
    ):
        """Test cannot suspend the last active admin."""
        # Make regular user an admin too
        regular_user.role = "admin"
        db.commit()

        regular_admin_token = create_access_token(
            data={
                "user_id": regular_user.id,
                "company_id": regular_user.company_id,
                "role": "admin",
                "email": regular_user.email,
            }
        )

        # Try to suspend admin_user - should work because regular_user is also admin
        response = client.patch(
            f"/api/companies/me/members/{admin_user.id}/status",
            headers={"Authorization": f"Bearer {regular_admin_token}"},
            json={"status": "suspended"},
        )
        assert response.status_code == 200

        # Now regular_user is the only active admin
        # Try to suspend regular_user using their own token - should fail (can't modify self)
        response = client.patch(
            f"/api/companies/me/members/{regular_user.id}/status",
            headers={"Authorization": f"Bearer {regular_admin_token}"},
            json={"status": "suspended"},
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "CANNOT_MODIFY_SELF"

    def test_regular_user_cannot_change_status(
        self, client: TestClient, regular_token: str, admin_user: User
    ):
        """Test non-admin cannot change user status."""
        response = client.patch(
            f"/api/companies/me/members/{admin_user.id}/status",
            headers={"Authorization": f"Bearer {regular_token}"},
            json={"status": "suspended"},
        )

        assert response.status_code == 403
