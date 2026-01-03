/**
 * Position Similarity Factor Tests
 *
 * Tests for position-based matching:
 * - Center-to-center distance calculation
 * - Size similarity scoring
 * - Position score tiers (exact, close, medium, far)
 * - Soft veto for large movements
 * - Handling of zero-size/hidden elements
 * - Off-screen and viewport edge cases
 */

import { describe, it, expect } from "vitest";
import { positionSimilarityFactor } from "../positionSimilarity";
import type { CandidateElement, ElementContext } from "../../types";
import { VETO_CONFIG } from "../../config";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockContext(
  x: number,
  y: number,
  width: number,
  height: number,
): ElementContext {
  return {
    tagName: "BUTTON",
    role: "button",
    type: null,
    name: null,
    text: "Submit",
    classes: ["btn"],
    boundingBox: { x, y, width, height },
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

function createMockCandidate(
  x: number,
  y: number,
  width: number,
  height: number,
): CandidateElement {
  const element = document.createElement("button");
  element.textContent = "Submit";

  // Mock getBoundingClientRect
  element.getBoundingClientRect = () => ({
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    bottom: y + height,
    right: x + width,
    toJSON: () => ({}),
  });

  return {
    element,
    metadata: {
      tag_name: "BUTTON",
      role: "button",
      type: null,
      name: null,
      text: "Submit",
      classes: ["btn"],
      bounding_box: { x, y, width, height },
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

// ============================================================================
// EXACT POSITION TESTS
// ============================================================================

describe("positionSimilarity - Exact Position", () => {
  it("should return 1.0 for identical position and size", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 120, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should return high score for same position, slightly different size", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 125, 42);

    const score = positionSimilarityFactor.score(candidate, original);

    // Position perfect (1.0), size very similar (~0.95)
    // Combined: 1.0 * 0.7 + 0.95 * 0.3 = 0.985
    expect(score).toBeGreaterThan(0.95);
  });
});

// ============================================================================
// DISTANCE TIERS TESTS
// ============================================================================

describe("positionSimilarity - Distance Tiers", () => {
  it("should return 0.9 for distance < 50px", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(130, 220, 120, 40); // ~36px distance

    const score = positionSimilarityFactor.score(candidate, original);

    // Position score 0.9, size perfect (1.0)
    // Combined: 0.9 * 0.7 + 1.0 * 0.3 = 0.93
    expect(score).toBeCloseTo(0.93, 2);
  });

  it("should return 0.8 for distance 50-100px", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(150, 250, 120, 40); // ~71px distance

    const score = positionSimilarityFactor.score(candidate, original);

    // Position score 0.8, size perfect (1.0)
    // Combined: 0.8 * 0.7 + 1.0 * 0.3 = 0.86
    expect(score).toBeCloseTo(0.86, 2);
  });

  it("should return 0.6 for distance 100-200px", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(200, 300, 120, 40); // ~141px distance

    const score = positionSimilarityFactor.score(candidate, original);

    // Position score 0.6, size perfect (1.0)
    // Combined: 0.6 * 0.7 + 1.0 * 0.3 = 0.72
    expect(score).toBeCloseTo(0.72, 2);
  });

  it("should decay linearly for distance 200-500px", () => {
    const original = createMockContext(100, 200, 120, 40);

    // Test multiple points in the decay range
    const distances = [250, 300, 350, 400, 450];

    let previousScore = 1.0;
    distances.forEach((targetDistance) => {
      // Calculate position to achieve target distance
      const offsetX = Math.sqrt(targetDistance ** 2 / 2);
      const candidate = createMockCandidate(
        100 + offsetX,
        200 + offsetX,
        120,
        40,
      );

      const score = positionSimilarityFactor.score(candidate, original);

      // Score should decrease as distance increases
      expect(score).toBeLessThan(previousScore);
      previousScore = score;
    });
  });

  it("should return 0 for distance >= 500px", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(600, 200, 120, 40); // 500px distance

    const score = positionSimilarityFactor.score(candidate, original);

    // Position score 0, size perfect (1.0)
    // Combined: 0 * 0.7 + 1.0 * 0.3 = 0.30
    expect(score).toBeCloseTo(0.3, 2);
  });
});

// ============================================================================
// SIZE SIMILARITY TESTS
// ============================================================================

