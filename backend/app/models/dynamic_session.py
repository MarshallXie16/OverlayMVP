"""
DynamicSession model for AI-agent guided web task completion.

Users type a natural language goal (e.g., "submit expense report for $56.99")
and an AI guides them through a web app step by step. This model tracks each
such session including the goal, extracted entities, per-turn logs, and token usage.
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
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.company import Company
    from app.models.user import User


class DynamicSession(Base):
    """
    DynamicSession model representing an AI-guided web task completion session.

    Sessions progress through states: active -> completed/abandoned/error.
    Tracks the user's goal, extracted entities, per-turn conversation log,
    and token usage for cost estimation.
    """

    __tablename__ = "dynamic_sessions"

    # Primary Key
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Foreign Keys
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Core Fields
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    goal_entities: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}", server_default="{}"
    )

    # Status
    status: Mapped[str] = mapped_column(
        SQLEnum(
            "active",
            "completed",
            "abandoned",
            "error",
            name="dynamic_session_status",
        ),
        nullable=False,
        default="active",
        server_default="active",
    )

    # Turn log (JSON array as TEXT for SQLite compatibility)
    turn_log: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]", server_default="[]"
    )

    # Metrics
    step_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    total_input_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    total_output_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    estimated_cost: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default="0.0"
    )

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships (no back_populates to avoid modifying Company/User models)
    company: Mapped["Company"] = relationship("Company")
    user: Mapped[Optional["User"]] = relationship("User")

    # Indexes
    __table_args__ = (
        Index("idx_dynamic_sessions_company", "company_id"),
        Index("idx_dynamic_sessions_user", "user_id"),
        Index("idx_dynamic_sessions_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<DynamicSession(id={self.id}, goal='{self.goal[:50]}...', "
            f"status='{self.status}')>"
        )
