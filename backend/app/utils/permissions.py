"""
Role-based access control (RBAC) helpers.

Provides permission checking for the 3-tier role system:
- Admin: Full control (all workflow ops)
- Editor: Workflow operations (create, edit, delete, run workflows)
- Viewer: Read-only (run workflows)

Usage:
    from app.utils.permissions import require_permission, Permission

    @router.post("/workflows")
    def create_workflow(current_user: AuthUser = Depends(get_current_user)):
        require_permission(current_user, Permission.CREATE_WORKFLOW)
        # ... proceed with creation
"""
from enum import Enum
from typing import TYPE_CHECKING, Set
from fastapi import HTTPException, status

if TYPE_CHECKING:
    from app.utils.dependencies import AuthUser


class Permission(str, Enum):
    """All permissions in the system."""

    # Workflow operations
    CREATE_WORKFLOW = "create_workflow"     # Create new workflows
    EDIT_WORKFLOW = "edit_workflow"         # Modify workflow steps
    DELETE_WORKFLOW = "delete_workflow"     # Delete workflows
    RUN_WORKFLOW = "run_workflow"           # Execute walkthrough mode
    VIEW_WORKFLOW = "view_workflow"         # View workflow details


# Permission sets for each role
ROLE_PERMISSIONS: dict[str, Set[Permission]] = {
    "admin": {
        # All workflow operations
        Permission.CREATE_WORKFLOW,
        Permission.EDIT_WORKFLOW,
        Permission.DELETE_WORKFLOW,
        Permission.RUN_WORKFLOW,
        Permission.VIEW_WORKFLOW,
    },
    "editor": {
        # All workflow operations
        Permission.CREATE_WORKFLOW,
        Permission.EDIT_WORKFLOW,
        Permission.DELETE_WORKFLOW,
        Permission.RUN_WORKFLOW,
        Permission.VIEW_WORKFLOW,
    },
    "viewer": {
        # Read-only workflow access
        Permission.RUN_WORKFLOW,
        Permission.VIEW_WORKFLOW,
    },
}


def has_permission(user: "AuthUser", permission: Permission) -> bool:
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


def require_permission(user: "AuthUser", permission: Permission) -> None:
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


def is_admin(user: "AuthUser") -> bool:
    """Check if user has admin role."""
    return user.role == "admin"


def is_editor_or_above(user: "AuthUser") -> bool:
    """Check if user has editor or admin role."""
    return user.role in ("admin", "editor")


def can_create_workflow(user: "AuthUser") -> bool:
    """Check if user can create workflows (admin, editor)."""
    return has_permission(user, Permission.CREATE_WORKFLOW)


def can_edit_workflow(user: "AuthUser") -> bool:
    """Check if user can edit workflows (admin, editor)."""
    return has_permission(user, Permission.EDIT_WORKFLOW)


def can_run_workflow(user: "AuthUser") -> bool:
    """Check if user can run workflows (all roles)."""
    return has_permission(user, Permission.RUN_WORKFLOW)
