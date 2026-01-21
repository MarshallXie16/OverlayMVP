"""
User model for authentication and authorization.

Users have role-based permissions.
Password is stored as bcrypt hash.

Roles:
- admin: Full control (manage users, all workflow ops)
- editor: Create/edit/delete workflows, run workflows (no user management)
- viewer: Run workflows only (no create/edit)

Status:
- active: Normal account
- suspended: Account disabled by admin
"""
from datetime import datetime
from typing import TYPE_CHECKING, Optional, Literal

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.workflow import Workflow
    from app.models.step import Step


# Valid role values (validated at application level, not database level for SQLite compatibility)
VALID_ROLES = {"admin", "editor", "viewer"}
# Valid status values
VALID_STATUSES = {"active", "suspended"}


class User(Base):
    """
    User model for authentication and team management.

    Users are scoped to a company and have role-based permissions.
    Passwords are hashed using bcrypt before storage.
    """

    __tablename__ = "users"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Authentication Fields
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)

    # User Profile
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # User Preferences - IANA timezone identifier (e.g., "America/Los_Angeles")
    timezone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Authorization - Using String for SQLite compatibility (validated at app level)
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="viewer"
    )

    # Account Status - active or suspended
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    # Workflows created by this user
    workflows_created: Mapped[list["Workflow"]] = relationship(
        "Workflow", back_populates="creator", foreign_keys="Workflow.created_by"
    )

    # Steps edited by this user
    steps_edited: Mapped[list["Step"]] = relationship(
        "Step", back_populates="editor", foreign_keys="Step.edited_by"
    )

    # Indexes
    __table_args__ = (
        Index("idx_users_email", "email"),
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email='{self.email}', role='{self.role}')>"
