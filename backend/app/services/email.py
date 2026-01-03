"""
Email service for sending transactional emails via Resend.

Features:
- Team invitation emails with styled HTML templates
- Async sending via Celery task
- Error handling with logging
- Environment-based configuration

Usage:
    from app.services.email import EmailService

    email_service = EmailService()
    email_service.send_invite_email(
        to_email="user@example.com",
        inviter_name="John Doe",
        company_name="Acme Corp",
        invite_url="https://app.overlay.io/signup?token=abc123",
        role="editor"
    )
"""
import html
import os
import logging
from typing import Optional
from urllib.parse import quote

logger = logging.getLogger(__name__)


class EmailServiceError(Exception):
    """Base exception for email service errors."""
    pass


class EmailService:
    """
    Email service for sending transactional emails via Resend.

    Handles:
    - Team invitation emails
    - Password reset emails (future)
    - Notification emails (future)
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize email service with Resend API key.

        Args:
            api_key: Resend API key. If not provided, reads from RESEND_API_KEY env var.

        Raises:
            EmailServiceError: If API key is not configured.
        """
        self.api_key = api_key or os.getenv("RESEND_API_KEY")
        self.from_email = os.getenv("FROM_EMAIL", "noreply@overlay.io")
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

        if not self.api_key:
            logger.warning("RESEND_API_KEY not configured - emails will be logged only")
            self._mock_mode = True
        else:
            self._mock_mode = False
            try:
                import resend
                resend.api_key = self.api_key
                self._resend = resend
            except ImportError:
                logger.error("Resend library not installed")
                raise EmailServiceError("Resend library not installed. Run: pip install resend")

    def send_invite_email(
        self,
        to_email: str,
        inviter_name: str,
        company_name: str,
        invite_token: str,
        role: str,
    ) -> dict:
        """
        Send a team invitation email.

        Args:
            to_email: Recipient email address
            inviter_name: Name of the user sending the invite
            company_name: Company name
            invite_token: Unique invite token for signup URL
            role: Role being offered (admin, editor, viewer)

        Returns:
            dict: {"success": bool, "message": str, "email_id": str|None}

        Raises:
            EmailServiceError: If email sending fails after retries
        """
        invite_url = f"{self.frontend_url}/signup?invite={invite_token}"
        subject = f"You've been invited to join {company_name} on Overlay"
        html_content = self._render_invite_template(
            inviter_name=inviter_name,
            company_name=company_name,
            invite_url=invite_url,
            role=role,
        )

        if self._mock_mode:
            # Log the email in development/testing
            # Redact the token portion of the URL for security
            masked_url = self._mask_invite_url(invite_url)
            logger.info(
                f"[MOCK EMAIL] Invite email to {to_email}\n"
                f"Subject: {subject}\n"
                f"Invite URL: {masked_url}"
            )
            return {
                "success": True,
                "message": "Email logged (mock mode - no API key configured)",
                "email_id": None,
            }

        try:
            response = self._resend.Emails.send({
                "from": f"Overlay <{self.from_email}>",
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            })

            logger.info(f"Invite email sent to {to_email}, ID: {response.get('id')}")

            return {
                "success": True,
                "message": "Email sent successfully",
                "email_id": response.get("id"),
            }

        except Exception as e:
            logger.error(f"Failed to send invite email to {to_email}: {e}")
            raise EmailServiceError(f"Failed to send email: {str(e)}")

    def _mask_invite_url(self, invite_url: str) -> str:
        """
        Mask the invite token in a URL for secure logging.

        Args:
            invite_url: Full invite URL with token

        Returns:
            URL with token partially masked (e.g., abc***xyz)
        """
        # Parse and mask the invite parameter
        if "invite=" in invite_url:
            parts = invite_url.split("invite=")
            if len(parts) == 2:
                token = parts[1].split("&")[0]  # Get token before any other params
                if len(token) > 8:
                    masked_token = token[:4] + "***" + token[-4:]
                else:
                    masked_token = "***"
                return parts[0] + "invite=" + masked_token
        return invite_url.replace(invite_url.split("/")[-1], "***")

    def _render_invite_template(
        self,
        inviter_name: str,
        company_name: str,
        invite_url: str,
        role: str,
    ) -> str:
        """
        Render the HTML template for invite emails.

        Args:
            inviter_name: Name of the person who sent the invite
            company_name: Company name
            invite_url: Full URL to accept the invite
            role: Role being offered

        Returns:
            str: Rendered HTML content
        """
        # Escape user-provided values to prevent XSS/HTML injection
        safe_inviter_name = html.escape(inviter_name)
        safe_company_name = html.escape(company_name)
        safe_invite_url = html.escape(invite_url)
        safe_role = html.escape(role)

        role_description = {
            "admin": "full administrative access",
            "editor": "create and edit workflows",
            "viewer": "view and run workflows",
        }.get(role, "access")

        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>You're Invited</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 24px; text-align: center;">
                            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #18181b;">
                                You're Invited!
                            </h1>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                                <strong>{safe_inviter_name}</strong> has invited you to join <strong>{safe_company_name}</strong> on Overlay.
                            </p>
                            <p style="margin: 0 0 24px; font-size: 16px; line-height: 24px; color: #3f3f46;">
                                As an <strong>{safe_role}</strong>, you'll be able to {role_description}.
                            </p>
                        </td>
                    </tr>

                    <!-- CTA Button -->
                    <tr>
                        <td style="padding: 0 40px 32px;" align="center">
                            <a href="{safe_invite_url}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                                Accept Invitation
                            </a>
                        </td>
                    </tr>

                    <!-- Expiry Notice -->
                    <tr>
                        <td style="padding: 0 40px 32px;">
                            <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a; text-align: center;">
                                This invitation will expire in 7 days.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 40px; border-top: 1px solid #e4e4e7;">
                            <p style="margin: 0; font-size: 13px; line-height: 20px; color: #a1a1aa; text-align: center;">
                                If you didn't expect this invitation, you can safely ignore this email.
                            </p>
                            <p style="margin: 12px 0 0; font-size: 13px; line-height: 20px; color: #a1a1aa; text-align: center;">
                                <a href="{safe_invite_url}" style="color: #71717a; text-decoration: underline;">
                                    {safe_invite_url}
                                </a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
