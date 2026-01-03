"""
Email sending background tasks via Celery.

Handles async delivery of:
- Team invitation emails
- Password reset emails (future)
- Notification emails (future)

All tasks use exponential backoff for retries and log failures for monitoring.
"""
import logging

from app.celery_app import celery_app, BaseTask
from app.services.email import EmailService, EmailServiceError

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="app.tasks.email.send_team_invite_email",
    queue="default",
    max_retries=3,
    default_retry_delay=60,  # 1 minute between retries
)
def send_team_invite_email(
    self,
    to_email: str,
    inviter_name: str,
    company_name: str,
    invite_token: str,
    role: str,
) -> dict:
    """
    Send a team invitation email asynchronously.

    This task is queued when an admin creates a new invite. It handles
    retries with exponential backoff and logs all failures.

    Args:
        to_email: Recipient email address
        inviter_name: Name of the admin sending the invite
        company_name: Company name
        invite_token: Unique token for the invite URL
        role: Role being offered (admin, editor, viewer)

    Returns:
        dict: {
            "success": bool,
            "message": str,
            "email_id": str | None,
            "to_email": str,
        }

    Raises:
        Exception: Re-raised after max retries exhausted
    """
    logger.info(f"Sending invite email to {to_email} for {company_name}")

    try:
        email_service = EmailService()
        result = email_service.send_invite_email(
            to_email=to_email,
            inviter_name=inviter_name,
            company_name=company_name,
            invite_token=invite_token,
            role=role,
        )

        return {
            **result,
            "to_email": to_email,
        }

    except EmailServiceError as e:
        logger.error(f"Email service error for {to_email}: {e}")
        # Retry with exponential backoff
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))

    except Exception as e:
        logger.error(f"Unexpected error sending email to {to_email}: {e}")
        raise self.retry(exc=e, countdown=60 * (2 ** self.request.retries))
