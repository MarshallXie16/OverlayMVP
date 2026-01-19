"""
Screenshot model for storing workflow step screenshots.

Screenshots are deduplicated using SHA-256 hashing to avoid storing
identical images multiple times.
"""
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.workflow import Workflow
    from app.models.step import Step


class Screenshot(Base):
    """
    Screenshot model for workflow step images.

    Deduplication via hash prevents storing duplicate images.
    Stored in S3 with organized key structure.
    """

    __tablename__ = "screenshots"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Foreign Keys
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )

    # Deduplication
    hash: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)

    # Storage Information
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    storage_url: Mapped[str] = mapped_column(String, nullable=False)

    # Metadata
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    format: Mapped[str] = mapped_column(
        String, nullable=False, default="jpeg", server_default="jpeg"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship(
        "Workflow", back_populates="screenshots"
    )
    steps: Mapped[list["Step"]] = relationship(
        "Step", back_populates="screenshot"
    )

    # Indexes
    __table_args__ = (
        Index("idx_screenshots_hash", "hash"),
        Index("idx_screenshots_workflow", "workflow_id"),
    )

    def __repr__(self) -> str:
        return f"<Screenshot(id={self.id}, hash='{self.hash[:8]}...', workflow_id={self.workflow_id})>"
