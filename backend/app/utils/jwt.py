"""
JWT token utilities for authentication.

Tokens have 7-day expiration and include user_id, company_id, role, and email.

NOTE: For the get_current_user dependency, use app.utils.dependencies instead.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
import os
import warnings


# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not SECRET_KEY:
    if os.getenv("ENVIRONMENT", "development") == "production":
        raise RuntimeError(
            "CRITICAL: JWT_SECRET_KEY environment variable must be set in production! "
            "Generate a secure key with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    warnings.warn(
        "JWT_SECRET_KEY not set - using insecure default for development. "
        "Set JWT_SECRET_KEY environment variable before deploying to production.",
        UserWarning
    )
    SECRET_KEY = "dev-secret-key-DO-NOT-USE-IN-PRODUCTION"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7


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


# NOTE: get_current_user has been removed from this file.
# Use app.utils.dependencies.get_current_user instead.
# This prevents duplicate implementations and security gaps.
