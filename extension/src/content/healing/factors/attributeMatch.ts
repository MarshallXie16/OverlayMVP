/**
 * Attribute Match Scoring Factor
 *
 * Weight: 0.15
 *
 * Compares structural attributes between elements:
 * - ID matching
 * - Name attribute
 * - data-testid and data-* attributes
 * - CSS class overlap
 * - Parent chain similarity
 *
 * Strong attribute matches (like ID) are highly reliable signals.
 */

import type { ScoringFactor, CandidateElement, ElementContext } from "../types";
import { FACTOR_WEIGHTS } from "../config";

/**
 * Calculate CSS class overlap score
 */
function classOverlap(
  originalClasses: string[],
  candidateClasses: string[],
): { score: number; matchingClasses: string[] } {
  if (originalClasses.length === 0 && candidateClasses.length === 0) {
    return { score: 0.5, matchingClasses: [] }; // Neutral
  }

  if (originalClasses.length === 0 || candidateClasses.length === 0) {
    return { score: 0.3, matchingClasses: [] }; // One has classes, other doesn't
  }

  // Filter out utility/generated classes that are likely to change
  const filterClasses = (classes: string[]) =>
    classes.filter((c) => {
      // Skip single-letter classes
      if (c.length <= 1) return false;
      // Skip likely generated classes (hashes, numbers)
      if (/^[a-z]{1,3}-[a-f0-9]+$/i.test(c)) return false;
      if (/^[a-f0-9]{6,}$/i.test(c)) return false;
      // Skip common utility prefixes that are very generic
      if (/^(m|p|w|h|flex|grid|text|bg|border)-/.test(c)) return false;
      return true;
    });

  const filteredOriginal = filterClasses(originalClasses);
  const filteredCandidate = filterClasses(candidateClasses);

  if (filteredOriginal.length === 0 && filteredCandidate.length === 0) {
    return { score: 0.5, matchingClasses: [] }; // Only utility classes
  }

  const originalSet = new Set(filteredOriginal);
  const matchingClasses = filteredCandidate.filter((c) => originalSet.has(c));

  if (matchingClasses.length === 0) {
    return { score: 0.2, matchingClasses: [] };
  }

  const totalUniqueClasses = new Set([
    ...filteredOriginal,
    ...filteredCandidate,
  ]).size;

  const score = matchingClasses.length / totalUniqueClasses;

  return {
    score: Math.min(score + 0.3, 1.0), // Boost score slightly
    matchingClasses,
  };
}

/**
 * Extract stable ID from an element's ID
 * Filters out likely dynamic/generated IDs
 */
function getStableId(id: string | null): string | null {
  if (!id) return null;

  // Skip IDs that look generated
  if (/^[a-f0-9]{8,}$/i.test(id)) return null; // Hash-like
  if (/^(react|ember|vue|ng)-/.test(id)) return null; // Framework generated
  if (/^:r[0-9]+:/.test(id)) return null; // React generated
  if (/[0-9]{10,}/.test(id)) return null; // Contains long number (timestamp)

  return id;
}

/**
 * Compare parent chains for structural similarity
 */
function parentChainSimilarity(
  originalChain: ElementContext["parentChain"],
  candidateChain: CandidateElement["metadata"]["parentChain"],
): number {
  if (originalChain.length === 0 && candidateChain.length === 0) {
    return 0.5;
  }

  if (originalChain.length === 0 || candidateChain.length === 0) {
    return 0.35; // One side has parent chain, other doesn't
  }

  let matchScore = 0;
  const compareLength = Math.min(originalChain.length, candidateChain.length);

  for (let i = 0; i < compareLength; i++) {
    const originalEntry = originalChain[i];
    const candidateEntry = candidateChain[i];

    // Skip if either is undefined
    if (!originalEntry || !candidateEntry) continue;

    // Tag match (fundamental structural similarity)
    if (originalEntry.tag === candidateEntry.tag) {
      matchScore += 0.55;
    }

    // ID match (if both have stable IDs)
    const originalId = getStableId(originalEntry.id);
    const candidateId = getStableId(candidateEntry.id);
    if (originalId && candidateId && originalId === candidateId) {
      matchScore += 0.45;
    }

    // Role match
    if (originalEntry.role && originalEntry.role === candidateEntry.role) {
      matchScore += 0.2;
    }
  }

  // Normalize by number of levels compared
  const maxPossibleScore = compareLength * 1.0;
  return Math.min(matchScore / maxPossibleScore, 1.0);
}

