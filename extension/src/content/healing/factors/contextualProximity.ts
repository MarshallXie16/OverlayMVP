/**
 * Contextual Proximity Scoring Factor
 *
 * THE MOST CRITICAL FACTOR (weight: 0.35)
 *
 * This factor is the key to preventing false positives. It validates that
 * a candidate element is in the same context as the original:
 * - Same form (if original was in a form)
 * - Same visual region (header/main/footer/sidebar/modal)
 * - Near same landmarks (headings, labels)
 *
 * It can VETO matches that fail critical context checks, regardless of
 * how high other factor scores are.
 */

import type {
  ScoringFactor,
  CandidateElement,
  ElementContext,
  VetoResult,
} from "../types";
import { FACTOR_WEIGHTS, VETO_CONFIG } from "../config";

/**
 * Check if two form contexts match
 */
function formsMatch(
  candidateForm: CandidateElement["metadata"]["formContext"],
  originalForm: ElementContext["formContext"],
): { match: boolean; score: number; details: string } {
  // Neither in a form - neutral
  if (!originalForm && !candidateForm) {
    return { match: true, score: 0.5, details: "Neither element in a form" };
  }

  // Original was in form, candidate is not - bad sign
  if (originalForm && !candidateForm) {
    return {
      match: false,
      score: 0,
      details: "Original in form, candidate not in any form",
    };
  }

  // Original not in form, candidate is - suspicious
  if (!originalForm && candidateForm) {
    return {
      match: false,
      score: 0.2,
      details: "Original not in form, candidate is in a form",
    };
  }

  // Both in forms - check if same form
  if (originalForm && candidateForm) {
    // Check by form ID first (most reliable)
    if (originalForm.formId && candidateForm.formId) {
      if (originalForm.formId === candidateForm.formId) {
        return { match: true, score: 1.0, details: "Same form by ID" };
      }
      return {
        match: false,
        score: 0,
        details: `Different form IDs: ${originalForm.formId} vs ${candidateForm.formId}`,
      };
    }

    // Check by form name
    if (originalForm.formName && candidateForm.formName) {
      if (originalForm.formName === candidateForm.formName) {
        return { match: true, score: 0.9, details: "Same form by name" };
      }
    }

    // Check by form action (URL)
    if (originalForm.formAction && candidateForm.formAction) {
      if (originalForm.formAction === candidateForm.formAction) {
        return { match: true, score: 0.85, details: "Same form by action URL" };
      }
    }

    // Check by form classes (weaker signal)
    if (
      originalForm.formClasses.length > 0 &&
      candidateForm.formClasses.length > 0
    ) {
      const originalClasses = new Set(originalForm.formClasses);
      const matchingClasses = candidateForm.formClasses.filter((c) =>
        originalClasses.has(c),
      );
      if (matchingClasses.length > 0) {
        const overlap =
          matchingClasses.length /
          Math.max(
            originalForm.formClasses.length,
            candidateForm.formClasses.length,
          );
        return {
          match: overlap > 0.5,
          score: overlap * 0.7,
          details: `Form class overlap: ${matchingClasses.join(", ")}`,
        };
      }
    }

    // Check field position in form
    if (originalForm.totalFields > 0 && candidateForm.totalFields > 0) {
      const originalPosition =
        originalForm.fieldIndex / originalForm.totalFields;
      const candidatePosition =
        candidateForm.fieldIndex / candidateForm.totalFields;
      const positionDiff = Math.abs(originalPosition - candidatePosition);

      // Similar relative position in form is a good sign
      if (positionDiff < 0.2) {
        return {
          match: true,
          score: 0.6,
          details: `Similar position in form: ${Math.round(originalPosition * 100)}% vs ${Math.round(candidatePosition * 100)}%`,
        };
      }
    }

    // Forms exist but we couldn't match them - uncertain
    return {
      match: false,
      score: 0.3,
      details: "Both in forms but could not confirm same form",
    };
  }

  return { match: false, score: 0.5, details: "Unknown form state" };
}

/**
 * Check if visual regions match
 */
function regionsMatch(
  candidateRegion: CandidateElement["metadata"]["visualRegion"],
  originalRegion: ElementContext["visualRegion"],
): { match: boolean; score: number; details: string } {
  // Unknown regions - can't determine
  if (originalRegion === "unknown" || candidateRegion === "unknown") {
    return {
      match: true,
      score: 0.5,
      details: "Visual region unknown",
    };
  }

  // Exact match
  if (candidateRegion === originalRegion) {
    return {
      match: true,
      score: 1.0,
      details: `Same visual region: ${originalRegion}`,
    };
  }

  // Modal is special - if original was in modal, candidate MUST be in modal
  if (originalRegion === "modal" && candidateRegion !== "modal") {
    return {
      match: false,
      score: 0,
      details: "Original in modal, candidate not in modal",
    };
  }

  // Different regions (note: unknown regions already handled above)
  return {
    match: false,
    score: 0.1,
    details: `Different regions: ${originalRegion} vs ${candidateRegion}`,
  };
}

/**
 * Check if nearby landmarks match
 */
