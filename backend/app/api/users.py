"""
User profile management API endpoints.

Provides endpoints for:
- Updating user profile (display name)
- Changing password (requires current password verification)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.schemas.user import (
    UpdateProfileRequest,
    ChangePasswordRequest,
    ChangePasswordResponse,
)
from app.schemas.auth import UserResponse
from app.services.auth import get_user_response
from app.utils.dependencies import get_current_user
from app.utils.security import hash_password, verify_password

router = APIRouter()


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    update_data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update current user's profile.

    **Authentication Required:** Yes

    **Updatable Fields:**
    - name: Display name (1-255 characters)

    **Returns:**
    - Updated user data

    **Errors:**
    - 401: Invalid or missing token
    """
    # Only update fields that were provided
    if update_data.name is not None:
        current_user.name = update_data.name

    db.commit()
    db.refresh(current_user)

    return get_user_response(current_user)


@router.post("/me/change-password", response_model=ChangePasswordResponse)
async def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Change current user's password.

    **Authentication Required:** Yes

    **Security:**
    - Requires current password verification
    - New password must meet strength requirements (8+ chars, letter + number)
    - User should re-login after password change (token remains valid but recommend logout)

    **Errors:**
    - 400: Current password incorrect
    - 400: New password same as current
    - 422: New password validation failed
    - 401: Invalid or missing token
    """
    # Verify current password
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_CURRENT_PASSWORD",
                "message": "Current password is incorrect",
            },
        )

    # Check if new password is same as current
    if verify_password(password_data.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SAME_PASSWORD",
                "message": "New password must be different from current password",
            },
        )

    # Update password
    current_user.password_hash = hash_password(password_data.new_password)
    db.commit()

    return ChangePasswordResponse(
        success=True,
        message="Password changed successfully. Please log in again.",
    )
