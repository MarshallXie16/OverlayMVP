"""
Supabase Authentication Integration

Validates Supabase JWT tokens and syncs user data.
"""
from __future__ import annotations

from datetime import datetime, timezone
import os
import secrets
import time
from typing import Any, Optional

from fastapi import HTTPException, status
import httpx
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.models.user import User
from app.utils.security import hash_password

_JWKS_CACHE_TTL_SECONDS = 60 * 10  # 10 minutes
_jwks_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _get_supabase_jwt_secret() -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        # Don't crash app import; fail requests clearly instead.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "SUPABASE_NOT_CONFIGURED",
                "message": "SUPABASE_JWT_SECRET is not set on the backend.",
            },
        )
    return secret


def _get_jwks_url_from_token(token: str) -> str:
    """
    Derive the JWKS URL from the token issuer (preferred) or SUPABASE_URL fallback.

    Supabase typically sets iss like: https://<project>.supabase.co/auth/v1
    JWKS is then:                https://<project>.supabase.co/auth/v1/.well-known/jwks.json
    """
    iss: Optional[str] = None
    try:
        claims = jwt.get_unverified_claims(token)
        iss = claims.get("iss")
    except Exception:
        iss = None

    if iss:
        return iss.rstrip("/") + "/.well-known/jwks.json"

    supabase_url = os.getenv("SUPABASE_URL")
    if supabase_url:
        return supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail={
            "code": "SUPABASE_NOT_CONFIGURED",
            "message": "Cannot determine Supabase JWKS URL. Token is missing iss and SUPABASE_URL is not set. Set SUPABASE_URL in backend/.env (Project URL, e.g. https://<project>.supabase.co).",
        },
    )


def _fetch_jwks_keys(jwks_url: str) -> list[dict[str, Any]]:
    now = time.time()
    cached = _jwks_cache.get(jwks_url)
    if cached and (now - cached[0]) < _JWKS_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        resp = httpx.get(jwks_url, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        keys = data.get("keys") or []
        if not isinstance(keys, list) or not keys:
            raise ValueError("JWKS contains no keys")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "SUPABASE_JWKS_FETCH_FAILED",
                "message": f"Failed to fetch Supabase JWKS from {jwks_url}: {e}",
            },
        )

    _jwks_cache[jwks_url] = (now, keys)
    return keys


def _get_jwk_for_token(token: str) -> dict[str, Any]:
    header = jwt.get_unverified_header(token)
    kid = header.get("kid")
    jwks_url = _get_jwks_url_from_token(token)
    keys = _fetch_jwks_keys(jwks_url)

    if kid:
        for k in keys:
            if k.get("kid") == kid:
                return k
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "UNKNOWN_TOKEN_KID",
                "message": f"Token kid={kid} not found in Supabase JWKS.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    if len(keys) == 1:
        return keys[0]

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={
            "code": "MISSING_TOKEN_KID",
            "message": "Token header missing kid and Supabase JWKS has multiple keys.",
        },
        headers={"WWW-Authenticate": "Bearer"},
    )


def verify_supabase_token(token: str) -> dict[str, Any]:
    """
    Verify and decode a Supabase JWT token.

    Args:
        token: JWT token from Supabase

    Returns:
        Decoded token payload with user info

    Raises:
        HTTPException: If token is invalid
    """
    try:
        # Quick sanity/diagnostics (no verification, safe to inspect)
        try:
            header = jwt.get_unverified_header(token)
        except Exception:
            header = {}

        alg = header.get("alg")
        # Supabase can mint either symmetric (HS256) or asymmetric (ES256/RS256) JWTs.
        # - HS256: verify with SUPABASE_JWT_SECRET
        # - ES256/RS256: verify with Supabase JWKS public keys
        if alg == "HS256" or not alg:
            secret = _get_supabase_jwt_secret()
            try:
                return jwt.decode(
                    token,
                    secret,
                    algorithms=["HS256"],
                    audience="authenticated",
                )
            except JWTError as e:
                msg = str(e).lower()
                if "aud" in msg or "audience" in msg:
                    return jwt.decode(token, secret, algorithms=["HS256"])
                raise

        if alg in ("ES256", "RS256"):
            jwk_key = _get_jwk_for_token(token)
            try:
                return jwt.decode(
                    token,
                    jwk_key,
                    algorithms=[alg],
                    audience="authenticated",
                )
            except JWTError as e:
                msg = str(e).lower()
                if "aud" in msg or "audience" in msg:
                    return jwt.decode(token, jwk_key, algorithms=[alg])
                raise

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "UNSUPPORTED_TOKEN_ALG",
                "message": f"Unsupported Supabase JWT alg={alg}. Supported: HS256, ES256, RS256.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError as e:
        # Add a helpful hint for the common failure mode: wrong secret / wrong project.
        # (Do not include the token itself.)
        hint = ""
        msg = str(e)
        lower = msg.lower()
        if "signature verification failed" in lower or "invalid signature" in lower:
            hint = " (check that SUPABASE_JWT_SECRET matches the same Supabase project as VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY)"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN",
                "message": f"Invalid or expired token: {msg}{hint}",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_or_create_user_from_supabase_payload(db: Session, payload: dict[str, Any]) -> User:
    """
    Map a valid Supabase JWT payload to a local User row (create if missing).

    We store a random password_hash since Supabase owns the real password.
    """
    email: Optional[str] = payload.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_TOKEN_PAYLOAD",
                "message": "Supabase token payload missing email claim",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.email == email).first()
    if user:
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(user)
        return user

    user_metadata = payload.get("user_metadata") or {}
    name = (
        user_metadata.get("full_name")
        or user_metadata.get("name")
        or user_metadata.get("display_name")
        or ""
    )

    user = User(
        email=email,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        name=name,
        role="editor",
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

