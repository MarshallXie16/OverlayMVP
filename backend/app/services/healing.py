"""
AI healing validation service layer.

Validates auto-healing candidate matches using Claude Vision API.
The AI's role is to CONFIRM or REJECT the deterministic choice, not to discover elements.

Design principle: AI validates, doesn't replace deterministic scoring.
This keeps costs low and latency acceptable while adding a safety net.
"""
import os
import logging
import base64
from pathlib import Path
from typing import Dict, Optional, Tuple
from anthropic import Anthropic, APIError, RateLimitError

from app.schemas.healing import (
    HealingValidationRequest,
    HealingValidationResponse,
    ElementContextSchema,
)

logger = logging.getLogger(__name__)

# Input sanitization limits
MAX_TEXT_LENGTH = 200
MAX_URL_LENGTH = 500
MAX_CLASS_COUNT = 5


def sanitize_text(text: str | None, max_length: int = MAX_TEXT_LENGTH) -> str:
    """
    Sanitize user-provided text for safe inclusion in AI prompts.

    - Truncates to max length
    - Removes control characters
    - Escapes potential prompt injection patterns
    - Returns "(empty)" for None/empty values
    """
    if not text:
        return "(empty)"

    # Remove control characters except newlines and tabs
    sanitized = "".join(c for c in str(text) if c.isprintable() or c in "\n\t")

    # Truncate to max length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + "..."

    # Escape potential prompt injection patterns
    # These patterns could trick the AI into ignoring prior instructions
    injection_patterns = [
        ("ignore", "[filtered]"),
        ("disregard", "[filtered]"),
        ("forget", "[filtered]"),
        ("new instructions", "[filtered]"),
        ("system:", "[sys]"),
        ("assistant:", "[asst]"),
        ("human:", "[hum]"),
        ("```", "'''"),  # Prevent code block escape
    ]

    sanitized_lower = sanitized.lower()
    for pattern, replacement in injection_patterns:
        if pattern in sanitized_lower:
            # Replace case-insensitively
            import re
            sanitized = re.sub(re.escape(pattern), replacement, sanitized, flags=re.IGNORECASE)

    return sanitized.strip()


def sanitize_url(url: str | None) -> str:
    """Sanitize URL for safe display in prompts."""
    if not url:
        return "(no url)"

    # Truncate long URLs
    if len(url) > MAX_URL_LENGTH:
        return url[:MAX_URL_LENGTH] + "..."

    return url


class HealingServiceError(Exception):
    """Base exception for healing service errors."""
    pass


