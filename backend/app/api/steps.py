"""
Step API endpoints.

RESTful API for managing individual workflow steps, including:
- Getting step details
- Updating step labels (admin editing)
- Deleting steps (with automatic renumbering)
"""
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import update
import logging
from datetime import datetime, timezone

from app.db.session import get_db
from app.models.user import User
from app.models.step import Step
from app.models.workflow import Workflow
from app.utils.dependencies import get_current_user
from app.utils.permissions import Permission, require_permission
from app.schemas.step import StepResponse, StepUpdate

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{step_id}",
    response_model=StepResponse,
    summary="Get step details",
    description="""
    Retrieve details for a specific step.
    
    **Multi-tenant Security:**
    - Users can only access steps from their own company's workflows
    - Returns 403 Forbidden if step belongs to another company
    - Returns 404 if step doesn't exist
    """
)
def get_step(
    step_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get step by ID with multi-tenant isolation."""
    # Check permission (all roles can view)
    require_permission(current_user, Permission.VIEW_WORKFLOW)

    # Fetch step with workflow relationship
    step = db.query(Step).filter(Step.id == step_id).first()
    
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Step {step_id} not found"
        )
    
    # Multi-tenant check: step belongs to user's company?
    if step.workflow.company_id != current_user.company_id:
        logger.warning(
            f"User {current_user.id} attempted to access step {step_id} "
            f"from company {step.workflow.company_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this step"
        )
    
    return step


@router.patch(
    "/{step_id}/screenshot",
    response_model=StepResponse,
    summary="Link screenshot to step",
    description="""
    Update a step's screenshot_id after screenshot upload.
    
    **Use Case:**
    Extension uploads screenshots separately, then links them to steps.
    
    **Multi-tenant Security:**
    - Users can only update steps from their own company's workflows
    - Returns 403 Forbidden if step belongs to another company
    - Returns 404 if step doesn't exist
    """
)
def link_screenshot_to_step(
    step_id: int,
    screenshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Link screenshot to step (used by extension after upload)."""
    # Check permission (admin, editor only - viewers cannot edit)
    require_permission(current_user, Permission.EDIT_WORKFLOW)

    # Fetch step with workflow relationship
    step = db.query(Step).filter(Step.id == step_id).first()
    
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Step {step_id} not found"
        )
    
    # Multi-tenant check
    if step.workflow.company_id != current_user.company_id:
        logger.warning(
            f"User {current_user.id} attempted to update step {step_id} "
            f"from company {step.workflow.company_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this step"
        )
    
    # Update screenshot_id
    step.screenshot_id = screenshot_id
    db.commit()
    db.refresh(step)
    
    logger.info(f"Linked screenshot {screenshot_id} to step {step_id}")
    
    return step


@router.put(
    "/{step_id}",
    response_model=StepResponse,
    summary="Update step labels",
    description="""
    Update field label and instruction for a workflow step.
    
    **Use Case:** Admin corrects AI-generated labels during workflow review
    
    **Validation:**
    - field_label: 1-100 characters (if provided)
    - instruction: 1-500 characters (if provided)
    - At least one field must be provided
    
    **Tracking:**
    - Sets edited_by to current user ID
    - Sets edited_at to current timestamp
    - Marks label_edited or instruction_edited flags
    
    **Multi-tenant Security:**
    - Users can only edit steps from their own company's workflows
    - Returns 403 Forbidden if step belongs to another company
    """
)
def update_step(
    step_id: int,
    step_update: StepUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update step labels with edit tracking.

    Process:
    1. Fetch step and validate access
    2. Validate input (at least one field, max lengths)
    3. Update step with new values
    4. Set edit tracking fields (edited_by, edited_at, flags)
    5. Commit and return updated step
    """
    # Check permission (admin, editor only - viewers cannot edit)
    require_permission(current_user, Permission.EDIT_WORKFLOW)

    # Fetch step with workflow relationship
    step = db.query(Step).filter(Step.id == step_id).first()
    
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Step {step_id} not found"
        )
    
    # Multi-tenant check
    if step.workflow.company_id != current_user.company_id:
        logger.warning(
            f"User {current_user.id} attempted to edit step {step_id} "
            f"from company {step.workflow.company_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to edit this step"
        )
    
    # Validate at least one field is being updated
    if step_update.field_label is None and step_update.instruction is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one field (field_label or instruction) must be provided"
        )
    
    # Validate field lengths (Pydantic handles max_length, but check for empty)
    if step_update.field_label is not None:
        if not step_update.field_label.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="field_label cannot be empty or whitespace"
            )
        step.field_label = step_update.field_label.strip()
        step.label_edited = True
    
    if step_update.instruction is not None:
        if not step_update.instruction.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="instruction cannot be empty or whitespace"
            )
        step.instruction = step_update.instruction.strip()
        step.instruction_edited = True
    
    # Set edit tracking
    step.edited_by = current_user.id
    step.edited_at = datetime.now(timezone.utc)
    
    # Commit changes
    try:
        db.commit()
        db.refresh(step)
        logger.info(
            f"Step {step_id} edited by user {current_user.id}: "
            f"label_edited={step.label_edited}, instruction_edited={step.instruction_edited}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update step {step_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update step"
        )

    return step


@router.delete(
    "/{step_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a step",
    description="""
    Delete a workflow step and automatically renumber remaining steps.

    **Process:**
    1. Delete the specified step
    2. Renumber remaining steps to maintain contiguous sequence (1, 2, 3...)

    **Multi-tenant Security:**
    - Users can only delete steps from their own company's workflows
    - Returns 403 Forbidden if step belongs to another company
    - Returns 404 if step doesn't exist
    """
)
def delete_step(
    step_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a step and renumber remaining steps."""
    # Check permission (admin, editor only - viewers cannot delete)
    require_permission(current_user, Permission.EDIT_WORKFLOW)

    # Fetch step with workflow relationship
    step = db.query(Step).filter(Step.id == step_id).first()

    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Step {step_id} not found"
        )

    # Multi-tenant check
    if step.workflow.company_id != current_user.company_id:
        logger.warning(
            f"User {current_user.id} attempted to delete step {step_id} "
            f"from company {step.workflow.company_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this step"
        )

    workflow_id = step.workflow_id
    deleted_step_number = step.step_number

    try:
        # Delete the step
        db.delete(step)
        db.flush()  # Flush to ensure delete happens before renumbering

        # Renumber remaining steps to maintain contiguous sequence
        # All steps with step_number > deleted_step_number get decremented by 1
        remaining_steps = (
            db.query(Step)
            .filter(Step.workflow_id == workflow_id)
            .filter(Step.step_number > deleted_step_number)
            .order_by(Step.step_number)
            .all()
        )

        for step_to_update in remaining_steps:
            step_to_update.step_number -= 1

        # Update workflow's updated_at timestamp
        workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
        if workflow:
            workflow.updated_at = datetime.now(timezone.utc)

        db.commit()

        logger.info(
            f"Deleted step {step_id} from workflow {workflow_id}, "
            f"renumbered {len(remaining_steps)} remaining steps"
        )

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete step {step_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete step"
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
