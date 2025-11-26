"""
Pydantic schemas for health logging (workflow execution tracking).

Health logs record workflow execution outcomes: success, failure, healing events.
"""
from pydantic import BaseModel, Field
from typing import Optional
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
