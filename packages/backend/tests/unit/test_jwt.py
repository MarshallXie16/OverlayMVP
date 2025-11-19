"""
Unit tests for JWT token creation and validation.
"""
import pytest
from datetime import datetime, timedelta
from jose import JWTError

from app.utils.jwt import create_access_token, decode_token, verify_token


class TestTokenCreation:
    """Test JWT token creation."""

    def test_create_access_token_returns_string(self):
        """Test that create_access_token returns a string."""
        data = {"user_id": 1, "email": "test@example.com"}
        token = create_access_token(data)

        assert isinstance(token, str)
        assert len(token) > 50  # JWT tokens are long

    def test_create_access_token_contains_payload(self):
        """Test that token contains the provided data."""
        data = {
            "user_id": 1,
            "company_id": 1,
            "role": "admin",
            "email": "test@example.com",
        }
        token = create_access_token(data)
        decoded = decode_token(token)

        assert decoded["user_id"] == 1
        assert decoded["company_id"] == 1
        assert decoded["role"] == "admin"
        assert decoded["email"] == "test@example.com"

    def test_create_access_token_has_expiration(self):
        """Test that token has expiration claim."""
        data = {"user_id": 1}
        token = create_access_token(data)
        decoded = decode_token(token)

        assert "exp" in decoded
        assert isinstance(decoded["exp"], (int, float))

    def test_create_access_token_default_expiration_7_days(self):
        """Test that default expiration is 7 days."""
        data = {"user_id": 1}
        before = datetime.utcnow()
        token = create_access_token(data)
        after = datetime.utcnow()

        decoded = decode_token(token)
        exp_timestamp = decoded["exp"]
        exp_datetime = datetime.utcfromtimestamp(exp_timestamp)

        # Check expiration is approximately 7 days from now
        expected_exp = before + timedelta(days=7)
        delta = abs((exp_datetime - expected_exp).total_seconds())

        # Allow 10 second margin for test execution time
        assert delta < 10

    def test_create_access_token_custom_expiration(self):
        """Test creating token with custom expiration."""
        data = {"user_id": 1}
        custom_delta = timedelta(hours=1)

        before = datetime.utcnow()
        token = create_access_token(data, expires_delta=custom_delta)
        after = datetime.utcnow()

        decoded = decode_token(token)
        exp_timestamp = decoded["exp"]
        exp_datetime = datetime.utcfromtimestamp(exp_timestamp)

        # Check expiration is approximately 1 hour from now
        expected_exp = before + timedelta(hours=1)
        delta = abs((exp_datetime - expected_exp).total_seconds())

        # Allow 10 second margin
        assert delta < 10

    def test_create_access_token_preserves_data_types(self):
        """Test that token preserves different data types."""
        data = {
            "user_id": 123,
            "email": "test@example.com",
            "role": "admin",
            "active": True,
        }
        token = create_access_token(data)
        decoded = decode_token(token)

        assert decoded["user_id"] == 123
        assert decoded["email"] == "test@example.com"
        assert decoded["role"] == "admin"
        assert decoded["active"] is True


class TestTokenDecoding:
    """Test JWT token decoding."""

    def test_decode_token_valid_token(self):
        """Test decoding a valid token."""
        data = {"user_id": 1, "email": "test@example.com"}
        token = create_access_token(data)

        decoded = decode_token(token)

        assert decoded["user_id"] == 1
        assert decoded["email"] == "test@example.com"

    def test_decode_token_invalid_token(self):
        """Test decoding an invalid token raises error."""
        invalid_token = "invalid.token.here"

        with pytest.raises(JWTError):
            decode_token(invalid_token)

    def test_decode_token_malformed_token(self):
        """Test decoding malformed token raises error."""
        malformed_tokens = [
            "",
            "notajwt",
            "a.b",  # Not enough segments
            "a.b.c.d",  # Too many segments
        ]

        for token in malformed_tokens:
            with pytest.raises(JWTError):
                decode_token(token)

    def test_decode_token_expired_token(self):
        """Test decoding expired token raises error."""
        data = {"user_id": 1}
        # Create token that expired 1 hour ago
        expired_delta = timedelta(hours=-1)
        token = create_access_token(data, expires_delta=expired_delta)

        with pytest.raises(JWTError):
            decode_token(token)

    def test_decode_token_tampered_payload(self):
        """Test that tampered tokens are rejected."""
        data = {"user_id": 1, "role": "regular"}
        token = create_access_token(data)

        # Try to tamper with the token by replacing a character
        tampered_token = token[:-5] + "XXXXX"

        with pytest.raises(JWTError):
            decode_token(tampered_token)


class TestTokenVerification:
    """Test JWT token verification."""

    def test_verify_token_valid_token(self):
        """Test verifying a valid token."""
        data = {"user_id": 1}
        token = create_access_token(data)

        assert verify_token(token) is True

    def test_verify_token_invalid_token(self):
        """Test verifying an invalid token."""
        invalid_token = "invalid.token.here"

        assert verify_token(invalid_token) is False

    def test_verify_token_expired_token(self):
        """Test verifying an expired token."""
        data = {"user_id": 1}
        expired_delta = timedelta(hours=-1)
        token = create_access_token(data, expires_delta=expired_delta)

        assert verify_token(token) is False

    def test_verify_token_empty_string(self):
        """Test verifying empty string."""
        assert verify_token("") is False

    def test_verify_token_none_type(self):
        """Test verifying None raises appropriate error."""
        # verify_token expects a string, passing None should fail
        with pytest.raises((JWTError, AttributeError, TypeError)):
            verify_token(None)


class TestTokenSecurity:
    """Test token security properties."""

    def test_different_users_get_different_tokens(self):
        """Test that different users get different tokens."""
        data1 = {"user_id": 1, "email": "user1@example.com"}
        data2 = {"user_id": 2, "email": "user2@example.com"}

        token1 = create_access_token(data1)
        token2 = create_access_token(data2)

        assert token1 != token2

        # Verify each token contains correct data
        decoded1 = decode_token(token1)
        decoded2 = decode_token(token2)

        assert decoded1["user_id"] == 1
        assert decoded2["user_id"] == 2

    def test_same_data_different_times_different_tokens(self):
        """Test that same data at different times creates different tokens."""
        data = {"user_id": 1}

        token1 = create_access_token(data)
        # Wait a tiny bit (expiration timestamp will be different)
        import time
        time.sleep(0.1)
        token2 = create_access_token(data)

        # Tokens should be different due to different expiration timestamps
        assert token1 != token2

        # But both should decode to the same user_id
        decoded1 = decode_token(token1)
        decoded2 = decode_token(token2)
        assert decoded1["user_id"] == decoded2["user_id"]

    def test_token_cannot_be_forged(self):
        """Test that tokens cannot be forged without secret key."""
        data = {"user_id": 1, "role": "regular"}
        token = create_access_token(data)

        # Try to create a fake token with admin role
        # This should fail because we don't have the secret key
        fake_data = {"user_id": 1, "role": "admin"}

        # Even if we try to encode with a different key, verification will fail
        from jose import jwt
        fake_token = jwt.encode(fake_data, "wrong-secret-key", algorithm="HS256")

        with pytest.raises(JWTError):
            decode_token(fake_token)
