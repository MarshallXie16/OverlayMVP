"""
HealthLog model for tracking workflow execution results.

Logs record success, failure, and auto-healing events for workflows and steps.
"""
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.workflow import Workflow
    from app.models.step import Step
    from app.models.user import User


class HealthLog(Base):
    """
    HealthLog model for tracking workflow execution outcomes.

    Records success/failure status, error details, healing information,
    and performance metrics for each workflow run.
    """

    __tablename__ = "health_logs"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Foreign Keys
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    step_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("steps.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Execution Status
    status: Mapped[str] = mapped_column(
        String, nullable=False
    )  # success, healed_deterministic, healed_ai, failed

    # Error Information
    error_type: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # element_not_found, timeout, navigation_error
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Healing Metrics
    healing_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    deterministic_score: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )  # 0-100
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    candidates_evaluated: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )

    # Page Context
    page_state_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    page_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Performance
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="health_logs")
    step: Mapped[Optional["Step"]] = relationship("Step", back_populates="health_logs")
    user: Mapped["User"] = relationship("User", back_populates="health_logs")

    # Indexes
    __table_args__ = (
        Index("idx_health_logs_workflow", "workflow_id", "created_at"),
        Index("idx_health_logs_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<HealthLog(id={self.id}, workflow_id={self.workflow_id}, status='{self.status}')>"
