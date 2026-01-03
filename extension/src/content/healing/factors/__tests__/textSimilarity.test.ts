/**
 * Text Similarity Factor Tests
 *
 * Tests for all text similarity algorithms:
 * - Levenshtein distance calculation
 * - Levenshtein similarity ratio
 * - Text normalization
 * - Semantic similarity (word overlap, prefix matching)
 * - Main scoring function
 */

import { describe, it, expect } from "vitest";
import { textSimilarityFactor } from "../textSimilarity";
import type { CandidateElement, ElementContext } from "../../types";

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock ElementContext for testing
 */
function createMockContext(text: string | null): ElementContext {
  return {
    tagName: "BUTTON",
    role: "button",
    type: null,
    name: null,
    text,
    classes: ["btn"],
    boundingBox: { x: 0, y: 0, width: 100, height: 40 },
    selectors: {
      primary: "#test-btn",
      css: ".btn",
      xpath: null,
      dataTestId: null,
    },
    parentChain: [],
    formContext: null,
    visualRegion: "main",
    nearbyLandmarks: {
      closestHeading: null,
      closestLabel: null,
      siblingTexts: [],
      containerText: null,
    },
    fieldLabel: null,
    instruction: null,
  };
}

/**
 * Create a mock CandidateElement for testing
 */
function createMockCandidate(text: string | null): CandidateElement {
  const element = document.createElement("button");
  if (text) element.textContent = text;

  return {
    element,
    metadata: {
      tag_name: "BUTTON",
      role: "button",
      type: null,
      name: null,
      text,
      classes: ["btn"],
      bounding_box: { x: 0, y: 0, width: 100, height: 40 },
      parentChain: [],
      formContext: null,
      visualRegion: "main",
      nearbyLandmarks: {
        closestHeading: null,
        closestLabel: null,
        siblingTexts: [],
        containerText: null,
      },
    },
  };
}

// Access private functions via module for testing
// We'll need to test these through the public API or export them
// For now, we'll test the behavior through the main score() function

// ============================================================================
// EXACT MATCH TESTS
// ============================================================================

describe("textSimilarity - Exact Matches", () => {
  it("should return 1.0 for identical text", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should return 1.0 for identical text with different casing", () => {
    const original = createMockContext("Submit Order");
    const candidate = createMockCandidate("SUBMIT ORDER");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should return 1.0 for identical text with extra whitespace", () => {
    const original = createMockContext("  Submit   Order  ");
    const candidate = createMockCandidate("Submit Order");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should return 1.0 for identical text with punctuation differences", () => {
    const original = createMockContext("Submit!");
    const candidate = createMockCandidate("Submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });
});

// ============================================================================
// LEVENSHTEIN DISTANCE TESTS
// ============================================================================

describe("textSimilarity - Levenshtein Distance", () => {
  it("should handle classic 'kitten' to 'sitting' example (distance = 3)", () => {
    const original = createMockContext("kitten");
    const candidate = createMockCandidate("sitting");

    const score = textSimilarityFactor.score(candidate, original);

    // Distance = 3, maxLen = 7, similarity = 1 - 3/7 = 0.571
    expect(score).toBeCloseTo(0.571, 2);
  });

  it("should return high score for strings with 1 character difference", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submits");

    const score = textSimilarityFactor.score(candidate, original);

    // Distance = 1, maxLen = 7, similarity = 1 - 1/7 = 0.857
    expect(score).toBeGreaterThan(0.85);
  });

  it("should return low score for completely different strings", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Cancel");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBeLessThan(0.5);
  });

  it("should handle empty strings", () => {
    const original = createMockContext("");
    const candidate = createMockCandidate("");

    const score = textSimilarityFactor.score(candidate, original);

    // Both empty = neutral score
    expect(score).toBe(0.5);
  });

  it("should handle one empty string", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("");

    const score = textSimilarityFactor.score(candidate, original);

    // One has text, other doesn't = penalty
    expect(score).toBe(0.3);
  });

  it("should handle null text as empty", () => {
    const original = createMockContext(null);
    const candidate = createMockCandidate(null);

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.5);
  });

  it("should handle very long strings efficiently", () => {
    const longText1 = "a".repeat(1000);
    const longText2 = "b".repeat(1000);

    const original = createMockContext(longText1);
    const candidate = createMockCandidate(longText2);

    // Should complete without timeout
    const start = Date.now();
    const score = textSimilarityFactor.score(candidate, original);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100); // Should be fast
    expect(score).toBe(0); // Completely different
  });
});

// ============================================================================
// SEMANTIC SIMILARITY TESTS
// ============================================================================

