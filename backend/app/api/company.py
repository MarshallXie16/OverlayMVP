"""
Company management API endpoints.

Provides endpoints for:
- Getting company info (with invite token)
- Listing team members
- Removing team members (admin only)
- Updating company details (admin only)
- Public invite info lookup (no auth)
- Slack integration settings (admin only)
"""
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.user import User
from app.models.company import Company
from app.models.workflow import Workflow
from app.schemas.company import (
    CompanyResponse,
    TeamMemberResponse,
    UpdateCompanyRequest,
    UpdateMemberRoleRequest,
    UpdateMemberStatusRequest,
    InviteInfoResponse,
    SlackSettingsRequest,
    SlackSettingsResponse,
    SlackTestResponse,
)
from app.utils.dependencies import get_current_user
from app.utils.permissions import Permission, require_permission

router = APIRouter()


def require_admin(current_user: User) -> User:
    """Check if user is admin, raise 403 if not."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "INSUFFICIENT_PERMISSIONS",
                "message": "Admin role required for this action",
            },
        )
    return current_user


@router.get("/me", response_model=CompanyResponse)
async def get_company(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current user's company information.

    **Authentication Required:** Yes

    **Returns:**
    - Company details including invite token
    - Member count

    **Errors:**
    - 401: Invalid or missing token
    """
    company = db.query(Company).filter(Company.id == current_user.company_id).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found"},
        )

    member_count = db.query(User).filter(User.company_id == company.id).count()

    return CompanyResponse(
        id=company.id,
        name=company.name,
        invite_token=company.invite_token,
        created_at=company.created_at,
        member_count=member_count,
    )


@router.put("/me", response_model=CompanyResponse)
async def update_company(
    update_data: UpdateCompanyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update company details (admin only).

    **Authentication Required:** Yes (Admin)

    **Request Body:**
    - name: New company name (1-255 characters)

    **Returns:**
    - Updated company details

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    """
    require_admin(current_user)

    company = db.query(Company).filter(Company.id == current_user.company_id).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found"},
        )

    company.name = update_data.name
    db.commit()
    db.refresh(company)

    member_count = db.query(User).filter(User.company_id == company.id).count()

    return CompanyResponse(
        id=company.id,
        name=company.name,
        invite_token=company.invite_token,
        created_at=company.created_at,
        member_count=member_count,
    )


@router.get("/me/members", response_model=List[TeamMemberResponse])
async def get_team_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all team members in the company.

    **Authentication Required:** Yes

    **Returns:**
    - List of team members with their details
    - Ordered by created_at (oldest first)

    **Errors:**
    - 401: Invalid or missing token
    """
    members = (
        db.query(User)
        .filter(User.company_id == current_user.company_id)
        .order_by(User.created_at)
        .all()
    )

    return [
        TeamMemberResponse(
            id=member.id,
            name=member.name,
            email=member.email,
            role=member.role,
            status=member.status,
            created_at=member.created_at,
            last_login_at=member.last_login_at,
        )
        for member in members
    ]


@router.delete("/me/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove a team member from the company (admin only).

    **Authentication Required:** Yes (Admin)

    **Business Rules:**
    - Admins cannot remove themselves
    - All workflows created by the removed user are reassigned to the admin
    - User is deleted from the database

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    - 400: Cannot remove yourself
    - 404: User not found in company
    """
    require_admin(current_user)

    # Cannot remove yourself
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CANNOT_REMOVE_SELF",
                "message": "Admins cannot remove themselves from the company",
            },
        )

    # Find the user to remove
    user_to_remove = (
        db.query(User)
        .filter(User.id == user_id, User.company_id == current_user.company_id)
        .first()
    )

    if not user_to_remove:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "USER_NOT_FOUND",
                "message": "User not found in your company",
            },
        )

    # Reassign workflows created by this user to the admin
    db.query(Workflow).filter(Workflow.created_by == user_id).update(
        {"created_by": current_user.id}
    )

    # Delete the user
    db.delete(user_to_remove)
    db.commit()

    return None


def _count_admins(db: Session, company_id: int, for_update: bool = False) -> int:
    """
    Count the number of active admin users in a company.

    Args:
        db: Database session
        company_id: Company to count admins for
        for_update: If True, lock the rows to prevent race conditions

    Returns:
        Number of active admins in the company
    """
    query = db.query(User).filter(
        User.company_id == company_id,
        User.role == "admin",
        User.status == "active",
    )

    # Use row-level locking to prevent race conditions
    # This ensures the count is accurate when making last-admin decisions
    if for_update:
        query = query.with_for_update()

    return query.count()


@router.patch("/me/members/{user_id}/role", response_model=TeamMemberResponse)
async def update_member_role(
    user_id: int,
    update_data: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update a team member's role (admin only).

    **Authentication Required:** Yes (Admin)

    **Business Rules:**
    - Cannot change your own role
    - Cannot demote the last admin in the company
    - Valid roles: admin, editor, viewer

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    - 400: Cannot modify self or last admin
    - 404: User not found in company
    """
    require_permission(current_user, Permission.MANAGE_ROLES)

    # Cannot change your own role
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CANNOT_MODIFY_SELF",
                "message": "You cannot change your own role",
            },
        )

    # Find the user
    user_to_update = (
        db.query(User)
        .filter(User.id == user_id, User.company_id == current_user.company_id)
        .first()
    )

    if not user_to_update:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "USER_NOT_FOUND",
                "message": "User not found in your company",
            },
        )

    # Last admin protection: cannot demote the last active admin
    # Use for_update=True to lock rows and prevent race conditions
    if (
        user_to_update.role == "admin"
        and update_data.role != "admin"
        and _count_admins(db, current_user.company_id, for_update=True) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "LAST_ADMIN",
                "message": "Cannot demote the last admin in the company",
            },
        )

    user_to_update.role = update_data.role
    db.commit()
    db.refresh(user_to_update)

    return TeamMemberResponse(
        id=user_to_update.id,
        name=user_to_update.name,
        email=user_to_update.email,
        role=user_to_update.role,
        status=user_to_update.status,
        created_at=user_to_update.created_at,
        last_login_at=user_to_update.last_login_at,
    )


