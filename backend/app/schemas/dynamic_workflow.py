"""
Pydantic schemas for dynamic AI-guided workflows.

Dynamic workflows let users type a goal and get AI-guided step-by-step
instructions to complete web tasks. Unlike recorded workflows (workflow.py),
these are generated in real-time by an AI agent that analyzes the current
page context and determines the next action.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
import json


class CreateSessionRequest(BaseModel):
    """
    Request to create a new dynamic workflow session.

    The extension sends this when the user types a goal (e.g., "Create a $50
    expense report for Staples"). The backend extracts entities from the goal
    and returns a session ID for subsequent step requests.
    """

    goal: str = Field(..., min_length=1, max_length=1000, description="Natural language goal")
    starting_url: str = Field(..., min_length=1, description="URL where user currently is")

    class Config:
        json_schema_extra = {
            "example": {
                "goal": "Create a $50 expense report for Staples",
                "starting_url": "https://app.netsuite.com/expenses"
            }
        }


class CreateSessionResponse(BaseModel):
    """
    Response after creating a session with extracted entities.

    Returns the session ID and any entities extracted from the goal
    (e.g., amount="$50", vendor="Staples") which the AI uses to auto-fill
    form fields during guidance.
    """

    session_id: int
    goal: str
    goal_entities: Dict[str, str] = Field(
        default_factory=dict,
        description="Extracted entities like amount, vendor"
    )
    status: str = "active"

    class Config:
        json_schema_extra = {
            "example": {
                "session_id": 42,
                "goal": "Create a $50 expense report for Staples",
                "goal_entities": {"amount": "$50", "vendor": "Staples"},
                "status": "active"
            }
        }


class PageContext(BaseModel):
    """
    Page context captured by the content script.

    The extension's content script builds an accessibility tree of interactive
    elements on the current page and sends it here so the AI can determine
    what action to take next.

    Max-length constraints prevent token blowup and limit prompt-injection
    surface from untrusted page content.
    """

    url: str = Field(..., max_length=2000)
    title: str = Field(..., max_length=500)
    interactive_elements: str = Field(
        ..., max_length=20000,
        description="Formatted accessibility tree text"
    )
    status_text: str = Field(
        "", max_length=2000,
        description="Visible status messages, headings"
    )
    element_count: int = Field(
        0, description="Number of interactive elements found"
    )


class StepRequest(BaseModel):
    """
    Request for the next AI-guided step. Includes current page context.

    Sent after every page load or action completion. The AI analyzes the
    page context and returns the next action to take toward the goal.
    """

    page_context: PageContext

    class Config:
        json_schema_extra = {
            "example": {
                "page_context": {
                    "url": "https://app.netsuite.com/expenses/new",
                    "title": "New Expense Report",
                    "interactive_elements": "[0] input 'Amount' type=text\n[1] input 'Vendor' type=text\n[2] button 'Submit'",
                    "status_text": "New Expense Report",
                    "element_count": 3
                }
            }
        }


class DynamicStepResponse(BaseModel):
    """
    AI-determined next action for the user.

    Contains the instruction to display, the target element, what action to
    take, and optional auto-fill values extracted from the goal entities.
    """

    instruction: str = Field(
        ..., max_length=200, description="Action-oriented instruction"
    )
    field_label: str = Field(
        ..., max_length=50, description="Short label for the target element"
    )
    action_type: str = Field(
        ..., description="click, input_commit, select_change, submit, navigate, wait"
    )
    element_index: int = Field(
        ..., description="Index from INTERACTIVE ELEMENTS list"
    )
    selector_hint: Optional[str] = Field(
        None, max_length=500, description="CSS selector fallback"
    )
    auto_fill_value: Optional[str] = Field(
        None, description="Value from goal to fill"
    )
    confidence: float = Field(
        ..., ge=0, le=1, description="AI confidence 0-1"
    )
    reasoning: str = Field(
        ..., max_length=300, description="Why this action"
    )
    goal_achieved: bool = Field(
        False, description="Whether the goal is complete"
    )
    progress_estimate: float = Field(
        0, ge=0, le=1, description="Estimated progress 0-1"
    )
    automation_level: str = Field(
        "manual", description="auto, confirm, or manual"
    )
    ai_message: Optional[str] = Field(
        None, max_length=200, description="Optional message to show user"
    )

    @field_validator("action_type")
    @classmethod
    def validate_action_type(cls, v: str) -> str:
        """Validate action_type is one of allowed values."""
        allowed = ["click", "input_commit", "select_change", "submit", "navigate", "wait"]
        if v not in allowed:
            raise ValueError(f"action_type must be one of: {', '.join(allowed)}")
        return v

    @field_validator("automation_level")
    @classmethod
    def validate_automation_level(cls, v: str) -> str:
        """Validate automation_level is one of allowed values."""
        allowed = ["auto", "confirm", "manual"]
        if v not in allowed:
            raise ValueError(f"automation_level must be one of: {', '.join(allowed)}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "instruction": "Enter the expense amount",
                "field_label": "Amount",
                "action_type": "input_commit",
                "element_index": 0,
                "selector_hint": "input[name='amount']",
                "auto_fill_value": "$50",
                "confidence": 0.95,
                "reasoning": "The Amount field matches the expense amount from the goal",
                "goal_achieved": False,
                "progress_estimate": 0.3,
                "automation_level": "confirm",
                "ai_message": None
            }
        }


class FeedbackRequest(BaseModel):
    """
    User correction when AI got something wrong.

    Sent when the user clicks "That's wrong" or provides a correction.
    The AI uses this feedback to adjust its next step recommendation.

    Optionally includes page_context so the AI can see current interactive
    elements when determining the corrected action. Without page_context the
    AI still works, but element_index references may be unreliable.
    """

    correction_text: str = Field(
        ..., min_length=1, max_length=500,
        description="What went wrong or what to do instead"
    )
    step_context: Optional[str] = Field(
        None, max_length=200,
        description="Context about which step failed"
    )
    page_context: Optional[PageContext] = Field(
        None,
        description="Current page context for accurate element references"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "correction_text": "That's the wrong field, the amount goes in the Total box not the Subtotal",
                "step_context": "Step was: Enter the expense amount in Amount field",
                "page_context": {
                    "url": "https://app.netsuite.com/expenses/new",
                    "title": "New Expense Report",
                    "interactive_elements": "[0] input 'Total' type=text\n[1] input 'Subtotal' type=text",
                    "status_text": "New Expense Report",
                    "element_count": 2
                }
            }
        }


class CompleteSessionRequest(BaseModel):
    """
    Request to mark session as completed or abandoned.

    Sent when the goal is achieved or the user gives up.
    """

    reason: str = Field("completed", description="completed or abandoned")

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: str) -> str:
        """Validate reason is one of allowed values."""
        allowed = ["completed", "abandoned"]
        if v not in allowed:
            raise ValueError(f"reason must be one of: {', '.join(allowed)}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "reason": "completed"
            }
        }


class SessionResponse(BaseModel):
    """
    Full session state response.

    Used for GET /api/dynamic-workflows/sessions/:id. Includes token usage
    and cost tracking for the AI calls made during the session.
    """

    id: int
    company_id: int
    user_id: Optional[int] = None
    goal: str
    goal_entities: Dict[str, str] = Field(default_factory=dict)
    status: str
    step_count: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    estimated_cost: float = 0.0
    started_at: datetime
    completed_at: Optional[datetime] = None
    last_activity_at: datetime

    @field_validator("goal_entities", mode="before")
    @classmethod
    def parse_goal_entities(cls, v):
        """Parse goal_entities from JSON string to dict."""
        if isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return {}
        return v or {}

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 42,
                "company_id": 1,
                "user_id": 5,
                "goal": "Create a $50 expense report for Staples",
                "goal_entities": {"amount": "$50", "vendor": "Staples"},
                "status": "completed",
                "step_count": 7,
                "total_input_tokens": 12500,
                "total_output_tokens": 3200,
                "estimated_cost": 0.045,
                "started_at": "2025-11-19T10:30:00Z",
                "completed_at": "2025-11-19T10:35:00Z",
                "last_activity_at": "2025-11-19T10:35:00Z"
            }
        }
