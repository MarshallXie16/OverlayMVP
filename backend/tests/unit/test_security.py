"""
Unit tests for password hashing and verification utilities.
"""
import pytest
from app.utils.security import hash_password, verify_password


class TestPasswordHashing:
    """Test password hashing functionality."""

    def test_hash_password_returns_string(self):
        """Test that hash_password returns a string."""
        password = "SecurePass123"
        hashed = hash_password(password)

        assert isinstance(hashed, str)
        assert len(hashed) > 0

    def test_hash_password_uses_bcrypt(self):
        """Test that hash uses bcrypt format."""
        password = "SecurePass123"
        hashed = hash_password(password)

        # Bcrypt hashes start with $2b$ (or $2a$/$2y$)
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$") or hashed.startswith("$2y$")

    def test_hash_password_uses_cost_factor_12(self):
        """Test that hash uses cost factor 12."""
        password = "SecurePass123"
        hashed = hash_password(password)

        # Bcrypt format: $2b$12$... (12 is the cost factor)
        assert "$12$" in hashed

    def test_hash_password_creates_different_hashes(self):
        """Test that same password creates different hashes (salt)."""
        password = "SecurePass123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        # Hashes should be different due to random salt
        assert hash1 != hash2

    def test_hash_password_handles_various_passwords(self):
        """Test hashing various password formats."""
        passwords = [
            "short1",
            "VeryLongPasswordWith123Numbers",
            "Special!@#$%^&*()Characters1",
            "Unicode🔒Password123",
        ]

        for password in passwords:
            hashed = hash_password(password)
            assert isinstance(hashed, str)
            assert len(hashed) > 0


class TestPasswordVerification:
    """Test password verification functionality."""

    def test_verify_password_correct_password(self):
        """Test verification with correct password."""
        password = "SecurePass123"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect_password(self):
        """Test verification with incorrect password."""
        password = "SecurePass123"
        wrong_password = "WrongPass456"
        hashed = hash_password(password)

        assert verify_password(wrong_password, hashed) is False

    def test_verify_password_case_sensitive(self):
        """Test that verification is case sensitive."""
        password = "SecurePass123"
        wrong_case = "securepass123"
        hashed = hash_password(password)

        assert verify_password(wrong_case, hashed) is False

    def test_verify_password_empty_password(self):
        """Test verification with empty password."""
        password = "SecurePass123"
        hashed = hash_password(password)

        assert verify_password("", hashed) is False

    def test_verify_password_with_special_characters(self):
        """Test verification with special characters."""
        password = "P@ssw0rd!#$%"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True
        assert verify_password("P@ssw0rd!#$", hashed) is False  # Missing %

    def test_verify_password_with_unicode(self):
        """Test verification with unicode characters."""
        password = "Password123🔒"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True
        assert verify_password("Password123", hashed) is False


class TestPasswordSecurity:
    """Test password security properties."""

    def test_password_not_stored_in_plain_text(self):
        """Test that original password cannot be retrieved from hash."""
        password = "SecurePass123"
        hashed = hash_password(password)

        # Hash should not contain the original password
        assert password not in hashed

    def test_similar_passwords_have_different_hashes(self):
        """Test that similar passwords have completely different hashes."""
        password1 = "SecurePass123"
        password2 = "SecurePass124"  # Only last char different

        hash1 = hash_password(password1)
        hash2 = hash_password(password2)

        # Hashes should be completely different
        assert hash1 != hash2

        # Neither should verify with the other's password
        assert verify_password(password1, hash2) is False
        assert verify_password(password2, hash1) is False
