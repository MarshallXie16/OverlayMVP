"""
Auto-healing validation API endpoints.

Provides AI-powered validation of auto-healing candidate matches.
The extension calls these endpoints when deterministic scoring is uncertain.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.utils.dependencies import get_current_user
from app.schemas.healing import (
    HealingValidationRequest,
    HealingValidationResponse,
)
from app.services.healing import (
    HealingValidationService,
    HealingServiceError,
    get_healing_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/validate", response_model=HealingValidationResponse)
async def validate_healing_match(
    request: HealingValidationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Validate an auto-healing candidate match using AI.

    Called by the extension when deterministic healing score is uncertain
    (typically 0.70-0.85 range) or when multiple candidates are close.

    The AI validates whether the candidate serves the same PURPOSE
    and is in the same CONTEXT as the original recorded element.

    **Authentication Required**: Any valid JWT token

    Args:
        request: Healing validation request with element contexts

    Returns:
        HealingValidationResponse with:
        - is_match: Whether AI confirms the match
        - ai_confidence: AI confidence score (0.0-1.0)
        - reasoning: Explanation for the decision
        - combined_score: Weighted combination of deterministic + AI
        - recommendation: accept/reject/prompt_user

    Raises:
        503: AI service unavailable
        500: Validation error
    """
    # Get healing service (may be None if API key not configured)
    service = get_healing_service()

    if service is None:
        # AI not available - return deterministic-only result
        logger.warning("AI healing validation unavailable, using deterministic only")

        # Use stricter thresholds when AI is unavailable
        deterministic_score = request.deterministic_score

        if deterministic_score >= 0.90:
            recommendation = "accept"
        elif deterministic_score >= 0.60:
            recommendation = "prompt_user"
        else:
            recommendation = "reject"

        return HealingValidationResponse(
            is_match=deterministic_score >= 0.60,
            ai_confidence=0.0,
            reasoning="AI validation unavailable. Using deterministic score only with stricter thresholds.",
            combined_score=deterministic_score,
            recommendation=recommendation,
            ai_model="deterministic_fallback",
        )

    try:
        # Validate the match using AI
        response = service.validate_healing_match(request)

        logger.info(
            f"Healing validation for step {request.step_id}: "
            f"is_match={response.is_match}, "
            f"ai_confidence={response.ai_confidence:.2f}, "
            f"combined={response.combined_score:.2f}, "
            f"recommendation={response.recommendation}"
        )

        return response

    except HealingServiceError as e:
        logger.error(f"Healing validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Healing validation failed: {str(e)}"
        )


@router.get("/status")
async def get_healing_service_status(
    current_user: User = Depends(get_current_user),
):
    """
    Check if AI healing validation service is available.

    **Authentication Required**: Any valid JWT token

    Returns:
        Service status and configuration
    """
    service = get_healing_service()

    return {
        "ai_available": service is not None,
        "model": service.model if service else None,
        "ai_weight": HealingValidationService.AI_WEIGHT,
        "thresholds": {
            "accept": HealingValidationService.ACCEPT_THRESHOLD,
            "reject": HealingValidationService.REJECT_THRESHOLD,
        },
        "fallback_mode": "deterministic_with_strict_thresholds",
    }
