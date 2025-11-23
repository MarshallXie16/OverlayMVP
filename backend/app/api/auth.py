"""
Authentication API endpoints for signup and login.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse, UserResponse
from app.services.auth import create_user, authenticate_user, get_user_response
from app.utils.jwt import create_access_token, get_current_user
from app.models.user import User

router = APIRouter()


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(signup_data: SignupRequest, db: Session = Depends(get_db)):
    """
    Create a new user account.

    **First user creates company (admin role):**
    - Provide `company_name` to create a new company
    - User becomes admin with full permissions
    - Company invite token is generated

    **Subsequent users join company (regular role):**
    - Provide `invite_token` to join existing company
    - User becomes regular user with limited permissions

    **Returns:**
    - JWT access token (7-day expiration)
    - User data including company information

    **Errors:**
    - 400: Email already exists
    - 400: Invalid invite token
    - 400: Missing company_name or invite_token
    """
    # Create user (handles company creation/joining)
    user = create_user(db, signup_data)

    # Generate JWT token
    access_token = create_access_token(
        data={
            "user_id": user.id,
            "company_id": user.company_id,
            "role": user.role,
            "email": user.email,
        }
    )

    # Return token and user data
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=get_user_response(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user and return access token.

    **Authentication:**
    - Validates email and password
    - Updates last_login_at timestamp
    - Generates new JWT token

    **Returns:**
    - JWT access token (7-day expiration)
    - User data including company information

    **Errors:**
    - 401: Invalid credentials (email or password incorrect)
    """
    # Authenticate user
    user = authenticate_user(db, login_data)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Invalid email or password",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate JWT token
    access_token = create_access_token(
        data={
            "user_id": user.id,
            "company_id": user.company_id,
            "role": user.role,
            "email": user.email,
        }
    )

    # Return token and user data
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=get_user_response(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user information from JWT token.

    **Authentication Required:**
    - Requires valid JWT token in Authorization header

    **Returns:**
    - User data including company information

    **Errors:**
    - 401: Invalid or missing token
    - 401: User not found
    """
    return get_user_response(current_user)
