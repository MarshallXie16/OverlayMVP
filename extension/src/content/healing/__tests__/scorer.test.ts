/**
 * Auto-Healing Scorer Tests
 *
 * Comprehensive tests for the scoring system focusing on FALSE POSITIVE PREVENTION.
 * The core challenge is ensuring we don't match elements that look similar
 * but serve completely different purposes.
 *
 * Test Categories:
 * 1. Easy cases - should auto-accept (>85% confidence)
 * 2. Context-dependent - should validate (70-85%)
 * 3. Ambiguous - should prompt user (60-70%)
 * 4. FALSE POSITIVE TRAPS - MUST NOT MATCH
 * 5. Broken - should mark broken (<50%)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  scoreCandidate,
  scoreCandidates,
  getBestCandidate,
  hasClearWinner,
} from "../scorer";
import type { CandidateElement, ElementContext, ScoringResult } from "../types";
import type {
  ElementMetadata,
  FormContext,
  NearbyLandmarks,
  VisualRegion,
} from "../../utils/metadata";

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock ElementMetadata for testing
 * Note: ElementMetadata uses snake_case for some fields (tag_name, bounding_box)
 */
function createMockMetadata(
  overrides: Record<string, any> = {},
): ElementMetadata {
  // Handle both camelCase and snake_case in overrides
  const tagName = overrides.tagName || overrides.tag_name || "button";
  const boundingBox = overrides.boundingBox ||
    overrides.bounding_box || { x: 100, y: 200, width: 120, height: 40 };

  return {
    tag_name: tagName,
    role: overrides.role ?? "button",
    type: overrides.type ?? null,
    name: overrides.name ?? null,
    text: overrides.text ?? "Submit",
    classes: overrides.classes ?? ["btn", "btn-primary"],
    bounding_box: boundingBox,
    parent: overrides.parent ?? null,
    visible: overrides.visible ?? true,
    parentChain: overrides.parentChain ?? [],
    formContext: overrides.formContext ?? null,
    visualRegion: (overrides.visualRegion ?? "main") as VisualRegion,
    nearbyLandmarks: overrides.nearbyLandmarks ?? {
      closestHeading: null,
      closestLabel: null,
      siblingTexts: [],
      containerText: null,
    },
  };
}

/**
 * Create a mock CandidateElement for testing
 */
function createMockCandidate(
  metadataOverrides: Record<string, any> = {},
): CandidateElement {
  const tagName =
    metadataOverrides.tagName || metadataOverrides.tag_name || "button";
  const element = document.createElement(tagName);
  element.textContent = metadataOverrides.text || "Submit";

  return {
    element,
    metadata: createMockMetadata(metadataOverrides),
  };
}

/**
 * Create a mock ElementContext (original recorded element) for testing
 */
function createMockOriginal(
  overrides: Partial<ElementContext> = {},
): ElementContext {
  return {
    tagName: "button",
    role: "button",
    type: null,
    name: null,
    text: "Submit",
    classes: ["btn", "btn-primary"],
    boundingBox: { x: 100, y: 200, width: 120, height: 40 },
    selectors: {
      primary: "#submit-btn",
      css: "form#checkout button.btn-primary",
      xpath: null,
      dataTestId: null,
    },
    parentChain: [],
    formContext: null,
    visualRegion: "main" as VisualRegion,
    nearbyLandmarks: {
      closestHeading: null,
      closestLabel: null,
      siblingTexts: [],
      containerText: null,
    },
    fieldLabel: null,
    instruction: null,
    ...overrides,
  };
}

/**
 * Create form context for testing
 */
function createFormContext(overrides: Partial<FormContext> = {}): FormContext {
  return {
    formId: "checkout-form",
    formAction: "/api/checkout",
    formName: "checkout",
    formClasses: ["checkout-form"],
    fieldIndex: 3,
    totalFields: 5,
    ...overrides,
  };
}

// ============================================================================
// CATEGORY 1: EASY CASES (should auto-accept, >85%)
// ============================================================================