/**
 * Attribute Match Factor
 */
export const attributeMatchFactor: ScoringFactor = {
  name: "attributeMatch",
  weight: FACTOR_WEIGHTS.attributeMatch,

  score(candidate: CandidateElement, original: ElementContext): number {
    let totalScore = 0;
    let factors = 0;
    let differentStableIds = false;

    // ID matching (strongest signal when present)
    const originalId = getStableId(
      original.selectors.primary?.match(/#([^[\s.]+)/)?.[1] || null,
    );
    const candidateId = getStableId(candidate.element.id);

    if (originalId || candidateId) {
      factors++;
      if (originalId && candidateId) {
        if (originalId === candidateId) {
          totalScore += 1.0; // Perfect ID match
        } else {
          totalScore += 0.1; // Different IDs - bad sign
          differentStableIds = true; // Flag for cap
        }
      } else {
        totalScore += 0.35; // One has ID, other doesn't (or generated ID filtered)
      }
    }

    // Name attribute matching (strong signal for form elements)
    let perfectNameMatch = false;
    if (original.name || candidate.metadata.name) {
      factors++;
      if (original.name && candidate.metadata.name) {
        if (original.name === candidate.metadata.name) {
          totalScore += 1.0;
          perfectNameMatch = true;
        } else {
          totalScore += 0.2;
        }
      } else {
        totalScore += 0.35; // One has name, other doesn't
      }
    }

    // data-testid matching (strong signal in test-aware apps)
    const originalTestId = original.selectors.dataTestId;
    const candidateTestId = candidate.element.getAttribute("data-testid");
    let perfectTestIdMatch = false;

    if (originalTestId || candidateTestId) {
      factors++;
      if (originalTestId && candidateTestId) {
        if (originalTestId === candidateTestId) {
          totalScore += 1.0;
          perfectTestIdMatch = true;
        } else {
          totalScore += 0.1;
        }
      } else {
        totalScore += 0.3;
      }
    }

    // CSS class overlap (only count if at least one side has classes)
    const classResult = classOverlap(
      original.classes,
      candidate.metadata.classes,
    );
    if (original.classes.length > 0 || candidate.metadata.classes.length > 0) {
      factors++;
      totalScore += classResult.score;
    }

    // Parent chain similarity (only count if at least one side has parent chain)
    const parentSim = parentChainSimilarity(
      original.parentChain,
      candidate.metadata.parentChain,
    );
    if (
      original.parentChain.length > 0 ||
      candidate.metadata.parentChain.length > 0
    ) {
      factors++;
      totalScore += parentSim;
    }

    // Calculate average score (default to 0.5 if no factors)
    let avgScore = factors > 0 ? totalScore / factors : 0.5;

    // Cap score when stable IDs are different (strong negative signal)
    if (differentStableIds) {
      avgScore = Math.min(avgScore, 0.4);
    }

    // Boost score for strong matches (name/testid are key identifiers)
    if ((perfectNameMatch || perfectTestIdMatch) && avgScore < 0.75) {
      avgScore = Math.min(avgScore + 0.15, 0.85);
    }

    return avgScore;
  },

  // Attribute match doesn't veto - attributes can change
  // The contextual proximity factor handles form/region vetoes

  getDetails(candidate: CandidateElement, original: ElementContext): string {
    const details: string[] = [];

    // ID comparison
    const originalId = getStableId(
      original.selectors.primary?.match(/#([^[\s.]+)/)?.[1] || null,
    );
    const candidateId = getStableId(candidate.element.id);
    if (originalId || candidateId) {
      details.push(
        `ID: ${originalId || "(none)"} vs ${candidateId || "(none)"}`,
      );
    }

    // Name comparison
    if (original.name || candidate.metadata.name) {
      details.push(
        `Name: ${original.name || "(none)"} vs ${candidate.metadata.name || "(none)"}`,
      );
    }

    // Class overlap
    const classResult = classOverlap(
      original.classes,
      candidate.metadata.classes,
    );
    if (classResult.matchingClasses.length > 0) {
      details.push(
        `Classes: ${classResult.matchingClasses.length} matching (${classResult.score.toFixed(2)})`,
      );
    }

    // Parent chain
    const parentSim = parentChainSimilarity(
      original.parentChain,
      candidate.metadata.parentChain,
    );
    details.push(`Parent chain: ${parentSim.toFixed(2)}`);

    return details.join(" | ");
  },
};
