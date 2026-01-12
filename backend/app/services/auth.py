"""
Authentication service layer for user signup, login, and company management.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import datetime, timezone
from typing import Optional
import secrets

from app.models.user import User
from app.models.company import Company
from app.models.invite import Invite
from app.schemas.auth import SignupRequest, LoginRequest, UserResponse
from app.utils.security import hash_password, verify_password


def generate_invite_token() -> str:
    """
    Generate a secure random invite token for company invites.

    Returns:
        Random URL-safe token string
    """
    return secrets.token_urlsafe(32)


def create_user(db: Session, signup_data: SignupRequest) -> User:
    """
    Create a new user account.

    If company_name is provided, creates a new company with the user as admin.
    If invite_token is provided, joins the user to existing company as regular user.

    Args:
        db: Database session
        signup_data: Signup request data

    Returns:
        Created User object

    Raises:
        HTTPException: If email already exists or invite token is invalid
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

    # Determine company association
    company = None
    user_role = "editor"  # Default role for invited users

    if signup_data.company_name:
        # First user creates new company (admin role)
        company = Company(
            name=signup_data.company_name,
            invite_token=generate_invite_token(),
        )
        db.add(company)
        db.flush()  # Get company.id before creating user
        user_role = "admin"

    elif signup_data.invite_token:
        # First check if this is an email invite token (from Invite table)
        invite = (
            db.query(Invite)
            .filter(Invite.token == signup_data.invite_token)
            .first()
        )

        if invite:
            # Email invite token found - validate it
            if invite.accepted_at is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVITE_ALREADY_USED",
                        "message": "This invite has already been used",
                    },
                )

            # Use timezone-aware comparison
            now = datetime.now(timezone.utc)
            expires_at = invite.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            if now > expires_at:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVITE_EXPIRED",
                        "message": "This invite has expired. Please request a new invite.",
                    },
                )

            # Use the invite's company and role
            company = invite.company
            user_role = invite.role

            # Mark invite as accepted
            invite.accepted_at = datetime.now(timezone.utc)

        else:
            # Fall back to static company invite token
            company = (
                db.query(Company)
                .filter(Company.invite_token == signup_data.invite_token)
                .first()
            )
            if not company:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "code": "INVALID_INVITE_TOKEN",
                        "message": "Invalid invite token",
                    },
                )
            user_role = "editor"  # Default role for static company tokens

    else:
        # Must provide either company_name or invite_token
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "MISSING_COMPANY_INFO",
                "message": "Must provide either company_name or invite_token",
            },
        )

    # Create user
    user = User(
        email=signup_data.email,
        password_hash=hash_password(signup_data.password),
        name=signup_data.name,
        role=user_role,
        company_id=company.id,
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
        company_id=user.company_id,
        company_name=user.company.name,
        timezone=user.timezone,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )
