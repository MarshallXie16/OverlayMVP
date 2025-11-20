"""
Base model class for all SQLAlchemy models.

This module provides the declarative base class and common functionality
for all database models in the Workflow Automation Platform.
"""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """
    Base class for all database models.

    Provides common functionality and type annotations for SQLAlchemy 2.0.
    """

    # Allow models to define their own type annotation map
    type_annotation_map = {}

    def to_dict(self) -> dict[str, Any]:
        """
        Convert model instance to dictionary.

        Useful for serialization and API responses.

        Returns:
            Dictionary representation of the model
        """
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
        }

    def __repr__(self) -> str:
        """String representation of the model instance."""
        attrs = ", ".join(
            f"{col.name}={getattr(self, col.name)!r}"
            for col in self.__table__.columns
        )
        return f"{self.__class__.__name__}({attrs})"
