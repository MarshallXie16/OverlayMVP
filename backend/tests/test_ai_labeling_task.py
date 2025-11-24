"""
Tests for AI labeling background task (AI-003).

Tests:
- Task execution with mock database and AI service
- Workflow status updates
- Error handling and partial failures
- Progress tracking
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone
from app.tasks.ai_labeling import label_workflow_steps
from app.celery_app import celery_app


# Enable eager mode for synchronous testing
@pytest.fixture(autouse=True)
def setup_eager_mode():
    """Run tasks synchronously for testing."""
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    yield
    celery_app.conf.task_always_eager = False


class TestAILabelingTask:
    """Test AI labeling background task."""
    
    @pytest.fixture
    def mock_workflow(self):
        """Create a mock workflow."""
        workflow = Mock()
        workflow.id = 1
        workflow.status = "processing"
        return workflow
    
    @pytest.fixture
    def mock_steps(self):
        """Create mock steps."""
        steps = []
        for i in range(1, 4):
            step = Mock()
            step.id = i
            step.step_number = i
            step.workflow_id = 1
            step.action_type = "input_commit"
            step.element_meta = '{"label_text": "Field ' + str(i) + '"}'
            step.action_data = None
            step.page_context = '{}'
            step.screenshot = Mock()
            step.screenshot.storage_url = f"https://example.com/screenshot{i}.jpg"
            steps.append(step)
        return steps
    
    @patch("app.tasks.ai_labeling.get_task_db")
    @patch("app.tasks.ai_labeling.AIService")
    def test_successful_labeling(self, mock_ai_service_class, mock_get_db, mock_workflow, mock_steps):
        """Test successful AI labeling of all steps."""
        # Set up mock database
        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.__exit__.return_value = None
        mock_get_db.return_value = mock_db
        
        # Mock workflow query
        mock_workflow_query = Mock()
        mock_workflow_query.filter_by.return_value.first.return_value = mock_workflow
        
        # Mock steps query
        mock_steps_query = Mock()
        mock_steps_query.filter_by.return_value.order_by.return_value.all.return_value = mock_steps
        
        # Configure db.query to return appropriate mocks
        def query_side_effect(model):
            from app.models.workflow import Workflow
            from app.models.step import Step
            if model == Workflow:
                return mock_workflow_query
            elif model == Step:
                return mock_steps_query
        
        mock_db.query.side_effect = query_side_effect
        
        # Set up mock AI service
        mock_ai_instance = Mock()
        mock_ai_service_class.return_value = mock_ai_instance
        mock_ai_instance.generate_step_labels.return_value = {
            "field_label": "Test Field",
            "instruction": "Enter test field",
            "ai_confidence": 0.85,
            "ai_model": "claude-3-5-sonnet-20241022",
        }
        mock_ai_instance.get_total_cost.return_value = 0.045
        
        # Execute task
        result = label_workflow_steps(workflow_id=1)
        
        # Verify result
        assert result["workflow_id"] == 1
        assert result["status"] == "success"
        assert result["total_steps"] == 3
        assert result["steps_labeled"] == 3
        assert result["steps_failed"] == 0
        assert result["ai_cost"] == 0.045
        assert result["processing_time"] >= 0
        
        # Verify workflow status updated
        assert mock_workflow.status == "draft"
        
        # Verify AI service called for each step
        assert mock_ai_instance.generate_step_labels.call_count == 3
        
        # Verify database commit
        mock_db.commit.assert_called()
    
    @patch("app.tasks.ai_labeling.get_task_db")
    def test_workflow_not_found(self, mock_get_db):
        """Test error when workflow doesn't exist."""
        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.__exit__.return_value = None
        mock_get_db.return_value = mock_db
        
        # Mock empty workflow query
        mock_workflow_query = Mock()
        mock_workflow_query.filter_by.return_value.first.return_value = None
        mock_db.query.return_value = mock_workflow_query
        
        # Execute task - should raise exception
        with pytest.raises(Exception) as exc_info:
            label_workflow_steps(workflow_id=999)
        
        assert "not found" in str(exc_info.value).lower()
    
    @patch("app.tasks.ai_labeling.get_task_db")
    @patch("app.tasks.ai_labeling.AIService")
    def test_workflow_with_no_steps(self, mock_ai_service_class, mock_get_db, mock_workflow):
        """Test workflow with no steps."""
        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.__exit__.return_value = None
        mock_get_db.return_value = mock_db
        
        # Mock workflow query
        mock_workflow_query = Mock()
        mock_workflow_query.filter_by.return_value.first.return_value = mock_workflow
        
        # Mock empty steps query
        mock_steps_query = Mock()
        mock_steps_query.filter_by.return_value.order_by.return_value.all.return_value = []
        
        def query_side_effect(model):
            from app.models.workflow import Workflow
            from app.models.step import Step
            if model == Workflow:
                return mock_workflow_query
            elif model == Step:
                return mock_steps_query
        
        mock_db.query.side_effect = query_side_effect
        
        # Execute task
        result = label_workflow_steps(workflow_id=1)
        
        # Verify result
        assert result["workflow_id"] == 1
        assert result["status"] == "success"
        assert result["total_steps"] == 0
        assert result["steps_labeled"] == 0
        assert result["steps_failed"] == 0
        
        # Workflow status should still be updated
        assert mock_workflow.status == "draft"
    
    @patch("app.tasks.ai_labeling.get_task_db")
    @patch("app.tasks.ai_labeling.AIService")
    def test_partial_failure(self, mock_ai_service_class, mock_get_db, mock_workflow, mock_steps):
        """Test partial failure when some steps fail to label."""
        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.__exit__.return_value = None
        mock_get_db.return_value = mock_db
        
        # Mock queries
        mock_workflow_query = Mock()
        mock_workflow_query.filter_by.return_value.first.return_value = mock_workflow
        
        mock_steps_query = Mock()
        mock_steps_query.filter_by.return_value.order_by.return_value.all.return_value = mock_steps
        
        def query_side_effect(model):
            from app.models.workflow import Workflow
            from app.models.step import Step
            if model == Workflow:
                return mock_workflow_query
            elif model == Step:
                return mock_steps_query
        
        mock_db.query.side_effect = query_side_effect
        
        # Set up AI service to fail on second step
        mock_ai_instance = Mock()
        mock_ai_service_class.return_value = mock_ai_instance
        
        def generate_labels_side_effect(step):
            if step.step_number == 2:
                raise Exception("AI service error")
            return {
                "field_label": f"Field {step.step_number}",
                "instruction": f"Enter field {step.step_number}",
                "ai_confidence": 0.85,
                "ai_model": "claude-3-5-sonnet-20241022",
            }
        
        mock_ai_instance.generate_step_labels.side_effect = generate_labels_side_effect
        mock_ai_instance.get_total_cost.return_value = 0.030
        
        # Execute task
        result = label_workflow_steps(workflow_id=1)
        
        # Verify result
        assert result["workflow_id"] == 1
        assert result["status"] == "partial_success"
        assert result["total_steps"] == 3
        assert result["steps_labeled"] == 2
        assert result["steps_failed"] == 1
        
        # Workflow should still be in draft (reviewable)
        assert mock_workflow.status == "draft"
        
        # Verify failed step was marked
        failed_step = mock_steps[1]  # Step 2
        assert failed_step.ai_confidence == 0.0
        assert failed_step.ai_model == "error"
        assert "Error" in failed_step.field_label
    
    @patch("app.tasks.ai_labeling.get_task_db")
    @patch("app.tasks.ai_labeling.AIService")
    def test_complete_failure(self, mock_ai_service_class, mock_get_db, mock_workflow, mock_steps):
        """Test complete failure when all steps fail to label."""
        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.__exit__.return_value = None
        mock_get_db.return_value = mock_db
        
        # Mock queries
        mock_workflow_query = Mock()
        mock_workflow_query.filter_by.return_value.first.return_value = mock_workflow
        
        mock_steps_query = Mock()
        mock_steps_query.filter_by.return_value.order_by.return_value.all.return_value = mock_steps
        
        def query_side_effect(model):
            from app.models.workflow import Workflow
            from app.models.step import Step
            if model == Workflow:
                return mock_workflow_query
            elif model == Step:
                return mock_steps_query
        
        mock_db.query.side_effect = query_side_effect
        
        # Set up AI service to always fail
        mock_ai_instance = Mock()
        mock_ai_service_class.return_value = mock_ai_instance
        mock_ai_instance.generate_step_labels.side_effect = Exception("AI service error")
        mock_ai_instance.get_total_cost.return_value = 0.0
        
        # Execute task
        result = label_workflow_steps(workflow_id=1)
        
        # Verify result
        assert result["workflow_id"] == 1
        assert result["status"] == "failed"
        assert result["total_steps"] == 3
        assert result["steps_labeled"] == 0
        assert result["steps_failed"] == 3
        
        # Workflow should be marked as needs_review
        assert mock_workflow.status == "needs_review"
    
    @patch("app.tasks.ai_labeling.get_task_db")
    @patch("app.tasks.ai_labeling.AIService")
    def test_ai_service_initialization_failure(self, mock_ai_service_class, mock_get_db, mock_workflow, mock_steps):
        """Test error when AI service fails to initialize."""
        mock_db = MagicMock()
        mock_db.__enter__.return_value = mock_db
        mock_db.__exit__.return_value = None
        mock_get_db.return_value = mock_db
        
        # Mock queries
        mock_workflow_query = Mock()
        mock_workflow_query.filter_by.return_value.first.return_value = mock_workflow
        
        mock_steps_query = Mock()
        mock_steps_query.filter_by.return_value.order_by.return_value.all.return_value = mock_steps
        
        def query_side_effect(model):
            from app.models.workflow import Workflow
            from app.models.step import Step
            if model == Workflow:
                return mock_workflow_query
            elif model == Step:
                return mock_steps_query
        
        mock_db.query.side_effect = query_side_effect
        
        # AI service fails to initialize
        from app.services.ai import AIServiceError
        mock_ai_service_class.side_effect = AIServiceError("No API key")
        
        # Execute task - should raise exception
        with pytest.raises(AIServiceError):
            label_workflow_steps(workflow_id=1)
        
        # Workflow should be marked as needs_review
        assert mock_workflow.status == "needs_review"
        mock_db.commit.assert_called()


if __name__ == "__main__":
    # Run tests with: pytest tests/test_ai_labeling_task.py -v
    pytest.main([__file__, "-v"])
