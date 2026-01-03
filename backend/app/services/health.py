"""
Health logging service layer.

Handles workflow execution logging, success/failure tracking, workflow
status updates, and admin notifications for healing events.

Phase 5: Enhanced healing logging and admin alerts.
"""
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Optional

from app.models.health_log import HealthLog
from app.models.workflow import Workflow
from app.models.notification import Notification
from app.schemas.health import ExecutionLogRequest


logger = logging.getLogger(__name__)

# Exponential moving average factor for success rate
# 0.9 means 90% weight on historical data, 10% on new execution
EMA_ALPHA = 0.1

# Consecutive failures threshold for marking workflow as broken
BROKEN_THRESHOLD = 3

# Success rate threshold for degradation alerts
DEGRADATION_THRESHOLD = 0.6

# Low confidence threshold for alerts
LOW_CONFIDENCE_THRESHOLD = 0.65


def log_workflow_execution(
    db: Session,
    workflow_id: int,
    user_id: int,
    execution_data: ExecutionLogRequest
) -> tuple[HealthLog, Workflow]:
    """
    Log workflow execution and update workflow health metrics.
    
    Creates health log entry and updates workflow:
    - total_uses counter
    - success_rate (exponential moving average)
    - consecutive_failures counter
    - last_successful_run / last_failed_run timestamps
    - status (broken if consecutive_failures >= 3)
    
    Args:
        db: Database session
        workflow_id: Workflow ID
        user_id: User who executed the workflow
        execution_data: Execution result data
    
    Returns:
        Tuple of (health_log, updated_workflow)
    
    Raises:
        ValueError: If workflow not found
    """
    # Get workflow
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise ValueError(f"Workflow {workflow_id} not found")
    
    # Create health log entry
    health_log = HealthLog(
        workflow_id=workflow_id,
        step_id=execution_data.step_id,
        user_id=user_id,
        status=execution_data.status,
        error_type=execution_data.error_type,
        error_message=execution_data.error_message,
        healing_confidence=execution_data.healing_confidence,
        deterministic_score=execution_data.deterministic_score,
        ai_confidence=execution_data.ai_confidence,
        candidates_evaluated=execution_data.candidates_evaluated,
        page_state_hash=execution_data.page_state_hash,
        page_url=execution_data.page_url,
        execution_time_ms=execution_data.execution_time_ms,
    )
    
    db.add(health_log)
    
    # Update workflow metrics
    workflow.total_uses += 1
    
    # Determine if execution was successful
    is_success = execution_data.status in ['success', 'healed_deterministic', 'healed_ai']
    
    if is_success:
        # Reset consecutive failures on success
        workflow.consecutive_failures = 0
        workflow.last_successful_run = datetime.now()
        
        # Update success rate with exponential moving average
        # success_rate = (1 - α) * old_rate + α * 1.0
        workflow.success_rate = (1 - EMA_ALPHA) * workflow.success_rate + EMA_ALPHA * 1.0
        
        # If workflow was broken, change back to active
        if workflow.status == 'broken':
            workflow.status = 'active'
    
    else:  # Failed
        # Increment consecutive failures
        workflow.consecutive_failures += 1
        workflow.last_failed_run = datetime.now()
        
        # Update success rate with exponential moving average
        # success_rate = (1 - α) * old_rate + α * 0.0
        workflow.success_rate = (1 - EMA_ALPHA) * workflow.success_rate + EMA_ALPHA * 0.0
        
        # Mark as broken if consecutive failures >= threshold
        if workflow.consecutive_failures >= BROKEN_THRESHOLD:
            workflow.status = 'broken'
            # Create notification for admin
            create_workflow_broken_notification(
                db, workflow, execution_data.error_message
            )

    # Check for low confidence healing (create advisory notification)
    if execution_data.healing_confidence is not None:
        if execution_data.healing_confidence < LOW_CONFIDENCE_THRESHOLD:
            create_low_confidence_notification(
                db, workflow, execution_data.healing_confidence, execution_data.step_id
            )

    # Check for success rate degradation
    if workflow.success_rate < DEGRADATION_THRESHOLD and workflow.total_uses >= 5:
        create_degradation_notification(db, workflow)

    # Commit changes
    db.commit()
    db.refresh(health_log)
    db.refresh(workflow)

    return health_log, workflow


