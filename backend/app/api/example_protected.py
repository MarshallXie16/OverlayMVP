"""
Example protected endpoints demonstrating JWT authentication usage.

This file shows how to use get_current_user and get_current_admin dependencies.
Delete this file after understanding the pattern.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.utils.dependencies import get_current_user, get_current_admin

router = APIRouter()


# Example 1: Protected endpoint requiring any authenticated user
@router.get("/me")
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """
    Get current user's profile.

    **Authentication Required**: Any valid JWT token

    The current_user parameter is automatically populated by the
    get_current_user dependency, which:
    1. Extracts JWT from Authorization header
    2. Validates token signature and expiration
    3. Queries user from database
    4. Returns User object or raises 401

    Returns:
        User profile information
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "company_id": current_user.company_id,
    }


# Example 2: Protected endpoint with multi-tenant filtering
@router.get("/my-data")
async def get_my_company_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get data filtered by user's company_id.

    **Authentication Required**: Any valid JWT token

    This example shows how to use the authenticated user's company_id
    for multi-tenant data isolation. Always filter by current_user.company_id
    to ensure users can only access their company's data.

    Returns:
        Company-specific data
    """
    # Example: Query workflows for current user's company
    # workflows = db.query(Workflow).filter(
    #     Workflow.company_id == current_user.company_id
    # ).all()

    return {
        "message": "This endpoint returns data for your company only",
        "company_id": current_user.company_id,
        "note": "Always filter database queries by current_user.company_id",
    }


# Example 3: Admin-only endpoint
@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Delete a user (admin only).

    **Authentication Required**: Admin role

    The get_current_admin dependency chains with get_current_user:
    1. First validates JWT (401 if invalid)
    2. Then checks if user.role == "admin" (403 if not admin)
    3. Returns admin User object if both checks pass

    This ensures only authenticated admin users can access this endpoint.

    Args:
        user_id: ID of user to delete
        current_admin: Admin user from dependency (automatic)
        db: Database session from dependency (automatic)

    Returns:
        Success message
    """
    # Example: Delete user from same company
    # user_to_delete = db.query(User).filter(
    #     User.id == user_id,
    #     User.company_id == current_admin.company_id  # Multi-tenant check
    # ).first()
    #
    # if not user_to_delete:
    #     raise HTTPException(status_code=404, detail="User not found")
    #
    # db.delete(user_to_delete)
    # db.commit()

    return {
        "message": f"User {user_id} deleted successfully",
        "deleted_by_admin_id": current_admin.id,
        "note": "This endpoint requires admin role",
    }


# Example 4: Endpoint with optional authentication
@router.get("/public-or-authenticated")
async def public_or_authenticated_endpoint(
    current_user: User = Depends(get_current_user) if False else None,
):
    """
    Endpoint that works both with and without authentication.

    **Authentication**: Optional

    Note: For truly optional auth, you'd need to create a separate
    get_current_user_optional dependency that doesn't raise 401
    when token is missing. This is just a placeholder example.

    Most endpoints should require authentication for security.
    """
    if current_user:
        return {
            "message": "Hello authenticated user",
            "user_id": current_user.id,
        }
    else:
        return {
            "message": "Hello anonymous user",
        }


# Example 5: Combining dependencies
@router.post("/admin-data")
async def create_admin_data(
    data: dict,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Create data with admin privileges.

    **Authentication Required**: Admin role
    **Database Access**: Yes

    This shows how to combine multiple dependencies:
    - get_current_admin: Validates JWT + admin role
    - get_db: Provides database session

    FastAPI automatically resolves all dependencies in order.

    Returns:
        Created data confirmation
    """
    return {
        "message": "Data created by admin",
        "admin_id": current_admin.id,
        "company_id": current_admin.company_id,
        "data": data,
    }