describe("textSimilarity - Semantic Similarity", () => {
  it("should match when candidate contains original (substring)", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submit Order");

    const score = textSimilarityFactor.score(candidate, original);

    // Containment: 0.8 * (6/12) = 0.4
    // Word overlap: 0.7 * (1/2) = 0.35
    // Best: 0.4
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should match when original contains candidate", () => {
    const original = createMockContext("Submit Order");
    const candidate = createMockCandidate("Submit");

    const score = textSimilarityFactor.score(candidate, original);

    // Containment: 0.8 * (6/12) = 0.4
    // Word overlap: 0.7 * (1/2) = 0.35
    // Best: 0.4
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should match based on common prefix", () => {
    const original = createMockContext("Submit Form");
    const candidate = createMockCandidate("Submit Order");

    const score = textSimilarityFactor.score(candidate, original);

    // Common prefix "Submit" should give decent score
    expect(score).toBeGreaterThan(0.6);
  });

  it("should match based on word overlap", () => {
    const original = createMockContext("Complete Order Now");
    const candidate = createMockCandidate("Complete Purchase Now");

    const score = textSimilarityFactor.score(candidate, original);

    // 2 out of 3 words match (Complete, Now)
    expect(score).toBeGreaterThan(0.5);
  });

  it("should ignore short words (< 3 chars) in word overlap", () => {
    const original = createMockContext("Go to checkout");
    const candidate = createMockCandidate("Go to payment");

    const score = textSimilarityFactor.score(candidate, original);

    // "Go" and "to" are too short, only "checkout" vs "payment" compared
    expect(score).toBeLessThan(0.7);
  });

  it("should handle single word comparisons", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should score low when no words overlap", () => {
    const original = createMockContext("Submit Order");
    const candidate = createMockCandidate("Cancel Payment");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBeLessThan(0.5);
  });
});

// ============================================================================
// TEXT NORMALIZATION TESTS
// ============================================================================

