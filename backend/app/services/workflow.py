"""
Workflow service layer for business logic.

Handles CRUD operations with multi-tenant isolation and transaction management.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, select
from fastapi import HTTPException, status
from typing import List, Tuple
from datetime import datetime, timezone
import json
import logging

from app.models.workflow import Workflow
from app.models.step import Step
from app.schemas.workflow import CreateWorkflowRequest, UpdateWorkflowRequest, WorkflowListItem
from app.schemas.step import StepCreate
from app.utils.s3 import delete_directory

logger = logging.getLogger(__name__)


def create_workflow(
    db: Session,
    workflow_data: CreateWorkflowRequest,
    company_id: int,
    user_id: int
) -> Workflow:
    """
    Create a new workflow with steps in a single transaction.

    **Multi-tenant Isolation:**
    - Workflow automatically assigned to user's company_id
    - Steps are child records, automatically isolated via workflow

    **Transaction:**
    - Creates workflow record
    - Creates all step records
    - Commits atomically (all or nothing)

    **Initial Status:**
    - Workflow created with status="draft"
    - AI labeling is triggered separately via /start-processing endpoint
    - Status changes to "processing" when AI labeling starts

    Args:
        db: Database session
        workflow_data: Workflow creation data with steps
        company_id: ID of user's company (from JWT)
        user_id: ID of creating user (from JWT)

    Returns:
        Created Workflow object with steps

    Raises:
        HTTPException: 400 if data is invalid
    """
    try:
        # Create workflow record
        workflow = Workflow(
            company_id=company_id,
            created_by=user_id,
            name=workflow_data.name,
            description=workflow_data.description,
            starting_url=workflow_data.starting_url,
            tags=json.dumps(workflow_data.tags),
            status="draft",  # Initial status - changes to "processing" when AI labeling starts
        )

        db.add(workflow)
        db.flush()  # Get workflow.id for steps

        # Create step records
        for step_data in workflow_data.steps:
            step = Step(
                workflow_id=workflow.id,
                step_number=step_data.step_number,
                timestamp=step_data.timestamp,
                action_type=step_data.action_type,
                selectors=json.dumps(step_data.selectors),
                element_meta=json.dumps(step_data.element_meta),
                page_context=json.dumps(step_data.page_context),
                action_data=json.dumps(step_data.action_data) if step_data.action_data else None,
                dom_context=json.dumps(step_data.dom_context) if step_data.dom_context else None,
                screenshot_id=step_data.screenshot_id,
            )
            db.add(step)

        # Commit transaction
        db.commit()
        db.refresh(workflow)

        return workflow

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "WORKFLOW_CREATION_FAILED",
                "message": f"Failed to create workflow: {str(e)}"
            }
        )


def get_workflows(
    db: Session,
    company_id: int,
    limit: int = 10,
    offset: int = 0
) -> Tuple[List[WorkflowListItem], int]:
    """
    Get paginated list of workflows for a company.

    **Multi-tenant Isolation:**
    - ALWAYS filters by company_id from JWT token
    - Users can ONLY see workflows from their own company

    **Pagination:**
    - Default: 10 items per page
    - Max: 100 items per page
    - Returns total count for pagination UI

    **Computed Fields:**
    - step_count: Number of steps in workflow (via subquery)

    Args:
        db: Database session
        company_id: ID of user's company (from JWT)
        limit: Number of items per page (max 100)
        offset: Number of items to skip

    Returns:
        Tuple of (workflows list, total count)
    """
    # Enforce max limit
    if limit > 100:
        limit = 100

    # Subquery to count steps per workflow
    step_count_subquery = (
        db.query(
            Step.workflow_id,
            func.count(Step.id).label("step_count")
        )
        .group_by(Step.workflow_id)
        .subquery()
    )

    # Main query with multi-tenant filtering
    query = (
        db.query(
            Workflow,
            func.coalesce(step_count_subquery.c.step_count, 0).label("step_count")
        )
        .outerjoin(step_count_subquery, Workflow.id == step_count_subquery.c.workflow_id)
        .filter(Workflow.company_id == company_id)
        .order_by(Workflow.updated_at.desc())
    )

    # Get total count
    total = db.query(Workflow).filter(Workflow.company_id == company_id).count()

    # Get paginated results
    results = query.limit(limit).offset(offset).all()

    # Convert to WorkflowListItem with step_count
    workflows = []
    for workflow, step_count in results:
        workflow_dict = {
            "id": workflow.id,
            "company_id": workflow.company_id,
            "created_by": workflow.created_by,
            "name": workflow.name,
            "description": workflow.description,
            "starting_url": workflow.starting_url,
            "tags": workflow.tags,  # Will be parsed by Pydantic validator
            "status": workflow.status,
            "success_rate": workflow.success_rate,
            "total_uses": workflow.total_uses,
            "consecutive_failures": workflow.consecutive_failures,
            "created_at": workflow.created_at,
            "updated_at": workflow.updated_at,
            "last_successful_run": workflow.last_successful_run,
            "last_failed_run": workflow.last_failed_run,
            "step_count": step_count,
        }
        workflows.append(WorkflowListItem(**workflow_dict))

    return workflows, total


def get_workflow_by_id(
    db: Session,
    workflow_id: int,
    company_id: int
) -> Workflow:
    """
    Get a single workflow by ID with all steps.

    **Multi-tenant Isolation:**
    - ALWAYS filters by company_id from JWT token
    - Returns 404 if workflow doesn't exist OR belongs to different company
    - This prevents information leakage across companies

    **Included Data:**
    - Workflow metadata
    - All steps (ordered by step_number)
    - Steps eagerly loaded for performance

    Args:
        db: Database session
        workflow_id: ID of workflow to retrieve
        company_id: ID of user's company (from JWT)

    Returns:
        Workflow object with steps

    Raises:
        HTTPException: 404 if workflow not found or access denied
    """
    workflow = (
        db.query(Workflow)
        .filter(Workflow.id == workflow_id, Workflow.company_id == company_id)
        .first()
    )

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "WORKFLOW_NOT_FOUND",
                "message": f"Workflow with ID {workflow_id} not found"
            }
        )

    return workflow


def update_workflow(
    db: Session,
    workflow_id: int,
    company_id: int,
    workflow_data: UpdateWorkflowRequest
) -> Workflow:
    """
    Update workflow metadata.

    **Multi-tenant Isolation:**
    - ALWAYS filters by company_id from JWT token
    - Returns 404 if workflow doesn't exist OR belongs to different company

    **Updatable Fields:**
    - name, description, tags, status
    - Does NOT update steps (use separate step endpoints)
    - Only updates fields that are provided (partial update)

    **Status Validation (BE-008):**
    - When changing status to "active", validates all steps have labels
    - Returns 400 if activating workflow with incomplete steps

    Args:
        db: Database session
        workflow_id: ID of workflow to update
        company_id: ID of user's company (from JWT)
        workflow_data: Update data (partial)

    Returns:
        Updated Workflow object

    Raises:
        HTTPException: 404 if workflow not found or access denied
        HTTPException: 400 if activating incomplete workflow
    """
    # Get workflow with multi-tenant check
    workflow = get_workflow_by_id(db, workflow_id, company_id)

    # Update fields (only if provided)
    if workflow_data.name is not None:
        workflow.name = workflow_data.name

    if workflow_data.description is not None:
        workflow.description = workflow_data.description

    if workflow_data.tags is not None:
        workflow.tags = json.dumps(workflow_data.tags)

    if workflow_data.status is not None:
        # BE-008: Validate workflow is complete before activating
        if workflow_data.status == "active":
            validate_workflow_complete(db, workflow)
        
        workflow.status = workflow_data.status
        workflow.updated_at = datetime.now(timezone.utc)

    # Commit changes
    db.commit()
    db.refresh(workflow)

    return workflow


def validate_workflow_complete(db: Session, workflow: Workflow) -> None:
    """
    Validate that all steps in a workflow have labels and instructions.
    
    Called before activating a workflow to ensure it's ready for use.
    
    Args:
        db: Database session
        workflow: Workflow object to validate
    
    Raises:
        HTTPException: 400 if any step is missing labels
    """
    from app.models.step import Step
    
    # Check if workflow has steps
    if not workflow.steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "WORKFLOW_INCOMPLETE",
                "message": "Cannot activate workflow with no steps"
            }
        )
    
    # Find steps with missing labels
    incomplete_steps = []
    for step in workflow.steps:
        if not step.field_label or not step.field_label.strip():
            incomplete_steps.append({
                "step_number": step.step_number,
                "missing": "field_label"
            })
        elif not step.instruction or not step.instruction.strip():
            incomplete_steps.append({
                "step_number": step.step_number,
                "missing": "instruction"
            })
    
    if incomplete_steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "WORKFLOW_INCOMPLETE",
                "message": f"Cannot activate workflow: {len(incomplete_steps)} step(s) missing labels",
                "incomplete_steps": incomplete_steps
            }
        )


def delete_workflow(
    db: Session,
    workflow_id: int,
    company_id: int
) -> None:
    """
    Delete a workflow and all associated steps (cascade), including screenshot files.

    **Multi-tenant Isolation:**
    - ALWAYS filters by company_id from JWT token
    - Returns 404 if workflow doesn't exist OR belongs to different company

    **Cascade Deletion:**
    - Deletes workflow record
    - Deletes all step records (CASCADE)
    - Deletes all screenshots (CASCADE)
    - Deletes all health logs (CASCADE)
    - Deletes all notifications (CASCADE)
    - Deletes screenshot files from storage (after DB commit)

    Args:
        db: Database session
        workflow_id: ID of workflow to delete
        company_id: ID of user's company (from JWT)

    Raises:
        HTTPException: 404 if workflow not found or access denied
    """
    # Get workflow with multi-tenant check
    workflow = get_workflow_by_id(db, workflow_id, company_id)

    # Build the storage path for this workflow's screenshots BEFORE deleting DB records
    # Path: companies/{company_id}/workflows/{workflow_id}/
    storage_path = f"companies/{company_id}/workflows/{workflow_id}"

    # Delete workflow (cascades to steps, screenshots, etc.)
    db.delete(workflow)
    db.commit()

    # Clean up screenshot files AFTER successful DB commit
    # This prevents orphaned files if the workflow existed
    if not delete_directory(storage_path):
        logger.warning(
            f"Failed to delete screenshot files for workflow {workflow_id} "
            f"at path: {storage_path}. Files may be orphaned."
        )