describe("positionSimilarity - Size Similarity", () => {
  it("should return 1.0 for identical sizes", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 120, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should handle different widths", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 60, 40); // Half width

    const score = positionSimilarityFactor.score(candidate, original);

    // Size similarity: (60/120 + 40/40) / 2 = 0.75
    // Position perfect (1.0)
    // Combined: 1.0 * 0.7 + 0.75 * 0.3 = 0.925
    expect(score).toBeCloseTo(0.925, 2);
  });

  it("should handle different heights", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 120, 80); // Double height

    const score = positionSimilarityFactor.score(candidate, original);

    // Size similarity: (120/120 + 40/80) / 2 = 0.75
    // Position perfect (1.0)
    // Combined: 1.0 * 0.7 + 0.75 * 0.3 = 0.925
    expect(score).toBeCloseTo(0.925, 2);
  });

  it("should handle both dimensions different", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 60, 20); // Half size

    const score = positionSimilarityFactor.score(candidate, original);

    // Size similarity: (60/120 + 20/40) / 2 = 0.5
    // Position perfect (1.0)
    // Combined: 1.0 * 0.7 + 0.5 * 0.3 = 0.85
    expect(score).toBeCloseTo(0.85, 2);
  });

  it("should use min/max ratio correctly", () => {
    const original = createMockContext(100, 200, 100, 100);
    const candidate = createMockCandidate(100, 200, 200, 50);

    const score = positionSimilarityFactor.score(candidate, original);

    // Width ratio: 100/200 = 0.5
    // Height ratio: 50/100 = 0.5
    // Size similarity: (0.5 + 0.5) / 2 = 0.5
    // Position perfect (1.0)
    // Combined: 1.0 * 0.7 + 0.5 * 0.3 = 0.85
    expect(score).toBeCloseTo(0.85, 2);
  });
});

// ============================================================================
// COMBINED POSITION AND SIZE TESTS
// ============================================================================

describe("positionSimilarity - Combined Position and Size", () => {
  it("should combine position and size with 70/30 weighting", () => {
    const original = createMockContext(100, 200, 120, 40);
    // 50px distance = 0.9 position score, half size = 0.5 size score
    const candidate = createMockCandidate(130, 220, 60, 20);

    const score = positionSimilarityFactor.score(candidate, original);

    // Expected: 0.9 * 0.7 + 0.5 * 0.3 = 0.63 + 0.15 = 0.78
    expect(score).toBeCloseTo(0.78, 2);
  });

  it("should prioritize position over size", () => {
    const original = createMockContext(100, 200, 120, 40);

    // Good position, bad size
    const candidate1 = createMockCandidate(120, 220, 60, 20);
    const score1 = positionSimilarityFactor.score(candidate1, original);

    // Bad position, good size
    const candidate2 = createMockCandidate(300, 400, 120, 40);
    const score2 = positionSimilarityFactor.score(candidate2, original);

    // Good position should score higher
    expect(score1).toBeGreaterThan(score2);
  });
});

// ============================================================================
// ZERO-SIZE ELEMENT TESTS
// ============================================================================

describe("positionSimilarity - Zero-Size Elements", () => {
  it("should return 0.3 (uncertain) when original has zero width", () => {
    const original = createMockContext(100, 200, 0, 40);
    const candidate = createMockCandidate(100, 200, 120, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.3);
  });

  it("should return 0.3 when original has zero height", () => {
    const original = createMockContext(100, 200, 120, 0);
    const candidate = createMockCandidate(100, 200, 120, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.3);
  });

  it("should return 0.3 when candidate has zero width", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 0, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.3);
  });

  it("should return 0.3 when candidate has zero height", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 120, 0);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.3);
  });

  it("should return 0.3 when both are zero-size", () => {
    const original = createMockContext(100, 200, 0, 0);
    const candidate = createMockCandidate(100, 200, 0, 0);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(0.3);
  });
});

// ============================================================================
// VETO TESTS
// ============================================================================

describe("positionSimilarity - Soft Veto", () => {
  it("should soft veto when distance > threshold (300px)", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(400, 200, 120, 40); // 300px distance

    const veto = positionSimilarityFactor.canVeto?.(candidate, original);

    expect(veto).not.toBeNull();
    expect(veto?.factorName).toBe("positionSimilarity");
    expect(veto?.severity).toBe("soft");
    expect(veto?.reason).toContain("300");
    expect(veto?.reason).toContain(
      VETO_CONFIG.position.softVetoDistanceThreshold.toString(),
    );
  });

  it("should not veto when distance <= threshold", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(300, 200, 120, 40); // ~200px distance

    const veto = positionSimilarityFactor.canVeto?.(candidate, original);

    expect(veto).toBeNull();
  });

  it("should not veto when original is zero-size", () => {
    const original = createMockContext(100, 200, 0, 0);
    const candidate = createMockCandidate(500, 500, 120, 40);

    const veto = positionSimilarityFactor.canVeto?.(candidate, original);

    expect(veto).toBeNull();
  });

  it("should not veto when candidate is zero-size", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(500, 500, 0, 0);

    const veto = positionSimilarityFactor.canVeto?.(candidate, original);

    expect(veto).toBeNull();
  });

  it("should calculate distance correctly for diagonal movement", () => {
    const original = createMockContext(100, 200, 120, 40);
    // Move 212px right and 212px down = ~300px diagonal
    const candidate = createMockCandidate(312, 412, 120, 40);

    const veto = positionSimilarityFactor.canVeto?.(candidate, original);

    // Should be just at or slightly over threshold
    expect(veto).not.toBeNull();
  });
});

// ============================================================================
// OFF-SCREEN AND VIEWPORT TESTS
// ============================================================================

