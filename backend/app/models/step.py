"""
Step model for individual workflow actions.

Steps store detailed information about user interactions including selectors,
element metadata, page context, AI-generated labels, and auto-healing data.
"""
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.workflow import Workflow
    from app.models.screenshot import Screenshot
    from app.models.user import User


class Step(Base):
    """
    Step model representing a single action in a workflow.

    Steps are ordered sequentially and contain:
    - Element identification (selectors, metadata)
    - Page context (URL, title, viewport)
    - AI-generated labels and instructions
    - Auto-healing tracking for selector updates
    - Admin edit tracking
    """

    __tablename__ = "steps"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Foreign Keys
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    screenshot_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("screenshots.id", ondelete="SET NULL"), nullable=True
    )
    edited_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Step Ordering
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Timing
    timestamp: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Action Type
    action_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # click, input_commit, select_change, submit, navigate

    # Element Identification (JSON as TEXT for SQLite)
    selectors: Mapped[str] = mapped_column(Text, nullable=False)
    element_meta: Mapped[str] = mapped_column(Text, nullable=False)
    page_context: Mapped[str] = mapped_column(Text, nullable=False)
    action_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dom_context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # AI-Generated Labels (populated after processing)
    field_label: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instruction: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ai_generated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Admin Edits
    label_edited: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    instruction_edited: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    edited_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Auto-Healing Tracking
    healed_selectors: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    healed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    healing_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    healing_method: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # deterministic, ai_assisted

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="steps")
    screenshot: Mapped[Optional["Screenshot"]] = relationship(
        "Screenshot", back_populates="steps"
    )
    editor: Mapped[Optional["User"]] = relationship(
        "User", back_populates="steps_edited", foreign_keys=[edited_by]
    )

    # Indexes and Constraints
    __table_args__ = (
        UniqueConstraint("workflow_id", "step_number", name="uq_workflow_step_number"),
        Index("idx_steps_workflow", "workflow_id"),
        Index("idx_steps_screenshot", "screenshot_id"),
    )

    def __repr__(self) -> str:
        return f"<Step(id={self.id}, workflow_id={self.workflow_id}, step_number={self.step_number}, action_type='{self.action_type}')>"