@router.patch("/me/members/{user_id}/status", response_model=TeamMemberResponse)
async def update_member_status(
    user_id: int,
    update_data: UpdateMemberStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update a team member's status - suspend or reactivate (admin only).

    **Authentication Required:** Yes (Admin)

    **Business Rules:**
    - Cannot change your own status
    - Cannot suspend the last active admin in the company
    - Valid statuses: active, suspended

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    - 400: Cannot modify self or last admin
    - 404: User not found in company
    """
    require_permission(current_user, Permission.MANAGE_STATUS)

    # Cannot change your own status
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "CANNOT_MODIFY_SELF",
                "message": "You cannot change your own status",
            },
        )

    # Find the user
    user_to_update = (
        db.query(User)
        .filter(User.id == user_id, User.company_id == current_user.company_id)
        .first()
    )

    if not user_to_update:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "USER_NOT_FOUND",
                "message": "User not found in your company",
            },
        )

    # Last admin protection: cannot suspend the last active admin
    # Use for_update=True to lock rows and prevent race conditions
    if (
        user_to_update.role == "admin"
        and user_to_update.status == "active"
        and update_data.status == "suspended"
        and _count_admins(db, current_user.company_id, for_update=True) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "LAST_ADMIN",
                "message": "Cannot suspend the last active admin in the company",
            },
        )

    user_to_update.status = update_data.status
    db.commit()
    db.refresh(user_to_update)

    return TeamMemberResponse(
        id=user_to_update.id,
        name=user_to_update.name,
        email=user_to_update.email,
        role=user_to_update.role,
        status=user_to_update.status,
        created_at=user_to_update.created_at,
        last_login_at=user_to_update.last_login_at,
    )


@router.get("/invite/{token}", response_model=InviteInfoResponse)
async def get_invite_info(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Get company name from invite token (public endpoint).

    **Authentication Required:** No

    Used by the invite landing page to show the company name
    before the user signs up.

    **Returns:**
    - Company name associated with the invite token

    **Errors:**
    - 404: Invalid invite token
    """
    company = db.query(Company).filter(Company.invite_token == token).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "INVALID_INVITE_TOKEN",
                "message": "Invalid or expired invite token",
            },
        )

    return InviteInfoResponse(company_name=company.name)