describe("textSimilarity - Text Normalization", () => {
  it("should normalize whitespace (multiple spaces to single)", () => {
    const original = createMockContext("Submit    Order");
    const candidate = createMockCandidate("Submit Order");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should normalize whitespace (tabs and newlines)", () => {
    const original = createMockContext("Submit\n\tOrder");
    const candidate = createMockCandidate("Submit Order");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should remove leading/trailing whitespace", () => {
    const original = createMockContext("   Submit   ");
    const candidate = createMockCandidate("Submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should remove punctuation", () => {
    const original = createMockContext("Submit!");
    const candidate = createMockCandidate("Submit?");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should convert to lowercase", () => {
    const original = createMockContext("SUBMIT");
    const candidate = createMockCandidate("submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should handle mixed normalization", () => {
    const original = createMockContext("  SUBMIT!!!  Order???  ");
    const candidate = createMockCandidate("submit order");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("textSimilarity - Edge Cases", () => {
  it("should handle very short text (< 2 chars)", () => {
    const original = createMockContext("X");
    const candidate = createMockCandidate("X");

    const score = textSimilarityFactor.score(candidate, original);

    // Short text = neutral score
    expect(score).toBe(0.5);
  });

  it("should penalize when only one has short text", () => {
    const original = createMockContext("X");
    const candidate = createMockCandidate("Submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.3);
  });

  it("should handle text with only whitespace", () => {
    const original = createMockContext("   ");
    const candidate = createMockCandidate("   ");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.5);
  });

  it("should handle text with only punctuation", () => {
    const original = createMockContext("!!!");
    const candidate = createMockCandidate("???");

    const score = textSimilarityFactor.score(candidate, original);

    // After normalization, both become empty
    expect(score).toBe(0.5);
  });

  it("should handle special characters", () => {
    const original = createMockContext("Submit © 2024");
    const candidate = createMockCandidate("Submit 2024");

    const score = textSimilarityFactor.score(candidate, original);

    // Should match closely after normalization
    expect(score).toBeGreaterThan(0.9);
  });

  it("should handle unicode characters", () => {
    const original = createMockContext("提交 Submit");
    const candidate = createMockCandidate("提交 Submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should handle emoji", () => {
    const original = createMockContext("Submit ✓");
    const candidate = createMockCandidate("Submit ✓");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });
});

// ============================================================================
// BEST-OF-TWO ALGORITHM TESTS
// ============================================================================

describe("textSimilarity - Best-of-Two Algorithm", () => {
  it("should use semantic similarity when better than Levenshtein", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submit Order");

    const score = textSimilarityFactor.score(candidate, original);

    // Levenshtein: 1 - 6/12 = 0.5
    // Semantic: 0.8 * (6/12) = 0.4
    // Best: 0.5
    expect(score).toBeCloseTo(0.5, 1);
  });

  it("should use Levenshtein when better than semantic", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submits");

    const score = textSimilarityFactor.score(candidate, original);

    // Levenshtein should give high score (1 char diff)
    expect(score).toBeGreaterThan(0.85);
  });

  it("should apply bonus for very high similarity", () => {
    const original = createMockContext("Submit Order");
    const candidate = createMockCandidate("Submit Orders");

    const score = textSimilarityFactor.score(candidate, original);

    // Very similar, should get bonus
    expect(score).toBeGreaterThan(0.9);
  });

  it("should not exceed 1.0 even with bonus", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submit");

    const score = textSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================================
// REAL-WORLD SCENARIOS
// ============================================================================

describe("textSimilarity - Real-World Scenarios", () => {
  it("should match button text variations", () => {
    const scenarios = [
      ["Submit", "Submit Form", 0.4], // Containment scoring
      ["Submit", "Submit Order", 0.4], // Containment scoring
      ["Next", "Next Step", 0.4], // Containment scoring
      ["Continue", "Continue to Payment", 0.3], // Longer text reduces score
      ["Sign In", "Sign In to Continue", 0.3], // Longer text reduces score
    ];

    scenarios.forEach(([original, candidate, minScore]) => {
      const originalCtx = createMockContext(original as string);
      const candidateEl = createMockCandidate(candidate as string);

      const score = textSimilarityFactor.score(candidateEl, originalCtx);

      expect(score).toBeGreaterThanOrEqual(minScore as number);
    });
  });

  it("should match with typos", () => {
    const original = createMockContext("Submit Order");
    const candidate = createMockCandidate("Submti Order"); // typo

    const score = textSimilarityFactor.score(candidate, original);

    // Should still match reasonably well (1 char swap)
    expect(score).toBeGreaterThan(0.7);
  });

  it("should match pluralization differences", () => {
    const scenarios = [
      ["Item", "Items"],
      ["Product", "Products"],
      ["Order", "Orders"],
      ["Category", "Categories"],
    ];

    scenarios.forEach(([original, candidate]) => {
      const originalCtx = createMockContext(original);
      const candidateEl = createMockCandidate(candidate);

      const score = textSimilarityFactor.score(candidateEl, originalCtx);

      expect(score).toBeGreaterThan(0.7);
    });
  });

  it("should reject completely different text", () => {
    const scenarios = [
      ["Submit", "Cancel"],
      ["Yes", "No"],
      ["Accept", "Reject"],
      ["Continue", "Go Back"],
    ];

    scenarios.forEach(([original, candidate]) => {
      const originalCtx = createMockContext(original);
      const candidateEl = createMockCandidate(candidate);

      const score = textSimilarityFactor.score(candidateEl, originalCtx);

      expect(score).toBeLessThan(0.5);
    });
  });

  it("should handle dynamic content (dates, numbers)", () => {
    const original = createMockContext("Order #12345");
    const candidate = createMockCandidate("Order #67890");

    const score = textSimilarityFactor.score(candidate, original);

    // "Order" matches, numbers differ
    expect(score).toBeGreaterThan(0.5);
  });

  it("should handle loading states", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Loading...");

    const score = textSimilarityFactor.score(candidate, original);

    // Completely different
    expect(score).toBeLessThan(0.3);
  });
});

// ============================================================================
// GET DETAILS TESTS
// ============================================================================

describe("textSimilarity - getDetails()", () => {
  it("should provide detailed comparison info", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submit Order");

    const details = textSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("Submit");
    expect(details).toContain("Submit Order");
    expect(details).toContain("Levenshtein");
    expect(details).toContain("Semantic");
  });

  it("should handle empty text in details", () => {
    const original = createMockContext("");
    const candidate = createMockCandidate("");

    const details = textSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("No text content");
  });

  it("should truncate long text in details", () => {
    const longText = "a".repeat(100);
    const original = createMockContext(longText);
    const candidate = createMockCandidate(longText);

    const details = textSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    // Details should be truncated to 30 chars
    expect(details!.length).toBeLessThan(200);
  });

  it("should show numeric scores", () => {
    const original = createMockContext("Submit");
    const candidate = createMockCandidate("Submit Order");

    const details = textSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    // Should contain numeric values (format: "0.XX")
    expect(details).toMatch(/\d\.\d{2}/);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("textSimilarity - Performance", () => {
  it("should handle 100 comparisons quickly", () => {
    const original = createMockContext("Submit Order");

    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      const candidate = createMockCandidate(`Submit Order ${i}`);
      textSimilarityFactor.score(candidate, original);
    }

    const duration = Date.now() - start;

    // 100 comparisons should complete in under 100ms
    expect(duration).toBeLessThan(100);
  });

  it("should handle very long text comparisons", () => {
    const longText1 = "Submit Order ".repeat(100);
    const longText2 = "Submit Order ".repeat(100) + "Extra";

    const original = createMockContext(longText1);
    const candidate = createMockCandidate(longText2);

    const start = Date.now();
    const score = textSimilarityFactor.score(candidate, original);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(50); // Should be fast
    expect(score).toBeGreaterThan(0.9); // Should be very similar
  });
});

// ============================================================================
// FACTOR METADATA TESTS
// ============================================================================

describe("textSimilarity - Factor Metadata", () => {
  it("should have correct name", () => {
    expect(textSimilarityFactor.name).toBe("textSimilarity");
  });

  it("should have correct weight (0.20)", () => {
    expect(textSimilarityFactor.weight).toBe(0.2);
  });

  it("should not have canVeto function (text can legitimately change)", () => {
    expect(textSimilarityFactor.canVeto).toBeUndefined();
  });

  it("should have getDetails function", () => {
    expect(textSimilarityFactor.getDetails).toBeDefined();
    expect(typeof textSimilarityFactor.getDetails).toBe("function");
  });
});
