"""
Invite management API endpoints.

Provides endpoints for:
- Creating email invites (admin only)
- Listing pending invites (admin only)
- Revoking invites (admin only)
- Verifying invite tokens (public)
"""
import logging
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.models.company import Company
from app.models.invite import Invite
from app.schemas.invite import (
    InviteCreateRequest,
    InviteResponse,
    InviteVerifyResponse,
    InviteListResponse,
)
from app.utils.dependencies import get_current_user
from app.utils.permissions import Permission, require_permission
from app.tasks.email import send_team_invite_email

router = APIRouter()
logger = logging.getLogger(__name__)

# Invite expiry in days
INVITE_EXPIRY_DAYS = 7


@router.get("/me/invites", response_model=InviteListResponse)
async def list_pending_invites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all pending (unaccepted) invites for the company (admin only).

    **Authentication Required:** Yes (Admin)

    **Returns:**
    - List of pending invites with their details
    - Total count of pending invites

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    """
    require_permission(current_user, Permission.VIEW_INVITES)

    # Get pending invites (not yet accepted)
    invites = (
        db.query(Invite)
        .filter(
            Invite.company_id == current_user.company_id,
            Invite.accepted_at.is_(None),
        )
        .order_by(Invite.created_at.desc())
        .all()
    )

    return InviteListResponse(
        invites=[
            InviteResponse(
                id=invite.id,
                token=invite.token,
                email=invite.email,
                role=invite.role,
                company_id=invite.company_id,
                invited_by_id=invite.invited_by_id,
                expires_at=invite.expires_at,
                accepted_at=invite.accepted_at,
                created_at=invite.created_at,
            )
            for invite in invites
        ],
        total=len(invites),
    )


@router.post("/me/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
async def create_invite(
    invite_data: InviteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Create a new invite for the company (admin only).

    **Authentication Required:** Yes (Admin)

    **Request Body:**
    - email: Email address of the invitee
    - role: Role to assign when invite is accepted (default: viewer)

    **Business Rules:**
    - Cannot invite an email that's already a user in the company
    - Cannot invite an email with a pending invite
    - Invite expires after 7 days

    **Returns:**
    - Created invite details including token

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    - 400: Email already exists or has pending invite
    """
    require_permission(current_user, Permission.CREATE_INVITE)

    # Check if email is already a user in the company
    existing_user = (
        db.query(User)
        .filter(
            User.email == invite_data.email,
            User.company_id == current_user.company_id,
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "USER_ALREADY_EXISTS",
                "message": f"User with email '{invite_data.email}' is already a member of this company",
            },
        )

    # Check for existing pending invite
    existing_invite = (
        db.query(Invite)
        .filter(
            Invite.email == invite_data.email,
            Invite.company_id == current_user.company_id,
            Invite.accepted_at.is_(None),
        )
        .first()
    )

    if existing_invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVITE_ALREADY_EXISTS",
                "message": f"A pending invite already exists for '{invite_data.email}'",
            },
        )

    # Create new invite
    invite = Invite(
        token=str(uuid4()),
        email=invite_data.email,
        role=invite_data.role,
        company_id=current_user.company_id,
        invited_by_id=current_user.id,
        expires_at=datetime.utcnow() + timedelta(days=INVITE_EXPIRY_DAYS),
    )

    db.add(invite)
    db.commit()
    db.refresh(invite)

    # Get company name for email
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    company_name = company.name if company else "Your Company"

    # Queue invite email via Celery
    try:
        send_team_invite_email.delay(
            to_email=invite.email,
            inviter_name=current_user.name or current_user.email,
            company_name=company_name,
            invite_token=invite.token,
            role=invite.role,
        )
    except Exception as e:
        # Invites should still be created even if async email dispatch is unavailable.
        logger.exception("Failed to enqueue invite email (invite_id=%s): %s", invite.id, e)

    return InviteResponse(
        id=invite.id,
        token=invite.token,
        email=invite.email,
        role=invite.role,
        company_id=invite.company_id,
        invited_by_id=invite.invited_by_id,
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
        created_at=invite.created_at,
    )


@router.delete("/me/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    invite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Revoke a pending invite (admin only).

    **Authentication Required:** Yes (Admin)

    **Business Rules:**
    - Can only revoke invites from your own company
    - Can only revoke pending (unaccepted) invites

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    - 404: Invite not found or already accepted
    """
    require_permission(current_user, Permission.REVOKE_INVITE)

    invite = (
        db.query(Invite)
        .filter(
            Invite.id == invite_id,
            Invite.company_id == current_user.company_id,
            Invite.accepted_at.is_(None),
        )
        .first()
    )

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "INVITE_NOT_FOUND",
                "message": "Invite not found or already accepted",
            },
        )

    db.delete(invite)
    db.commit()

    return None


@router.get("/verify/{token}", response_model=InviteVerifyResponse)
async def verify_invite(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Verify an invite token (public endpoint).

    **Authentication Required:** No

    Used by the signup page to validate the invite before registration.

    **Returns:**
    - valid: Whether the invite can be used
    - company_name: Company name if valid
    - role: Role that will be assigned
    - email: Email the invite was sent to
    - expired: True if the invite has expired

    **Note:** Returns valid=false for invalid tokens or expired invites
    """
    invite = db.query(Invite).filter(Invite.token == token).first()

    if not invite:
        return InviteVerifyResponse(
            valid=False,
            company_name=None,
            role=None,
            email=None,
            expired=False,
        )

    # Check if already accepted
    if invite.accepted_at is not None:
        return InviteVerifyResponse(
            valid=False,
            company_name=invite.company.name,
            role=None,
            email=None,
            expired=False,
        )

    # Check if expired
    if invite.expires_at < datetime.utcnow():
        return InviteVerifyResponse(
            valid=False,
            company_name=invite.company.name,
            role=None,
            email=None,
            expired=True,
        )

    return InviteVerifyResponse(
        valid=True,
        company_name=invite.company.name,
        role=invite.role,
        email=invite.email,
        expired=False,
    )
