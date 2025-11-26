"""
Health logging service layer.

Handles workflow execution logging, success/failure tracking, and workflow
status updates based on health metrics.
"""
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Optional

from app.models.health_log import HealthLog
from app.models.workflow import Workflow
from app.schemas.health import ExecutionLogRequest


# Exponential moving average factor for success rate
# 0.9 means 90% weight on historical data, 10% on new execution
EMA_ALPHA = 0.1

# Consecutive failures threshold for marking workflow as broken
BROKEN_THRESHOLD = 3


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
            # TODO Epic 5: Create notification for admin
    
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
    # Broken takes precedence
    if workflow.status == 'broken' or workflow.consecutive_failures >= BROKEN_THRESHOLD:
        return 'broken'
    
    # Check explicit needs_review status
    if workflow.status == 'needs_review':
        return 'needs_review'
    
    # Active workflows: check success rate
    if workflow.status == 'active':
        if workflow.success_rate > 0.9:
            return 'healthy'
        if workflow.success_rate >= 0.6:
            return 'needs_review'
        return 'broken'
    
    # Draft, processing, archived don't have health status
    return 'unknown'
