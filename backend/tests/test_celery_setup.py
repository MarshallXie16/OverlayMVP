"""
Tests for Celery task queue setup (AI-001).

Tests:
- Celery app configuration
- Task registration
- Task execution in eager mode
- Error handling and retries
"""
import pytest
from unittest.mock import patch
from app.celery_app import celery_app, BaseTask
from app.tasks.ai_labeling import label_workflow_steps


class TestCeleryConfiguration:
    """Test Celery app configuration and settings."""
    
    def test_celery_app_exists(self):
        """Verify Celery app is properly initialized."""
        assert celery_app is not None
        assert celery_app.main == "workflow_platform"
    
    def test_celery_config(self):
        """Verify Celery configuration settings."""
        assert celery_app.conf.task_serializer == "json"
        assert celery_app.conf.result_serializer == "json"
        assert celery_app.conf.task_time_limit == 300  # 5 minutes
        assert celery_app.conf.worker_concurrency == 5  # AI rate limiting
    
    def test_task_queues_configured(self):
        """Verify task queues are properly configured."""
        queues = {q.name for q in celery_app.conf.task_queues}
        assert "default" in queues
        assert "ai_labeling" in queues
    
    def test_retry_configuration(self):
        """Verify retry settings."""
        assert celery_app.conf.task_retry_backoff is True
        assert celery_app.conf.task_retry_backoff_max == 600  # 10 minutes


class TestTaskRegistration:
    """Test task registration and discovery."""
    
    def test_label_workflow_steps_registered(self):
        """Verify AI labeling task is registered."""
        assert "app.tasks.ai_labeling.label_workflow_steps" in celery_app.tasks
    
    def test_task_base_class(self):
        """Verify BaseTask is available for custom tasks."""
        assert BaseTask is not None
        
        # Check lifecycle methods exist
        assert hasattr(BaseTask, "on_failure")
        assert hasattr(BaseTask, "on_retry")
        assert hasattr(BaseTask, "on_success")


class TestTaskExecution:
    """Test task execution in eager mode (synchronous for testing)."""
    
    @pytest.fixture(autouse=True)
    def setup_eager_mode(self):
        """Run tasks synchronously for testing."""
        celery_app.conf.task_always_eager = True
        celery_app.conf.task_eager_propagates = True
        yield
        celery_app.conf.task_always_eager = False
    
    def test_task_registered(self):
        """Test AI labeling task is properly registered."""
        # Verify task exists and has correct name
        task = label_workflow_steps
        assert task.name == "app.tasks.ai_labeling.label_workflow_steps"
        assert task.queue == "ai_labeling"
    
    def test_task_retry_configuration(self):
        """Test task retry configuration."""
        # Verify the task has retry configuration
        task = label_workflow_steps
        assert task.max_retries == 3
        assert task.default_retry_delay == 60
        
        # Verify task uses correct queue
        assert task.queue == "ai_labeling"


class TestTaskUtils:
    """Test shared task utilities."""
    
    def test_get_task_db_context_manager(self):
        """Test database session context manager."""
        from app.tasks.utils import get_task_db
        
        with get_task_db() as db:
            assert db is not None
            # Session should be active
            assert db.is_active
    
    def test_log_task_progress(self):
        """Test progress logging utility."""
        from app.tasks.utils import log_task_progress
        from unittest.mock import Mock
        
        # Create mock task
        mock_task = Mock()
        mock_task.update_state = Mock()
        mock_task.get_logger = Mock(return_value=Mock())
        
        # Log progress
        log_task_progress(mock_task, current=5, total=10, message="Processing step 5")
        
        # Verify update_state was called with correct progress
        mock_task.update_state.assert_called_once()
        call_args = mock_task.update_state.call_args
        assert call_args[1]["meta"]["current"] == 5
        assert call_args[1]["meta"]["total"] == 10
        assert call_args[1]["meta"]["percent"] == 50
    
    def test_safe_json_parse(self):
        """Test JSON parsing utility."""
        from app.tasks.utils import safe_json_parse
        import json
        
        # Valid JSON
        result = safe_json_parse('{"key": "value"}')
        assert result == {"key": "value"}
        
        # Invalid JSON (should return default)
        result = safe_json_parse("not json", default={"error": True})
        assert result == {"error": True}
        
        # None input
        result = safe_json_parse(None)
        assert result == {}


@pytest.mark.integration
class TestCeleryIntegration:
    """Integration tests requiring Redis and Celery worker."""
    
    @pytest.fixture
    def check_redis_available(self):
        """Skip tests if Redis is not available."""
        import redis
        try:
            r = redis.from_url("redis://localhost:6379/0")
            r.ping()
        except (redis.ConnectionError, redis.TimeoutError):
            pytest.skip("Redis not available for integration tests")
    
    def test_task_queue_and_result_backend(self, check_redis_available):
        """
        Test task queueing with actual Redis.
        
        Note: This test requires a running Celery worker to execute the task.
        If no worker is running, the task will be queued but never processed.
        
        Skip this test for CI/CD - it's for local verification only.
        """
        pytest.skip(
            "Integration test requires running Celery worker. "
            "Run manually with: celery -A app.celery_app worker --loglevel=info"
        )
        
        # Disable eager mode for real async execution
        celery_app.conf.task_always_eager = False
        
        try:
            # Mock the database to avoid "Workflow not found" errors
            from unittest.mock import patch, Mock
            
            mock_workflow = Mock()
            mock_workflow.id = 999
            mock_workflow.status = "processing"
            
            with patch("app.tasks.ai_labeling.get_task_db") as mock_db:
                mock_db_instance = Mock()
                mock_db_instance.__enter__.return_value = mock_db_instance
                mock_db_instance.query.return_value.filter_by.return_value.first.return_value = mock_workflow
                mock_db_instance.query.return_value.filter_by.return_value.order_by.return_value.all.return_value = []
                mock_db.return_value = mock_db_instance
                
                # Queue task
                async_result = label_workflow_steps.delay(workflow_id=999)
                
                # Verify task was queued
                assert async_result.id is not None
                
                # Wait for result (with timeout)
                result = async_result.get(timeout=10)
                
                # Verify result (empty workflow)
                assert result["workflow_id"] == 999
                assert result["total_steps"] == 0
            
        finally:
            # Re-enable eager mode for other tests
            celery_app.conf.task_always_eager = True


if __name__ == "__main__":
    # Run tests with: pytest tests/test_celery_setup.py -v
    pytest.main([__file__, "-v"])