def calculate_workflow_health_status(workflow: Workflow) -> str:
    """
    Calculate workflow health status based on metrics.

    Used for reporting/display purposes. The actual workflow.status field
    is updated by log_workflow_execution().

    Returns:
        'healthy', 'needs_review', 'broken', or 'unknown'
    """
    # Broken takes precedence (only if explicitly broken or has consecutive failures)
    if workflow.status == 'broken' or workflow.consecutive_failures >= BROKEN_THRESHOLD:
        return 'broken'

    # Check explicit needs_review status
    if workflow.status == 'needs_review':
        return 'needs_review'

    # Active workflows: check success rate (only if we have enough data)
    if workflow.status == 'active':
        # Minimum 5 runs before applying success rate thresholds
        # Assume healthy until we have reliable data
        if workflow.total_uses < 5:
            return 'healthy'

        # Enough data - apply success rate thresholds
        if workflow.success_rate > 0.9:
            return 'healthy'
        if workflow.success_rate >= 0.6:
            return 'needs_review'
        return 'broken'

    # Draft, processing, archived don't have health status
    return 'unknown'


def create_workflow_broken_notification(
    db: Session,
    workflow: Workflow,
    error_message: Optional[str]
) -> Notification:
    """
    Create notification when workflow is marked as broken.

    Triggered after BROKEN_THRESHOLD consecutive failures.
    Severity: error
    """
    notification = Notification(
        company_id=workflow.company_id,
        workflow_id=workflow.id,
        type="workflow_broken",
        severity="error",
        title=f"Workflow '{workflow.name}' is broken",
        message=f"This workflow has failed {workflow.consecutive_failures} times consecutively. "
                f"Last error: {error_message or 'Unknown error'}",
        action_url=f"/workflows/{workflow.id}",
    )
    db.add(notification)
    logger.warning(
        f"Workflow {workflow.id} marked as broken after {workflow.consecutive_failures} failures"
    )
    return notification


def create_low_confidence_notification(
    db: Session,
    workflow: Workflow,
    confidence: float,
    step_id: Optional[int]
) -> Notification:
    """
    Create notification for low-confidence healing events.

    Advisory notification to review healed elements.
    Severity: warning
    """
    step_info = f" at step {step_id}" if step_id else ""
    notification = Notification(
        company_id=workflow.company_id,
        workflow_id=workflow.id,
        type="low_confidence",
        severity="warning",
        title=f"Low confidence healing in '{workflow.name}'",
        message=f"Auto-healing{step_info} completed with {confidence:.0%} confidence. "
                f"Review recommended to ensure correct element selection.",
        action_url=f"/workflows/{workflow.id}",
    )
    db.add(notification)
    logger.info(
        f"Low confidence healing ({confidence:.2f}) in workflow {workflow.id}, step {step_id}"
    )
    return notification


def create_degradation_notification(
    db: Session,
    workflow: Workflow
) -> Notification:
    """
    Create notification when workflow success rate degrades.

    Triggered when success_rate drops below DEGRADATION_THRESHOLD
    and workflow has at least 5 uses (to avoid false alarms).
    Severity: warning
    """
    # Avoid duplicate notifications - check if recent degradation notification exists
    recent_notification = db.query(Notification).filter(
        Notification.workflow_id == workflow.id,
        Notification.type == "high_failure_rate",
        Notification.read == False
    ).first()

    if recent_notification:
        # Update existing notification instead of creating duplicate
        recent_notification.message = (
            f"Success rate has dropped to {workflow.success_rate:.0%} "
            f"(below {DEGRADATION_THRESHOLD:.0%} threshold). "
            f"Total uses: {workflow.total_uses}."
        )
        logger.debug(f"Updated existing degradation notification for workflow {workflow.id}")
        return recent_notification

    notification = Notification(
        company_id=workflow.company_id,
        workflow_id=workflow.id,
        type="high_failure_rate",
        severity="warning",
        title=f"High failure rate in '{workflow.name}'",
        message=f"Success rate has dropped to {workflow.success_rate:.0%} "
                f"(below {DEGRADATION_THRESHOLD:.0%} threshold). "
                f"Total uses: {workflow.total_uses}.",
        action_url=f"/workflows/{workflow.id}",
    )
    db.add(notification)
    logger.warning(
        f"Workflow {workflow.id} success rate degraded to {workflow.success_rate:.2f}"
    )
    return notification