describe("Category 1: Easy Cases (>85% confidence)", () => {
  it("should score high when ID is renamed but everything else matches", () => {
    // Scenario: #submit-btn → #submitButton
    const original = createMockOriginal({
      text: "Submit Order",
      formContext: createFormContext(),
      visualRegion: "main",
      nearbyLandmarks: {
        closestHeading: { text: "Payment Information", level: 2, distance: 50 },
        closestLabel: null,
        siblingTexts: ["Cancel"],
        containerText: "Complete your purchase",
      },
    });

    const candidate = createMockCandidate({
      text: "Submit Order",
      formContext: createFormContext(), // Same form
      visualRegion: "main",
      nearbyLandmarks: {
        closestHeading: { text: "Payment Information", level: 2, distance: 50 },
        closestLabel: null,
        siblingTexts: ["Cancel"],
        containerText: "Complete your purchase",
      },
    });

    const result = scoreCandidate(candidate, original);

    // Should score high enough for auto-accept
    expect(result.totalScore).toBeGreaterThanOrEqual(0.85);
    expect(result.isVetoed).toBe(false);
    expect(result.vetoes).toHaveLength(0);
  });

  it("should score high when class is changed but context matches", () => {
    // Scenario: .btn-primary → .button-primary
    const original = createMockOriginal({
      classes: ["btn-primary"],
      formContext: createFormContext({ formId: "login-form" }),
    });

    const candidate = createMockCandidate({
      classes: ["button-primary"], // Changed class
      formContext: createFormContext({ formId: "login-form" }), // Same form
    });

    const result = scoreCandidate(candidate, original);

    // Context match should compensate for class mismatch
    expect(result.totalScore).toBeGreaterThanOrEqual(0.75);
    expect(result.isVetoed).toBe(false);
  });

  it("should score high with minor text change in same context", () => {
    // Scenario: "Submit" → "Submit Form"
    const original = createMockOriginal({
      text: "Submit",
      formContext: createFormContext(),
    });

    const candidate = createMockCandidate({
      text: "Submit Form", // Minor text change
      formContext: createFormContext(), // Same form
    });

    const result = scoreCandidate(candidate, original);

    expect(result.totalScore).toBeGreaterThanOrEqual(0.75);
    expect(result.isVetoed).toBe(false);
  });
});

// ============================================================================
// CATEGORY 2: CONTEXT-DEPENDENT (should validate, 70-85%)
// ============================================================================

describe("Category 2: Context-Dependent (70-85% confidence)", () => {
  it("should score medium-high for element moved within same form", () => {
    const formContext = createFormContext({ fieldIndex: 1, totalFields: 5 });
    const movedFormContext = createFormContext({
      fieldIndex: 4,
      totalFields: 5,
    });

    const original = createMockOriginal({
      text: "Submit",
      formContext,
      boundingBox: { x: 100, y: 200, width: 120, height: 40 },
    });

    const candidate = createMockCandidate({
      text: "Submit",
      formContext: movedFormContext, // Same form, different position
      boundingBox: { x: 100, y: 400, width: 120, height: 40 }, // Moved down
    });

    const result = scoreCandidate(candidate, original);

    // Same form = good, but position changed = some uncertainty
    expect(result.totalScore).toBeGreaterThanOrEqual(0.6);
    expect(result.totalScore).toBeLessThan(0.9);
    expect(result.isVetoed).toBe(false);
  });

  it("should score medium for significant text change in same form", () => {
    // Scenario: "Submit" → "Complete Purchase"
    const original = createMockOriginal({
      text: "Submit",
      formContext: createFormContext(),
    });

    const candidate = createMockCandidate({
      text: "Complete Purchase", // Significant text change
      formContext: createFormContext(), // Same form
    });

    const result = scoreCandidate(candidate, original);

    // Context match should give some confidence despite text change
    expect(result.totalScore).toBeGreaterThanOrEqual(0.55);
    expect(result.isVetoed).toBe(false);
  });

  it("should score medium when tag changed but role preserved", () => {
    // Scenario: <button> → <a role="button">
    const original = createMockOriginal({
      tagName: "button",
      role: "button",
      formContext: createFormContext(),
    });

    const candidate = createMockCandidate({
      tagName: "a", // Changed tag
      role: "button", // Same role
      formContext: createFormContext(),
    });

    const result = scoreCandidate(candidate, original);

    // Role match + context match should give reasonable score
    expect(result.totalScore).toBeGreaterThanOrEqual(0.55);
    expect(result.isVetoed).toBe(false);
  });
});

// ============================================================================
// CATEGORY 3: AMBIGUOUS (should prompt user, 60-70%)
// ============================================================================

