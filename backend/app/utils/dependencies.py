"""
FastAPI authentication dependencies.

This project uses Supabase Auth as the source of truth for users.
We validate the Supabase JWT and derive an auth user object from token claims
without querying a local `users` table.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError

from app.utils.jwt import decode_token
from app.utils.supabase_auth import verify_supabase_token


# HTTP Bearer token extractor
security = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    """
    Lightweight authenticated user derived from JWT claims.

    NOTE: `id` is a Supabase user id (UUID string) when using Supabase tokens.
    """

    id: str
    email: str
    role: str = "editor"
    name: str = ""
    timezone: Optional[str] = None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthUser:
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

    # Prefer Supabase tokens (current auth system)
    payload: Optional[dict[str, Any]] = None
    try:
        payload = verify_supabase_token(token)
    except HTTPException:
        payload = None

    if payload:
        user_metadata = payload.get("user_metadata") or {}
        app_metadata = payload.get("app_metadata") or {}

        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id or not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "INVALID_TOKEN_PAYLOAD",
                    "message": "Supabase token missing required claims (sub/email)",
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

        role = (
            app_metadata.get("role")
            or payload.get("role")
            or "authenticated"
        )
        # Map Supabase default role to app default role
        if role == "authenticated":
            role = "editor"

        name = (
            user_metadata.get("full_name")
            or user_metadata.get("name")
            or user_metadata.get("display_name")
            or ""
        )
        timezone = user_metadata.get("timezone")

        return AuthUser(
            id=str(user_id),
            email=str(email),
            role=str(role),
            name=str(name),
            timezone=timezone if isinstance(timezone, str) else None,
        )

    # Fallback: legacy API JWTs (if still used anywhere)
    try:
        legacy = decode_token(token)
        user_id = legacy.get("user_id")
        email = legacy.get("email") or ""
        role = legacy.get("role") or "editor"
        if user_id is None:
            raise JWTError("missing user_id")
        return AuthUser(id=str(user_id), email=str(email), role=str(role))
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN",
                "message": f"Invalid or expired token: {str(e)}",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_admin(current_user: AuthUser = Depends(get_current_user)) -> AuthUser:
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
