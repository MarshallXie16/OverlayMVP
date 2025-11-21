"""
JWT token utilities for authentication.

Tokens have 7-day expiration and include user_id, company_id, role, and email.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import os

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

# HTTP Bearer security scheme
security = HTTPBearer()


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary of claims to encode in the token
        expires_delta: Optional custom expiration time (default: 7 days)

    Returns:
        Encoded JWT token string

    Example:
        >>> token = create_access_token({
        ...     "user_id": 1,
        ...     "company_id": 1,
        ...     "role": "admin",
        ...     "email": "sarah@company.com"
        ... })
        >>> len(token) > 50
        True
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)

    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token string to decode

    Returns:
        Dictionary of decoded claims

    Raises:
        JWTError: If token is invalid, expired, or malformed

    Example:
        >>> token = create_access_token({"user_id": 1, "email": "test@example.com"})
        >>> payload = decode_token(token)
        >>> payload["user_id"]
        1
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        raise JWTError(f"Invalid token: {str(e)}")


def verify_token(token: str) -> bool:
    """
    Verify if a token is valid without decoding it fully.

    Args:
        token: JWT token string to verify

    Returns:
        True if token is valid, False otherwise

    Example:
        >>> token = create_access_token({"user_id": 1})
        >>> verify_token(token)
        True
        >>> verify_token("invalid.token.here")
        False
    """
    try:
        decode_token(token)
        return True
    except JWTError:
        return False


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(lambda: None),  # Will be overridden when used
):
    """
    FastAPI dependency to extract and validate the current user from JWT token.

    Args:
        credentials: HTTP Bearer credentials
        db: Database session

    Returns:
        User object from database

    Raises:
        HTTPException: If token is invalid or user not found
    """
    from app.db.session import get_db
    from app.models.user import User

    # Get database session if not provided
    if db is None:
        db = next(get_db())

    token = credentials.credentials

    try:
        payload = decode_token(token)
        user_id: int = payload.get("user_id")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_TOKEN", "message": "Invalid authentication token"},
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Invalid authentication token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_NOT_FOUND", "message": "User not found"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
