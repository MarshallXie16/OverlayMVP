"""
Shared utilities for Celery tasks.

Helper functions for:
- Database session management
- Error handling
- Logging
- Status updates
"""
from contextlib import contextmanager
from sqlalchemy.orm import Session
from app.db.session import SessionLocal


@contextmanager
def get_task_db():
    """
    Database session context manager for Celery tasks.
    
    Usage:
        with get_task_db() as db:
            workflow = db.query(Workflow).filter_by(id=workflow_id).first()
            # ... do work ...
            db.commit()
    
    Ensures:
    - Session is properly closed after use
    - Transactions are committed or rolled back
    - Connections are released back to pool
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def log_task_progress(task, current: int, total: int, message: str = ""):
    """
    Log task progress for monitoring.
    
    Args:
        task: Celery task instance (self)
        current: Current step number
        total: Total steps
        message: Additional message
    
    Example:
        log_task_progress(self, step_num, total_steps, f"Processing step {step_num}")
    """
    import logging
    
    percent = int((current / total) * 100) if total > 0 else 0
    
    # Update state only if we have a valid task_id (not in eager mode)
    try:
        if hasattr(task, 'request') and task.request.id:
            task.update_state(
                state="PROGRESS",
                meta={
                    "current": current,
                    "total": total,
                    "percent": percent,
                    "message": message,
                }
            )
    except (AttributeError, ValueError):
        # In eager mode or testing, update_state may fail
        # Just log progress without updating state
        pass
    
    # Always log progress
    logger = logging.getLogger(__name__)
    logger.info(f"[{percent}%] {message}")


def safe_json_parse(json_str: str, default: dict = None) -> dict:
    """
    Safely parse JSON string with fallback.
    
    Args:
        json_str: JSON string to parse
        default: Default value if parsing fails
    
    Returns:
        Parsed dict or default value
    """
    import json
    
    if not json_str:
        return default or {}
    
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return default or {}
