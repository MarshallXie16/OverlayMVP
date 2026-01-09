"""
Rate limiting configuration for auth endpoints.

Uses slowapi to prevent brute force attacks on authentication endpoints.

Rate limits:
- Login: 5 attempts per minute per IP
- Signup: 3 attempts per minute per IP

Disabled during testing (when TESTING=true environment variable is set).
"""
import os
from slowapi import Limiter
from slowapi.util import get_remote_address

# Disable rate limiting during tests
# This allows test suite to run without hitting rate limits
_is_testing = os.getenv("TESTING", "").lower() in ("true", "1", "yes")

# Shared rate limiter instance
# Key function extracts client IP for per-IP rate limiting
limiter = Limiter(
    key_func=get_remote_address,
    enabled=not _is_testing,  # Disabled during tests
)
