"""
Workflow CRUD API endpoints.

RESTful API for creating, reading, updating, and deleting workflows with
multi-tenant isolation and async processing.
"""
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session
from typing import List
import json

from app.db.session import get_db
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.schemas.workflow import (
    CreateWorkflowRequest,
    CreateWorkflowResponse,
    UpdateWorkflowRequest,
    WorkflowResponse,
    WorkflowListResponse,
)
from app.schemas.step import StepResponse
from app.services.workflow import (
    create_workflow,
    get_workflows,
    get_workflow_by_id,
    update_workflow,
    delete_workflow,
)


router = APIRouter()


@router.post(
    "",
    response_model=CreateWorkflowResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new workflow",
    description="""
    Create a new workflow with steps.

    **Async Upload Workflow (Story 2.3):**
    - Returns immediately with workflow_id and "processing" status
    - AI labeling job queued in background (not implemented yet)
    - Frontend can show "Processing..." state
    - User can navigate away or create new workflows

    **Multi-tenant Isolation:**
    - Workflow automatically assigned to user's company_id from JWT
    - Users can only create workflows for their own company

    **Transaction:**
    - Workflow and all steps created atomically
    - If any step fails, entire workflow creation is rolled back

    **Required Fields:**
    - name: Workflow name
    - starting_url: URL where workflow starts
    - steps: At least 1 step required

    **Returns:**
    - workflow_id: ID of created workflow
    - status: "processing" (AI labeling happens async)
    """
)
def create_workflow_endpoint(
    workflow_data: CreateWorkflowRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new workflow with steps."""
    # Create workflow with user's company_id
    workflow = create_workflow(
        db=db,
        workflow_data=workflow_data,
        company_id=current_user.company_id,
        user_id=current_user.id
    )

    # TODO: Queue AI labeling job here (Sprint 2)
    # celery_app.send_task("tasks.label_workflow", args=[workflow.id])

    return CreateWorkflowResponse(
        workflow_id=workflow.id,
        status="processing"
    )


@router.get(
    "",
    response_model=WorkflowListResponse,
    summary="List workflows",
    description="""
    Get paginated list of workflows for the current user's company.

    **Multi-tenant Isolation:**
    - ONLY returns workflows from user's company
    - Impossible to access other companies' workflows

    **Pagination:**
    - Default: 10 items per page
    - Max: 100 items per page
    - Returns total count for pagination UI

    **Includes:**
    - Workflow metadata
    - step_count: Number of steps in workflow
    - Does NOT include step details (use GET /workflows/:id)

    **Sorting:**
    - Results sorted by updated_at DESC (newest first)
    """
)
def list_workflows_endpoint(
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List workflows for current user's company."""
    workflows, total = get_workflows(
        db=db,
        company_id=current_user.company_id,
        limit=limit,
        offset=offset
    )

    return WorkflowListResponse(
        total=total,
        limit=limit,
        offset=offset,
        workflows=workflows
    )


@router.get(
    "/{workflow_id}",
    response_model=WorkflowResponse,
    summary="Get workflow by ID",
    description="""
    Get a single workflow with all steps.

    **Multi-tenant Isolation:**
    - Returns 404 if workflow doesn't exist
    - Returns 404 if workflow belongs to different company (prevents info leakage)

    **Includes:**
    - Workflow metadata
    - All steps (ordered by step_number)
    - AI-generated labels (if processing complete)
    - Admin edits (if any)

    **Use Cases:**
    - Review workflow after recording
    - View workflow details before starting walkthrough
    - Admin editing workflow labels
    """
)
def get_workflow_endpoint(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single workflow with steps."""
    workflow = get_workflow_by_id(
        db=db,
        workflow_id=workflow_id,
        company_id=current_user.company_id
    )

    # Convert steps to StepResponse (parse JSON fields)
    steps_data = []
    for step in workflow.steps:
        step_dict = {
            "id": step.id,
            "workflow_id": step.workflow_id,
            "step_number": step.step_number,
            "timestamp": step.timestamp,
            "action_type": step.action_type,
            "selectors": json.loads(step.selectors),
            "element_meta": json.loads(step.element_meta),
            "page_context": json.loads(step.page_context),
            "action_data": json.loads(step.action_data) if step.action_data else None,
            "dom_context": json.loads(step.dom_context) if step.dom_context else None,
            "screenshot_id": step.screenshot_id,
            "field_label": step.field_label,
            "instruction": step.instruction,
            "ai_confidence": step.ai_confidence,
            "ai_model": step.ai_model,
            "ai_generated_at": step.ai_generated_at,
            "label_edited": step.label_edited,
            "instruction_edited": step.instruction_edited,
            "edited_by": step.edited_by,
            "edited_at": step.edited_at,
            "healed_selectors": json.loads(step.healed_selectors) if step.healed_selectors else None,
            "healed_at": step.healed_at,
            "healing_confidence": step.healing_confidence,
            "healing_method": step.healing_method,
            "created_at": step.created_at,
        }
        steps_data.append(StepResponse(**step_dict))

    # Build workflow response
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
        "steps": steps_data,
        "step_count": len(steps_data),
    }

    return WorkflowResponse(**workflow_dict)


@router.put(
    "/{workflow_id}",
    response_model=WorkflowResponse,
    summary="Update workflow metadata",
    description="""
    Update workflow metadata (name, description, tags, status).

    **Multi-tenant Isolation:**
    - Returns 404 if workflow doesn't exist or belongs to different company

    **Updatable Fields:**
    - name: Workflow name
    - description: Workflow description
    - tags: Tags array
    - status: Workflow status (draft, processing, active, needs_review, broken, archived)

    **Partial Update:**
    - Only updates fields that are provided
    - Omitted fields remain unchanged

    **Does NOT Update:**
    - Steps (use separate step endpoints - not implemented in MVP)
    - Metrics (success_rate, total_uses, etc. - updated by system)

    **Use Cases:**
    - Admin editing workflow name/description
    - Changing workflow status (draft → active)
    - Adding/removing tags
    """
)
def update_workflow_endpoint(
    workflow_id: int,
    workflow_data: UpdateWorkflowRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update workflow metadata."""
    workflow = update_workflow(
        db=db,
        workflow_id=workflow_id,
        company_id=current_user.company_id,
        workflow_data=workflow_data
    )

    # Convert to response format (same as GET)
    steps_data = []
    for step in workflow.steps:
        step_dict = {
            "id": step.id,
            "workflow_id": step.workflow_id,
            "step_number": step.step_number,
            "timestamp": step.timestamp,
            "action_type": step.action_type,
            "selectors": json.loads(step.selectors),
            "element_meta": json.loads(step.element_meta),
            "page_context": json.loads(step.page_context),
            "action_data": json.loads(step.action_data) if step.action_data else None,
            "dom_context": json.loads(step.dom_context) if step.dom_context else None,
            "screenshot_id": step.screenshot_id,
            "field_label": step.field_label,
            "instruction": step.instruction,
            "ai_confidence": step.ai_confidence,
            "ai_model": step.ai_model,
            "ai_generated_at": step.ai_generated_at,
            "label_edited": step.label_edited,
            "instruction_edited": step.instruction_edited,
            "edited_by": step.edited_by,
            "edited_at": step.edited_at,
            "healed_selectors": json.loads(step.healed_selectors) if step.healed_selectors else None,
            "healed_at": step.healed_at,
            "healing_confidence": step.healing_confidence,
            "healing_method": step.healing_method,
            "created_at": step.created_at,
        }
        steps_data.append(StepResponse(**step_dict))

    workflow_dict = {
        "id": workflow.id,
        "company_id": workflow.company_id,
        "created_by": workflow.created_by,
        "name": workflow.name,
        "description": workflow.description,
        "starting_url": workflow.starting_url,
        "tags": workflow.tags,
        "status": workflow.status,
        "success_rate": workflow.success_rate,
        "total_uses": workflow.total_uses,
        "consecutive_failures": workflow.consecutive_failures,
        "created_at": workflow.created_at,
        "updated_at": workflow.updated_at,
        "last_successful_run": workflow.last_successful_run,
        "last_failed_run": workflow.last_failed_run,
        "steps": steps_data,
        "step_count": len(steps_data),
    }

    return WorkflowResponse(**workflow_dict)


@router.delete(
    "/{workflow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workflow",
    description="""
    Delete a workflow and all associated data.

    **Multi-tenant Isolation:**
    - Returns 404 if workflow doesn't exist or belongs to different company

    **Cascade Deletion:**
    - Deletes workflow record
    - Deletes all steps (CASCADE)
    - Deletes all screenshots (CASCADE)
    - Deletes all health logs (CASCADE)
    - Deletes all notifications (CASCADE)

    **Irreversible:**
    - This operation cannot be undone
    - Consider archiving workflows instead (set status="archived")

    **Returns:**
    - 204 No Content on success
    - 404 if workflow not found or access denied
    """
)
def delete_workflow_endpoint(
    workflow_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workflow."""
    delete_workflow(
        db=db,
        workflow_id=workflow_id,
        company_id=current_user.company_id
    )

    # Return 204 No Content (no response body)
    return None
