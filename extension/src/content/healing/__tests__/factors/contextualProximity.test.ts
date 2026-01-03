/**
 * Contextual Proximity Factor Tests
 *
 * THE MOST CRITICAL FACTOR for false positive prevention.
 * Weight: 0.35 (highest of all factors)
 *
 * This factor validates that a candidate element is in the SAME CONTEXT
 * as the original element. Without this, we'd match any button with
 * similar text regardless of where it appears on the page.
 */

import { describe, it, expect } from "vitest";
import { contextualProximityFactor } from "../../factors/contextualProximity";
import type { CandidateElement, ElementContext } from "../../types";
import type {
  FormContext,
  VisualRegion,
  ElementMetadata,
} from "../../../utils/metadata";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createFormContext(overrides: Partial<FormContext> = {}): FormContext {
  return {
    formId: "test-form",
    formAction: "/api/submit",
    formName: "test",
    formClasses: ["form-class"],
    fieldIndex: 0,
    totalFields: 3,
    ...overrides,
  };
}

function createMetadata(overrides: Record<string, any> = {}): ElementMetadata {
  return {
    tag_name: overrides.tagName || overrides.tag_name || "button",
    role: overrides.role ?? "button",
    type: overrides.type ?? null,
    name: overrides.name ?? null,
    text: overrides.text ?? "Submit",
    classes: overrides.classes ?? [],
    bounding_box: overrides.boundingBox ||
      overrides.bounding_box || { x: 100, y: 200, width: 100, height: 40 },
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

function createCandidate(
  metadataOverrides: Record<string, any> = {},
): CandidateElement {
  return {
    element: document.createElement("button"),
    metadata: createMetadata(metadataOverrides),
  };
}

function createOriginal(
  overrides: Partial<ElementContext> = {},
): ElementContext {
  return {
    tagName: "button",
    role: "button",
    type: null,
    name: null,
    text: "Submit",
    classes: [],
    boundingBox: { x: 100, y: 200, width: 100, height: 40 },
    selectors: { primary: null, css: null, xpath: null, dataTestId: null },
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

// ============================================================================
// FORM CONTEXT TESTS - Most Critical for False Positive Prevention
// ============================================================================

describe("Form Context Matching", () => {
  describe("Same Form Detection", () => {
    it("should score 1.0 for elements in same form by ID", () => {
      const original = createOriginal({
        formContext: createFormContext({ formId: "checkout-form" }),
      });

      const candidate = createCandidate({
        formContext: createFormContext({ formId: "checkout-form" }),
      });

      const score = contextualProximityFactor.score(candidate, original);

      // Form match is 50% of factor score, so perfect form match = 0.5
      // Plus region and landmark scores
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    it("should score 0.9 for elements in same form by name", () => {
      const original = createOriginal({
        formContext: createFormContext({
          formId: null,
          formName: "checkout",
        }),
      });

      const candidate = createCandidate({
        formContext: createFormContext({
          formId: null,
          formName: "checkout",
        }),
      });

      const score = contextualProximityFactor.score(candidate, original);
      expect(score).toBeGreaterThanOrEqual(0.45); // ~0.9 * 0.5 = 0.45 from form match
    });

    it("should score 0.85 for elements in same form by action URL", () => {
      const original = createOriginal({
        formContext: createFormContext({
          formId: null,
          formName: null,
          formAction: "/api/checkout",
        }),
      });

      const candidate = createCandidate({
        formContext: createFormContext({
          formId: null,
          formName: null,
          formAction: "/api/checkout",
        }),
      });

      const score = contextualProximityFactor.score(candidate, original);
      expect(score).toBeGreaterThanOrEqual(0.4); // ~0.85 * 0.5 = 0.425 from form match
    });
  });

  describe("Different Form Detection - CRITICAL", () => {
    it("should score 0 and VETO for element in different form by ID", () => {
      const original = createOriginal({
        formContext: createFormContext({ formId: "checkout-form" }),
      });

      const candidate = createCandidate({
        formContext: createFormContext({ formId: "newsletter-form" }), // DIFFERENT!
      });

      // Check veto
      const veto = contextualProximityFactor.canVeto?.(candidate, original);
      expect(veto).not.toBeNull();
      expect(veto?.severity).toBe("hard");

      // Score should reflect the mismatch
      const score = contextualProximityFactor.score(candidate, original);
      expect(score).toBeLessThan(0.4); // Form mismatch = 0 from form component
    });

    it("should HARD VETO when original has formId and candidate has different formId", () => {
      const original = createOriginal({
        formContext: createFormContext({ formId: "form-a" }),
      });

      const candidate = createCandidate({
        formContext: createFormContext({ formId: "form-b" }),
      });

      const veto = contextualProximityFactor.canVeto?.(candidate, original);

      expect(veto).not.toBeNull();
      expect(veto?.severity).toBe("hard");
      expect(veto?.reason).toContain("different form");
    });

    it("should HARD VETO when original has formId and candidate has no form", () => {
      const original = createOriginal({
        formContext: createFormContext({ formId: "checkout-form" }),
      });

      const candidate = createCandidate({
        formContext: null, // NOT in any form
      });

      const veto = contextualProximityFactor.canVeto?.(candidate, original);

      expect(veto).not.toBeNull();
      expect(veto?.severity).toBe("hard");
    });
  });

  describe("Edge Cases", () => {
    it("should score neutral (0.5) when neither element is in a form", () => {
      const original = createOriginal({ formContext: null });
      const candidate = createCandidate({ formContext: null });

      const score = contextualProximityFactor.score(candidate, original);
      // With no form context, form component contributes 0.5 * 0.5 = 0.25
      expect(score).toBeGreaterThanOrEqual(0.25);
    });

    it("should score low when original not in form but candidate is", () => {
      const original = createOriginal({ formContext: null });
      const candidate = createCandidate({
        formContext: createFormContext({ formId: "some-form" }),
      });

      const score = contextualProximityFactor.score(candidate, original);
      // Candidate in form when original wasn't = suspicious = 0.2 * 0.5 = 0.1
      expect(score).toBeLessThan(0.5);
    });
  });
});

// ============================================================================
// VISUAL REGION TESTS
// ============================================================================

describe("Visual Region Matching", () => {
  describe("Same Region Detection", () => {
    it("should score high for elements in same visual region", () => {
      const original = createOriginal({ visualRegion: "main" });
      const candidate = createCandidate({ visualRegion: "main" });

      const score = contextualProximityFactor.score(candidate, original);
      // Region is 20% of factor score, so same region = 0.2
      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it("should score neutral for unknown regions", () => {
      const original = createOriginal({ visualRegion: "unknown" });
      const candidate = createCandidate({ visualRegion: "unknown" });

      // Should not veto for unknown regions
      const veto = contextualProximityFactor.canVeto?.(candidate, original);
      expect(veto).toBeNull();
    });
  });

  describe("Different Region Detection", () => {
    it("should SOFT VETO for elements in different regions", () => {
      const original = createOriginal({ visualRegion: "header" });
      const candidate = createCandidate({ visualRegion: "footer" }); // DIFFERENT!

      const veto = contextualProximityFactor.canVeto?.(candidate, original);

      expect(veto).not.toBeNull();
      expect(veto?.severity).toBe("soft"); // Soft veto, not hard
    });

    it("should score low for header vs footer mismatch", () => {
      const original = createOriginal({ visualRegion: "header" });
      const candidate = createCandidate({ visualRegion: "footer" });

      const score = contextualProximityFactor.score(candidate, original);
      // Different region = 0.1 * 0.2 = 0.02 from region component
      expect(score).toBeLessThan(0.5);
    });
  });

  describe("Modal Context - CRITICAL", () => {
    it("should HARD VETO when original in modal but candidate is not", () => {
      const original = createOriginal({ visualRegion: "modal" });
      const candidate = createCandidate({ visualRegion: "main" }); // NOT in modal!

      const veto = contextualProximityFactor.canVeto?.(candidate, original);

      expect(veto).not.toBeNull();
      expect(veto?.severity).toBe("hard"); // Hard veto for modal mismatch!
      expect(veto?.reason).toContain("modal");
    });

    it("should score low for region component when modal mismatch", () => {
      const original = createOriginal({ visualRegion: "modal" });
      const candidate = createCandidate({ visualRegion: "main" });

      const score = contextualProximityFactor.score(candidate, original);
      // Modal to non-modal = 0 for region component (20% of factor)
      // Total score = form(0.5*0.5) + region(0*0.2) + landmarks(0.5*0.3) = 0.4
      expect(score).toBeLessThanOrEqual(0.4);
    });

    it("should not veto when candidate is also in modal", () => {
      const original = createOriginal({ visualRegion: "modal" });
      const candidate = createCandidate({ visualRegion: "modal" }); // Also in modal

      const veto = contextualProximityFactor.canVeto?.(candidate, original);
      // Should not have modal veto since both are in modal
      const modalVeto = veto?.reason?.includes("modal");
      expect(modalVeto).toBeFalsy();
    });
  });
});

// ============================================================================
// LANDMARK MATCHING TESTS
// ============================================================================

describe("Landmark Matching", () => {
  describe("Heading Matching", () => {
    it("should score 1.0 for exact heading match", () => {
      const original = createOriginal({
        nearbyLandmarks: {
          closestHeading: {
            text: "Payment Information",
            level: 2,
            distance: 30,
          },
          closestLabel: null,
          siblingTexts: [],
          containerText: null,
        },
      });

      const candidate = createCandidate({
        nearbyLandmarks: {
          closestHeading: {
            text: "Payment Information",
            level: 2,
            distance: 30,
          },
          closestLabel: null,
          siblingTexts: [],
          containerText: null,
        },
      });

      const score = contextualProximityFactor.score(candidate, original);
      // Landmarks are 30% of factor score
      expect(score).toBeGreaterThanOrEqual(0.3);
    });

    it("should score 0.7 for partial heading match", () => {
      const original = createOriginal({
        nearbyLandmarks: {
          closestHeading: {
            text: "Payment Information",
            level: 2,
            distance: 30,
          },
          closestLabel: null,
          siblingTexts: [],
          containerText: null,
        },
      });

      const candidate = createCandidate({
        nearbyLandmarks: {
          closestHeading: { text: "Payment", level: 2, distance: 30 }, // Partial match
          closestLabel: null,
          siblingTexts: [],
          containerText: null,
        },
      });

      const score = contextualProximityFactor.score(candidate, original);
      // Partial heading match = 0.7, so landmarks contribute ~0.7 * 0.3 = 0.21
      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    it("should score 0 for completely different headings", () => {
      const original = createOriginal({
        nearbyLandmarks: {
          closestHeading: { text: "Checkout", level: 2, distance: 30 },
          closestLabel: null,
          siblingTexts: [],
          containerText: null,
        },
      });

      const candidate = createCandidate({
        nearbyLandmarks: {
          closestHeading: { text: "Newsletter", level: 2, distance: 30 }, // Different!
          closestLabel: null,
          siblingTexts: [],
          containerText: null,
        },
      });

      const score = contextualProximityFactor.score(candidate, original);
      // Different heading = 0 from heading comparison
      expect(score).toBeLessThan(0.5);
    });
  });

  describe("Label Matching", () => {
    it("should score high for matching labels", () => {
      const original = createOriginal({
        nearbyLandmarks: {
          closestHeading: null,
          closestLabel: { text: "Email Address", forId: "email-input" },
          siblingTexts: [],
          containerText: null,
        },
      });

      const candidate = createCandidate({
        nearbyLandmarks: {
          closestHeading: null,
          closestLabel: { text: "Email Address", forId: "email-input" },
          siblingTexts: [],
          containerText: null,
        },
      });

      const score = contextualProximityFactor.score(candidate, original);
      expect(score).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe("Sibling Text Matching", () => {
    it("should score higher when siblings match", () => {
      const original = createOriginal({
        nearbyLandmarks: {
          closestHeading: null,
          closestLabel: null,
          siblingTexts: ["Cancel", "Back", "Next"],
          containerText: null,
        },
      });

      const candidateWithMatchingSiblings = createCandidate({
        nearbyLandmarks: {
          closestHeading: null,
          closestLabel: null,
          siblingTexts: ["Cancel", "Back", "Next"], // Same siblings
          containerText: null,
        },
      });

      const candidateWithDifferentSiblings = createCandidate({
        nearbyLandmarks: {
          closestHeading: null,
          closestLabel: null,
          siblingTexts: ["Save", "Delete", "Edit"], // Different siblings
          containerText: null,
        },
      });

      const scoreMatching = contextualProximityFactor.score(
        candidateWithMatchingSiblings,
        original,
      );
      const scoreDifferent = contextualProximityFactor.score(
        candidateWithDifferentSiblings,
        original,
      );

      expect(scoreMatching).toBeGreaterThan(scoreDifferent);
    });
  });
});

// ============================================================================
// COMBINED CONTEXT TESTS - Real-World Scenarios
// ============================================================================

describe("Combined Context Scenarios", () => {
  it("should score very high when form, region, and landmarks all match", () => {
    const original = createOriginal({
      formContext: createFormContext({ formId: "checkout" }),
      visualRegion: "main",
      nearbyLandmarks: {
        closestHeading: { text: "Payment", level: 2, distance: 30 },
        closestLabel: { text: "Card Number", forId: "card-input" },
        siblingTexts: ["Cancel"],
        containerText: "Complete your order",
      },
    });

    const perfectMatch = createCandidate({
      formContext: createFormContext({ formId: "checkout" }),
      visualRegion: "main",
      nearbyLandmarks: {
        closestHeading: { text: "Payment", level: 2, distance: 30 },
        closestLabel: { text: "Card Number", forId: "card-input" },
        siblingTexts: ["Cancel"],
        containerText: "Complete your order",
      },
    });

    const score = contextualProximityFactor.score(perfectMatch, original);

    // Perfect context match should give max score
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it("should score very low when form, region, and landmarks all differ", () => {
    const original = createOriginal({
      formContext: createFormContext({ formId: "checkout" }),
      visualRegion: "main",
      nearbyLandmarks: {
        closestHeading: { text: "Payment", level: 2, distance: 30 },
        closestLabel: null,
        siblingTexts: [],
        containerText: null,
      },
    });

    const totalMismatch = createCandidate({
      formContext: createFormContext({ formId: "newsletter" }), // Different form
      visualRegion: "footer", // Different region
      nearbyLandmarks: {
        closestHeading: { text: "Subscribe", level: 2, distance: 30 }, // Different heading
        closestLabel: null,
        siblingTexts: [],
        containerText: null,
      },
    });

    const score = contextualProximityFactor.score(totalMismatch, original);

    // Complete context mismatch should give very low score
    expect(score).toBeLessThan(0.3);

    // And should be vetoed
    const veto = contextualProximityFactor.canVeto?.(totalMismatch, original);
    expect(veto).not.toBeNull();
  });
});

// ============================================================================
// getDetails() TESTS
// ============================================================================

describe("getDetails()", () => {
  it("should provide detailed breakdown of scoring", () => {
    const original = createOriginal({
      formContext: createFormContext({ formId: "test-form" }),
      visualRegion: "main",
    });

    const candidate = createCandidate({
      formContext: createFormContext({ formId: "test-form" }),
      visualRegion: "main",
    });

    const details = contextualProximityFactor.getDetails?.(candidate, original);

    expect(details).toBeDefined();
    expect(details).toContain("Form:");
    expect(details).toContain("Region:");
    expect(details).toContain("Landmarks:");
  });
});
