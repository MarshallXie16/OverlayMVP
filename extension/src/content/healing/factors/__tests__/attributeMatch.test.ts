/**
 * Attribute Match Factor Tests
 *
 * Tests for structural attribute matching:
 * - ID matching (stable vs generated IDs)
 * - Name attribute matching
 * - data-testid matching
 * - CSS class overlap calculation
 * - Parent chain similarity
 * - Framework-generated ID detection
 */

import { describe, it, expect } from "vitest";
import { attributeMatchFactor } from "../attributeMatch";
import type {
  CandidateElement,
  ElementContext,
  ParentChainEntry,
} from "../../types";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockContext(attrs: {
  id?: string;
  name?: string;
  testId?: string;
  classes?: string[];
  parentChain?: ParentChainEntry[];
}): ElementContext {
  return {
    tagName: "BUTTON",
    role: "button",
    type: null,
    name: attrs.name || null,
    text: "Submit",
    classes: attrs.classes || [],
    boundingBox: { x: 100, y: 200, width: 120, height: 40 },
    selectors: {
      primary: attrs.id ? `#${attrs.id}` : null,
      css: ".btn",
      xpath: null,
      dataTestId: attrs.testId || null,
    },
    parentChain: attrs.parentChain || [],
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

function createMockCandidate(attrs: {
  id?: string;
  name?: string;
  testId?: string;
  classes?: string[];
  parentChain?: ParentChainEntry[];
}): CandidateElement {
  const element = document.createElement("button");
  if (attrs.id) element.id = attrs.id;
  if (attrs.name) element.setAttribute("name", attrs.name);
  if (attrs.testId) element.setAttribute("data-testid", attrs.testId);
  if (attrs.classes) element.className = attrs.classes.join(" ");

  return {
    element,
    metadata: {
      tag_name: "BUTTON",
      role: "button",
      type: null,
      name: attrs.name || null,
      text: "Submit",
      classes: attrs.classes || [],
      bounding_box: { x: 100, y: 200, width: 120, height: 40 },
      parentChain: attrs.parentChain || [],
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
// ID MATCHING TESTS
// ============================================================================

describe("attributeMatch - ID Matching", () => {
  it("should return 1.0 for perfect ID match", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "submit-btn" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should return low score for different IDs", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "cancel-btn" });

    const score = attributeMatchFactor.score(candidate, original);

    // ID mismatch = 0.1 score for that factor
    expect(score).toBeLessThan(0.5);
  });

  it("should return neutral score when one has ID, other doesn't", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({});

    const score = attributeMatchFactor.score(candidate, original);

    // 0.3 for ID factor, other factors depend on defaults
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should handle both missing IDs", () => {
    const original = createMockContext({});
    const candidate = createMockCandidate({});

    const score = attributeMatchFactor.score(candidate, original);

    // No ID factor counted, depends on other factors
    expect(score).toBeDefined();
  });
});

// ============================================================================
// FRAMEWORK-GENERATED ID DETECTION TESTS
// ============================================================================

describe("attributeMatch - Generated ID Detection", () => {
  it("should ignore React-generated IDs (:r0:, :r1:)", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: ":r0:" });

    const score = attributeMatchFactor.score(candidate, original);

    // :r0: should be treated as "no stable ID"
    // So we get 0.3 (one has ID, other doesn't)
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should ignore React prefix IDs (react-xxx)", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "react-button-123" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should ignore Ember-generated IDs (ember-xxx)", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "ember-view-456" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should ignore Vue-generated IDs (vue-xxx)", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "vue-component-789" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should ignore hash-like IDs (8+ hex chars)", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "a1b2c3d4" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should ignore IDs with timestamps (long numbers)", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "btn-1234567890123" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });

  it("should accept stable semantic IDs", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "submit-btn" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should handle when both have generated IDs", () => {
    const original = createMockContext({ id: ":r0:" });
    const candidate = createMockCandidate({ id: ":r1:" });

    const score = attributeMatchFactor.score(candidate, original);

    // Both treated as "no stable ID", so no ID factor
    expect(score).toBeDefined();
  });
});

// ============================================================================
// NAME ATTRIBUTE TESTS
// ============================================================================

describe("attributeMatch - Name Attribute", () => {
  it("should return 1.0 for matching names", () => {
    const original = createMockContext({ name: "email" });
    const candidate = createMockCandidate({ name: "email" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should return low score for different names", () => {
    const original = createMockContext({ name: "email" });
    const candidate = createMockCandidate({ name: "password" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeLessThan(0.5);
  });

  it("should handle missing names", () => {
    const original = createMockContext({});
    const candidate = createMockCandidate({});

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeDefined();
  });

  it("should handle one having name, other not", () => {
    const original = createMockContext({ name: "email" });
    const candidate = createMockCandidate({});

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });
});

// ============================================================================
// DATA-TESTID TESTS
// ============================================================================

describe("attributeMatch - data-testid Matching", () => {
  it("should return 1.0 for matching data-testid", () => {
    const original = createMockContext({ testId: "submit-button" });
    const candidate = createMockCandidate({ testId: "submit-button" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should return low score for different data-testid", () => {
    const original = createMockContext({ testId: "submit-button" });
    const candidate = createMockCandidate({ testId: "cancel-button" });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeLessThan(0.5);
  });

  it("should handle missing data-testid", () => {
    const original = createMockContext({});
    const candidate = createMockCandidate({});

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeDefined();
  });

  it("should prioritize data-testid as strong signal", () => {
    // data-testid match should contribute strongly to score
    const original = createMockContext({
      testId: "submit-btn",
      classes: ["btn"],
    });
    const candidate = createMockCandidate({
      testId: "submit-btn",
      classes: ["different-class"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // data-testid match should outweigh class mismatch
    expect(score).toBeGreaterThan(0.7);
  });
});

// ============================================================================
// CLASS OVERLAP TESTS
// ============================================================================

describe("attributeMatch - CSS Class Overlap", () => {
  it("should return 1.0 for identical classes", () => {
    const original = createMockContext({ classes: ["btn", "btn-primary"] });
    const candidate = createMockCandidate({ classes: ["btn", "btn-primary"] });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should handle partial class overlap", () => {
    const original = createMockContext({
      classes: ["btn", "btn-primary", "large"],
    });
    const candidate = createMockCandidate({
      classes: ["btn", "btn-secondary", "large"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // 2/4 unique classes match = 0.5 base + 0.3 boost = 0.8 (capped at 1.0)
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(0.9);
  });

  it("should filter out utility classes", () => {
    const original = createMockContext({
      classes: ["btn", "m-4", "p-2", "text-white"],
    });
    const candidate = createMockCandidate({
      classes: ["btn", "m-8", "p-4", "text-black"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // Utility classes filtered out, only "btn" matters
    expect(score).toBeGreaterThan(0.8);
  });

  it("should filter out hash-like classes", () => {
    const original = createMockContext({
      classes: ["btn", "abc123", "button-component"],
    });
    const candidate = createMockCandidate({
      classes: ["btn", "def456", "button-component"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // Hash-like classes filtered out
    expect(score).toBeGreaterThan(0.8);
  });

  it("should filter out single-letter classes", () => {
    const original = createMockContext({ classes: ["a", "btn", "x"] });
    const candidate = createMockCandidate({ classes: ["b", "btn", "y"] });

    const score = attributeMatchFactor.score(candidate, original);

    // Single-letter classes filtered out, only "btn" matters
    expect(score).toBeGreaterThan(0.8);
  });

  it("should return neutral score when both have no semantic classes", () => {
    const original = createMockContext({ classes: ["m-4", "p-2"] });
    const candidate = createMockCandidate({ classes: ["m-8", "p-4"] });

    const score = attributeMatchFactor.score(candidate, original);

    // Only utility classes = neutral
    expect(score).toBeCloseTo(0.5, 1);
  });

  it("should return neutral score when both have no classes", () => {
    const original = createMockContext({ classes: [] });
    const candidate = createMockCandidate({ classes: [] });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeCloseTo(0.5, 1);
  });

  it("should penalize when one has classes, other doesn't", () => {
    const original = createMockContext({ classes: ["btn", "primary"] });
    const candidate = createMockCandidate({ classes: [] });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeLessThan(0.5);
  });

  it("should handle completely different classes", () => {
    const original = createMockContext({ classes: ["btn", "primary"] });
    const candidate = createMockCandidate({ classes: ["link", "secondary"] });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeLessThan(0.5);
  });
});

// ============================================================================
// PARENT CHAIN SIMILARITY TESTS
// ============================================================================

describe("attributeMatch - Parent Chain Similarity", () => {
  it("should return 1.0 for identical parent chains", () => {
    const chain: ParentChainEntry[] = [
      { tag: "FORM", id: "checkout-form", role: null },
      { tag: "DIV", id: "button-container", role: null },
    ];

    const original = createMockContext({ parentChain: chain });
    const candidate = createMockCandidate({ parentChain: chain });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBe(1.0);
  });

  it("should match on tag names", () => {
    const originalChain: ParentChainEntry[] = [
      { tag: "FORM", id: null, role: null },
      { tag: "DIV", id: null, role: null },
    ];

    const candidateChain: ParentChainEntry[] = [
      { tag: "FORM", id: null, role: null },
      { tag: "DIV", id: null, role: null },
    ];

    const original = createMockContext({ parentChain: originalChain });
    const candidate = createMockCandidate({ parentChain: candidateChain });

    const score = attributeMatchFactor.score(candidate, original);

    // Tag matches give 0.3 per level, 2 levels = 0.6 / 2.0 max = 0.3 base
    expect(score).toBeGreaterThan(0.5);
  });

  it("should match on stable IDs in parent chain", () => {
    const originalChain: ParentChainEntry[] = [
      { tag: "FORM", id: "checkout-form", role: null },
    ];

    const candidateChain: ParentChainEntry[] = [
      { tag: "FORM", id: "checkout-form", role: null },
    ];

    const original = createMockContext({ parentChain: originalChain });
    const candidate = createMockCandidate({ parentChain: candidateChain });

    const score = attributeMatchFactor.score(candidate, original);

    // Tag match (0.3) + ID match (0.5) = 0.8 / 1.0 max = 0.8
    expect(score).toBeGreaterThan(0.8);
  });

  it("should ignore generated IDs in parent chain", () => {
    const originalChain: ParentChainEntry[] = [
      { tag: "DIV", id: "react-view-123", role: null },
    ];

    const candidateChain: ParentChainEntry[] = [
      { tag: "DIV", id: "react-view-456", role: null },
    ];

    const original = createMockContext({ parentChain: originalChain });
    const candidate = createMockCandidate({ parentChain: candidateChain });

    const score = attributeMatchFactor.score(candidate, original);

    // Generated IDs ignored, only tag match counts
    expect(score).toBeGreaterThan(0.5);
  });

  it("should match on roles in parent chain", () => {
    const originalChain: ParentChainEntry[] = [
      { tag: "NAV", id: null, role: "navigation" },
    ];

    const candidateChain: ParentChainEntry[] = [
      { tag: "NAV", id: null, role: "navigation" },
    ];

    const original = createMockContext({ parentChain: originalChain });
    const candidate = createMockCandidate({ parentChain: candidateChain });

    const score = attributeMatchFactor.score(candidate, original);

    // Tag (0.3) + role (0.2) = 0.5 / 1.0 max = 0.5
    expect(score).toBeGreaterThan(0.6);
  });

  it("should handle different parent chain lengths", () => {
    const originalChain: ParentChainEntry[] = [
      { tag: "FORM", id: "form", role: null },
      { tag: "DIV", id: null, role: null },
    ];

    const candidateChain: ParentChainEntry[] = [
      { tag: "FORM", id: "form", role: null },
    ];

    const original = createMockContext({ parentChain: originalChain });
    const candidate = createMockCandidate({ parentChain: candidateChain });

    const score = attributeMatchFactor.score(candidate, original);

    // Should only compare first level (min length)
    expect(score).toBeGreaterThan(0.7);
  });

  it("should handle empty parent chains", () => {
    const original = createMockContext({ parentChain: [] });
    const candidate = createMockCandidate({ parentChain: [] });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeCloseTo(0.5, 1);
  });

  it("should handle one empty parent chain", () => {
    const chain: ParentChainEntry[] = [{ tag: "FORM", id: "form", role: null }];

    const original = createMockContext({ parentChain: chain });
    const candidate = createMockCandidate({ parentChain: [] });

    const score = attributeMatchFactor.score(candidate, original);

    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.6);
  });
});

// ============================================================================
// COMBINED FACTORS TESTS
// ============================================================================

describe("attributeMatch - Combined Factors", () => {
  it("should average all present factors", () => {
    const original = createMockContext({
      id: "submit-btn",
      name: "submit",
      testId: "submit-button",
      classes: ["btn", "primary"],
    });

    const candidate = createMockCandidate({
      id: "submit-btn",
      name: "submit",
      testId: "submit-button",
      classes: ["btn", "primary"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // All factors match perfectly
    expect(score).toBe(1.0);
  });

  it("should weight all factors equally in average", () => {
    // Test with mix of matching and non-matching factors
    const original = createMockContext({
      id: "submit-btn", // Match (1.0)
      name: "submit", // Match (1.0)
      testId: "submit", // Mismatch (0.1)
      classes: ["btn"], // Match (1.0)
    });

    const candidate = createMockCandidate({
      id: "submit-btn",
      name: "submit",
      testId: "different",
      classes: ["btn"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // ID(1.0) + Name(1.0) + TestId(0.1) + Class(~0.8) + ParentChain(~0.5) = ~3.4 / 5 = 0.68
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(0.8);
  });

  it("should handle all factors missing", () => {
    const original = createMockContext({});
    const candidate = createMockCandidate({});

    const score = attributeMatchFactor.score(candidate, original);

    // Only class and parent chain factors (both neutral)
    expect(score).toBeCloseTo(0.5, 1);
  });
});

// ============================================================================
// GET DETAILS TESTS
// ============================================================================

describe("attributeMatch - getDetails()", () => {
  it("should show ID comparison when present", () => {
    const original = createMockContext({ id: "submit-btn" });
    const candidate = createMockCandidate({ id: "submit-btn" });

    const details = attributeMatchFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("ID:");
    expect(details).toContain("submit-btn");
  });

  it("should show name comparison when present", () => {
    const original = createMockContext({ name: "email" });
    const candidate = createMockCandidate({ name: "email" });

    const details = attributeMatchFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("Name:");
    expect(details).toContain("email");
  });

  it("should show class overlap info", () => {
    const original = createMockContext({ classes: ["btn", "primary"] });
    const candidate = createMockCandidate({ classes: ["btn", "secondary"] });

    const details = attributeMatchFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("Classes:");
    expect(details).toContain("matching");
  });

  it("should show parent chain similarity", () => {
    const chain: ParentChainEntry[] = [{ tag: "FORM", id: "form", role: null }];

    const original = createMockContext({ parentChain: chain });
    const candidate = createMockCandidate({ parentChain: chain });

    const details = attributeMatchFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("Parent chain:");
  });

  it("should handle missing attributes in details", () => {
    const original = createMockContext({});
    const candidate = createMockCandidate({});

    const details = attributeMatchFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    // Should still show parent chain at minimum
    expect(details).toContain("Parent chain:");
  });

  it("should use pipe separator between sections", () => {
    const original = createMockContext({
      id: "btn",
      name: "submit",
      classes: ["btn"],
    });
    const candidate = createMockCandidate({
      id: "btn",
      name: "submit",
      classes: ["btn"],
    });

    const details = attributeMatchFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("|");
  });
});

// ============================================================================
// REAL-WORLD SCENARIOS
// ============================================================================

describe("attributeMatch - Real-World Scenarios", () => {
  it("should match form inputs by name", () => {
    const original = createMockContext({
      name: "email",
      classes: ["form-control"],
    });
    const candidate = createMockCandidate({
      name: "email",
      classes: ["form-input"], // Different class
    });

    const score = attributeMatchFactor.score(candidate, original);

    // Name match should dominate
    expect(score).toBeGreaterThan(0.7);
  });

  it("should match test-aware applications by data-testid", () => {
    const original = createMockContext({
      testId: "checkout-submit-btn",
      classes: ["btn", "btn-xl-primary"],
    });
    const candidate = createMockCandidate({
      testId: "checkout-submit-btn",
      classes: ["btn", "btn-lg-primary"], // Class changed
    });

    const score = attributeMatchFactor.score(candidate, original);

    // data-testid match is strong
    expect(score).toBeGreaterThan(0.8);
  });

  it("should handle CSS framework class churn", () => {
    const original = createMockContext({
      id: "submit",
      classes: ["btn", "btn-primary", "btn-lg", "px-4", "py-2"],
    });
    const candidate = createMockCandidate({
      id: "submit",
      classes: ["btn", "btn-primary", "btn-md", "px-6", "py-3"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // ID match + semantic class overlap (btn, btn-primary)
    // Utility classes filtered out
    expect(score).toBeGreaterThan(0.8);
  });

  it("should reject when ID changed", () => {
    const original = createMockContext({
      id: "submit-btn",
      classes: ["btn"],
    });
    const candidate = createMockCandidate({
      id: "cancel-btn",
      classes: ["btn"],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // Different stable IDs = bad sign
    expect(score).toBeLessThan(0.5);
  });

  it("should handle dynamic ID generation gracefully", () => {
    const original = createMockContext({
      classes: ["submit-button", "primary"],
      parentChain: [{ tag: "FORM", id: "checkout-form", role: null }],
    });
    const candidate = createMockCandidate({
      id: ":r0:", // Generated ID
      classes: ["submit-button", "primary"],
      parentChain: [{ tag: "FORM", id: "checkout-form", role: null }],
    });

    const score = attributeMatchFactor.score(candidate, original);

    // Should match on classes and parent chain
    expect(score).toBeGreaterThan(0.8);
  });
});

// ============================================================================
// FACTOR METADATA TESTS
// ============================================================================

describe("attributeMatch - Factor Metadata", () => {
  it("should have correct name", () => {
    expect(attributeMatchFactor.name).toBe("attributeMatch");
  });

  it("should have correct weight (0.15)", () => {
    expect(attributeMatchFactor.weight).toBe(0.15);
  });

  it("should not have canVeto function", () => {
    expect(attributeMatchFactor.canVeto).toBeUndefined();
  });

  it("should have getDetails function", () => {
    expect(attributeMatchFactor.getDetails).toBeDefined();
    expect(typeof attributeMatchFactor.getDetails).toBe("function");
  });
});
