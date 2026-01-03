"""
Invite model for team email invitations.

Invites track pending team member invitations with:
- Unique token for signup link
- Email address of invitee
- Assigned role on acceptance
- Expiration (7 days default)
- Acceptance tracking
"""
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Optional
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.user import User


# Default invite expiration: 7 days
INVITE_EXPIRY_DAYS = 7


def generate_invite_token() -> str:
    """Generate a unique invite token using UUID4."""
    return str(uuid.uuid4())


class Invite(Base):
    """
    Invite model for team email invitations.

    Tracks pending invitations to join a company team.
    Invites expire after 7 days and can only be used once.
    """

    __tablename__ = "invites"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Unique token for invite link
    token: Mapped[str] = mapped_column(
        String(36), unique=True, nullable=False, index=True
    )

    # Invitee email
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    # Role to assign on acceptance (admin, editor, viewer)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="viewer")

    # Foreign Keys
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    invited_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    company: Mapped["Company"] = relationship("Company", back_populates="invites")
    invited_by: Mapped[Optional["User"]] = relationship("User")

    # Indexes
    __table_args__ = (
        Index("idx_invites_company", "company_id"),
        Index("idx_invites_email", "email"),
        Index("idx_invites_token", "token"),
    )

    @property
    def is_expired(self) -> bool:
        """Check if the invite has expired."""
        return datetime.utcnow() > self.expires_at.replace(tzinfo=None)

    @property
    def is_accepted(self) -> bool:
        """Check if the invite has been accepted."""
        return self.accepted_at is not None

    @property
    def is_valid(self) -> bool:
        """Check if the invite is still valid (not expired and not accepted)."""
        return not self.is_expired and not self.is_accepted

    def __repr__(self) -> str:
        return f"<Invite(id={self.id}, email='{self.email}', role='{self.role}', expired={self.is_expired})>"
