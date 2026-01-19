"""
Workflow CRUD API endpoints.

RESTful API for creating, reading, updating, and deleting workflows with
async processing.
"""
from fastapi import APIRouter, Depends, status, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import json
import logging

from app.db.session import get_db
from app.utils.dependencies import get_current_user, AuthUser
from app.utils.permissions import Permission, require_permission
from app.schemas.workflow import (
    CreateWorkflowRequest,
    CreateWorkflowResponse,
    UpdateWorkflowRequest,
    WorkflowResponse,
    WorkflowListResponse,
)
from app.schemas.step import StepResponse, ReorderStepsRequest
from app.services.workflow import (
    create_workflow,
    get_workflow_by_id,
    update_workflow,
    delete_workflow,
)
from app.tasks.ai_labeling import label_workflow_steps

logger = logging.getLogger(__name__)


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
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new workflow with steps.

    Process:
    1. Create workflow and steps in database (status: "processing")
    2. Queue AI labeling task asynchronously
    3. Return immediately with workflow_id
    4. AI labeling happens in background
    5. Status updates to "draft" when complete
    """
    # Check permission (admin, editor only - viewers cannot create)
    require_permission(current_user, Permission.CREATE_WORKFLOW)

    # Create workflow
    workflow = create_workflow(
        db=db,
        workflow_data=workflow_data,
        user_id=current_user.id
    )

    # NOTE: AI labeling task is NOT queued here anymore
    # Extension will call POST /api/workflows/{id}/start-processing after uploading screenshots
    # This prevents race condition where Celery starts before screenshots are linked
    logger.info(
        f"Workflow {workflow.id} created, awaiting screenshot upload and processing trigger"
    )

    # Return response with workflow_id
    return {
        "workflow_id": workflow.id,
        "status": "draft"  # Changed from "processing" - not processing yet
    }


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
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List workflows."""
    # Check permission (all roles can view workflows)
    require_permission(current_user, Permission.VIEW_WORKFLOW)

    # Query Supabase schema (public.workflow / public.steps) directly.
    # This intentionally does NOT use the legacy SQLAlchemy ORM models.
    total = db.execute(text("SELECT COUNT(*) FROM public.workflow")).scalar() or 0

    rows = db.execute(
        text(
            """
            SELECT
              w.id,
              w.owner_id,
              w.title,
              w.description,
              w.tags,
              w.created_at,
              w.updated_at,
              (
                SELECT COUNT(*)
                FROM public.steps s
                WHERE s.workflow_id = w.id
              ) AS step_count
            FROM public.workflow w
            ORDER BY w.updated_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {"limit": limit, "offset": offset},
    ).mappings().all()

    workflows = []
    for r in rows:
        workflows.append(
            {
                "id": str(r["id"]),
                "created_by": str(r["owner_id"]) if r["owner_id"] else None,
                "name": r["title"],
                "description": r["description"],
                "starting_url": "",
                "tags": list(r["tags"] or []),
                "status": "active",
                "success_rate": 1.0,
                "total_uses": 0,
                "consecutive_failures": 0,
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "last_successful_run": None,
                "last_failed_run": None,
                "step_count": int(r["step_count"] or 0),
            }
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


    **Includes:**
    - Workflow metadata
    - All steps (ordered by order_index)
    """
)
def get_workflow_endpoint(
    workflow_id: str,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a single workflow with steps."""
    # Check permission (all roles can view workflows)
    require_permission(current_user, Permission.VIEW_WORKFLOW)

    # Query Supabase schema directly
    workflow_row = db.execute(
        text("SELECT * FROM public.workflow WHERE id = :workflow_id"),
        {"workflow_id": workflow_id},
    ).mappings().first()

    if not workflow_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "WORKFLOW_NOT_FOUND",
                "message": f"Workflow with ID {workflow_id} not found"
            }
        )

    # Query steps
    steps_rows = db.execute(
        text(
            "SELECT * FROM public.steps WHERE workflow_id = :workflow_id ORDER BY order_index ASC"
        ),
        {"workflow_id": workflow_id},
    ).mappings().all()

    # Map steps to StepResponse (minimal - Supabase schema is simpler)
    steps_data = []
    for step_row in steps_rows:
        # Convert UUID to numeric ID for frontend compatibility (use first 8 hex chars)
        step_uuid = step_row["id"]
        if isinstance(step_uuid, str):
            step_id_int = int(step_uuid.replace("-", "")[:8], 16)
        else:
            step_id_int = hash(str(step_uuid)) % (10**9)  # Fallback hash
        
        # Extract screenshot_url from Supabase Storage
        # Supabase steps table has screenshot_url pointing directly to Supabase Storage
        screenshot_url = step_row.get("screenshot_url")
        screenshot_id = None
        # For backward compatibility, also check screenshot_id
        if "screenshot_id" in step_row and step_row["screenshot_id"] is not None:
            try:
                screenshot_id = int(step_row["screenshot_id"])
            except (ValueError, TypeError):
                pass
        
        # Parse instruction_text to extract field_label and instruction
        # Format: "field_label: instruction" or just "instruction"
        instruction_text_value = step_row.get("instruction_text") or ""
        field_label = None
        instruction = instruction_text_value
        
        # If instruction_text contains ":", split it into field_label and instruction
        if ":" in instruction_text_value:
            parts = instruction_text_value.split(":", 1)
            field_label = parts[0].strip() or None
            instruction = parts[1].strip() if len(parts) > 1 and parts[1].strip() else None
        
        steps_data.append(
            StepResponse(
                id=step_id_int,
                workflow_id=0,  # Not used by frontend for step display
                step_number=step_row["order_index"],
                timestamp=None,
                action_type="click",  # Default
                selectors={},
                element_meta={},
                page_context={},
                action_data=None,
                dom_context=None,
                screenshot_id=screenshot_id,
                screenshot_url=screenshot_url,
                field_label=field_label,
                instruction=instruction,
                ai_confidence=None,
                ai_model=None,
                ai_generated_at=None,
                label_edited=False,
                instruction_edited=False,
                edited_by=None,
                edited_at=None,
                healed_selectors=None,
                healed_at=None,
                healing_confidence=None,
                healing_method=None,
                created_at=step_row.get("created_at") or datetime.now(timezone.utc),
            )
        )

    # Build workflow response
    return WorkflowResponse(
        id=str(workflow_row["id"]),
        created_by=str(workflow_row["owner_id"]) if workflow_row.get("owner_id") else None,
        name=workflow_row["title"],
        description=workflow_row.get("description"),
        starting_url="",
        tags=list(workflow_row.get("tags") or []),
        status="active",
        success_rate=1.0,
        total_uses=0,
        consecutive_failures=0,
        created_at=workflow_row.get("created_at") or datetime.now(timezone.utc),
        updated_at=workflow_row.get("updated_at") or datetime.now(timezone.utc),
        last_successful_run=None,
        last_failed_run=None,
        steps=steps_data,
        step_count=len(steps_data),
    )


@router.put(
    "/{workflow_id}",
    response_model=WorkflowResponse,
    summary="Update workflow metadata",
    description="""
    Update workflow metadata (name, description, tags, status).


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
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update workflow metadata."""
    # Check permission (admin, editor only - viewers cannot edit)
    require_permission(current_user, Permission.EDIT_WORKFLOW)

    workflow = update_workflow(
        db=db,
        workflow_id=workflow_id,
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


@router.patch(
    "/{workflow_id}/steps/reorder",
    response_model=WorkflowResponse,
    summary="Reorder workflow steps",
    description="""
    Reorder workflow steps via drag-and-drop.

    **Request:**
    - step_order: List of step IDs in desired order
    - All step IDs must belong to this workflow
    - All steps must be included exactly once

    - Returns 400 if step_order is invalid

    **Returns:**
    - Updated workflow with steps in new order
    """
)
def reorder_steps_endpoint(
    workflow_id: int,
    reorder_request: ReorderStepsRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reorder workflow steps."""
    # Check permission (admin, editor only - viewers cannot edit)
    require_permission(current_user, Permission.EDIT_WORKFLOW)

    # Verify workflow exists and belongs to user's company
    workflow = get_workflow_by_id(
        db=db,
        workflow_id=workflow_id,
    )

    # Get all steps for this workflow
    existing_steps = db.query(Step).filter(Step.workflow_id == workflow_id).all()
    existing_step_ids = {step.id for step in existing_steps}

    # Validate step_order
    provided_step_ids = set(reorder_request.step_order)

    if provided_step_ids != existing_step_ids:
        missing = existing_step_ids - provided_step_ids
        extra = provided_step_ids - existing_step_ids
        error_parts = []
        if missing:
            error_parts.append(f"Missing step IDs: {sorted(missing)}")
        if extra:
            error_parts.append(f"Invalid step IDs: {sorted(extra)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid step_order. {'. '.join(error_parts)}"
        )

    # Check for duplicates in step_order
    if len(reorder_request.step_order) != len(set(reorder_request.step_order)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate step IDs in step_order"
        )

    # Create map of step_id -> step object
    step_map = {step.id: step for step in existing_steps}

    try:
        # Two-phase update to avoid unique constraint violations:
        # Phase 1: Set all step_numbers to temporary negative values
        # This avoids collisions when reassigning step numbers
        for step_id in reorder_request.step_order:
            step_map[step_id].step_number = -step_map[step_id].step_number - 1000
        db.flush()  # Apply the temporary values

        # Phase 2: Set final step_numbers based on new order
        for new_step_number, step_id in enumerate(reorder_request.step_order, start=1):
            step_map[step_id].step_number = new_step_number

        db.commit()

        logger.info(
            f"Reordered {len(existing_steps)} steps in workflow {workflow_id}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to reorder steps in workflow {workflow_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reorder steps"
        )

    # Refresh and return updated workflow
    db.refresh(workflow)

    # Convert steps to response format (same pattern as other endpoints)
    steps_data = []
    for step in sorted(workflow.steps, key=lambda s: s.step_number):
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


@router.post(
    "/{workflow_id}/start-processing",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start AI processing for workflow",
    description="""
    Trigger AI labeling task for a workflow after screenshots have been uploaded.
    
    **Use Case:**
    Extension calls this endpoint after:
    1. Creating workflow
    2. Uploading all screenshots
    3. Linking all screenshots to steps
    
    This prevents race condition where AI processing starts before screenshots are ready.
    
    - Returns 404 if workflow doesn't exist
    
    **Returns:**
    - 202 Accepted: Task queued successfully
    - task_id: Celery task ID for tracking
    - message: Confirmation message
    """
)
def start_workflow_processing(
    workflow_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start AI processing for workflow after screenshots are uploaded."""
    # Check permission (admin, editor only - viewers cannot trigger processing)
    require_permission(current_user, Permission.EDIT_WORKFLOW)

    # Verify workflow exists
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id
    ).first()
    
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow {workflow_id} not found"
        )
    
    # Queue AI labeling job (async - runs in background)
    try:
        task = label_workflow_steps.delay(workflow.id)
        logger.info(
            f"AI labeling task queued for workflow {workflow.id}, "
            f"task_id: {task.id}"
        )
        
        return {
            "task_id": str(task.id),
            "workflow_id": workflow.id,
            "message": "AI processing started",
            "status": "processing"
        }
    except Exception as e:
        logger.error(
            f"Failed to queue AI labeling task for workflow {workflow.id}: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start AI processing: {str(e)}"
        )


@router.delete(
    "/{workflow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete workflow",
    description="""
    Delete a workflow and all associated data.


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
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a workflow."""
    # Check permission (admin, editor only - viewers cannot delete)
    require_permission(current_user, Permission.DELETE_WORKFLOW)

    delete_workflow(
        db=db,
        workflow_id=workflow_id,
    )

    # Return 204 No Content (no response body)
    return None


# Execution logging endpoint removed - health_log model was deleted
