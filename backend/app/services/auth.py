"""
Authentication service layer for user signup and login.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime, timezone
from typing import Optional

from app.models.user import User
from app.schemas.auth import SignupRequest, LoginRequest, UserResponse
from app.utils.security import hash_password, verify_password


def create_user(db: Session, signup_data: SignupRequest) -> User:
    """
    Create a new user account.

    Args:
        db: Database session
        signup_data: Signup request data

    Returns:
        Created User object

    Raises:
        HTTPException: If email already exists
    """
    # Check if email already exists
    existing_user = db.query(User).filter(User.email == signup_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "EMAIL_EXISTS",
                "message": f"User with email '{signup_data.email}' already exists",
            },
        )

    # Create user with default role
    user = User(
        email=signup_data.email,
        password_hash=hash_password(signup_data.password),
        name=signup_data.name,
        role="editor",  # Default role
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def authenticate_user(db: Session, login_data: LoginRequest) -> Optional[User]:
    """
    Authenticate a user by email and password.

    Args:
        db: Database session
        login_data: Login request data

    Returns:
        User object if credentials are valid

    Raises:
        HTTPException: 403 if user account is suspended
    """
    user = db.query(User).filter(User.email == login_data.email).first()

    if not user:
        return None

    if not verify_password(login_data.password, user.password_hash):
        return None

    # Check if user is suspended
    if user.status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "ACCOUNT_SUSPENDED",
                "message": "Your account has been suspended. Please contact your administrator.",
            },
        )

    # Update last login timestamp (timezone-aware)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)

    return user


def get_user_response(user: User) -> UserResponse:
    """
    Convert User model to UserResponse schema.

    Args:
        user: User model instance

    Returns:
        UserResponse schema with user data
    """
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name or "",
        role=user.role,
        timezone=user.timezone,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )
