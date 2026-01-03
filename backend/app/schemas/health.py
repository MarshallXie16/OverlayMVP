"""
Pydantic schemas for health logging (workflow execution tracking).

Health logs record workflow execution outcomes: success, failure, healing events.
Also includes schemas for the Health Dashboard API.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime


class ExecutionLogRequest(BaseModel):
    """
    Schema for logging workflow execution result.
    
    Sent by extension after walkthrough completes (or fails).
    Records success, failure, healing metrics, and performance data.
    """
    
    # Execution Result
    step_id: Optional[int] = Field(None, description="Step ID if failure was at specific step, null if workflow-level")
    status: str = Field(
        ..., 
        description="Execution status: success, healed_deterministic, healed_ai, failed"
    )
    
    # Error Information (for failures)
    error_type: Optional[str] = Field(
        None, 
        description="Error type: element_not_found, timeout, navigation_error, user_exit"
    )
    error_message: Optional[str] = Field(None, description="Detailed error message")
    
    # Healing Metrics (if healed)
    healing_confidence: Optional[float] = Field(
        None, 
        ge=0.0, 
        le=1.0,
        description="Overall healing confidence score (0.0-1.0)"
    )
    deterministic_score: Optional[int] = Field(
        None,
        ge=0,
        le=100, 
        description="Deterministic healing score (0-100)"
    )
    ai_confidence: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="AI healing confidence (0.0-1.0)"
    )
    candidates_evaluated: Optional[int] = Field(
        None,
        ge=0,
        description="Number of candidate elements evaluated during healing"
    )
    
    # Page Context
    page_url: Optional[str] = Field(None, description="URL where execution occurred")
    page_state_hash: Optional[str] = Field(None, description="Hash of page state (for debugging)")
    
    # Performance
    execution_time_ms: Optional[int] = Field(
        None,
        ge=0,
        description="Total execution time in milliseconds"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "step_id": 123,
                "status": "success",
                "page_url": "https://app.example.com/submit",
                "execution_time_ms": 1250
            }
        }


class ExecutionLogResponse(BaseModel):
    """
    Response after logging execution.
    
    Includes execution_id and updated workflow status.
    """
    
    execution_id: int = Field(..., description="ID of created health log entry")
    workflow_status: str = Field(
        ...,
        description="Updated workflow status: active, needs_review, or broken"
    )
    consecutive_failures: int = Field(..., description="Updated consecutive failures count")
    success_rate: float = Field(..., description="Updated success rate (0.0-1.0)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "execution_id": 456,
                "workflow_status": "active",
                "consecutive_failures": 0,
                "success_rate": 0.95
            }
        }


# ============================================================================
# Health Dashboard API Schemas
# ============================================================================


class HealthLogResponse(BaseModel):
    """Response schema for a single health log entry."""

    id: int
    workflow_id: int
    workflow_name: str = Field(..., description="Name of the workflow")
    step_id: Optional[int] = None
    status: str = Field(
        ..., description="Execution status: success, healed_deterministic, healed_ai, failed"
    )
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    healing_confidence: Optional[float] = None
    execution_time_ms: Optional[int] = None
    page_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "workflow_id": 123,
                "workflow_name": "Invoice Processing",
                "step_id": 456,
                "status": "healed_deterministic",
                "error_type": None,
                "error_message": None,
                "healing_confidence": 0.92,
                "execution_time_ms": 1250,
                "page_url": "https://app.example.com/invoices",
                "created_at": "2025-12-25T10:30:00Z",
            }
        }


class HealthLogListResponse(BaseModel):
    """Response schema for paginated health log list."""

    logs: List[HealthLogResponse]
    total: int = Field(..., description="Total logs matching the filter")

    class Config:
        json_schema_extra = {
            "example": {
                "logs": [
                    {
                        "id": 1,
                        "workflow_id": 123,
                        "workflow_name": "Invoice Processing",
                        "step_id": 456,
                        "status": "success",
                        "execution_time_ms": 1250,
                        "created_at": "2025-12-25T10:30:00Z",
                    }
                ],
                "total": 50,
            }
        }


class HealthStatsResponse(BaseModel):
    """
    Aggregated health statistics for the company.

    Used by the Health Dashboard to display overall system health.
    """

    total_executions: int = Field(..., description="Total workflow executions in period")
    success_count: int = Field(..., description="Successful executions")
    healed_count: int = Field(..., description="Executions that required healing")
    failed_count: int = Field(..., description="Failed executions")
    success_rate: float = Field(..., description="Success rate (0.0-1.0)")
    healing_rate: float = Field(
        ..., description="Rate of healed executions among non-failures (0.0-1.0)"
    )
    avg_execution_time_ms: int = Field(..., description="Average execution time in ms")
    workflows_by_status: Dict[str, int] = Field(
        ..., description="Count of workflows by status (active, needs_review, broken)"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "total_executions": 1250,
                "success_count": 1100,
                "healed_count": 100,
                "failed_count": 50,
                "success_rate": 0.96,
                "healing_rate": 0.083,
                "avg_execution_time_ms": 1450,
                "workflows_by_status": {
                    "active": 15,
                    "needs_review": 3,
                    "broken": 1,
                },
            }
        }
