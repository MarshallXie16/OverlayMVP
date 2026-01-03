/**
 * Auto-Healer Error Handling Tests
 *
 * Focused tests for error scenarios:
 * 1. AI validation timeout handling
 * 2. AI validation rate limit handling
 * 3. AI validation malformed response handling
 * 4. Fallback to deterministic when AI unavailable
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { healElement } from "../autoHealer";
import type { StepResponse } from "../../../shared/types";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockStep(): StepResponse {
  return {
    id: 1,
    workflow_id: 100,
    step_number: 1,
    timestamp: new Date().toISOString(),
    action_type: "click",
    selectors: {
      primary: "#submit-btn",
      css: "form button.btn-primary",
      xpath: null,
      data_testid: null,
    },
    element_meta: {
      tag_name: "BUTTON",
      role: "button",
      type: null,
      name: null,
      text: "Submit",
      classes: ["btn", "btn-primary"],
      bounding_box: { x: 100, y: 200, width: 120, height: 40 },
      parentChain: [],
      formContext: null,
      visualRegion: "main" as const,
      nearbyLandmarks: {
        closestHeading: null,
        closestLabel: null,
        siblingTexts: [],
        containerText: null,
      },
    },
    page_context: {
      url: "https://example.com/checkout",
      title: "Checkout",
    },
    action_data: null,
    dom_context: null,
    screenshot_id: null,
    field_label: null,
    instruction: null,
  };
}

// ============================================================================
// AI TIMEOUT HANDLING
// ============================================================================

describe("AI Validation - Timeout Handling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should handle AI timeout gracefully", async () => {
    const step = createMockStep();

    // Simulate timeout
    const mockAIValidate = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout")), 10);
      });
    });

    // Should not throw
    const result = await healElement(step, {
      aiEnabled: true,
      onAIValidate: mockAIValidate,
    });

    // Should fallback to deterministic
    expect(result).toBeDefined();
    expect(result.aiConfidence).toBeNull();
  });

  it("should not throw on timeout errors", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockRejectedValue(new Error("Timeout"));

    // Should not throw
    await expect(
      healElement(step, {
        aiEnabled: true,
        onAIValidate: mockAIValidate,
      }),
    ).resolves.toBeDefined();
  });
});

// ============================================================================
// AI RATE LIMIT HANDLING
// ============================================================================

describe("AI Validation - Rate Limit Handling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should handle rate limit errors gracefully", async () => {
    const step = createMockStep();

    // Simulate rate limit
    const rateLimitError = new Error("Rate limit exceeded");
    (rateLimitError as any).status = 429;

    const mockAIValidate = vi.fn().mockRejectedValue(rateLimitError);

    // Should not throw
    const result = await healElement(step, {
      aiEnabled: true,
      onAIValidate: mockAIValidate,
    });

    expect(result).toBeDefined();
  });

  it("should fallback to deterministic on rate limit", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockRejectedValue({
      status: 429,
      message: "Rate limit exceeded",
    });

    const result = await healElement(step, {
      aiEnabled: true,
      onAIValidate: mockAIValidate,
    });

    // Should complete without AI confidence
    expect(result.aiConfidence).toBeNull();
  });
});

// ============================================================================
// MALFORMED AI RESPONSES
// ============================================================================

describe("AI Validation - Malformed Response Handling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should handle missing isMatch field", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockResolvedValue({
      confidence: 0.8,
      // isMatch missing!
    });

    // Should not crash
    await expect(
      healElement(step, {
        aiEnabled: true,
        onAIValidate: mockAIValidate,
      }),
    ).resolves.toBeDefined();
  });

  it("should handle missing confidence field", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockResolvedValue({
      isMatch: true,
      // confidence missing!
    });

    await expect(
      healElement(step, {
        aiEnabled: true,
        onAIValidate: mockAIValidate,
      }),
    ).resolves.toBeDefined();
  });

  it("should handle non-numeric confidence", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockResolvedValue({
      isMatch: true,
      confidence: "high" as any, // Should be number
    });

    await expect(
      healElement(step, {
        aiEnabled: true,
        onAIValidate: mockAIValidate,
      }),
    ).resolves.toBeDefined();
  });

  it("should handle null response", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockResolvedValue(null);

    await expect(
      healElement(step, {
        aiEnabled: true,
        onAIValidate: mockAIValidate,
      }),
    ).resolves.toBeDefined();
  });

  it("should handle undefined response", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockResolvedValue(undefined);

    await expect(
      healElement(step, {
        aiEnabled: true,
        onAIValidate: mockAIValidate,
      }),
    ).resolves.toBeDefined();
  });
});

// ============================================================================
// FALLBACK TO DETERMINISTIC
// ============================================================================

describe("Fallback to Deterministic Scoring", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should not call AI when aiEnabled is false", async () => {
    const step = createMockStep();
    const mockAIValidate = vi.fn();

    await healElement(step, {
      aiEnabled: false,
      onAIValidate: mockAIValidate,
    });

    expect(mockAIValidate).not.toHaveBeenCalled();
  });

  it("should work without onAIValidate callback", async () => {
    const step = createMockStep();

    // Should not throw
    const result = await healElement(step, { aiEnabled: true });

    expect(result).toBeDefined();
    expect(result.aiConfidence).toBeNull();
  });

  it("should work with undefined options", async () => {
    const step = createMockStep();

    // Should not throw
    const result = await healElement(step);

    expect(result).toBeDefined();
  });
});

// ============================================================================
// USER PROMPT ERRORS
// ============================================================================

describe("User Prompt Error Handling", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should handle user prompt error gracefully", async () => {
    const step = createMockStep();

    const mockUserPrompt = vi
      .fn()
      .mockRejectedValue(new Error("User closed dialog"));

    // Should not throw
    const result = await healElement(step, {
      aiEnabled: false,
      onUserPrompt: mockUserPrompt,
    });

    expect(result).toBeDefined();
  });

  it("should not throw on user prompt errors", async () => {
    const step = createMockStep();

    const mockUserPrompt = vi.fn().mockRejectedValue(new Error("Timeout"));

    // Should not throw
    await expect(
      healElement(step, {
        aiEnabled: false,
        onUserPrompt: mockUserPrompt,
      }),
    ).resolves.toBeDefined();
  });
});

// ============================================================================
// COMBINED ERROR SCENARIOS
// ============================================================================

describe("Combined Error Scenarios", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should handle AI timeout then user prompt error", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockRejectedValue(new Error("Timeout"));
    const mockUserPrompt = vi.fn().mockRejectedValue(new Error("User error"));

    // Should not throw
    const result = await healElement(step, {
      aiEnabled: true,
      onAIValidate: mockAIValidate,
      onUserPrompt: mockUserPrompt,
    });

    expect(result).toBeDefined();
  });

  it("should return failed result when all mechanisms fail", async () => {
    const step = createMockStep();

    const mockAIValidate = vi.fn().mockRejectedValue(new Error("AI failed"));
    const mockUserPrompt = vi.fn().mockRejectedValue(new Error("User failed"));

    const result = await healElement(step, {
      aiEnabled: true,
      onAIValidate: mockAIValidate,
      onUserPrompt: mockUserPrompt,
    });

    expect(result.success).toBe(false);
    expect(result.resolution).toBe("failed");
  });
});