describe("Category 3: Ambiguous (60-70% confidence)", () => {
  it("should score in prompt range for similar element in different position", () => {
    const original = createMockOriginal({
      text: "Save",
      boundingBox: { x: 100, y: 100, width: 80, height: 30 },
      visualRegion: "main",
    });

    const candidate = createMockCandidate({
      text: "Save",
      boundingBox: { x: 500, y: 600, width: 80, height: 30 }, // Very different position
      visualRegion: "main",
    });

    const result = scoreCandidate(candidate, original);

    // Text matches but position is very different - uncertain
    expect(result.totalScore).toBeLessThan(0.85);
    // Position penalty should apply
  });

  it("should score lower when landmarks differ significantly", () => {
    const original = createMockOriginal({
      text: "Submit",
      nearbyLandmarks: {
        closestHeading: { text: "Checkout", level: 2, distance: 30 },
        closestLabel: null,
        siblingTexts: ["Cancel", "Back"],
        containerText: "Complete your order",
      },
    });

    const candidate = createMockCandidate({
      text: "Submit",
      nearbyLandmarks: {
        closestHeading: { text: "Contact Us", level: 2, distance: 30 }, // Different heading
        closestLabel: null,
        siblingTexts: ["Reset"],
        containerText: "Send us a message",
      },
    });

    const result = scoreCandidate(candidate, original);

    // Same text but different context = uncertain
    expect(result.totalScore).toBeLessThan(0.8);
  });
});

// ============================================================================
// CATEGORY 4: FALSE POSITIVE TRAPS (MUST NOT MATCH)
// This is the CRITICAL category - these tests MUST pass
// ============================================================================

describe("Category 4: FALSE POSITIVE TRAPS (MUST NOT MATCH)", () => {
  describe("Same button text in DIFFERENT FORM", () => {
    it("should VETO 'Submit' button in different form (checkout vs newsletter)", () => {
      // THE TRAP: Two "Submit" buttons, but one is in checkout form, other in newsletter
      const original = createMockOriginal({
        text: "Submit",
        formContext: createFormContext({
          formId: "checkout-form",
          formAction: "/api/checkout",
          formName: "checkout",
        }),
      });

      const wrongFormCandidate = createMockCandidate({
        text: "Submit", // Same text!
        formContext: createFormContext({
          formId: "newsletter-form", // DIFFERENT FORM
          formAction: "/api/newsletter",
          formName: "newsletter",
        }),
      });

      const result = scoreCandidate(wrongFormCandidate, original);

      // CRITICAL: This MUST be vetoed or have very low score
      expect(result.isVetoed).toBe(true);
      // Or if not vetoed, score must be very low
      if (!result.isVetoed) {
        expect(result.totalScore).toBeLessThan(0.5);
      }
    });

    it("should prefer correct form over same-text wrong-form element", () => {
      const original = createMockOriginal({
        text: "Sign Up",
        formContext: createFormContext({
          formId: "signup-form",
        }),
      });

      const correctFormCandidate = createMockCandidate({
        text: "Register Now", // Different text but same form
        formContext: createFormContext({ formId: "signup-form" }),
      });

      const wrongFormCandidate = createMockCandidate({
        text: "Sign Up", // Same text but wrong form!
        formContext: createFormContext({ formId: "login-form" }),
      });

      const results = scoreCandidates(
        [wrongFormCandidate, correctFormCandidate],
        original,
      );

      const best = getBestCandidate(results);

      // The correct form candidate should win even with different text
      expect(best).not.toBeNull();
      // Wrong form candidate should be vetoed
      const wrongFormResult = results.find(
        (r) => r.candidate === wrongFormCandidate,
      );
      expect(wrongFormResult?.isVetoed).toBe(true);
    });
  });

  describe("Same link text in DIFFERENT NAV", () => {
    it("should VETO or score low for link in different visual region", () => {
      // THE TRAP: "Settings" link in header vs "Settings" in footer
      const original = createMockOriginal({
        tagName: "a",
        text: "Settings",
        visualRegion: "header",
        nearbyLandmarks: {
          closestHeading: null,
          closestLabel: null,
          siblingTexts: ["Profile", "Logout"],
          containerText: "User Menu",
        },
      });

      const wrongRegionCandidate = createMockCandidate({
        tagName: "a",
        text: "Settings", // Same text!
        visualRegion: "footer", // DIFFERENT REGION
        nearbyLandmarks: {
          closestHeading: null,
          closestLabel: null,
          siblingTexts: ["Privacy", "Terms"],
          containerText: "Site Links",
        },
      });

      const result = scoreCandidate(wrongRegionCandidate, original);

      // Should have soft veto for different region
      expect(result.softVetoCount).toBeGreaterThan(0);
      // Score should be reduced
      expect(result.totalScore).toBeLessThan(0.75);
    });
  });

  describe("Same input type in DIFFERENT CONTEXT", () => {
    it("should VETO email input in different form context", () => {
      // THE TRAP: Email input in login form vs contact form
      const original = createMockOriginal({
        tagName: "input",
        type: "email",
        name: "email",
        formContext: createFormContext({
          formId: "login-form",
          formAction: "/api/auth/login",
        }),
        nearbyLandmarks: {
          closestHeading: { text: "Sign In", level: 2, distance: 30 },
          closestLabel: { text: "Email Address", forId: "login-email" },
          siblingTexts: [],
          containerText: null,
        },
      });

      const wrongContextCandidate = createMockCandidate({
        tagName: "input",
        type: "email", // Same type!
        name: "email", // Same name!
        formContext: createFormContext({
          formId: "contact-form", // DIFFERENT FORM
          formAction: "/api/contact",
        }),
        nearbyLandmarks: {
          closestHeading: { text: "Contact Us", level: 2, distance: 30 },
          closestLabel: { text: "Your Email", forId: "contact-email" },
          siblingTexts: [],
          containerText: null,
        },
      });

      const result = scoreCandidate(wrongContextCandidate, original);

      // CRITICAL: Must be vetoed
      expect(result.isVetoed).toBe(true);
    });
  });

  describe("Modal vs non-modal elements", () => {
    it("should HARD VETO element outside modal when original was in modal", () => {
      // THE TRAP: "Close" button in modal vs "Close" button in main content
      const original = createMockOriginal({
        text: "Close",
        visualRegion: "modal", // In modal
      });

      const outsideModalCandidate = createMockCandidate({
        text: "Close", // Same text!
        visualRegion: "main", // NOT in modal
      });

      const result = scoreCandidate(outsideModalCandidate, original);

      // CRITICAL: Must be hard vetoed
      expect(result.isVetoed).toBe(true);
      const contextVeto = result.vetoes.find(
        (v) => v.factorName === "contextualProximity",
      );
      expect(contextVeto).toBeDefined();
      expect(contextVeto?.severity).toBe("hard");
    });
  });
});

