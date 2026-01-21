"""
AI labeling background task for workflow steps.

Processes workflow steps asynchronously:
1. Fetch all steps for workflow
2. For each step: call AI service to generate labels
3. Update step records with AI-generated labels
4. Update workflow status to 'draft' when complete

Implements: AI-003
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.exc import SQLAlchemyError

from app.celery_app import celery_app, BaseTask
from app.tasks.utils import get_task_db, log_task_progress
from app.models.workflow import Workflow
from app.models.step import Step
from app.services.ai import AIService, AIServiceError

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    base=BaseTask,
    name="app.tasks.ai_labeling.label_workflow_steps",
    queue="ai_labeling",
    max_retries=3,
    default_retry_delay=60,  # 1 minute between retries
)
def label_workflow_steps(self, workflow_id: int) -> dict:
    """
    Generate AI labels for all steps in a workflow.
    
    Process:
    1. Fetch workflow and steps from database
    2. Initialize AI service
    3. For each step:
       - Generate labels using AI (with fallback)
       - Update step record with labels and metadata
    4. Update workflow status to 'draft'
    5. Return summary statistics
    
    Args:
        workflow_id: ID of workflow to process
    
    Returns:
        dict: {
            "workflow_id": int,
            "status": "success" | "partial_success" | "failed",
            "total_steps": int,
            "steps_labeled": int,
            "steps_failed": int,
            "ai_cost": float,
            "processing_time": float (seconds),
        }
    
    Raises:
        Exception: If workflow not found or critical error occurs
    """
    start_time = datetime.now(timezone.utc)
    
    logger.info(f"[Workflow {workflow_id}] Starting AI labeling task")
    
    try:
        with get_task_db() as db:
            # Fetch workflow
            workflow = db.query(Workflow).filter_by(id=workflow_id).first()
            
            if not workflow:
                logger.error(f"[Workflow {workflow_id}] Workflow not found")
                raise Exception(f"Workflow {workflow_id} not found")
            
            # Fetch steps
            steps = db.query(Step).filter_by(workflow_id=workflow_id).order_by(Step.step_number).all()
            
            if not steps:
                logger.warning(f"[Workflow {workflow_id}] No steps found")
                # Update status anyway
                workflow.status = "draft"
                db.commit()
                
                return {
                    "workflow_id": workflow_id,
                    "status": "success",
                    "total_steps": 0,
                    "steps_labeled": 0,
                    "steps_failed": 0,
                    "ai_cost": 0.0,
                    "processing_time": 0.0,
                }
            
            logger.info(f"[Workflow {workflow_id}] Processing {len(steps)} steps")
            
            # Initialize AI service
            try:
                ai_service = AIService()
            except AIServiceError as e:
                logger.error(f"[Workflow {workflow_id}] Failed to initialize AI service: {e}")
                # Mark workflow as needs review
                workflow.status = "needs_review"
                db.commit()
                raise
            
            # Process each step
            steps_labeled = 0
            steps_failed = 0
            
            for idx, step in enumerate(steps, 1):
                # Log progress
                log_task_progress(
                    self,
                    current=idx,
                    total=len(steps),
                    message=f"Processing step {idx}/{len(steps)}"
                )
                
                try:
                    # Generate labels
                    labels = ai_service.generate_step_labels(step)
                    
                    # Update step with AI-generated labels
                    step.field_label = labels["field_label"]
                    step.instruction = labels["instruction"]
                    step.ai_confidence = labels["ai_confidence"]
                    step.ai_model = labels.get("ai_model", "unknown")
                    step.ai_generated_at = datetime.now(timezone.utc)
                    
                    steps_labeled += 1
                    
                    logger.debug(
                        f"[Workflow {workflow_id}] Step {step.step_number}: "
                        f"'{labels['field_label']}' (confidence: {labels['ai_confidence']:.2f})"
                    )
                    
                except Exception as e:
                    steps_failed += 1
                    logger.error(
                        f"[Workflow {workflow_id}] Failed to label step {step.step_number}: {e}"
                    )
                    
                    # Mark step with low confidence to indicate failure
                    step.ai_confidence = 0.0
                    step.ai_model = "error"
                    step.field_label = "Error Generating Label"
                    step.instruction = "Please manually add a label and instruction"
                    step.ai_generated_at = datetime.now(timezone.utc)
            
            # Update workflow status
            if steps_failed == 0:
                workflow.status = "draft"  # Ready for review
                status_result = "success"
            elif steps_labeled > 0:
                workflow.status = "draft"  # Partial success, still reviewable
                status_result = "partial_success"
            else:
                workflow.status = "needs_review"  # All failed
                status_result = "failed"

            # Commit all changes
            db.commit()
            
            # Calculate metrics
            end_time = datetime.now(timezone.utc)
            processing_time = (end_time - start_time).total_seconds()
            ai_cost = ai_service.get_total_cost()
            
            logger.info(
                f"[Workflow {workflow_id}] AI labeling complete: "
                f"{steps_labeled}/{len(steps)} steps labeled, "
                f"{steps_failed} failed, "
                f"cost: ${ai_cost:.4f}, "
                f"time: {processing_time:.2f}s"
            )
            
            return {
                "workflow_id": workflow_id,
                "status": status_result,
                "total_steps": len(steps),
                "steps_labeled": steps_labeled,
                "steps_failed": steps_failed,
                "ai_cost": ai_cost,
                "processing_time": processing_time,
            }
    
    except SQLAlchemyError as e:
        logger.error(f"[Workflow {workflow_id}] Database error: {e}")
        raise
    
    except Exception as e:
        logger.error(f"[Workflow {workflow_id}] Unexpected error: {e}")
        raise