# ============================================================================
# Slack Integration Endpoints
# ============================================================================


@router.get("/me/slack", response_model=SlackSettingsResponse)
async def get_slack_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get Slack integration settings (admin only).

    **Authentication Required:** Yes (Admin)

    **Returns:**
    - Slack notification settings
    - Whether webhook is configured (URL not exposed)

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    """
    require_admin(current_user)

    company = db.query(Company).filter(Company.id == current_user.company_id).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found"},
        )

    # Parse settings JSON
    try:
        settings = json.loads(company.settings) if company.settings else {}
    except json.JSONDecodeError:
        settings = {}

    slack_config = settings.get("slack", {})

    return SlackSettingsResponse(
        enabled=slack_config.get("enabled", False),
        webhook_configured=bool(slack_config.get("webhook_url")),
        notify_on=slack_config.get("notify_on", ["workflow_broken", "high_failure_rate"]),
    )


@router.put("/me/slack", response_model=SlackSettingsResponse)
async def update_slack_settings(
    settings_data: SlackSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update Slack integration settings (admin only).

    **Authentication Required:** Yes (Admin)

    **Request Body:**
    - webhook_url: Slack Incoming Webhook URL (or null to remove)
    - enabled: Whether notifications are enabled
    - notify_on: List of notification types to send

    **Returns:**
    - Updated Slack settings

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    """
    require_admin(current_user)

    company = db.query(Company).filter(Company.id == current_user.company_id).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found"},
        )

    # Parse existing settings
    try:
        settings = json.loads(company.settings) if company.settings else {}
    except json.JSONDecodeError:
        settings = {}

    # Get existing Slack config to preserve webhook if not provided
    existing_slack = settings.get("slack", {})

    # Update Slack settings
    new_slack = {
        "enabled": settings_data.enabled,
        "notify_on": settings_data.notify_on,
    }

    # Only update webhook_url if provided (allow keeping existing)
    if settings_data.webhook_url is not None:
        new_slack["webhook_url"] = settings_data.webhook_url
    elif "webhook_url" in existing_slack:
        new_slack["webhook_url"] = existing_slack["webhook_url"]

    settings["slack"] = new_slack
    company.settings = json.dumps(settings)
    db.commit()

    return SlackSettingsResponse(
        enabled=new_slack.get("enabled", False),
        webhook_configured=bool(new_slack.get("webhook_url")),
        notify_on=new_slack.get("notify_on", ["workflow_broken", "high_failure_rate"]),
    )


@router.post("/me/slack/test", response_model=SlackTestResponse)
async def test_slack_webhook(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a test message to the configured Slack webhook (admin only).

    **Authentication Required:** Yes (Admin)

    **Returns:**
    - Success status and message

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    - 400: Slack not configured
    - 502: Slack API error
    """
    from app.services.slack import SlackService, SlackServiceError

    require_admin(current_user)

    company = db.query(Company).filter(Company.id == current_user.company_id).first()

    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "COMPANY_NOT_FOUND", "message": "Company not found"},
        )

    # Parse settings
    try:
        settings = json.loads(company.settings) if company.settings else {}
    except json.JSONDecodeError:
        settings = {}

    slack_config = settings.get("slack", {})
    webhook_url = slack_config.get("webhook_url")

    if not webhook_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SLACK_NOT_CONFIGURED",
                "message": "Slack webhook URL is not configured",
            },
        )

    try:
        service = SlackService(webhook_url)
        await service.send_test_message()
        return SlackTestResponse(
            success=True,
            message="Test message sent successfully to Slack",
        )
    except SlackServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "SLACK_API_ERROR",
                "message": f"Failed to send Slack message: {str(e)}",
            },
        )
