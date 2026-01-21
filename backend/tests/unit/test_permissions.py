"""
Unit tests for RBAC permission helpers.

Tests the 3-tier role system: admin > editor > viewer
"""
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException

from app.utils.permissions import (
    Permission,
    ROLE_PERMISSIONS,
    has_permission,
    require_permission,
    is_admin,
    is_editor_or_above,
    can_create_workflow,
    can_edit_workflow,
    can_run_workflow,
)


def create_mock_user(role: str) -> MagicMock:
    """Create a mock user with the specified role."""
    user = MagicMock()
    user.role = role
    return user


class TestRolePermissions:
    """Test the ROLE_PERMISSIONS mapping."""

    def test_admin_has_all_permissions(self):
        """Admin should have all defined permissions."""
        admin_perms = ROLE_PERMISSIONS["admin"]
        all_perms = set(Permission)
        assert admin_perms == all_perms

    def test_editor_has_workflow_permissions(self):
        """Editor should have workflow permissions."""
        editor_perms = ROLE_PERMISSIONS["editor"]

        # Should have
        assert Permission.CREATE_WORKFLOW in editor_perms
        assert Permission.EDIT_WORKFLOW in editor_perms
        assert Permission.DELETE_WORKFLOW in editor_perms
        assert Permission.RUN_WORKFLOW in editor_perms
        assert Permission.VIEW_WORKFLOW in editor_perms

    def test_viewer_has_readonly_permissions(self):
        """Viewer should only have run/view permissions."""
        viewer_perms = ROLE_PERMISSIONS["viewer"]

        # Should have
        assert Permission.RUN_WORKFLOW in viewer_perms
        assert Permission.VIEW_WORKFLOW in viewer_perms

        # Should NOT have
        assert Permission.CREATE_WORKFLOW not in viewer_perms
        assert Permission.EDIT_WORKFLOW not in viewer_perms
        assert Permission.DELETE_WORKFLOW not in viewer_perms

    def test_roles_are_hierarchical(self):
        """Admin perms ⊃ editor perms ⊃ viewer perms."""
        admin_perms = ROLE_PERMISSIONS["admin"]
        editor_perms = ROLE_PERMISSIONS["editor"]
        viewer_perms = ROLE_PERMISSIONS["viewer"]

        assert editor_perms.issubset(admin_perms)
        assert viewer_perms.issubset(editor_perms)
        assert viewer_perms.issubset(admin_perms)


class TestHasPermission:
    """Test the has_permission function."""

    def test_admin_has_create_workflow(self):
        user = create_mock_user("admin")
        assert has_permission(user, Permission.CREATE_WORKFLOW) is True

    def test_editor_has_create_workflow(self):
        user = create_mock_user("editor")
        assert has_permission(user, Permission.CREATE_WORKFLOW) is True

    def test_viewer_has_run_workflow(self):
        user = create_mock_user("viewer")
        assert has_permission(user, Permission.RUN_WORKFLOW) is True

    def test_viewer_lacks_create_workflow(self):
        user = create_mock_user("viewer")
        assert has_permission(user, Permission.CREATE_WORKFLOW) is False

    def test_unknown_role_has_no_permissions(self):
        user = create_mock_user("unknown_role")
        assert has_permission(user, Permission.VIEW_WORKFLOW) is False


class TestRequirePermission:
    """Test the require_permission function."""

    def test_admin_passes_create_workflow(self):
        user = create_mock_user("admin")
        # Should not raise
        require_permission(user, Permission.CREATE_WORKFLOW)

    def test_viewer_fails_create_workflow(self):
        user = create_mock_user("viewer")
        with pytest.raises(HTTPException) as exc_info:
            require_permission(user, Permission.CREATE_WORKFLOW)

        assert exc_info.value.status_code == 403
        assert "create_workflow" in exc_info.value.detail["message"]


class TestRoleCheckers:
    """Test the convenience role checker functions."""

    def test_is_admin_true_for_admin(self):
        user = create_mock_user("admin")
        assert is_admin(user) is True

    def test_is_admin_false_for_editor(self):
        user = create_mock_user("editor")
        assert is_admin(user) is False

    def test_is_admin_false_for_viewer(self):
        user = create_mock_user("viewer")
        assert is_admin(user) is False

    def test_is_editor_or_above_for_admin(self):
        user = create_mock_user("admin")
        assert is_editor_or_above(user) is True

    def test_is_editor_or_above_for_editor(self):
        user = create_mock_user("editor")
        assert is_editor_or_above(user) is True

    def test_is_editor_or_above_false_for_viewer(self):
        user = create_mock_user("viewer")
        assert is_editor_or_above(user) is False

    def test_can_create_workflow(self):
        assert can_create_workflow(create_mock_user("admin")) is True
        assert can_create_workflow(create_mock_user("editor")) is True
        assert can_create_workflow(create_mock_user("viewer")) is False

    def test_can_edit_workflow(self):
        assert can_edit_workflow(create_mock_user("admin")) is True
        assert can_edit_workflow(create_mock_user("editor")) is True
        assert can_edit_workflow(create_mock_user("viewer")) is False

    def test_can_run_workflow_all_roles(self):
        assert can_run_workflow(create_mock_user("admin")) is True
        assert can_run_workflow(create_mock_user("editor")) is True
        assert can_run_workflow(create_mock_user("viewer")) is True
