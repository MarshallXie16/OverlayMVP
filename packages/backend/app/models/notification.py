"""
Notification model for admin alerts about workflow health.

Notifications are triggered by workflow failures, healing events,
and low confidence situations requiring admin attention.
"""
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.workflow import Workflow
    from app.models.user import User


class Notification(Base):
    """
    Notification model for admin alerts.

    Alerts admins about workflow issues, healing events,
    and situations requiring manual review.
    """

    __tablename__ = "notifications"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Foreign Keys
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    workflow_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=True
    )
    read_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Notification Type
    type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # workflow_broken, workflow_healed, low_confidence, high_failure_rate

    # Severity
    severity: Mapped[str] = mapped_column(
        SQLEnum("info", "warning", "error", name="notification_severity"),
        nullable=False,
    )

    # Content
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    action_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Read Status
    read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    read_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    company: Mapped["Company"] = relationship("Company", back_populates="notifications")
    workflow: Mapped[Optional["Workflow"]] = relationship(
        "Workflow", back_populates="notifications"
    )
    reader: Mapped[Optional["User"]] = relationship(
        "User", back_populates="notifications_read", foreign_keys=[read_by]
    )

    # Indexes
    __table_args__ = (
        Index("idx_notifications_company", "company_id", "read", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<Notification(id={self.id}, type='{self.type}', severity='{self.severity}', read={self.read})>"
