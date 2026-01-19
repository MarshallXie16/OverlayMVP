"""
Authentication API endpoints for signup and login.

Rate limited to prevent brute force attacks:
- Login: 5 attempts per minute per IP
- Signup: 3 attempts per minute per IP
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse, UserResponse
from app.services.auth import create_user, authenticate_user, get_user_response
from app.utils.jwt import create_access_token
from app.utils.dependencies import get_current_user, AuthUser
from app.utils.rate_limit import limiter
from app.models.user import User

router = APIRouter()


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def signup(request: Request, signup_data: SignupRequest, db: Session = Depends(get_db)):
    """
    Create a new user account.

    **Returns:**
    - JWT access token (7-day expiration)
    - User data

    **Errors:**
    - 400: Email already exists
    """
    # Create user
    user = create_user(db, signup_data)

    # Generate JWT token
    access_token = create_access_token(
        data={
            "user_id": user.id,
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
@limiter.limit("5/minute")
async def login(request: Request, login_data: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate user and return access token.

    **Authentication:**
    - Validates email and password
    - Updates last_login_at timestamp
    - Generates new JWT token

    **Returns:**
    - JWT access token (7-day expiration)
    - User data

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
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Get current user information from JWT token.

    **Authentication Required:**
    - Requires valid JWT token in Authorization header

    **Returns:**
    - User data

    **Errors:**
    - 401: Invalid or missing token
    - 401: User not found
    """
    # Supabase-auth user (no DB lookup)
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or "",
        role=current_user.role,
        timezone=current_user.timezone,
        created_at=None,
        last_login_at=None,
    )
