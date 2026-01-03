"""
Health Dashboard API endpoints.

Provides endpoints for:
- Listing paginated health logs (execution history)
- Aggregated health statistics for the dashboard
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from app.db.session import get_db
from app.models.user import User
from app.models.workflow import Workflow
from app.models.health_log import HealthLog
from app.schemas.health import (
    HealthLogResponse,
    HealthLogListResponse,
    HealthStatsResponse,
)
from app.utils.dependencies import get_current_user

router = APIRouter()


@router.get("/logs", response_model=HealthLogListResponse)
async def list_health_logs(
    workflow_id: Optional[int] = Query(None, description="Filter by workflow ID"),
    status: Optional[str] = Query(
        None, description="Filter by status: success, healed_deterministic, healed_ai, failed"
    ),
    limit: int = Query(50, ge=1, le=200, description="Maximum logs to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List health logs (execution history) for the company.

    **Authentication Required:** Yes

    **Query Parameters:**
    - workflow_id: Filter logs for a specific workflow
    - status: Filter by execution status
    - limit: Max results (1-200, default 50)
    - offset: Pagination offset

    **Returns:**
    - Paginated list of health logs with workflow names
    - Total count matching filter
    """
    # Get all workflow IDs for this company (for multi-tenant isolation)
    company_workflow_ids = (
        db.query(Workflow.id)
        .filter(Workflow.company_id == current_user.company_id)
        .subquery()
    )

    # Base query for health logs in company's workflows
    query = (
        db.query(HealthLog, Workflow.name.label("workflow_name"))
        .join(Workflow, HealthLog.workflow_id == Workflow.id)
        .filter(HealthLog.workflow_id.in_(company_workflow_ids))
    )

    # Apply filters
    if workflow_id is not None:
        query = query.filter(HealthLog.workflow_id == workflow_id)

    if status is not None:
        query = query.filter(HealthLog.status == status)

    # Get total count before pagination
    total = query.count()

    # Apply pagination and ordering (newest first)
    results = (
        query.order_by(HealthLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return HealthLogListResponse(
        logs=[
            HealthLogResponse(
                id=log.id,
                workflow_id=log.workflow_id,
                workflow_name=workflow_name,
                step_id=log.step_id,
                status=log.status,
                error_type=log.error_type,
                error_message=log.error_message,
                healing_confidence=log.healing_confidence,
                execution_time_ms=log.execution_time_ms,
                page_url=log.page_url,
                created_at=log.created_at,
            )
            for log, workflow_name in results
        ],
        total=total,
    )


@router.get("/stats", response_model=HealthStatsResponse)
async def get_health_stats(
    days: int = Query(7, ge=1, le=90, description="Number of days to aggregate stats for"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get aggregated health statistics for the company.

    **Authentication Required:** Yes

    **Query Parameters:**
    - days: Number of days to aggregate (1-90, default 7)

    **Returns:**
    - Total executions, success/healed/failed counts
    - Success rate and healing rate
    - Average execution time
    - Workflow counts by status
    """
    # Calculate date range
    since = datetime.utcnow() - timedelta(days=days)

    # Get all workflow IDs for this company
    company_workflow_ids = (
        db.query(Workflow.id)
        .filter(Workflow.company_id == current_user.company_id)
        .subquery()
    )

    # Aggregate health log stats
    stats = db.query(
        func.count(HealthLog.id).label("total"),
        func.sum(case((HealthLog.status == "success", 1), else_=0)).label("success_count"),
        func.sum(
            case(
                (HealthLog.status.in_(["healed_deterministic", "healed_ai"]), 1),
                else_=0,
            )
        ).label("healed_count"),
        func.sum(case((HealthLog.status == "failed", 1), else_=0)).label("failed_count"),
        func.avg(HealthLog.execution_time_ms).label("avg_time"),
    ).filter(
        HealthLog.workflow_id.in_(company_workflow_ids),
        HealthLog.created_at >= since,
    ).first()

    total_executions = stats.total or 0
    success_count = stats.success_count or 0
    healed_count = stats.healed_count or 0
    failed_count = stats.failed_count or 0
    avg_time = int(stats.avg_time or 0)

    # Calculate rates
    success_rate = 0.0
    healing_rate = 0.0
    if total_executions > 0:
        success_rate = (success_count + healed_count) / total_executions
        non_failed = success_count + healed_count
        if non_failed > 0:
            healing_rate = healed_count / non_failed

    # Get workflow counts by status
    workflow_counts = (
        db.query(
            Workflow.status,
            func.count(Workflow.id).label("count"),
        )
        .filter(Workflow.company_id == current_user.company_id)
        .group_by(Workflow.status)
        .all()
    )

    workflows_by_status = {row.status: row.count for row in workflow_counts}
    # Ensure all statuses are present
    for status in ["active", "needs_review", "broken", "draft", "processing"]:
        if status not in workflows_by_status:
            workflows_by_status[status] = 0

    return HealthStatsResponse(
        total_executions=total_executions,
        success_count=success_count,
        healed_count=healed_count,
        failed_count=failed_count,
        success_rate=round(success_rate, 3),
        healing_rate=round(healing_rate, 3),
        avg_execution_time_ms=avg_time,
        workflows_by_status=workflows_by_status,
    )
