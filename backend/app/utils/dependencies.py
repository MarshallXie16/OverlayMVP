"""
FastAPI dependencies for JWT authentication and authorization.

Provides user context extraction from JWT tokens and role-based access control.
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError

from app.db.session import get_db
from app.models.user import User
from app.utils.jwt import decode_token


# HTTP Bearer token extractor
security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Extract and validate JWT token, return authenticated User object.

    **Token Validation:**
    - Extracts token from Authorization header: "Bearer {token}"
    - Validates token signature and expiration
    - Queries user from database using user_id from token
    - Returns User object for use in endpoint handlers

    **Error Cases (401 Unauthorized):**
    - Missing Authorization header
    - Invalid token format
    - Expired token
    - Invalid signature
    - User not found in database (deleted user)

    **Usage:**
        @router.get("/protected")
        def protected_endpoint(current_user: User = Depends(get_current_user)):
            # current_user is authenticated User object
            return {"user_id": current_user.id}

    Args:
        credentials: HTTP Bearer credentials from Authorization header
        db: Database session

    Returns:
        User: Authenticated user object

    Raises:
        HTTPException: 401 if authentication fails
    """
    # Check if Authorization header is present
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "MISSING_TOKEN",
                "message": "Authorization header missing. Please provide a valid JWT token.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Decode and validate token
    try:
        payload = decode_token(token)
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN",
                "message": f"Invalid or expired token: {str(e)}",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract user_id from token
    user_id: Optional[int] = payload.get("user_id")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN_PAYLOAD",
                "message": "Token payload missing user_id claim",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Query user from database
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "USER_NOT_FOUND",
                "message": "User account no longer exists",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Validate JWT token and ensure user has admin role.

    This dependency chains with get_current_user, so it performs
    all JWT validation AND checks for admin role.

    **Role Validation:**
    - First validates JWT (via get_current_user)
    - Then checks if user.role == "admin"
    - Returns User object if admin, raises 403 if not

    **Error Cases:**
    - 401: All get_current_user errors (invalid token, etc.)
    - 403: Valid token but user is not admin

    **Usage:**
        @router.delete("/admin/users/{user_id}")
        def delete_user(
            user_id: int,
            current_admin: User = Depends(get_current_admin)
        ):
            # current_admin is authenticated User with admin role
            # Proceed with admin-only operation
            pass

    Args:
        current_user: User object from get_current_user dependency

    Returns:
        User: Authenticated admin user object

    Raises:
        HTTPException: 403 if user is not admin
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INSUFFICIENT_PERMISSIONS",
                "message": "This operation requires admin privileges",
            },
        )

    return current_user
