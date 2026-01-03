"""
Slack notification service.

Sends workflow health alerts to Slack via Incoming Webhooks.
"""
import json
import logging
from typing import Optional
import httpx

from app.models.notification import Notification

logger = logging.getLogger(__name__)

# Timeout for Slack API calls
SLACK_TIMEOUT = 10.0


class SlackServiceError(Exception):
    """Exception raised when Slack API call fails."""
    pass


class SlackService:
    """
    Service for sending notifications to Slack.

    Uses Slack Incoming Webhooks to post messages with Block Kit formatting.
    """

    # Severity to color mapping (Slack attachment colors)
    SEVERITY_COLORS = {
        "error": "#dc2626",    # Red
        "warning": "#f59e0b",  # Amber
        "info": "#3b82f6",     # Blue
    }

    # Notification type to emoji mapping
    TYPE_EMOJIS = {
        "workflow_broken": ":x:",
        "workflow_healed": ":white_check_mark:",
        "low_confidence": ":warning:",
        "high_failure_rate": ":chart_with_downwards_trend:",
    }

    def __init__(self, webhook_url: str, base_dashboard_url: str = "http://localhost:3000"):
        """
        Initialize Slack service.

        Args:
            webhook_url: Slack Incoming Webhook URL
            base_dashboard_url: Base URL for dashboard links in messages
        """
        self.webhook_url = webhook_url
        self.base_dashboard_url = base_dashboard_url

    async def send_notification(self, notification: Notification) -> bool:
        """
        Send a notification to Slack.

        Args:
            notification: Notification model instance to send

        Returns:
            True if message was sent successfully

        Raises:
            SlackServiceError: If the Slack API call fails
        """
        message = self.format_message(notification)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=message,
                    timeout=SLACK_TIMEOUT,
                )

                if response.status_code != 200:
                    logger.error(
                        f"Slack API error: {response.status_code} - {response.text}"
                    )
                    raise SlackServiceError(
                        f"Slack API returned {response.status_code}: {response.text}"
                    )

                logger.info(f"Sent Slack notification: {notification.title}")
                return True

        except httpx.TimeoutException:
            logger.error("Slack API timeout")
            raise SlackServiceError("Slack API timeout")
        except httpx.HTTPError as e:
            logger.error(f"Slack HTTP error: {e}")
            raise SlackServiceError(f"Slack HTTP error: {e}")

    def format_message(self, notification: Notification) -> dict:
        """
        Format a notification as a Slack Block Kit message.

        Creates a rich message with:
        - Header with emoji and title
        - Message body
        - Action button linking to the workflow

        Args:
            notification: Notification to format

        Returns:
            Slack Block Kit message payload
        """
        emoji = self.TYPE_EMOJIS.get(notification.type, ":bell:")
        color = self.SEVERITY_COLORS.get(notification.severity, "#6b7280")

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} {notification.title}",
                    "emoji": True,
                },
            },
        ]

        # Add message body if present
        if notification.message:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": notification.message,
                },
            })

        # Add action button if there's a URL
        if notification.action_url:
            full_url = f"{self.base_dashboard_url}{notification.action_url}"
            blocks.append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "View in Dashboard",
                            "emoji": True,
                        },
                        "url": full_url,
                        "style": "primary" if notification.severity == "error" else None,
                    }
                ],
            })

        # Add context with timestamp
        blocks.append({
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"Sent from Overlay Guidance | {notification.created_at.strftime('%Y-%m-%d %H:%M UTC')}",
                }
            ],
        })

        return {
            "blocks": blocks,
            "attachments": [
                {
                    "color": color,
                    "fallback": notification.title,
                }
            ],
        }

    async def send_test_message(self) -> bool:
        """
        Send a test message to verify the webhook is working.

        Returns:
            True if test message was sent successfully

        Raises:
            SlackServiceError: If the Slack API call fails
        """
        message = {
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": ":white_check_mark: Slack Integration Test",
                        "emoji": True,
                    },
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "This is a test message from *Overlay Guidance*. Your Slack integration is working correctly!",
                    },
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": "You will receive notifications about workflow health issues here.",
                        }
                    ],
                },
            ],
            "attachments": [
                {
                    "color": "#22c55e",  # Green
                    "fallback": "Slack Integration Test - Success",
                }
            ],
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=message,
                    timeout=SLACK_TIMEOUT,
                )

                if response.status_code != 200:
                    logger.error(
                        f"Slack test failed: {response.status_code} - {response.text}"
                    )
                    raise SlackServiceError(
                        f"Slack API returned {response.status_code}: {response.text}"
                    )

                logger.info("Slack test message sent successfully")
                return True

        except httpx.TimeoutException:
            logger.error("Slack API timeout during test")
            raise SlackServiceError("Slack API timeout")
        except httpx.HTTPError as e:
            logger.error(f"Slack HTTP error during test: {e}")
            raise SlackServiceError(f"Slack HTTP error: {e}")


def get_slack_service(
    settings: dict, base_dashboard_url: str = "http://localhost:3000"
) -> Optional[SlackService]:
    """
    Get Slack service if configured and enabled.

    Args:
        settings: Company settings dict (parsed from JSON)
        base_dashboard_url: Base URL for dashboard links

    Returns:
        SlackService instance if configured and enabled, None otherwise
    """
    slack_config = settings.get("slack", {})

    if not slack_config.get("enabled", False):
        return None

    webhook_url = slack_config.get("webhook_url")
    if not webhook_url:
        return None

    return SlackService(webhook_url, base_dashboard_url)
