"""
Notification management API endpoints.

Provides endpoints for:
- Listing notifications for the current company
- Marking notifications as read
- Dismissing notifications (admin only)
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models.user import User
from app.models.notification import Notification
from app.schemas.notification import (
    NotificationResponse,
    NotificationListResponse,
    MarkAsReadRequest,
    MarkAllAsReadRequest,
)
from app.utils.dependencies import get_current_user
from app.utils.permissions import Permission, require_permission

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    read: Optional[bool] = Query(None, description="Filter by read status"),
    notification_type: Optional[str] = Query(
        None, alias="type", description="Filter by notification type"
    ),
    limit: int = Query(20, ge=1, le=100, description="Maximum notifications to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List notifications for the current user's company.

    **Authentication Required:** Yes

    **Query Parameters:**
    - read: Filter by read status (true/false)
    - type: Filter by notification type (workflow_broken, workflow_healed, etc.)
    - limit: Max results (1-100, default 20)
    - offset: Pagination offset

    **Returns:**
    - Paginated list of notifications
    - Unread count for badge display
    - Total count matching filter
    """
    # Base query for company notifications
    query = db.query(Notification).filter(
        Notification.company_id == current_user.company_id
    )

    # Apply filters
    if read is not None:
        query = query.filter(Notification.read == read)

    if notification_type is not None:
        query = query.filter(Notification.type == notification_type)

    # Get total count before pagination
    total = query.count()

    # Get unread count (always for the company, regardless of filters)
    unread_count = (
        db.query(func.count(Notification.id))
        .filter(
            Notification.company_id == current_user.company_id,
            Notification.read == False,
        )
        .scalar()
    )

    # Apply pagination and ordering (newest first)
    notifications = (
        query.order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return NotificationListResponse(
        notifications=[
            NotificationResponse(
                id=n.id,
                type=n.type,
                severity=n.severity,
                title=n.title,
                message=n.message,
                action_url=n.action_url,
                workflow_id=n.workflow_id,
                read=n.read,
                created_at=n.created_at,
            )
            for n in notifications
        ],
        unread_count=unread_count or 0,
        total=total,
    )


@router.patch("/{notification_id}", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: int,
    update_data: MarkAsReadRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark a notification as read or unread.

    **Authentication Required:** Yes

    **Business Rules:**
    - Can only update notifications from your own company
    - Records who marked it as read and when

    **Errors:**
    - 401: Invalid or missing token
    - 404: Notification not found
    """
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.company_id == current_user.company_id,
        )
        .first()
    )

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOTIFICATION_NOT_FOUND",
                "message": "Notification not found",
            },
        )

    notification.read = update_data.read
    if update_data.read:
        notification.read_by = current_user.id
        notification.read_at = datetime.utcnow()
    else:
        notification.read_by = None
        notification.read_at = None

    db.commit()
    db.refresh(notification)

    return NotificationResponse(
        id=notification.id,
        type=notification.type,
        severity=notification.severity,
        title=notification.title,
        message=notification.message,
        action_url=notification.action_url,
        workflow_id=notification.workflow_id,
        read=notification.read,
        created_at=notification.created_at,
    )


@router.post("/mark-all-read", status_code=status.HTTP_200_OK)
async def mark_all_notifications_read(
    request_data: Optional[MarkAllAsReadRequest] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Mark multiple notifications as read.

    **Authentication Required:** Yes

    **Request Body (optional):**
    - notification_ids: Specific IDs to mark as read. If omitted, marks all unread.

    **Returns:**
    - Count of notifications marked as read
    """
    query = db.query(Notification).filter(
        Notification.company_id == current_user.company_id,
        Notification.read == False,
    )

    # Filter to specific IDs if provided
    if request_data and request_data.notification_ids:
        query = query.filter(Notification.id.in_(request_data.notification_ids))

    # Update all matching notifications
    count = query.update(
        {
            "read": True,
            "read_by": current_user.id,
            "read_at": datetime.utcnow(),
        },
        synchronize_session=False,
    )
    db.commit()

    return {"marked_count": count}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete/dismiss a notification (admin only).

    **Authentication Required:** Yes (Admin)

    **Business Rules:**
    - Only admins can delete notifications
    - Can only delete notifications from your own company

    **Errors:**
    - 401: Invalid or missing token
    - 403: User is not admin
    - 404: Notification not found
    """
    require_permission(current_user, Permission.MANAGE_TEAM)

    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.company_id == current_user.company_id,
        )
        .first()
    )

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "NOTIFICATION_NOT_FOUND",
                "message": "Notification not found",
            },
        )

    db.delete(notification)
    db.commit()

    return None
