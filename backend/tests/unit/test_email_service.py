"""
Unit tests for email service.

Tests:
- Mock mode when RESEND_API_KEY is not set
- Email template rendering
- Error handling
"""
import pytest
from unittest.mock import patch, MagicMock

from app.services.email import EmailService, EmailServiceError


class TestEmailServiceMockMode:
    """Test email service in mock mode (no API key)."""

    @patch.dict("os.environ", {}, clear=True)
    def test_mock_mode_when_no_api_key(self):
        """Test that service enters mock mode without API key."""
        service = EmailService()
        assert service._mock_mode is True

    @patch.dict("os.environ", {}, clear=True)
    def test_send_invite_in_mock_mode(self):
        """Test that mock mode logs email instead of sending."""
        service = EmailService()

        result = service.send_invite_email(
            to_email="test@example.com",
            inviter_name="John Doe",
            company_name="Acme Corp",
            invite_token="test-token-123",
            role="editor",
        )

        assert result["success"] is True
        assert "mock mode" in result["message"].lower()
        assert result["email_id"] is None

    @patch.dict("os.environ", {"RESEND_API_KEY": "re_test_key"})
    def test_real_mode_with_api_key(self):
        """Test that service enters real mode with API key."""
        # Mock the resend import
        with patch.dict("sys.modules", {"resend": MagicMock()}):
            service = EmailService()
            assert service._mock_mode is False


class TestEmailTemplateRendering:
    """Test email template rendering."""

    @patch.dict("os.environ", {}, clear=True)
    def test_template_contains_required_elements(self):
        """Test that email template includes all required elements."""
        service = EmailService()
        html = service._render_invite_template(
            inviter_name="Jane Smith",
            company_name="Test Company",
            invite_url="https://app.overlay.io/signup?invite=abc123",
            role="admin",
        )

        # Check inviter name
        assert "Jane Smith" in html
        # Check company name
        assert "Test Company" in html
        # Check invite URL
        assert "https://app.overlay.io/signup?invite=abc123" in html
        # Check role
        assert "admin" in html
        # Check CTA button
        assert "Accept Invitation" in html
        # Check expiry notice
        assert "7 days" in html

    @patch.dict("os.environ", {}, clear=True)
    def test_role_descriptions(self):
        """Test that role descriptions are correct."""
        service = EmailService()

        # Test admin role
        html_admin = service._render_invite_template(
            inviter_name="Test",
            company_name="Test",
            invite_url="http://test",
            role="admin",
        )
        assert "full administrative access" in html_admin

        # Test editor role
        html_editor = service._render_invite_template(
            inviter_name="Test",
            company_name="Test",
            invite_url="http://test",
            role="editor",
        )
        assert "create and edit workflows" in html_editor

        # Test viewer role
        html_viewer = service._render_invite_template(
            inviter_name="Test",
            company_name="Test",
            invite_url="http://test",
            role="viewer",
        )
        assert "view and run workflows" in html_viewer


class TestEmailServiceConfiguration:
    """Test email service configuration."""

    @patch.dict(
        "os.environ",
        {
            "FROM_EMAIL": "custom@overlay.io",
            "FRONTEND_URL": "https://custom.overlay.io",
        },
        clear=True,
    )
    def test_custom_configuration(self):
        """Test that service uses custom environment variables."""
        service = EmailService()
        assert service.from_email == "custom@overlay.io"
        assert service.frontend_url == "https://custom.overlay.io"

    @patch.dict("os.environ", {}, clear=True)
    def test_default_configuration(self):
        """Test that service uses default values when env vars not set."""
        service = EmailService()
        assert service.from_email == "noreply@overlay.io"
        assert service.frontend_url == "http://localhost:5173"


class TestEmailServiceErrors:
    """Test email service error handling."""

    @patch.dict("os.environ", {"RESEND_API_KEY": "re_test_key"})
    def test_email_send_failure(self):
        """Test that email failures raise EmailServiceError."""
        # Create a mock resend module that raises an exception
        mock_resend = MagicMock()
        mock_resend.Emails.send.side_effect = Exception("API Error")

        with patch.dict("sys.modules", {"resend": mock_resend}):
            service = EmailService()
            service._resend = mock_resend

            with pytest.raises(EmailServiceError) as exc_info:
                service.send_invite_email(
                    to_email="test@example.com",
                    inviter_name="Test",
                    company_name="Test",
                    invite_token="token",
                    role="viewer",
                )

            assert "Failed to send email" in str(exc_info.value)

    @patch.dict("os.environ", {"RESEND_API_KEY": "re_test_key"})
    def test_successful_email_send(self):
        """Test successful email sending with mock Resend."""
        mock_resend = MagicMock()
        mock_resend.Emails.send.return_value = {"id": "email-123"}

        with patch.dict("sys.modules", {"resend": mock_resend}):
            service = EmailService()
            service._resend = mock_resend

            result = service.send_invite_email(
                to_email="test@example.com",
                inviter_name="Test User",
                company_name="Test Company",
                invite_token="test-token",
                role="editor",
            )

            assert result["success"] is True
            assert result["email_id"] == "email-123"

            # Verify Resend was called correctly
            mock_resend.Emails.send.assert_called_once()
            call_args = mock_resend.Emails.send.call_args[0][0]
            assert call_args["to"] == ["test@example.com"]
            assert "Test Company" in call_args["subject"]


class TestEmailSecurityFeatures:
    """Test email service security features."""

    @patch.dict("os.environ", {}, clear=True)
    def test_html_injection_is_escaped(self):
        """Test that user-provided values are HTML-escaped to prevent XSS."""
        service = EmailService()
        html = service._render_invite_template(
            inviter_name="<script>alert('xss')</script>",
            company_name="<img src=x onerror=alert('xss')>",
            invite_url="http://test.com?param=<script>",
            role="admin",
        )

        # Raw HTML tags should be escaped
        assert "<script>" not in html
        assert "&lt;script&gt;" in html
        assert "<img src=x" not in html
        assert "&lt;img src=x" in html

    @patch.dict("os.environ", {}, clear=True)
    def test_token_is_masked_in_logs(self):
        """Test that invite tokens are masked when logging in mock mode."""
        service = EmailService()

        # Test with a long token (>8 chars)
        long_url = "http://localhost:5173/signup?invite=abc123xyz789"
        masked = service._mask_invite_url(long_url)
        assert "abc1***789" in masked or "abc1***z789" in masked

        # The full token should not appear
        assert "abc123xyz789" not in masked

    @patch.dict("os.environ", {}, clear=True)
    def test_short_token_is_fully_masked(self):
        """Test that short tokens are fully masked."""
        service = EmailService()

        short_url = "http://localhost:5173/signup?invite=abc"
        masked = service._mask_invite_url(short_url)
        assert "abc" not in masked
        assert "***" in masked

    @patch.dict("os.environ", {}, clear=True)
    def test_url_without_invite_param_is_masked(self):
        """Test that URLs without invite parameter are still handled."""
        service = EmailService()

        url = "http://localhost:5173/signup"
        masked = service._mask_invite_url(url)
        # Should still work without crashing
        assert masked is not None