function landmarksMatch(
  candidateLandmarks: CandidateElement["metadata"]["nearbyLandmarks"],
  originalLandmarks: ElementContext["nearbyLandmarks"],
): { score: number; details: string } {
  let totalScore = 0;
  let factors = 0;
  const details: string[] = [];

  // Compare closest headings
  if (originalLandmarks.closestHeading && candidateLandmarks.closestHeading) {
    factors++;
    const originalText = originalLandmarks.closestHeading.text.toLowerCase();
    const candidateText = candidateLandmarks.closestHeading.text.toLowerCase();

    if (originalText === candidateText) {
      totalScore += 1.0;
      details.push("Exact heading match");
    } else if (
      originalText.includes(candidateText) ||
      candidateText.includes(originalText)
    ) {
      totalScore += 0.7;
      details.push("Partial heading match");
    } else {
      totalScore += 0;
      details.push("Different headings");
    }
  }

  // Compare closest labels
  if (originalLandmarks.closestLabel && candidateLandmarks.closestLabel) {
    factors++;
    const originalText = originalLandmarks.closestLabel.text.toLowerCase();
    const candidateText = candidateLandmarks.closestLabel.text.toLowerCase();

    if (originalText === candidateText) {
      totalScore += 1.0;
      details.push("Exact label match");
    } else if (
      originalText.includes(candidateText) ||
      candidateText.includes(originalText)
    ) {
      totalScore += 0.7;
      details.push("Partial label match");
    } else {
      totalScore += 0;
      details.push("Different labels");
    }
  }

  // Compare container text
  if (originalLandmarks.containerText && candidateLandmarks.containerText) {
    factors++;
    const originalText = originalLandmarks.containerText.toLowerCase();
    const candidateText = candidateLandmarks.containerText.toLowerCase();

    if (originalText === candidateText) {
      totalScore += 1.0;
      details.push("Exact container match");
    } else if (
      originalText.includes(candidateText) ||
      candidateText.includes(originalText)
    ) {
      totalScore += 0.6;
      details.push("Partial container match");
    } else {
      totalScore += 0;
      details.push("Different containers");
    }
  }

  // Compare sibling texts (weaker signal)
  if (
    originalLandmarks.siblingTexts.length > 0 &&
    candidateLandmarks.siblingTexts.length > 0
  ) {
    factors++;
    const originalSet = new Set(
      originalLandmarks.siblingTexts.map((s) => s.toLowerCase()),
    );
    const matchingSiblings = candidateLandmarks.siblingTexts.filter((s) =>
      originalSet.has(s.toLowerCase()),
    );

    if (matchingSiblings.length > 0) {
      const overlap =
        matchingSiblings.length /
        Math.max(
          originalLandmarks.siblingTexts.length,
          candidateLandmarks.siblingTexts.length,
        );
      totalScore += overlap;
      details.push(`${matchingSiblings.length} matching siblings`);
    } else {
      details.push("No matching siblings");
    }
  }

  // Calculate average score, default to neutral if no factors
  const avgScore = factors > 0 ? totalScore / factors : 0.5;

  return {
    score: avgScore,
    details:
      details.length > 0 ? details.join("; ") : "No landmarks to compare",
  };
}

/**
 * Contextual Proximity Factor
 */
export const contextualProximityFactor: ScoringFactor = {
  name: "contextualProximity",
  weight: FACTOR_WEIGHTS.contextualProximity,

  score(candidate: CandidateElement, original: ElementContext): number {
    // Form matching (50% of this factor's score)
    const formResult = formsMatch(
      candidate.metadata.formContext,
      original.formContext,
    );

    // Visual region matching (20% of this factor's score)
    const regionResult = regionsMatch(
      candidate.metadata.visualRegion,
      original.visualRegion,
    );

    // Landmark matching (30% of this factor's score)
    const landmarkResult = landmarksMatch(
      candidate.metadata.nearbyLandmarks,
      original.nearbyLandmarks,
    );

    // Weighted combination within this factor
    const score =
      formResult.score * 0.5 +
      regionResult.score * 0.2 +
      landmarkResult.score * 0.3;

    return Math.min(Math.max(score, 0), 1);
  },

  canVeto(
    candidate: CandidateElement,
    original: ElementContext,
  ): VetoResult | null {
    // HARD VETO: Different form when original was in a form
    if (VETO_CONFIG.context.requireSameForm && original.formContext?.formId) {
      if (
        !candidate.metadata.formContext ||
        candidate.metadata.formContext.formId !== original.formContext.formId
      ) {
        return {
          factorName: "contextualProximity",
          reason: `Element is in different form. Expected: ${original.formContext.formId}, Found: ${candidate.metadata.formContext?.formId || "none"}`,
          severity: "hard",
        };
      }
    }

    // HARD VETO: Original in modal, candidate not in modal
    if (
      VETO_CONFIG.context.requireSameModalContext &&
      original.visualRegion === "modal" &&
      candidate.metadata.visualRegion !== "modal"
    ) {
      return {
        factorName: "contextualProximity",
        reason: "Original element was in modal, candidate is not in modal",
        severity: "hard",
      };
    }

    // SOFT VETO: Different visual region (non-modal)
    if (
      original.visualRegion !== "unknown" &&
      candidate.metadata.visualRegion !== "unknown" &&
      original.visualRegion !== candidate.metadata.visualRegion
    ) {
      return {
        factorName: "contextualProximity",
        reason: `Different page regions: ${original.visualRegion} vs ${candidate.metadata.visualRegion}`,
        severity: "soft",
      };
    }

    return null;
  },

  getDetails(candidate: CandidateElement, original: ElementContext): string {
    const formResult = formsMatch(
      candidate.metadata.formContext,
      original.formContext,
    );
    const regionResult = regionsMatch(
      candidate.metadata.visualRegion,
      original.visualRegion,
    );
    const landmarkResult = landmarksMatch(
      candidate.metadata.nearbyLandmarks,
      original.nearbyLandmarks,
    );

    return [
      `Form: ${formResult.details} (${formResult.score.toFixed(2)})`,
      `Region: ${regionResult.details} (${regionResult.score.toFixed(2)})`,
      `Landmarks: ${landmarkResult.details} (${landmarkResult.score.toFixed(2)})`,
    ].join(" | ");
  },
};
