"""
Pydantic schemas for workflow steps.

Steps represent individual actions in a workflow sequence (clicks, inputs, navigation, etc.).
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any
from datetime import datetime
import json


class StepCreate(BaseModel):
    """
    Schema for creating a new step in a workflow.

    Used when recording a workflow - the extension sends this data for each user action.
    """

    step_number: int = Field(..., ge=1, description="Sequential step number (1, 2, 3...)")
    timestamp: Optional[str] = Field(None, description="ISO 8601 timestamp when action occurred")
    action_type: str = Field(
        ...,
        description="Type of action: click, input_commit, select_change, submit, navigate"
    )

    # Element identification (stored as JSON in database)
    selectors: Dict[str, Any] = Field(
        ...,
        description="Element selectors: {primary, css, xpath, data_testid, stable_attrs}"
    )
    element_meta: Dict[str, Any] = Field(
        ...,
        description="Element metadata: {tag_name, role, type, label_text, classes, bounding_box, etc.}"
    )
    page_context: Dict[str, Any] = Field(
        ...,
        description="Page context: {url, title, viewport, page_state_hash}"
    )
    action_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Action-specific data: {input_value, click_coordinates, etc.}"
    )
    dom_context: Optional[Dict[str, Any]] = Field(
        None,
        description="DOM context: {element_html, parent_html}"
    )

    # Screenshot reference (if already uploaded)
    screenshot_id: Optional[int] = Field(None, description="ID of associated screenshot")

    class Config:
        json_schema_extra = {
            "example": {
                "step_number": 1,
                "timestamp": "2025-11-19T10:30:00.000Z",
                "action_type": "click",
                "selectors": {
                    "primary": "#submit-button",
                    "css": "form > button.submit",
                    "xpath": "//button[@id='submit-button']",
                    "data_testid": "submit-btn",
                    "stable_attrs": {
                        "name": "submit",
                        "aria_label": "Submit Form"
                    }
                },
                "element_meta": {
                    "tag_name": "BUTTON",
                    "role": "button",
                    "type": "submit",
                    "inner_text": "Submit",
                    "classes": ["btn", "btn-primary"],
                    "bounding_box": {"x": 100, "y": 200, "width": 120, "height": 40}
                },
                "page_context": {
                    "url": "https://example.com/form",
                    "title": "Contact Form",
                    "viewport": {"width": 1920, "height": 1080},
                    "page_state_hash": "sha256:abc123..."
                },
                "action_data": {
                    "click_coordinates": {"x": 10, "y": 15}
                },
                "screenshot_id": 123
            }
        }


class StepResponse(BaseModel):
    """
    Schema for step data in API responses.

    Includes all step data plus AI-generated labels and admin edits.
    """

    id: int
    workflow_id: int
    step_number: int
    timestamp: Optional[str] = None
    action_type: str

    # Element identification
    selectors: Dict[str, Any]
    element_meta: Dict[str, Any]
    page_context: Dict[str, Any]
    action_data: Optional[Dict[str, Any]] = None
    dom_context: Optional[Dict[str, Any]] = None

    # Screenshot reference
    screenshot_id: Optional[int] = None
    screenshot_url: Optional[str] = None  # Direct URL to Supabase Storage

    # AI-generated labels (populated after processing)
    field_label: Optional[str] = None
    instruction: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_model: Optional[str] = None
    ai_generated_at: Optional[datetime] = None

    # Admin edits
    label_edited: bool = False
    instruction_edited: bool = False
    edited_by: Optional[int] = None
    edited_at: Optional[datetime] = None

    # Auto-healing tracking
    healed_selectors: Optional[Dict[str, Any]] = None
    healed_at: Optional[datetime] = None
    healing_confidence: Optional[float] = None
    healing_method: Optional[str] = None

    # Timestamps
    created_at: datetime

    @field_validator('selectors', 'element_meta', 'page_context', 'action_data', 'dom_context', 'healed_selectors', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        """Parse JSON string fields to dicts."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v if v is not None else {}

    class Config:
        from_attributes = True  # Pydantic v2 (was orm_mode in v1)
        json_schema_extra = {
            "example": {
                "id": 1,
                "workflow_id": 10,
                "step_number": 1,
                "timestamp": "2025-11-19T10:30:00.000Z",
                "action_type": "click",
                "selectors": {
                    "primary": "#submit-button",
                    "css": "form > button.submit"
                },
                "element_meta": {
                    "tag_name": "BUTTON",
                    "role": "button",
                    "inner_text": "Submit"
                },
                "page_context": {
                    "url": "https://example.com/form",
                    "title": "Contact Form"
                },
                "screenshot_id": 123,
                "field_label": "Submit Button",
                "instruction": "Click the submit button to save the form",
                "ai_confidence": 0.95,
                "ai_model": "claude-3-5-sonnet-20241022",
                "created_at": "2025-11-19T10:30:01Z"
            }
        }


class StepUpdate(BaseModel):
    """
    Schema for updating step labels (admin editing).

    Allows admins to correct AI-generated labels and instructions.
    """

    field_label: Optional[str] = Field(None, max_length=100, description="Human-readable field label")
    instruction: Optional[str] = Field(None, max_length=500, description="Step instruction for users")

    class Config:
        json_schema_extra = {
            "example": {
                "field_label": "Email Address",
                "instruction": "Enter your company email address"
            }
        }


class ReorderStepsRequest(BaseModel):
    """
    Schema for reordering workflow steps.

    Accepts a list of step IDs in the desired new order.
    All steps in the workflow must be included exactly once.
    """

    step_order: list[int] = Field(
        ...,
        min_length=1,
        description="List of step IDs in desired order (all workflow steps must be included)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "step_order": [5, 2, 1, 4, 3]
            }
        }
