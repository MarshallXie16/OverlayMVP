"""
AI service layer for step labeling using Claude Vision API.

Features:
- Claude 3.5 Sonnet vision model for screenshot analysis
- Template-based fallback for common field types
- Cost tracking and monitoring
- Error handling with retries
- Confidence scoring

Usage:
    from app.services.ai import AIService
    from app.models.step import Step
    
    ai_service = AIService()
    labels = ai_service.generate_step_labels(step)
    # Returns: {"field_label": str, "instruction": str, "ai_confidence": float}
"""
import os
import json
import logging
import base64
from pathlib import Path
from typing import Dict, Optional
from anthropic import Anthropic, APIError, RateLimitError
from app.models.step import Step

logger = logging.getLogger(__name__)


class AIServiceError(Exception):
    """Base exception for AI service errors."""
    pass


class AIService:
    """
    AI service for generating step labels using Claude Vision API.
    
    Analyzes screenshots and element metadata to generate:
    - field_label: Short, descriptive name for the element
    - instruction: Clear, action-oriented user instruction
    - confidence: 0.0-1.0 score indicating AI confidence
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize AI service with Anthropic API key.
        
        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
        
        Raises:
            AIServiceError: If API key is missing
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        
        if not self.api_key:
            raise AIServiceError(
                "ANTHROPIC_API_KEY environment variable not set. "
                "Please add it to your .env file."
            )
        
        self.client = Anthropic(api_key=self.api_key)
        # Model: claude-haiku-4-5-20251001 (Vision capable, fast, cost-effective)
        self.model = "claude-haiku-4-5-20251001"
        
        # Cost tracking (tokens used)
        self.total_input_tokens = 0
        self.total_output_tokens = 0
    
    def generate_step_labels(self, step: Step) -> Dict[str, any]:
        """
        Generate AI labels for a workflow step.
        
        Process:
        1. Try Claude Vision API with screenshot + metadata
        2. If fails or low confidence → Use fallback templates
        3. Track costs and log results
        
        Args:
            step: Step object with screenshot, element_meta, action_type
        
        Returns:
            dict: {
                "field_label": str (max 100 chars),
                "instruction": str (max 500 chars),
                "ai_confidence": float (0.0-1.0),
                "ai_model": str (model version used),
            }
        
        Raises:
            AIServiceError: If both AI and fallback fail
        """
        try:
            # Parse metadata
            element_meta = self._safe_json_parse(step.element_meta)
            action_data = self._safe_json_parse(step.action_data) if step.action_data else {}
            page_context = self._safe_json_parse(step.page_context)
            
            # Check if screenshot is available
            if not step.screenshot or not step.screenshot.storage_url:
                logger.warning(f"Step {step.id} has no screenshot, using fallback")
                return self._generate_fallback_label(step, element_meta)
            
            # Extract workflow context for better labelling
            workflow_context = None
            if step.workflow:
                workflow_context = {
                    "name": step.workflow.name,
                    "step_number": step.step_number,
                    "total_steps": step.workflow.step_count,
                }

            # Try AI labeling
            try:
                labels = self._call_claude_api(
                    screenshot_url=step.screenshot.storage_url,
                    element_meta=element_meta,
                    action_type=step.action_type,
                    action_data=action_data,
                    page_context=page_context,
                    workflow_context=workflow_context,
                )
                
                # Add model version
                labels["ai_model"] = self.model
                
                return labels
                
            except (APIError, RateLimitError) as e:
                logger.error(f"Claude API error for step {step.id}: {e}")
                logger.info(f"Falling back to template labels for step {step.id}")
                return self._generate_fallback_label(step, element_meta)
        
        except Exception as e:
            logger.error(f"Unexpected error generating labels for step {step.id}: {e}")
            raise AIServiceError(f"Failed to generate labels: {str(e)}")
    
    def _call_claude_api(
        self,
        screenshot_url: str,
        element_meta: dict,
        action_type: str,
        action_data: dict,
        page_context: dict,
        workflow_context: dict | None = None,
    ) -> Dict[str, any]:
        """
        Call Claude Vision API with screenshot and metadata.

        Args:
            screenshot_url: URL to screenshot image (local or S3)
            element_meta: Element metadata (tag, role, labels, etc.)
            action_type: Type of action (click, input_commit, etc.)
            action_data: Action data (e.g., input value)
            page_context: Page context (URL, title, viewport)
            workflow_context: Optional workflow context (name, step number, total steps)

        Returns:
            dict: Parsed API response with labels and confidence

        Raises:
            APIError: If Claude API fails
            RateLimitError: If rate limit exceeded
        """
        # Build prompt
        prompt = self._build_prompt(
            element_meta=element_meta,
            action_type=action_type,
            action_data=action_data,
            page_context=page_context,
            workflow_context=workflow_context,
        )
        
        # Prepare image source
        # Claude requires HTTPS URLs, so convert local files to base64
        if screenshot_url.startswith('/screenshots/'):
            # Local file - convert to base64
            image_source = self._load_local_image_as_base64(screenshot_url)
        elif screenshot_url.startswith('http://'):
            # HTTP URL - convert to base64 (Claude requires HTTPS)
            image_source = self._load_local_image_as_base64(screenshot_url.replace('http://localhost:8000', ''))
        else:
            # HTTPS URL - use directly
            image_source = {
                "type": "url",
                "url": screenshot_url,
            }
        
        # Define tool schema for structured JSON output
        tools = [{
            "name": "record_workflow_labels",
            "description": "Record workflow step labels with structured JSON format",
            "input_schema": {
                "type": "object",
                "properties": {
                    "field_label": {
                        "type": "string",
                        "description": "Short, descriptive field label (max 5 words). e.g., 'Email Address', 'Submit Button', 'Password Field'"
                    },
                    "instruction": {
                        "type": "string",
                        "description": "Clear, action-oriented instruction (1-2 sentences). e.g., 'Enter your work email address to continue'"
                    },
                    "confidence": {
                        "type": "integer",
                        "description": "Confidence score 0-100. Higher if element is clearly visible and identifiable"
                    }
                },
                "required": ["field_label", "instruction", "confidence"]
            }
        }]
        
        # Call API with tool calling
        response = self.client.messages.create(
            model=self.model,
            max_tokens=500,
            temperature=1.0,
            tools=tools,
            tool_choice={"type": "tool", "name": "record_workflow_labels"},
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": image_source,
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    }
                ]
            }]
        )
        
        # Track costs
        self.total_input_tokens += response.usage.input_tokens
        self.total_output_tokens += response.usage.output_tokens
        
        cost_estimate = self._estimate_cost(
            response.usage.input_tokens,
            response.usage.output_tokens
        )
        
        logger.info(
            f"Claude API call: {response.usage.input_tokens} input tokens, "
            f"{response.usage.output_tokens} output tokens, "
            f"est. cost: ${cost_estimate:.4f}"
        )
        
        # Parse tool call response
        try:
            # Claude returns tool use in response.content
            tool_use = None
            for content_block in response.content:
                if content_block.type == "tool_use":
                    tool_use = content_block
                    break
            
            if not tool_use:
                raise AIServiceError("No tool_use block in response")
            
            # Extract structured input from tool call
            result = tool_use.input
            
            logger.debug(f"Tool call result: {result}")
            
            # Validate required fields
            if "field_label" not in result or "instruction" not in result or "confidence" not in result:
                raise KeyError(f"Missing required fields. Got: {list(result.keys())}")
            
            # Validate and clean
            return {
                "field_label": str(result["field_label"])[:100],  # Max 100 chars
                "instruction": str(result["instruction"])[:500],  # Max 500 chars
                "ai_confidence": float(result["confidence"]) / 100,  # Convert to 0.0-1.0
            }
            
        except (KeyError, AttributeError, ValueError) as e:
            logger.error(f"Failed to parse Claude tool call response: {e}")
            logger.error(f"Response content: {response.content}")
            raise AIServiceError(f"Invalid tool call response: {e}")
    
    def _build_prompt(
        self,
        element_meta: dict,
        action_type: str,
        action_data: dict,
        page_context: dict,
        workflow_context: dict | None = None,
    ) -> str:
        """
        Build prompt for Claude based on technical requirements.

        Args:
            element_meta: Element metadata
            action_type: Action type
            action_data: Action data
            page_context: Page context
            workflow_context: Optional workflow context (name, step number, total steps)

        Returns:
            str: Formatted prompt
        """
        # Extract key metadata
        tag = element_meta.get("tag_name", "N/A")
        elem_type = element_meta.get("type", "N/A")
        label_text = element_meta.get("label_text", "N/A")
        placeholder = element_meta.get("placeholder", "N/A")
        nearby_text = element_meta.get("nearby_text", "N/A")

        # Enhanced context - additional fields for better labelling
        text_content = element_meta.get("text", "")
        role = element_meta.get("role", "")
        aria_label = element_meta.get("aria_label", "")
        visual_region = element_meta.get("visualRegion", "unknown")

        # Visibility status
        is_visible = element_meta.get("visible", True)

        # Bounding box - element position on screen
        bounding_box = element_meta.get("bounding_box", {})
        position = ""
        if bounding_box:
            x = bounding_box.get("x", 0)
            y = bounding_box.get("y", 0)
            position = f"at position ({x}, {y})"

        # Form context - critical for disambiguation
        form_context = element_meta.get("formContext", {})
        form_info = ""
        if form_context:
            form_id = form_context.get("form_id", "")
            form_action = form_context.get("form_action", "")
            field_index = form_context.get("field_index", "")
            total_fields = form_context.get("total_fields", "")
            if field_index and total_fields:
                form_info = f"Field {field_index} of {total_fields}"
                if form_id:
                    form_info += f" in form '{form_id}'"
                if form_action:
                    form_info += f" (submits to: {form_action})"

        # Nearby landmarks - contextual clues
        nearby_landmarks = element_meta.get("nearbyLandmarks", {})
        closest_heading = ""
        closest_label = ""
        if nearby_landmarks:
            heading_info = nearby_landmarks.get("closestHeading")
            if heading_info and heading_info.get("text"):
                closest_heading = heading_info.get("text", "")[:50]
            label_info = nearby_landmarks.get("closest_label")
            if label_info and label_info.get("text"):
                closest_label = label_info.get("text", "")[:50]
            sibling_texts = nearby_landmarks.get("siblingTexts", [])
            if sibling_texts:
                nearby_text = ", ".join(sibling_texts[:3])  # Limit to 3

        # Page context
        page_url = page_context.get("url", "")
        page_title = page_context.get("title", "")

        # Input value (if applicable) - BUGFIX: key is "value" not "input_value"
        input_value = action_data.get("value", "") if action_data else ""

        # Workflow context
        workflow_info = ""
        if workflow_context:
            wf_name = workflow_context.get("name", "")
            step_num = workflow_context.get("step_number", "")
            total_steps = workflow_context.get("total_steps", "")
            if wf_name and step_num and total_steps:
                workflow_info = f'Workflow: "{wf_name}" - Step {step_num} of {total_steps}'

        # Build prompt sections
        sections = ["Analyze this screenshot and element to generate clear workflow labels.", ""]

        # Workflow context section (if available)
        if workflow_info:
            sections.append("WORKFLOW CONTEXT:")
            sections.append(f"- {workflow_info}")
            sections.append("")

        # Page context section
        sections.append("PAGE CONTEXT:")
        sections.append(f"- URL: {page_url}")
        sections.append(f"- Title: {page_title}")
        sections.append(f"- Visual region: {visual_region}")
        if closest_heading:
            sections.append(f"- Section heading: {closest_heading}")
        if not is_visible:
            sections.append("- Visible: Hidden")
        sections.append("")

        # Element details section
        sections.append("ELEMENT DETAILS:")
        sections.append(f"- Tag: {tag}")
        sections.append(f"- Type: {elem_type}")
        if role:
            sections.append(f"- ARIA role: {role}")
        if aria_label:
            sections.append(f"- ARIA label: {aria_label}")
        sections.append(f"- Label text: {label_text}")
        if closest_label:
            sections.append(f"- Closest label: {closest_label}")
        sections.append(f"- Placeholder: {placeholder}")
        if text_content:
            sections.append(f"- Element text: {text_content[:100]}")
        sections.append(f"- Nearby text: {nearby_text}")
        if position:
            sections.append(f"- Position: {position}")
        if form_info:
            sections.append(f"- Form context: {form_info}")
        sections.append("")

        # Action section
        sections.append(f"ACTION: {action_type}")
        if input_value:
            sections.append(f"Input value: {input_value}")
        sections.append("")

        # Instructions section
        sections.append("INSTRUCTIONS:")
        sections.append("1. The element should be highlighted with a green outline in the screenshot")
        sections.append("2. Use the page title and URL to understand the application context")
        sections.append("3. Use form context and step position to disambiguate similar fields")
        sections.append("4. Generate a short, descriptive field label (max 5 words) that identifies this UI element")
        sections.append("5. Generate a clear, action-oriented instruction for this workflow step (1-2 sentences)")

        return "\n".join(sections)
    
    def _generate_fallback_label(
        self,
        step: Step,
        element_meta: dict
    ) -> Dict[str, any]:
        """
        Generate template-based labels when AI fails.
        
        Uses element metadata to create generic but helpful labels.
        
        Args:
            step: Step object
            element_meta: Element metadata
        
        Returns:
            dict: Fallback labels with confidence=0.0
        """
        # Action verbs
        verbs = {
            "click": "Click",
            "input_commit": "Enter",
            "select_change": "Select",
            "submit": "Submit",
            "navigate": "Navigate to",
        }
        
        # Try to extract a meaningful label
        label = (
            element_meta.get("label_text") or
            element_meta.get("placeholder") or
            element_meta.get("name") or
            element_meta.get("aria_label") or
            "Field"
        )
        
        # Clean label (remove extra whitespace, limit length)
        label = " ".join(label.split())[:50]
        
        # Get verb for action
        verb = verbs.get(step.action_type, "Complete")
        
        # Build instruction
        instruction = f"{verb} {label.lower()}"
        
        return {
            "field_label": label,
            "instruction": instruction,
            "ai_confidence": 0.0,  # Indicates fallback was used
            "ai_model": "fallback_template",
        }
    
    def _estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """
        Estimate cost of API call.
        
        Claude 3.5 Sonnet pricing (as of 2024):
        - Input: $3.00 per 1M tokens
        - Output: $15.00 per 1M tokens
        
        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
        
        Returns:
            float: Estimated cost in USD
        """
        input_cost = (input_tokens / 1_000_000) * 3.00
        output_cost = (output_tokens / 1_000_000) * 15.00
        return input_cost + output_cost
    
    def get_total_cost(self) -> float:
        """
        Get total cost of all API calls in this session.
        
        Returns:
            float: Total cost in USD
        """
        return self._estimate_cost(self.total_input_tokens, self.total_output_tokens)
    
    def reset_cost_tracking(self):
        """Reset cost tracking counters."""
        self.total_input_tokens = 0
        self.total_output_tokens = 0
    
    @staticmethod
    def _safe_json_parse(json_str: str) -> dict:
        """
        Safely parse JSON string.
        
        Args:
            json_str: JSON string to parse
        
        Returns:
            dict: Parsed JSON or empty dict
        """
        if not json_str:
            return {}
        
        try:
            return json.loads(json_str)
        except (json.JSONDecodeError, TypeError):
            logger.warning(f"Failed to parse JSON: {json_str[:100]}")
            return {}
    
    @staticmethod
    def _extract_json(text: str) -> str:
        """
        Extract JSON from text that might contain extra content.
        
        Args:
            text: Text potentially containing JSON
        
        Returns:
            str: Extracted JSON string
        """
        # Try to find JSON object in text
        start = text.find('{')
        end = text.rfind('}')
        
        if start != -1 and end != -1 and end > start:
            return text[start:end+1]
        
        # If no JSON found, return original text
        return text
    
    def _load_local_image_as_base64(self, screenshot_url: str) -> dict:
        """
        Load local screenshot file and convert to base64 for Claude API.
        
        Claude Vision API requires HTTPS URLs, so local files must be
        converted to base64 format.
        
        Args:
            screenshot_url: Local file path (e.g., /screenshots/companies/1/workflows/10/123.jpg)
        
        Returns:
            dict: Image source dict with base64 data
        
        Raises:
            AIServiceError: If file not found or can't be read
        """
        try:
            # Convert URL path to filesystem path
            # /screenshots/... -> backend/screenshots/...
            if screenshot_url.startswith('/screenshots/'):
                relative_path = screenshot_url[len('/screenshots/'):]
            else:
                relative_path = screenshot_url
            
            # Build absolute path
            base_dir = Path(__file__).parent.parent.parent  # backend/
            file_path = base_dir / "screenshots" / relative_path
            
            if not file_path.exists():
                raise AIServiceError(f"Screenshot file not found: {file_path}")
            
            # Read and encode image
            with open(file_path, "rb") as f:
                image_data = f.read()
            
            base64_data = base64.b64encode(image_data).decode('utf-8')
            
            # Detect media type from extension
            suffix = file_path.suffix.lower()
            media_type_map = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            }
            media_type = media_type_map.get(suffix, 'image/jpeg')
            
            logger.debug(f"Loaded screenshot as base64: {file_path} ({len(base64_data)} bytes)")
            
            return {
                "type": "base64",
                "media_type": media_type,
                "data": base64_data,
            }
            
        except Exception as e:
            logger.error(f"Failed to load local image {screenshot_url}: {e}")
            raise AIServiceError(f"Could not load screenshot: {e}")