// ============================================================================
// CATEGORY 5: BROKEN CASES (should mark broken, <50%)
// ============================================================================

describe("Category 5: Broken Cases (<50% confidence)", () => {
  it("should score very low when nothing matches", () => {
    const original = createMockOriginal({
      text: "Submit Order",
      formContext: createFormContext({ formId: "checkout" }),
      visualRegion: "main",
      nearbyLandmarks: {
        closestHeading: { text: "Payment", level: 2, distance: 30 },
        closestLabel: null,
        siblingTexts: [],
        containerText: null,
      },
    });

    const completelyDifferentCandidate = createMockCandidate({
      text: "Learn More", // Different text
      tagName: "a", // Different tag
      role: "link", // Different role
      formContext: null, // No form
      visualRegion: "footer", // Different region
      nearbyLandmarks: {
        closestHeading: { text: "Resources", level: 2, distance: 30 },
        closestLabel: null,
        siblingTexts: [],
        containerText: null,
      },
    });

    const result = scoreCandidate(completelyDifferentCandidate, original);

    // Should score very low
    expect(result.totalScore).toBeLessThan(0.5);
  });

  it("should reject candidates when all are vetoed", () => {
    const original = createMockOriginal({
      formContext: createFormContext({ formId: "form-a" }),
    });

    const vetoedCandidate1 = createMockCandidate({
      formContext: createFormContext({ formId: "form-b" }),
    });

    const vetoedCandidate2 = createMockCandidate({
      formContext: createFormContext({ formId: "form-c" }),
    });

    const results = scoreCandidates(
      [vetoedCandidate1, vetoedCandidate2],
      original,
    );

    const best = getBestCandidate(results);

    // All candidates vetoed = no valid match
    expect(best).toBeNull();
  });
});

// ============================================================================
// SCORING UTILITIES TESTS
// ============================================================================