class HealingValidationService:
    """
    AI service for validating auto-healing candidate matches.

    Uses Claude Vision API to confirm whether a candidate element
    matches the original recorded element in purpose and context.
    """

    # AI weight when combining with deterministic score
    AI_WEIGHT = 0.40

    # Recommendation thresholds
    ACCEPT_THRESHOLD = 0.85
    REJECT_THRESHOLD = 0.50

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize healing validation service.

        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)

        Raises:
            HealingServiceError: If API key is missing
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")

        if not self.api_key:
            raise HealingServiceError(
                "ANTHROPIC_API_KEY environment variable not set. "
                "AI healing validation will be unavailable."
            )

        self.client = Anthropic(api_key=self.api_key)
        # Use Haiku for fast, cost-effective validation
        self.model = "claude-haiku-4-5-20251001"

        # Cost tracking
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    def validate_healing_match(
        self,
        request: HealingValidationRequest,
    ) -> HealingValidationResponse:
        """
        Validate whether a candidate element matches the original.

        Process:
        1. Build comparison prompt from element contexts
        2. Call Claude Vision API with screenshots if available
        3. Parse AI response for confidence and reasoning
        4. Combine AI confidence with deterministic score
        5. Return recommendation (accept/reject/prompt_user)

        Args:
            request: Healing validation request with contexts and screenshots

        Returns:
            HealingValidationResponse with AI decision and combined score

        Raises:
            HealingServiceError: If validation fails
        """
        try:
            # Build the validation prompt
            prompt = self._build_validation_prompt(request)

            # Prepare messages
            messages_content = []

            # Add screenshots if available
            if request.original_screenshot:
                original_image = self._prepare_image_source(request.original_screenshot)
                if original_image:
                    messages_content.append({
                        "type": "image",
                        "source": original_image,
                    })

            if request.current_screenshot:
                current_image = self._prepare_image_source(request.current_screenshot)
                if current_image:
                    messages_content.append({
                        "type": "image",
                        "source": current_image,
                    })

            # Add the prompt text
            messages_content.append({
                "type": "text",
                "text": prompt,
            })

            # Define tool schema for structured response
            tools = [{
                "name": "validate_element_match",
                "description": "Validate whether a candidate element matches the original element",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "is_match": {
                            "type": "boolean",
                            "description": "True if candidate is the same functional element as original"
                        },
                        "confidence": {
                            "type": "integer",
                            "description": "Confidence score 0-100. Higher if purpose/context clearly match or mismatch"
                        },
                        "reasoning": {
                            "type": "string",
                            "description": "Brief explanation (1-2 sentences) for the decision"
                        }
                    },
                    "required": ["is_match", "confidence", "reasoning"]
                }
            }]

            # Call Claude API
            response = self.client.messages.create(
                model=self.model,
                max_tokens=300,
                temperature=0.0,  # Deterministic for validation
                tools=tools,
                tool_choice={"type": "tool", "name": "validate_element_match"},
                messages=[{
                    "role": "user",
                    "content": messages_content
                }]
            )

            # Track costs
            self.total_input_tokens += response.usage.input_tokens
            self.total_output_tokens += response.usage.output_tokens

            logger.info(
                f"Healing validation API call: {response.usage.input_tokens} input, "
                f"{response.usage.output_tokens} output tokens"
            )

            # Parse tool response
            tool_result = self._parse_tool_response(response)

            # Calculate combined score
            ai_confidence = tool_result["confidence"] / 100.0
            combined_score = self._calculate_combined_score(
                request.deterministic_score,
                ai_confidence,
                tool_result["is_match"]
            )

            # Determine recommendation
            recommendation = self._get_recommendation(combined_score, tool_result["is_match"])

            return HealingValidationResponse(
                is_match=tool_result["is_match"],
                ai_confidence=ai_confidence,
                reasoning=tool_result["reasoning"],
                combined_score=combined_score,
                recommendation=recommendation,
                ai_model=self.model,
            )

        except (APIError, RateLimitError) as e:
            logger.error(f"Claude API error during healing validation: {e}")
            raise HealingServiceError(f"AI validation failed: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error during healing validation: {e}")
            raise HealingServiceError(f"Validation failed: {str(e)}")

    def _build_validation_prompt(self, request: HealingValidationRequest) -> str:
        """
        Build the validation prompt from request data.

        Focuses on PURPOSE and CONTEXT, not just appearance.
        """
        original = request.original_context
        candidate = request.candidate_context

        # Build context strings
        original_context = self._format_element_context(original, "ORIGINAL")
        candidate_context = self._format_element_context(candidate, "CANDIDATE")

        # Form context comparison (with sanitized form IDs)
        form_comparison = ""
        if original.form_context or candidate.form_context:
            orig_form = original.form_context
            cand_form = candidate.form_context
            orig_form_id = sanitize_text(orig_form.form_id, max_length=100) if orig_form and orig_form.form_id else "none"
            cand_form_id = sanitize_text(cand_form.form_id, max_length=100) if cand_form and cand_form.form_id else "none"
            same_form = orig_form and cand_form and orig_form.form_id == cand_form.form_id if orig_form and cand_form else False
            form_comparison = f"""
FORM CONTEXT:
- Original form: {orig_form_id}
- Candidate form: {cand_form_id}
- Same form: {same_form}
"""

        # URL comparison (sanitize URLs)
        original_url = sanitize_url(request.original_url)
        current_url = sanitize_url(request.page_url)
        url_match = "SAME" if request.page_url == request.original_url else "DIFFERENT"

        # Sanitize field label
        field_label = sanitize_text(request.field_label, max_length=100) if request.field_label else "Not provided"

        # Sanitize factor scores (convert to safe string representation)
        safe_factor_scores = {}
        if request.factor_scores:
            for key, value in request.factor_scores.items():
                # Only allow alphanumeric factor names
                safe_key = "".join(c for c in str(key)[:30] if c.isalnum() or c == "_")
                # Ensure value is numeric
                try:
                    safe_value = float(value)
                except (TypeError, ValueError):
                    safe_value = 0.0
                safe_factor_scores[safe_key] = round(safe_value, 2)

        prompt = f"""You are validating an element match for a UI automation workflow.

The system found a candidate element that might be the same as the originally recorded element.
Your job: Determine if they serve the SAME PURPOSE in the SAME CONTEXT.

{original_context}

{candidate_context}
{form_comparison}
URLS: {url_match}
- Original: {original_url}
- Current: {current_url}

FIELD LABEL: {field_label}

DETERMINISTIC SCORE: {request.deterministic_score:.2f}
FACTOR SCORES: {safe_factor_scores}

KEY QUESTIONS:
1. Do both elements serve the same FUNCTIONAL PURPOSE?
2. Are they in the same CONTEXT (same form, same section)?
3. Would clicking/interacting accomplish the same GOAL?

IMPORTANT: Small text changes are OK (e.g., "Submit" → "Submit Order").
Different forms or sections are NOT OK (checkout vs newsletter).

If images are provided:
- Image 1 (if present): Original screenshot with element area
- Image 2 (if present): Current page with candidate highlighted

Validate the match now."""

        return prompt

    def _format_element_context(
        self,
        context: ElementContextSchema,
        label: str
    ) -> str:
        """
        Format element context for the prompt with sanitized values.

        All user-provided content is sanitized to prevent prompt injection.
        """
        # Sanitize all text fields
        text = sanitize_text(context.text)
        role = sanitize_text(context.role, max_length=50)
        type_val = sanitize_text(context.type, max_length=50)
        id_val = sanitize_text(context.id, max_length=100)
        label_text = sanitize_text(
            context.label_text or context.aria_label or context.placeholder,
            max_length=150
        )

        # Sanitize classes (limit count and length)
        classes_str = "none"
        if context.classes:
            sanitized_classes = [
                sanitize_text(c, max_length=50)
                for c in context.classes[:MAX_CLASS_COUNT]
            ]
            classes_str = ", ".join(sanitized_classes)

        # Tag name should be simple - validate it
        tag_name = context.tag_name.lower() if context.tag_name else "unknown"
        if not tag_name.isalnum() and tag_name not in ["input", "button", "a", "select", "textarea", "div", "span", "label", "form"]:
            tag_name = "element"

        return f"""{label} ELEMENT:
- Tag: <{tag_name}>
- Text: "{text}"
- Role: {role}
- Type: {type_val}
- ID: {id_val}
- Classes: {classes_str}
- Label: {label_text}
- Region: {context.visual_region}
- Position: ({context.x:.0f}, {context.y:.0f})"""

    def _prepare_image_source(self, image_data: str) -> Optional[Dict]:
        """
        Prepare image source for Claude API.

        Handles:
        - Base64 encoded images
        - Local file paths
        - HTTPS URLs

        Args:
            image_data: Base64 string, file path, or URL

        Returns:
            Image source dict for Claude API, or None if failed
        """
        try:
            # Check if it's base64 data
            if image_data.startswith("data:image"):
                # Extract base64 from data URL
                parts = image_data.split(",", 1)
                if len(parts) == 2:
                    media_type = parts[0].split(":")[1].split(";")[0]
                    return {
                        "type": "base64",
                        "media_type": media_type,
                        "data": parts[1],
                    }

            # Check if it's a local file path
            if image_data.startswith("/screenshots/"):
                return self._load_local_image(image_data)

            # Check if it's an HTTP URL (needs conversion)
            if image_data.startswith("http://"):
                local_path = image_data.replace("http://localhost:8000", "")
                return self._load_local_image(local_path)

            # HTTPS URL - use directly
            if image_data.startswith("https://"):
                return {
                    "type": "url",
                    "url": image_data,
                }

            # Unknown format - try as base64
            return {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": image_data,
            }

        except Exception as e:
            logger.warning(f"Failed to prepare image: {e}")
            return None

    def _load_local_image(self, path: str) -> Optional[Dict]:
        """Load local image file as base64."""
        try:
            if path.startswith("/screenshots/"):
                relative_path = path[len("/screenshots/"):]
            else:
                relative_path = path

            base_dir = Path(__file__).parent.parent.parent  # backend/
            file_path = base_dir / "screenshots" / relative_path

            if not file_path.exists():
                logger.warning(f"Screenshot not found: {file_path}")
                return None

            with open(file_path, "rb") as f:
                image_data = f.read()

            base64_data = base64.b64encode(image_data).decode("utf-8")

            # Detect media type
            suffix = file_path.suffix.lower()
            media_types = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".gif": "image/gif",
                ".webp": "image/webp",
            }
            media_type = media_types.get(suffix, "image/jpeg")

            return {
                "type": "base64",
                "media_type": media_type,
                "data": base64_data,
            }

        except Exception as e:
            logger.warning(f"Failed to load local image {path}: {e}")
            return None

    def _parse_tool_response(self, response) -> Dict:
        """Parse Claude tool call response."""
        for content_block in response.content:
            if content_block.type == "tool_use":
                result = content_block.input
                if all(k in result for k in ["is_match", "confidence", "reasoning"]):
                    return {
                        "is_match": bool(result["is_match"]),
                        "confidence": int(result["confidence"]),
                        "reasoning": str(result["reasoning"])[:500],
                    }

        raise HealingServiceError("Invalid tool response from Claude")

    def _calculate_combined_score(
        self,
        deterministic_score: float,
        ai_confidence: float,
        is_match: bool
    ) -> float:
        """
        Calculate combined score from deterministic and AI scores.

        AI can VETO: if AI says <0.5 confidence, cap final score at 0.70.
        """
        if not is_match:
            # AI says it's NOT a match - heavily penalize
            ai_score = 1.0 - ai_confidence  # Invert confidence for non-matches
        else:
            ai_score = ai_confidence

        # Weighted combination
        combined = (
            deterministic_score * (1 - self.AI_WEIGHT) +
            ai_score * self.AI_WEIGHT
        )

        # AI veto: if AI confidence is low for a match, cap the score
        if is_match and ai_confidence < 0.5:
            combined = min(combined, 0.70)

        # If AI says NOT a match with high confidence, heavily reduce
        if not is_match and ai_confidence > 0.7:
            combined = min(combined, 0.50)

        return round(combined, 3)

    def _get_recommendation(self, combined_score: float, is_match: bool) -> str:
        """Determine recommendation based on combined score."""
        if not is_match:
            return "reject"

        if combined_score >= self.ACCEPT_THRESHOLD:
            return "accept"
        elif combined_score >= self.REJECT_THRESHOLD:
            return "prompt_user"
        else:
            return "reject"

    def get_total_cost(self) -> float:
        """Get estimated total cost of all API calls."""
        # Haiku pricing
        input_cost = (self.total_input_tokens / 1_000_000) * 0.25
        output_cost = (self.total_output_tokens / 1_000_000) * 1.25
        return input_cost + output_cost

    def reset_cost_tracking(self):
        """Reset cost tracking counters."""
        self.total_input_tokens = 0
        self.total_output_tokens = 0


def get_healing_service() -> Optional[HealingValidationService]:
    """
    Factory function to get healing validation service.

    Returns None if API key not configured (graceful degradation).
    """
    try:
        return HealingValidationService()
    except HealingServiceError:
        logger.warning("Healing validation service unavailable (no API key)")
        return None
