"""
Test Anthropic API integration.

Simple test to verify Claude API connectivity and basic functionality.
"""
import os
import pytest
from anthropic import Anthropic


def test_anthropic_api_key_exists():
    """Test that ANTHROPIC_API_KEY is set in environment."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    assert api_key is not None, "ANTHROPIC_API_KEY environment variable not set"
    assert len(api_key) > 0, "ANTHROPIC_API_KEY is empty"


def test_anthropic_client_initialization():
    """Test that Anthropic client can be initialized."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    
    if not api_key:
        pytest.skip("ANTHROPIC_API_KEY not set, skipping test")
    
    # Should not raise exception
    client = Anthropic(api_key=api_key)
    assert client is not None
    assert hasattr(client, 'messages'), "Client should have 'messages' attribute"


def test_anthropic_simple_message():
    """Test simple message creation with Claude API."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    
    if not api_key:
        pytest.skip("ANTHROPIC_API_KEY not set, skipping test")
    
    client = Anthropic(api_key=api_key)
    
    # Make a simple API call
    # Model: claude-3-5-sonnet-20241022 (latest as of Nov 2024)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        temperature=0.0,
        messages=[{
            "role": "user",
            "content": "Say 'Hello, World!' and nothing else."
        }]
    )
    
    # Verify response structure
    assert response is not None
    assert hasattr(response, 'content'), "Response should have 'content'"
    assert len(response.content) > 0, "Response content should not be empty"
    assert hasattr(response, 'usage'), "Response should have 'usage'"
    assert hasattr(response.usage, 'input_tokens'), "Usage should have 'input_tokens'"
    assert hasattr(response.usage, 'output_tokens'), "Usage should have 'output_tokens'"
    
    # Verify response content
    text_content = response.content[0].text
    assert text_content is not None
    assert len(text_content) > 0
    
    # Log for debugging
    print(f"\n✓ Claude API call successful")
    print(f"  Input tokens: {response.usage.input_tokens}")
    print(f"  Output tokens: {response.usage.output_tokens}")
    print(f"  Response: {text_content[:100]}")


def test_anthropic_vision_api():
    """Test Claude Vision API with a simple image."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    
    if not api_key:
        pytest.skip("ANTHROPIC_API_KEY not set, skipping test")
    
    client = Anthropic(api_key=api_key)
    
    # Use a simple public image URL for testing
    # This is a 1x1 red pixel PNG (base64)
    test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
    
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=100,
        temperature=0.0,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": test_image_base64,
                    },
                },
                {
                    "type": "text",
                    "text": "Describe this image in one word."
                }
            ]
        }]
    )
    
    # Verify response
    assert response is not None
    assert len(response.content) > 0
    
    text_content = response.content[0].text
    assert text_content is not None
    
    print(f"\n✓ Claude Vision API call successful")
    print(f"  Input tokens: {response.usage.input_tokens}")
    print(f"  Output tokens: {response.usage.output_tokens}")
    print(f"  Response: {text_content}")


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "-s"])