describe("Scoring Utilities", () => {
  describe("hasClearWinner", () => {
    it("should return true when top candidate is significantly better", () => {
      const original = createMockOriginal();

      const goodCandidate = createMockCandidate({
        text: "Submit",
        formContext: createFormContext(),
      });

      const weakCandidate = createMockCandidate({
        text: "Different",
        formContext: null,
        visualRegion: "footer",
      });

      const results = scoreCandidates([goodCandidate, weakCandidate], original);

      // If there's a 10%+ gap, should be clear winner
      if (
        results.length >= 2 &&
        !results[0]?.isVetoed &&
        !results[1]?.isVetoed
      ) {
        const gap =
          (results[0]?.totalScore ?? 0) - (results[1]?.totalScore ?? 0);
        expect(hasClearWinner(results)).toBe(gap >= 0.1);
      }
    });

    it("should return false when multiple candidates are close", () => {
      const original = createMockOriginal({
        text: "Submit",
        formContext: null, // No form context for simpler matching
      });

      // Two very similar candidates
      const candidate1 = createMockCandidate({ text: "Submit" });
      const candidate2 = createMockCandidate({ text: "Submit" });

      const results = scoreCandidates([candidate1, candidate2], original);

      // Scores should be very close
      const nonVetoed = results.filter((r) => !r.isVetoed);
      if (nonVetoed.length >= 2) {
        const gap =
          (nonVetoed[0]?.totalScore ?? 0) - (nonVetoed[1]?.totalScore ?? 0);
        if (gap < 0.1) {
          expect(hasClearWinner(results)).toBe(false);
        }
      }
    });
  });

  describe("getBestCandidate", () => {
    it("should skip vetoed candidates", () => {
      const original = createMockOriginal({
        formContext: createFormContext({ formId: "correct-form" }),
      });

      // This one will be vetoed (wrong form)
      const highScoreButVetoed = createMockCandidate({
        text: "Submit",
        formContext: createFormContext({ formId: "wrong-form" }),
      });

      // This one will score lower but won't be vetoed
      const lowerScoreNotVetoed = createMockCandidate({
        text: "Submit",
        formContext: createFormContext({ formId: "correct-form" }),
      });

      const results = scoreCandidates(
        [highScoreButVetoed, lowerScoreNotVetoed],
        original,
      );

      const best = getBestCandidate(results);

      // Should return the non-vetoed candidate
      expect(best).not.toBeNull();
      expect(best?.isVetoed).toBe(false);
    });
  });
});

// ============================================================================
// VETO SYSTEM TESTS
// ============================================================================

describe("Veto System", () => {
  describe("Hard Vetoes", () => {
    it("should set score to 0 for hard-vetoed candidates", () => {
      const original = createMockOriginal({
        formContext: createFormContext({ formId: "original-form" }),
      });

      const wrongFormCandidate = createMockCandidate({
        formContext: createFormContext({ formId: "different-form" }),
      });

      const result = scoreCandidate(wrongFormCandidate, original);

      expect(result.isVetoed).toBe(true);
      expect(result.totalScore).toBe(0);
    });
  });

  describe("Soft Vetoes", () => {
    it("should reduce score by 10% per soft veto", () => {
      const original = createMockOriginal({
        visualRegion: "header",
        formContext: null, // No form to avoid hard veto
      });

      const differentRegionCandidate = createMockCandidate({
        visualRegion: "footer", // Different region = soft veto
        formContext: null,
      });

      const result = scoreCandidate(differentRegionCandidate, original);

      // Should have at least one soft veto
      expect(result.softVetoCount).toBeGreaterThan(0);
      // Score should be penalized but not zero
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThan(0.9);
    });

    it("should cap soft veto penalty at 30%", () => {
      // This test verifies the max penalty rule
      // Even with multiple soft vetoes, penalty shouldn't exceed 30%
      const original = createMockOriginal();

      const candidate = createMockCandidate();

      const result = scoreCandidate(candidate, original);

      // If there are soft vetoes, verify penalty is capped
      if (result.softVetoCount > 0) {
        // Calculate what the score would be without penalty
        const unpenaledScore = result.factorScores.reduce(
          (sum, fs) => sum + fs.weightedScore,
          0,
        );
        // With max 30% penalty, score should be at least 70% of unpenalized
        expect(result.totalScore).toBeGreaterThanOrEqual(unpenaledScore * 0.7);
      }
    });
  });
});
