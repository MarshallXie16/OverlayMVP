"""
Dynamic Workflow API endpoints.

AI-guided step-by-step web task completion. Users type a natural language goal
and the AI analyzes page context to determine next actions.

Endpoints:
- POST /sessions                    Create session (goal + starting URL)
- POST /sessions/{id}/step          Send page context, get next AI step
- POST /sessions/{id}/feedback      User correction, get adjusted step
- POST /sessions/{id}/complete      Mark session completed/abandoned
- GET  /sessions/{id}               Get session state
"""
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
import logging

from app.db.session import get_db
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.utils.permissions import Permission, require_permission
from app.schemas.dynamic_workflow import (
    CreateSessionRequest,
    CreateSessionResponse,
    StepRequest,
    DynamicStepResponse,
    FeedbackRequest,
    CompleteSessionRequest,
    SessionResponse,
)
from app.services.dynamic_workflow import DynamicWorkflowService, DynamicWorkflowServiceError

logger = logging.getLogger(__name__)


router = APIRouter()

# Lazy-initialized service instance (created on first use to avoid startup errors
# if ANTHROPIC_API_KEY is not set)
_service: DynamicWorkflowService | None = None


def get_service() -> DynamicWorkflowService:
    """Get or create the DynamicWorkflowService singleton."""
    global _service
    if _service is None:
        _service = DynamicWorkflowService()
    return _service


@router.post(
    "/sessions",
    response_model=CreateSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create dynamic workflow session",
    description="""
    Create a new AI-guided workflow session.

    The user provides a natural language goal (e.g., "Create a $50 expense report
    for Staples") and the starting URL. The backend extracts entities from the goal
    and returns them for user confirmation before starting the guidance loop.

    **Multi-tenant:** Session is created under the user's company_id from JWT.
    """,
)
def create_session(
    request: CreateSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new dynamic workflow session with entity extraction."""
    require_permission(current_user, Permission.RUN_WORKFLOW)

    try:
        service = get_service()
        result = service.create_session(
            db=db,
            company_id=current_user.company_id,
            user_id=current_user.id,
            goal=request.goal,
            starting_url=request.starting_url,
        )

        logger.info(
            f"Dynamic session {result['session_id']} created for user {current_user.id}: "
            f"\"{request.goal[:50]}...\""
        )

        return CreateSessionResponse(
            session_id=result["session_id"],
            goal=result["goal"],
            goal_entities=result["goal_entities"],
            status=result["status"],
        )

    except DynamicWorkflowServiceError as e:
        logger.error(f"Failed to create dynamic session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create session: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/step",
    response_model=DynamicStepResponse,
    summary="Get next AI-guided step",
    description="""
    Send current page context and receive the next AI-determined action.

    The extension captures an accessibility tree of interactive elements on the
    current page and sends it here. The AI analyzes the context and returns the
    next step: what element to interact with, what action to take, and whether
    to auto-fill a value from the goal.

    **Cost tracking:** Token usage is tracked per session.
    **Step limit:** Max 30 steps per session.
    """,
)
def get_next_step(
    session_id: int,
    request: StepRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the next AI-guided step based on page context."""
    require_permission(current_user, Permission.RUN_WORKFLOW)

    try:
        service = get_service()
        result = service.get_next_step(
            db=db,
            session_id=session_id,
            company_id=current_user.company_id,
            page_context=request.page_context.model_dump(),
        )

        return DynamicStepResponse(**result)

    except DynamicWorkflowServiceError as e:
        logger.error(f"Failed to get next step for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get next step: {str(e)}",
        )
    except ValueError as e:
        # Session not found or invalid state
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post(
    "/sessions/{session_id}/feedback",
    response_model=DynamicStepResponse,
    summary="Submit user correction",
    description="""
    Submit a user correction when the AI suggested the wrong action.

    The user clicks "That's wrong" and provides text explaining what went wrong
    or what to do instead. The AI re-evaluates and returns a corrected step.
    """,
)
def submit_feedback(
    session_id: int,
    request: FeedbackRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Process user feedback and return adjusted step."""
    require_permission(current_user, Permission.RUN_WORKFLOW)

    try:
        service = get_service()
        result = service.process_feedback(
            db=db,
            session_id=session_id,
            company_id=current_user.company_id,
            correction_text=request.correction_text,
            step_context=request.step_context,
            page_context=(
                request.page_context.model_dump()
                if request.page_context
                else None
            ),
        )

        return DynamicStepResponse(**result)

    except DynamicWorkflowServiceError as e:
        logger.error(f"Failed to process feedback for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process feedback: {str(e)}",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.post(
    "/sessions/{session_id}/complete",
    response_model=SessionResponse,
    summary="Complete or abandon session",
    description="""
    Mark a dynamic workflow session as completed or abandoned.

    Called when the goal is achieved or the user decides to stop.
    """,
)
def complete_session(
    session_id: int,
    request: CompleteSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark session as completed or abandoned."""
    require_permission(current_user, Permission.RUN_WORKFLOW)

    try:
        service = get_service()
        session = service.complete_session(
            db=db,
            session_id=session_id,
            company_id=current_user.company_id,
            reason=request.reason,
        )

        return SessionResponse.model_validate(session)

    except DynamicWorkflowServiceError as e:
        logger.error(f"Failed to complete session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete session: {str(e)}",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Get session state",
    description="""
    Get the current state of a dynamic workflow session.

    Returns session metadata, goal entities, step count, token usage, and cost.

    **Multi-tenant:** Only returns sessions belonging to the user's company.
    """,
)
def get_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get session state."""
    require_permission(current_user, Permission.RUN_WORKFLOW)

    from app.models.dynamic_session import DynamicSession

    session = db.query(DynamicSession).filter(
        DynamicSession.id == session_id,
        DynamicSession.company_id == current_user.company_id,
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    return SessionResponse.model_validate(session)
