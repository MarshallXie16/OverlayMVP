"""
Tests for AI service layer (AI-002).

Tests:
- AI service initialization
- Fallback label generation
- Cost tracking
- Error handling
- Claude API integration (mocked)
"""
import pytest
import json
import os
from unittest.mock import Mock, patch, MagicMock
from app.services.ai import AIService, AIServiceError
from app.models.step import Step
from app.models.screenshot import Screenshot


class TestAIServiceInit:
    """Test AI service initialization."""
    
    def test_init_with_env_var(self, monkeypatch):
        """Test initialization with API key from environment."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-123")
        
        service = AIService()
        assert service.api_key == "test-key-123"
        assert service.model == "claude-haiku-4-5-20251001"
        assert service.client is not None
    
    def test_init_with_explicit_key(self):
        """Test initialization with explicit API key."""
        service = AIService(api_key="explicit-key-456")
        assert service.api_key == "explicit-key-456"
    
    def test_init_without_key_raises_error(self, monkeypatch):
        """Test initialization fails without API key."""
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        
        with pytest.raises(AIServiceError) as exc_info:
            AIService()
        
        assert "ANTHROPIC_API_KEY" in str(exc_info.value)
    
    def test_cost_tracking_initialized(self):
        """Test cost tracking counters initialized to zero."""
        service = AIService(api_key="test-key")
        
        assert service.total_input_tokens == 0
        assert service.total_output_tokens == 0
        assert service.get_total_cost() == 0.0


class TestFallbackLabels:
    """Test template-based fallback label generation."""
    
    @pytest.fixture
    def mock_step(self):
        """Create a mock step for testing."""
        step = Mock(spec=Step)
        step.id = 1
        step.action_type = "input_commit"
        step.element_meta = json.dumps({
            "tag_name": "input",
            "type": "email",
            "label_text": "Email Address",
            "placeholder": "Enter your email",
            "name": "email",
        })
        step.action_data = json.dumps({"input_value": "test@example.com"})
        step.page_context = json.dumps({"url": "https://example.com/login"})
        step.screenshot = None  # No screenshot triggers fallback
        return step
    
    def test_fallback_with_label_text(self, mock_step):
        """Test fallback uses label_text if available."""
        service = AIService(api_key="test-key")
        
        element_meta = json.loads(mock_step.element_meta)
        result = service._generate_fallback_label(mock_step, element_meta)
        
        assert result["field_label"] == "Email Address"
        assert result["instruction"] == "Enter email address"
        assert result["ai_confidence"] == 0.0
        assert result["ai_model"] == "fallback_template"
    
    def test_fallback_with_placeholder(self, mock_step):
        """Test fallback uses placeholder if label_text missing."""
        mock_step.element_meta = json.dumps({
            "tag_name": "input",
            "type": "password",
            "placeholder": "Your Password",
        })
        
        service = AIService(api_key="test-key")
        element_meta = json.loads(mock_step.element_meta)
        result = service._generate_fallback_label(mock_step, element_meta)
        
        assert result["field_label"] == "Your Password"
        assert "password" in result["instruction"].lower()
    
    def test_fallback_with_only_name(self, mock_step):
        """Test fallback uses name if other fields missing."""
        mock_step.element_meta = json.dumps({
            "tag_name": "input",
            "name": "username",
        })
        
        service = AIService(api_key="test-key")
        element_meta = json.loads(mock_step.element_meta)
        result = service._generate_fallback_label(mock_step, element_meta)
        
        assert result["field_label"] == "username"
    
    def test_fallback_defaults_to_field(self, mock_step):
        """Test fallback uses 'Field' if all metadata missing."""
        mock_step.element_meta = json.dumps({"tag_name": "div"})
        
        service = AIService(api_key="test-key")
        element_meta = json.loads(mock_step.element_meta)
        result = service._generate_fallback_label(mock_step, element_meta)
        
        assert result["field_label"] == "Field"
    
    def test_fallback_action_verbs(self):
        """Test correct action verbs for different action types."""
        service = AIService(api_key="test-key")
        
        test_cases = [
            ("click", "Click"),
            ("input_commit", "Enter"),
            ("select_change", "Select"),
            ("submit", "Submit"),
            ("navigate", "Navigate to"),
        ]
        
        for action_type, expected_verb in test_cases:
            step = Mock(spec=Step)
            step.id = 1
            step.action_type = action_type
            step.element_meta = json.dumps({"label_text": "Test Field"})
            step.action_data = None
            step.page_context = json.dumps({})
            
            result = service._generate_fallback_label(
                step, json.loads(step.element_meta)
            )
            
            assert result["instruction"].startswith(expected_verb)


class TestCostTracking:
    """Test cost tracking and estimation."""
    
    def test_estimate_cost(self):
        """Test cost estimation formula."""
        service = AIService(api_key="test-key")
        
        # Test with known values
        # Claude 3.5 Sonnet: $3/1M input, $15/1M output
        cost = service._estimate_cost(1000, 500)
        
        expected_cost = (1000 / 1_000_000 * 3.0) + (500 / 1_000_000 * 15.0)
        assert abs(cost - expected_cost) < 0.0001
    
    def test_get_total_cost_initially_zero(self):
        """Test total cost is zero initially."""
        service = AIService(api_key="test-key")
        assert service.get_total_cost() == 0.0
    
    def test_cost_tracking_accumulates(self):
        """Test cost tracking accumulates across calls."""
        service = AIService(api_key="test-key")
        
        service.total_input_tokens = 5000
        service.total_output_tokens = 2000
        
        cost = service.get_total_cost()
        expected = (5000 / 1_000_000 * 3.0) + (2000 / 1_000_000 * 15.0)
        
        assert abs(cost - expected) < 0.0001
    
    def test_reset_cost_tracking(self):
        """Test cost tracking reset."""
        service = AIService(api_key="test-key")
        
        service.total_input_tokens = 5000
        service.total_output_tokens = 2000
        
        service.reset_cost_tracking()
        
        assert service.total_input_tokens == 0
        assert service.total_output_tokens == 0
        assert service.get_total_cost() == 0.0


class TestPromptBuilding:
    """Test prompt construction."""
    
    def test_build_prompt_with_all_fields(self):
        """Test prompt building with complete metadata."""
        service = AIService(api_key="test-key")

        element_meta = {
            "tag_name": "input",
            "type": "email",
            "label_text": "Email",
            "placeholder": "your@email.com",
            "nearby_text": "Sign in to continue",
        }
        # Note: key is "value" not "input_value" - matches frontend action_data format
        action_data = {"value": "test@example.com"}
        
        prompt = service._build_prompt(
            element_meta=element_meta,
            action_type="input_commit",
            action_data=action_data,
            page_context={},
        )
        
        # Verify key components are in prompt
        assert "input" in prompt
        assert "email" in prompt
        assert "Email" in prompt
        assert "your@email.com" in prompt
        assert "input_commit" in prompt
        assert "test@example.com" in prompt
        # Note: JSON is not in prompt - we use tool calling for structured output
    
    def test_build_prompt_without_input_value(self):
        """Test prompt building without input value."""
        service = AIService(api_key="test-key")
        
        prompt = service._build_prompt(
            element_meta={"tag_name": "button"},
            action_type="click",
            action_data={},
            page_context={},
        )
        
        assert "VALUE:" not in prompt


class TestGenerateStepLabels:
    """Test main step label generation method."""
    
    @pytest.fixture
    def mock_step_with_screenshot(self):
        """Create a mock step with screenshot."""
        screenshot = Mock(spec=Screenshot)
        screenshot.storage_url = "https://example.com/screenshot.jpg"
        
        step = Mock(spec=Step)
        step.id = 1
        step.action_type = "input_commit"
        step.element_meta = json.dumps({
            "tag_name": "input",
            "type": "email",
            "label_text": "Email",
        })
        step.action_data = json.dumps({"input_value": "test@example.com"})
        step.page_context = json.dumps({"url": "https://example.com"})
        step.screenshot = screenshot
        
        return step
    
    @pytest.fixture
    def mock_step_without_screenshot(self):
        """Create a mock step without screenshot."""
        step = Mock(spec=Step)
        step.id = 2
        step.action_type = "click"
        step.element_meta = json.dumps({"tag_name": "button", "label_text": "Submit"})
        step.action_data = None
        step.page_context = json.dumps({})
        step.screenshot = None
        
        return step
    
    def test_generates_fallback_without_screenshot(self, mock_step_without_screenshot):
        """Test fallback is used when screenshot is missing."""
        service = AIService(api_key="test-key")
        
        result = service.generate_step_labels(mock_step_without_screenshot)
        
        assert result["field_label"] == "Submit"
        assert result["ai_confidence"] == 0.0
        assert result["ai_model"] == "fallback_template"
    
    @patch("app.services.ai.AIService._call_claude_api")
    def test_uses_ai_with_screenshot(self, mock_api_call, mock_step_with_screenshot):
        """Test AI API is called when screenshot is available."""
        mock_api_call.return_value = {
            "field_label": "Email Address",
            "instruction": "Enter your email address",
            "ai_confidence": 0.92,
        }
        
        service = AIService(api_key="test-key")
        result = service.generate_step_labels(mock_step_with_screenshot)
        
        # Verify API was called
        mock_api_call.assert_called_once()
        
        # Verify result includes model version
        assert result["field_label"] == "Email Address"
        assert result["ai_model"] == "claude-haiku-4-5-20251001"
    
    @patch("app.services.ai.AIService._call_claude_api")
    @patch("app.services.ai.logger")
    def test_falls_back_on_api_error(self, mock_logger, mock_api_call, mock_step_with_screenshot):
        """Test fallback is used when API fails."""
        # Simulate API error by raising an exception that's caught by the service
        # We'll use a custom exception that matches the caught types
        class MockAPIError(Exception):
            """Mock API error for testing."""
            pass
        
        # Patch the exception classes in the service module
        with patch("app.services.ai.APIError", MockAPIError):
            with patch("app.services.ai.RateLimitError", MockAPIError):
                mock_api_call.side_effect = MockAPIError("API Error")
                
                service = AIService(api_key="test-key")
                result = service.generate_step_labels(mock_step_with_screenshot)
                
                # Should fall back to template
                assert result["ai_confidence"] == 0.0
                assert result["ai_model"] == "fallback_template"
                
                # Verify error was logged
                assert mock_logger.error.called
                assert mock_logger.info.called


class TestClaudeAPICall:
    """Test Claude API integration (mocked)."""

    @pytest.fixture
    def mock_anthropic_response(self):
        """Create a mock Anthropic API response with tool_use block."""
        response = Mock()
        response.usage = Mock()
        response.usage.input_tokens = 1200
        response.usage.output_tokens = 150

        # Tool calling response structure
        tool_use_block = Mock()
        tool_use_block.type = "tool_use"
        tool_use_block.input = {
            "field_label": "Invoice Number",
            "instruction": "Enter the invoice number from your receipt",
            "confidence": 85,
        }

        response.content = [tool_use_block]

        return response

    @patch("app.services.ai.Anthropic")
    def test_call_claude_api_success(self, mock_anthropic_class, mock_anthropic_response):
        """Test successful Claude API call with tool calling."""
        mock_client = Mock()
        mock_anthropic_class.return_value = mock_client
        mock_client.messages.create.return_value = mock_anthropic_response

        service = AIService(api_key="test-key")

        result = service._call_claude_api(
            screenshot_url="https://example.com/screenshot.jpg",
            element_meta={"tag_name": "input"},
            action_type="input_commit",
            action_data={},
            page_context={},
        )

        assert result["field_label"] == "Invoice Number"
        assert result["instruction"] == "Enter the invoice number from your receipt"
        assert result["ai_confidence"] == 0.85

        # Verify cost tracking
        assert service.total_input_tokens == 1200
        assert service.total_output_tokens == 150

    @patch("app.services.ai.Anthropic")
    def test_call_claude_api_invalid_json(self, mock_anthropic_class):
        """Test handling of response without tool_use block."""
        mock_client = Mock()
        mock_anthropic_class.return_value = mock_client

        # Response without tool_use block (text only)
        text_block = Mock()
        text_block.type = "text"
        text_block.text = "Not valid response"

        response = Mock()
        response.content = [text_block]
        response.usage = Mock()
        response.usage.input_tokens = 1000
        response.usage.output_tokens = 100

        mock_client.messages.create.return_value = response

        service = AIService(api_key="test-key")

        with pytest.raises(AIServiceError) as exc_info:
            service._call_claude_api(
                screenshot_url="https://example.com/screenshot.jpg",
                element_meta={},
                action_type="click",
                action_data={},
                page_context={},
            )

        assert "No tool_use block" in str(exc_info.value)


class TestSafeJSONParse:
    """Test JSON parsing utility."""
    
    def test_parse_valid_json(self):
        """Test parsing valid JSON."""
        result = AIService._safe_json_parse('{"key": "value"}')
        assert result == {"key": "value"}
    
    def test_parse_invalid_json(self):
        """Test parsing invalid JSON returns empty dict."""
        result = AIService._safe_json_parse("not json")
        assert result == {}
    
    def test_parse_none(self):
        """Test parsing None returns empty dict."""
        result = AIService._safe_json_parse(None)
        assert result == {}
    
    def test_parse_empty_string(self):
        """Test parsing empty string returns empty dict."""
        result = AIService._safe_json_parse("")
        assert result == {}


if __name__ == "__main__":
    # Run tests with: pytest tests/test_ai_service.py -v
    pytest.main([__file__, "-v"])
