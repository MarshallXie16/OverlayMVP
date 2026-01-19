"""
Workflow model for recorded automation sequences.

Workflows contain ordered steps and track success rates, status, and metadata.
"""
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    DateTime,
    Enum as SQLEnum,
    Float,
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
    from app.models.user import User
    from app.models.step import Step
    from app.models.screenshot import Screenshot


class Workflow(Base):
    """
    Workflow model representing a recorded automation sequence.

    Workflows progress through states: draft → processing → active/needs_review/broken.
    Success rates and failure tracking help identify when workflows need attention.
    """

    __tablename__ = "workflows"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Foreign Keys
    created_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Core Fields
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    starting_url: Mapped[str] = mapped_column(String, nullable=False)

    # Tags (JSON array as TEXT for SQLite)
    tags: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]", server_default="[]"
    )

    # Status
    status: Mapped[str] = mapped_column(
        SQLEnum(
            "draft",
            "processing",
            "active",
            "needs_review",
            "broken",
            "archived",
            name="workflow_status",
        ),
        nullable=False,
        default="draft",
        server_default="draft",
    )

    # Metrics
    # Initialize to 1.0 - assume healthy until proven otherwise
    # This prevents new workflows from showing artificially low success rates
    success_rate: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0, server_default="1.0"
    )
    total_uses: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    consecutive_failures: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    last_successful_run: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_failed_run: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    creator: Mapped[Optional["User"]] = relationship(
        "User", back_populates="workflows_created", foreign_keys=[created_by]
    )

    steps: Mapped[list["Step"]] = relationship(
        "Step", back_populates="workflow", cascade="all, delete-orphan"
    )
    screenshots: Mapped[list["Screenshot"]] = relationship(
        "Screenshot", back_populates="workflow", cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (
        Index("idx_workflows_status", "status"),
        Index("idx_workflows_created_by", "created_by"),
    )

    def __repr__(self) -> str:
        return f"<Workflow(id={self.id}, name='{self.name}', status='{self.status}')>"
