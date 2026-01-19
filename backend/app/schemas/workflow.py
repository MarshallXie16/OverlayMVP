"""
Pydantic schemas for workflows.

Workflows are recorded sequences of user interactions that can be replayed as guided walkthroughs.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
import json

from app.schemas.step import StepCreate, StepResponse


class CreateWorkflowRequest(BaseModel):
    """
    Schema for creating a new workflow with steps.

    The extension sends this after recording stops. Backend returns immediately
    with "processing" status and queues AI labeling job in background.
    """

    # Workflow metadata
    name: str = Field(..., min_length=1, max_length=255, description="Workflow name")
    description: Optional[str] = Field(None, max_length=1000, description="Workflow description")
    starting_url: str = Field(..., min_length=1, description="URL where workflow starts")
    tags: Optional[List[str]] = Field(default_factory=list, description="Tags for categorization")

    # Steps (recorded actions)
    steps: List[StepCreate] = Field(..., min_items=1, description="List of workflow steps")

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[List[str]]) -> List[str]:
        """Ensure tags is a list, limit to 10 tags max."""
        if v is None:
            return []
        if len(v) > 10:
            raise ValueError("Maximum 10 tags allowed")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Submit Expense Report",
                "description": "Process for submitting monthly expense reports in NetSuite",
                "starting_url": "https://app.netsuite.com/expenses",
                "tags": ["finance", "expenses", "netsuite"],
                "steps": [
                    {
                        "step_number": 1,
                        "timestamp": "2025-11-19T10:30:00.000Z",
                        "action_type": "click",
                        "selectors": {"primary": "#new-expense-btn"},
                        "element_meta": {"tag_name": "BUTTON", "inner_text": "New Expense"},
                        "page_context": {"url": "https://app.netsuite.com/expenses", "title": "Expenses"},
                        "screenshot_id": 123
                    }
                ]
            }
        }


class UpdateWorkflowRequest(BaseModel):
    """
    Schema for updating workflow metadata.

    Allows updating name, description, tags, and status. Does not update steps
    (steps are updated via separate step endpoints).
    """

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Workflow name")
    description: Optional[str] = Field(None, max_length=1000, description="Workflow description")
    tags: Optional[List[str]] = Field(None, description="Tags for categorization")
    status: Optional[str] = Field(
        None,
        description="Workflow status: draft, processing, active, needs_review, broken, archived"
    )

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Limit to 10 tags max."""
        if v is not None and len(v) > 10:
            raise ValueError("Maximum 10 tags allowed")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        """Validate status is one of allowed values."""
        allowed_statuses = ["draft", "processing", "active", "needs_review", "broken", "archived"]
        if v is not None and v not in allowed_statuses:
            raise ValueError(f"Status must be one of: {', '.join(allowed_statuses)}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Submit Expense Report (Updated)",
                "description": "Updated process for monthly expenses",
                "tags": ["finance", "expenses"],
                "status": "active"
            }
        }


class WorkflowResponse(BaseModel):
    """
    Schema for single workflow response with full details including steps.

    Used for GET /api/workflows/:id endpoint.
    """

    id: str
    created_by: Optional[str] = None
    name: str
    description: Optional[str] = None
    starting_url: str = ""
    tags: List[str]
    status: str
    success_rate: float
    total_uses: int
    consecutive_failures: int
    created_at: datetime
    updated_at: datetime
    last_successful_run: Optional[datetime] = None
    last_failed_run: Optional[datetime] = None

    # Include steps in detail view
    steps: List[StepResponse] = []

    # Computed fields
    step_count: int = 0

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        """Parse tags from JSON string to list."""
        if isinstance(v, str):
            return json.loads(v)
        return v or []

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 10,
                "created_by": 5,
                "name": "Submit Expense Report",
                "description": "Monthly expense submission process",
                "starting_url": "https://app.netsuite.com/expenses",
                "tags": ["finance", "expenses"],
                "status": "active",
                "success_rate": 0.95,
                "total_uses": 42,
                "consecutive_failures": 0,
                "created_at": "2025-11-19T10:30:00Z",
                "updated_at": "2025-11-19T11:00:00Z",
                "step_count": 5,
                "steps": []
            }
        }


class WorkflowListItem(BaseModel):
    """
    Schema for workflow list item (summary view).

    Used for GET /api/workflows endpoint. Excludes steps for performance.
    """

    id: str
    created_by: Optional[str] = None
    name: str
    description: Optional[str] = None
    starting_url: str = ""
    tags: List[str]
    status: str
    success_rate: float
    total_uses: int
    consecutive_failures: int
    created_at: datetime
    updated_at: datetime
    last_successful_run: Optional[datetime] = None
    last_failed_run: Optional[datetime] = None

    # Computed fields (step count calculated in query)
    step_count: int = 0

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        """Parse tags from JSON string to list."""
        if isinstance(v, str):
            return json.loads(v)
        return v or []

    class Config:
        from_attributes = True


class WorkflowListResponse(BaseModel):
    """
    Schema for paginated workflow list response.

    Includes pagination metadata and list of workflow summaries.
    """

    total: int = Field(..., description="Total number of workflows")
    limit: int = Field(..., description="Items per page")
    offset: int = Field(..., description="Number of items skipped")
    workflows: List[WorkflowListItem] = Field(..., description="List of workflows")

    class Config:
        json_schema_extra = {
            "example": {
                "total": 25,
                "limit": 10,
                "offset": 0,
                "workflows": [
                    {
                        "id": 10,
                        "name": "Submit Expense Report",
                        "status": "active",
                        "success_rate": 0.95,
                        "total_uses": 42,
                        "step_count": 5,
                        "created_at": "2025-11-19T10:30:00Z",
                        "tags": ["finance"]
                    }
                ]
            }
        }


class CreateWorkflowResponse(BaseModel):
    """
    Schema for immediate response after workflow creation.

    Returns workflow_id and "processing" status immediately. AI labeling
    happens asynchronously in background.
    """

    workflow_id: str = Field(..., description="ID of created workflow")
    status: str = Field(default="processing", description="Initial status is 'processing'")

    class Config:
        json_schema_extra = {
            "example": {
                "workflow_id": 123,
                "status": "processing"
            }
        }
