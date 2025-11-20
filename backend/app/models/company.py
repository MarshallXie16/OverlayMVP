"""
Company model for multi-tenant architecture.

Each company represents a separate organization using the platform.
All other data is scoped to a company via company_id foreign keys.
"""
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.workflow import Workflow
    from app.models.screenshot import Screenshot
    from app.models.notification import Notification


class Company(Base):
    """
    Company model - Multi-tenant root entity.

    Each company has its own isolated data space. The invite_token
    is used during user signup to join the correct company.
    """

    __tablename__ = "companies"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Core Fields
    name: Mapped[str] = mapped_column(String, nullable=False)
    invite_token: Mapped[str] = mapped_column(
        String, unique=True, nullable=False, index=True
    )

    # JSON Settings (stored as TEXT for SQLite compatibility)
    settings: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}", server_default="{}"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships (use string references to avoid circular imports)
    users: Mapped[list["User"]] = relationship(
        "User", back_populates="company", cascade="all, delete-orphan"
    )
    workflows: Mapped[list["Workflow"]] = relationship(
        "Workflow", back_populates="company", cascade="all, delete-orphan"
    )
    screenshots: Mapped[list["Screenshot"]] = relationship(
        "Screenshot", back_populates="company", cascade="all, delete-orphan"
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification", back_populates="company", cascade="all, delete-orphan"
    )

    # Indexes are defined via Index() for clarity
    __table_args__ = (Index("idx_companies_invite", "invite_token"),)

    def __repr__(self) -> str:
        return f"<Company(id={self.id}, name='{self.name}')>"
