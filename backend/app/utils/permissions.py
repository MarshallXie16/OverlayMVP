"""
Role-based access control (RBAC) helpers.

Provides permission checking for the 3-tier role system:
- Admin: Full control (manage users, all workflow ops, company settings)
- Editor: Workflow operations (create, edit, delete, run workflows)
- Viewer: Read-only (run workflows, view team)

Usage:
    from app.utils.permissions import require_permission, Permission

    @router.post("/workflows")
    def create_workflow(current_user: User = Depends(get_current_user)):
        require_permission(current_user, Permission.CREATE_WORKFLOW)
        # ... proceed with creation
"""
from enum import Enum
from typing import TYPE_CHECKING, Set
from fastapi import HTTPException, status

if TYPE_CHECKING:
    from app.models.user import User


class Permission(str, Enum):
    """All permissions in the system."""

    # User management (admin only)
    MANAGE_USERS = "manage_users"           # Add/remove team members
    MANAGE_ROLES = "manage_roles"           # Change user roles
    MANAGE_STATUS = "manage_status"         # Suspend/reactivate users
    VIEW_INVITES = "view_invites"           # View pending invites
    CREATE_INVITE = "create_invite"         # Send invites
    REVOKE_INVITE = "revoke_invite"         # Cancel pending invites

    # Company settings (admin only)
    MANAGE_COMPANY = "manage_company"       # Update company name, settings

    # Workflow operations
    CREATE_WORKFLOW = "create_workflow"     # Create new workflows
    EDIT_WORKFLOW = "edit_workflow"         # Modify workflow steps
    DELETE_WORKFLOW = "delete_workflow"     # Delete workflows
    RUN_WORKFLOW = "run_workflow"           # Execute walkthrough mode
    VIEW_WORKFLOW = "view_workflow"         # View workflow details

    # Team visibility
    VIEW_TEAM = "view_team"                 # See team member list


# Permission sets for each role
ROLE_PERMISSIONS: dict[str, Set[Permission]] = {
    "admin": {
        # All user management
        Permission.MANAGE_USERS,
        Permission.MANAGE_ROLES,
        Permission.MANAGE_STATUS,
        Permission.VIEW_INVITES,
        Permission.CREATE_INVITE,
        Permission.REVOKE_INVITE,
        # Company settings
        Permission.MANAGE_COMPANY,
        # All workflow operations
        Permission.CREATE_WORKFLOW,
        Permission.EDIT_WORKFLOW,
        Permission.DELETE_WORKFLOW,
        Permission.RUN_WORKFLOW,
        Permission.VIEW_WORKFLOW,
        # Team visibility
        Permission.VIEW_TEAM,
    },
    "editor": {
        # All workflow operations
        Permission.CREATE_WORKFLOW,
        Permission.EDIT_WORKFLOW,
        Permission.DELETE_WORKFLOW,
        Permission.RUN_WORKFLOW,
        Permission.VIEW_WORKFLOW,
        # Team visibility
        Permission.VIEW_TEAM,
    },
    "viewer": {
        # Read-only workflow access
        Permission.RUN_WORKFLOW,
        Permission.VIEW_WORKFLOW,
        # Team visibility
        Permission.VIEW_TEAM,
    },
}


def has_permission(user: "User", permission: Permission) -> bool:
    """
    Check if a user has a specific permission based on their role.

    Args:
        user: The user to check
        permission: The permission to verify

    Returns:
        True if user has the permission, False otherwise
    """
    role_perms = ROLE_PERMISSIONS.get(user.role, set())
    return permission in role_perms


def require_permission(user: "User", permission: Permission) -> None:
    """
    Require a user to have a specific permission, raising 403 if not.

    Args:
        user: The user to check
        permission: The permission required

    Raises:
        HTTPException: 403 if user lacks the permission
    """
    if not has_permission(user, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INSUFFICIENT_PERMISSIONS",
                "message": f"This action requires the '{permission.value}' permission",
                "required_permission": permission.value,
                "user_role": user.role,
            },
        )


def is_admin(user: "User") -> bool:
    """Check if user has admin role."""
    return user.role == "admin"


def is_editor_or_above(user: "User") -> bool:
    """Check if user has editor or admin role."""
    return user.role in ("admin", "editor")


def can_manage_users(user: "User") -> bool:
    """Check if user can manage other users (admin only)."""
    return has_permission(user, Permission.MANAGE_USERS)


def can_create_workflow(user: "User") -> bool:
    """Check if user can create workflows (admin, editor)."""
    return has_permission(user, Permission.CREATE_WORKFLOW)


def can_edit_workflow(user: "User") -> bool:
    """Check if user can edit workflows (admin, editor)."""
    return has_permission(user, Permission.EDIT_WORKFLOW)


def can_run_workflow(user: "User") -> bool:
    """Check if user can run workflows (all roles)."""
    return has_permission(user, Permission.RUN_WORKFLOW)
