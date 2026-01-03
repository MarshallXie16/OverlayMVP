"""
Pydantic schemas for auto-healing validation API.

The healing endpoint receives element context from both the original recorded element
and the candidate match found by deterministic scoring. AI validates whether
the candidate is the correct match.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from enum import Enum


class VisualRegion(str, Enum):
    """Visual region of the page where element appears."""
    HEADER = "header"
    MAIN = "main"
    FOOTER = "footer"
    SIDEBAR = "sidebar"
    MODAL = "modal"
    UNKNOWN = "unknown"


class FormContextSchema(BaseModel):
    """Form context for an element."""
    form_id: Optional[str] = Field(None, description="Form ID attribute")
    form_action: Optional[str] = Field(None, description="Form action URL")
    form_name: Optional[str] = Field(None, description="Form name attribute")
    form_classes: List[str] = Field(default_factory=list, description="Form CSS classes")
    field_index: int = Field(0, description="Position of field within form")
    total_fields: int = Field(0, description="Total number of fields in form")


class NearbyLandmarksSchema(BaseModel):
    """Nearby landmarks for contextual anchoring."""
    closest_heading: Optional[Dict[str, Any]] = Field(
        None,
        description="Closest heading: {text, level, distance}"
    )
    closest_label: Optional[Dict[str, Any]] = Field(
        None,
        description="Closest label: {text, for_id}"
    )
    sibling_texts: List[str] = Field(default_factory=list, description="Text of adjacent siblings")
    container_text: Optional[str] = Field(None, description="Text of container element")


class ElementContextSchema(BaseModel):
    """
    Full context of an element for healing comparison.

    This captures everything needed to identify an element across page changes.
    """
    # Core identifiers
    tag_name: str = Field(..., description="HTML tag name")
    text: Optional[str] = Field(None, description="Element text content")
    role: Optional[str] = Field(None, description="ARIA role")
    type: Optional[str] = Field(None, description="Input type (for inputs)")

    # Attributes
    id: Optional[str] = Field(None, description="Element ID")
    name: Optional[str] = Field(None, description="Element name attribute")
    classes: List[str] = Field(default_factory=list, description="CSS classes")
    data_testid: Optional[str] = Field(None, description="data-testid attribute")

    # Labels
    label_text: Optional[str] = Field(None, description="Associated label text")
    placeholder: Optional[str] = Field(None, description="Placeholder text")
    aria_label: Optional[str] = Field(None, description="ARIA label")

    # Position
    x: float = Field(0, description="X coordinate")
    y: float = Field(0, description="Y coordinate")
    width: float = Field(0, description="Element width")
    height: float = Field(0, description="Element height")

    # Context
    visual_region: VisualRegion = Field(
        VisualRegion.UNKNOWN,
        description="Visual page region"
    )
    form_context: Optional[FormContextSchema] = Field(
        None,
        description="Form context if in a form"
    )
    nearby_landmarks: Optional[NearbyLandmarksSchema] = Field(
        None,
        description="Nearby landmarks for anchoring"
    )

    class Config:
        use_enum_values = True


class HealingValidationRequest(BaseModel):
    """
    Request to validate an auto-healing candidate match.

    The extension sends this when:
    1. Deterministic score is 0.70-0.85 (uncertain range)
    2. Multiple close candidates (within 0.10 of each other)
    3. Any soft vetoes were applied

    AI validates whether the candidate is the correct match.
    """
    # Workflow context
    workflow_id: int = Field(..., description="Workflow ID")
    step_id: int = Field(..., description="Step ID being healed")

    # Element contexts
    original_context: ElementContextSchema = Field(
        ...,
        description="Context of original recorded element"
    )
    candidate_context: ElementContextSchema = Field(
        ...,
        description="Context of candidate element found"
    )

    # Deterministic scores
    deterministic_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Score from deterministic factors (0.0-1.0)"
    )
    factor_scores: Dict[str, float] = Field(
        default_factory=dict,
        description="Individual factor scores"
    )

    # Screenshots (base64 or URLs)
    original_screenshot: Optional[str] = Field(
        None,
        description="Original step screenshot URL or base64"
    )
    current_screenshot: Optional[str] = Field(
        None,
        description="Current page screenshot with candidate highlighted (URL or base64)"
    )

    # Additional context
    page_url: str = Field(..., description="Current page URL")
    original_url: str = Field(..., description="Original recorded URL")

    # Field label for context
    field_label: Optional[str] = Field(
        None,
        description="Human-readable field label from original step"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "workflow_id": 10,
                "step_id": 45,
                "original_context": {
                    "tag_name": "button",
                    "text": "Submit",
                    "role": "button",
                    "visual_region": "main",
                    "form_context": {
                        "form_id": "checkout-form",
                        "field_index": 5,
                        "total_fields": 6
                    }
                },
                "candidate_context": {
                    "tag_name": "button",
                    "text": "Submit Order",
                    "role": "button",
                    "visual_region": "main",
                    "form_context": {
                        "form_id": "checkout-form",
                        "field_index": 5,
                        "total_fields": 6
                    }
                },
                "deterministic_score": 0.78,
                "factor_scores": {
                    "contextualProximity": 1.0,
                    "textSimilarity": 0.65,
                    "roleMatch": 1.0,
                    "positionSimilarity": 0.8,
                    "attributeMatch": 0.6
                },
                "page_url": "https://shop.example.com/checkout",
                "original_url": "https://shop.example.com/checkout",
                "field_label": "Submit Button"
            }
        }


class HealingValidationResponse(BaseModel):
    """
    Response from healing validation.

    AI returns its confidence that the candidate is the correct match,
    along with reasoning.
    """
    # Validation result
    is_match: bool = Field(..., description="Whether AI confirms this is a match")
    ai_confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="AI confidence score (0.0-1.0)"
    )

    # Reasoning
    reasoning: str = Field(..., description="AI explanation for the decision")

    # Combined score (deterministic + AI weighted)
    combined_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Combined score using AI weight"
    )

    # Recommendation
    recommendation: str = Field(
        ...,
        description="Recommendation: accept, reject, prompt_user"
    )

    # Model info
    ai_model: str = Field(..., description="AI model used for validation")

    class Config:
        json_schema_extra = {
            "example": {
                "is_match": True,
                "ai_confidence": 0.92,
                "reasoning": "Both elements are submit buttons in the same checkout form. Text changed from 'Submit' to 'Submit Order' which is a common legitimate UI update.",
                "combined_score": 0.84,
                "recommendation": "accept",
                "ai_model": "claude-haiku-4-5-20251001"
            }
        }
