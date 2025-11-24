"""
Background tasks for async processing.

Tasks:
- ai_labeling: Generate AI labels for workflow steps
- (future) health_monitoring: Check workflow health
- (future) notifications: Send admin alerts
"""
from app.tasks.ai_labeling import label_workflow_steps

__all__ = ["label_workflow_steps"]