describe("positionSimilarity - Off-Screen Elements", () => {
  it("should handle negative positions", () => {
    const original = createMockContext(-50, -100, 120, 40);
    const candidate = createMockCandidate(-50, -100, 120, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should handle very large positions", () => {
    const original = createMockContext(10000, 5000, 120, 40);
    const candidate = createMockCandidate(10000, 5000, 120, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should handle elements moved from off-screen to on-screen", () => {
    const original = createMockContext(-200, 100, 120, 40);
    const candidate = createMockCandidate(100, 100, 120, 40); // 300px right

    const score = positionSimilarityFactor.score(candidate, original);

    // 300px distance should trigger soft veto and low score
    expect(score).toBeLessThan(0.5);
  });
});

// ============================================================================
// GET DETAILS TESTS
// ============================================================================

describe("positionSimilarity - getDetails()", () => {
  it("should provide detailed position and distance info", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(150, 250, 120, 40);

    const details = positionSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("Position:");
    expect(details).toContain("Distance:");
    expect(details).toContain("Size sim:");
  });

  it("should show center coordinates", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(150, 250, 120, 40);

    const details = positionSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    // Original center: (160, 220), Candidate center: (210, 270)
    expect(details).toContain("160"); // original x center
    expect(details).toContain("220"); // original y center
    expect(details).toContain("210"); // candidate x center
    expect(details).toContain("270"); // candidate y center
  });

  it("should round coordinates and distance", () => {
    const original = createMockContext(100.7, 200.3, 120, 40);
    const candidate = createMockCandidate(150.2, 250.8, 120, 40);

    const details = positionSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    // Should contain rounded numbers
    expect(details).toMatch(/\d+/); // Contains integers
    expect(details).not.toContain(".7"); // Not showing decimals
  });

  it("should show size similarity ratio", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 60, 20);

    const details = positionSimilarityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("0.50"); // Size similarity = 0.5
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("positionSimilarity - Edge Cases", () => {
  it("should handle elements with same center but different sizes", () => {
    const original = createMockContext(100, 200, 120, 40);
    // Different size but adjusted position to keep same center
    const candidate = createMockCandidate(70, 180, 180, 80);

    const score = positionSimilarityFactor.score(candidate, original);

    // Perfect position (same center), but different size
    // Size sim: (120/180 + 40/80) / 2 = (0.667 + 0.5) / 2 = 0.583
    // Combined: 1.0 * 0.7 + 0.583 * 0.3 = 0.875
    expect(score).toBeCloseTo(0.875, 2);
  });

  it("should handle fractional coordinates", () => {
    const original = createMockContext(100.5, 200.7, 120.3, 40.1);
    const candidate = createMockCandidate(100.5, 200.7, 120.3, 40.1);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should clamp score to [0, 1] range", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 120, 40);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("should handle very small elements (1x1)", () => {
    const original = createMockContext(100, 200, 1, 1);
    const candidate = createMockCandidate(100, 200, 1, 1);

    const score = positionSimilarityFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });
});

// ============================================================================
// REAL-WORLD SCENARIOS
// ============================================================================

describe("positionSimilarity - Real-World Scenarios", () => {
  it("should handle modal dialogs (centered, similar position)", () => {
    const original = createMockContext(400, 300, 200, 100);
    const candidate = createMockCandidate(410, 310, 200, 100);

    const score = positionSimilarityFactor.score(candidate, original);

    // Small movement (~14px), should score high
    expect(score).toBeGreaterThan(0.9);
  });

  it("should handle responsive layout changes (element moved)", () => {
    const original = createMockContext(100, 200, 120, 40);
    const candidate = createMockCandidate(100, 400, 120, 40); // Moved down 200px

    const score = positionSimilarityFactor.score(candidate, original);

    // 200px vertical movement
    expect(score).toBeCloseTo(0.72, 2); // Position 0.6, size 1.0
  });

  it("should handle sidebar collapse (horizontal movement)", () => {
    const original = createMockContext(300, 200, 120, 40);
    const candidate = createMockCandidate(100, 200, 120, 40); // Moved left 200px

    const score = positionSimilarityFactor.score(candidate, original);

    // 200px horizontal movement
    expect(score).toBeCloseTo(0.72, 2);
  });

  it("should reject elements that moved very far", () => {
    const original = createMockContext(100, 100, 120, 40);
    const candidate = createMockCandidate(600, 600, 120, 40); // Moved ~707px

    const score = positionSimilarityFactor.score(candidate, original);

    // Beyond max distance (500px)
    expect(score).toBeLessThan(0.5);
  });
});

// ============================================================================
// FACTOR METADATA TESTS
// ============================================================================

describe("positionSimilarity - Factor Metadata", () => {
  it("should have correct name", () => {
    expect(positionSimilarityFactor.name).toBe("positionSimilarity");
  });

  it("should have correct weight (0.15)", () => {
    expect(positionSimilarityFactor.weight).toBe(0.15);
  });

  it("should have canVeto function", () => {
    expect(positionSimilarityFactor.canVeto).toBeDefined();
    expect(typeof positionSimilarityFactor.canVeto).toBe("function");
  });

  it("should have getDetails function", () => {
    expect(positionSimilarityFactor.getDetails).toBeDefined();
    expect(typeof positionSimilarityFactor.getDetails).toBe("function");
  });
});
