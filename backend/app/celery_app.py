"""
Celery application configuration for async background tasks.

Handles:
- AI labeling for workflow steps
- Screenshot processing
- Health monitoring tasks
- Notification delivery

Configuration:
- Broker: Redis (localhost:6379 for dev)
- Result Backend: Redis (same instance)
- Task Time Limit: 300s (5 minutes)
- Max Concurrency: 5 (AI API rate limiting)
"""
import os
from celery import Celery
from kombu import Queue

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Redis URL from environment
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Initialize Celery app
celery_app = Celery(
    "workflow_platform",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=[
        "app.tasks.ai_labeling",
        "app.tasks.email",
    ]
)

# Celery Configuration
celery_app.conf.update(
    # Task Settings
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    
    # Task Time Limits
    task_time_limit=300,  # 5 minutes hard limit
    task_soft_time_limit=270,  # 4.5 minutes soft limit (sends exception)
    
    # Task Execution
    task_acks_late=True,  # Acknowledge after task completion
    task_reject_on_worker_lost=True,  # Requeue if worker dies
    
    # Retry Configuration
    task_autoretry_for=(Exception,),
    task_retry_kwargs={"max_retries": 3},
    task_retry_backoff=True,  # Exponential backoff
    task_retry_backoff_max=600,  # Max 10 minutes between retries
    task_retry_jitter=True,  # Add randomness to backoff
    
    # Concurrency (limit AI API calls)
    worker_concurrency=5,
    worker_prefetch_multiplier=1,  # Only fetch 1 task at a time
    
    # Result Backend
    result_expires=3600,  # Results expire after 1 hour
    result_backend_transport_options={"master_name": "mymaster"},
    
    # Queue Configuration
    task_default_queue="default",
    task_queues=(
        Queue("default", routing_key="task.#"),
        Queue("ai_labeling", routing_key="ai.#"),
    ),
    task_routes={
        "app.tasks.ai_labeling.*": {"queue": "ai_labeling", "routing_key": "ai.labeling"},
    },
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
    
    # Testing (override in test config)
    task_always_eager=False,  # Set to True for synchronous testing
    task_eager_propagates=True,
)


# Event handlers for lifecycle management
@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """
    Set up periodic tasks (cron jobs).
    
    Future tasks:
    - Health monitoring (check workflow success rates)
    - Cleanup expired results
    - Generate analytics reports
    """
    pass


# Task base classes for common functionality
import logging

logger = logging.getLogger(__name__)


class BaseTask(celery_app.Task):
    """
    Base task class with common error handling and logging.
    
    All custom tasks should inherit from this class for consistent behavior.
    """
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """
        Called when task fails after all retries exhausted.
        
        Args:
            exc: Exception that caused failure
            task_id: Unique task ID
            args: Task positional arguments
            kwargs: Task keyword arguments
            einfo: Exception info (traceback)
        """
        # Log failure
        logger.error(
            f"Task {self.name} failed: {exc}\n"
            f"Task ID: {task_id}\n"
            f"Args: {args}\n"
            f"Kwargs: {kwargs}\n"
            f"Traceback: {einfo}"
        )
        
        # Future: Send admin notification for critical failures
    
    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """
        Called when task is retried.
        
        Args:
            exc: Exception that triggered retry
            task_id: Unique task ID
            args: Task positional arguments
            kwargs: Task keyword arguments
            einfo: Exception info
        """
        logger.warning(
            f"Task {self.name} retry #{self.request.retries}: {exc}\n"
            f"Task ID: {task_id}"
        )
    
    def on_success(self, retval, task_id, args, kwargs):
        """
        Called when task succeeds.
        
        Args:
            retval: Task return value
            task_id: Unique task ID
            args: Task positional arguments
            kwargs: Task keyword arguments
        """
        logger.info(
            f"Task {self.name} succeeded\n"
            f"Task ID: {task_id}\n"
            f"Result: {retval}"
        )


if __name__ == "__main__":
    # Run worker with: celery -A app.celery_app worker --loglevel=info
    celery_app.start()
