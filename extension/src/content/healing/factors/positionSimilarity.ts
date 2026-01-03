/**
 * Position Similarity Scoring Factor
 *
 * Weight: 0.15 (lowest - positions change frequently)
 *
 * Compares the position of elements on the page.
 * Uses:
 * - Absolute position distance
 * - Relative position (% of viewport)
 * - Size similarity
 *
 * Position is the weakest signal because elements move around frequently.
 * However, large position changes can indicate wrong element (soft veto).
 */

import type {
  ScoringFactor,
  CandidateElement,
  ElementContext,
  VetoResult,
} from "../types";
import { FACTOR_WEIGHTS, VETO_CONFIG, CANDIDATE_CONFIG } from "../config";

/**
 * Calculate Euclidean distance between two points
 */
function calculateDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculate center point of a bounding box
 */
function getCenter(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): {
  x: number;
  y: number;
} {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * Calculate size similarity (0-1)
 */
function sizeSimilarity(
  original: { width: number; height: number },
  candidate: { width: number; height: number },
): number {
  const widthRatio =
    Math.min(original.width, candidate.width) /
    Math.max(original.width, candidate.width);
  const heightRatio =
    Math.min(original.height, candidate.height) /
    Math.max(original.height, candidate.height);

  // Average of width and height similarity
  return (widthRatio + heightRatio) / 2;
}

/**
 * Position Similarity Factor
 */
export const positionSimilarityFactor: ScoringFactor = {
  name: "positionSimilarity",
  weight: FACTOR_WEIGHTS.positionSimilarity,

  score(candidate: CandidateElement, original: ElementContext): number {
    const originalBox = original.boundingBox;
    const candidateBox = candidate.metadata.bounding_box;

    // Handle zero-size elements (hidden or not rendered)
    if (
      originalBox.width === 0 ||
      originalBox.height === 0 ||
      candidateBox.width === 0 ||
      candidateBox.height === 0
    ) {
      return 0.3; // Uncertain
    }

    // Calculate center-to-center distance
    const originalCenter = getCenter(originalBox);
    const candidateCenter = getCenter(candidateBox);
    const distance = calculateDistance(
      originalCenter.x,
      originalCenter.y,
      candidateCenter.x,
      candidateCenter.y,
    );

    // Calculate size similarity
    const sizeSim = sizeSimilarity(originalBox, candidateBox);

    // Position score based on distance
    // Max distance for consideration
    const maxDistance = CANDIDATE_CONFIG.maxPositionDistance;

    let positionScore: number;
    if (distance === 0) {
      positionScore = 1.0;
    } else if (distance < 50) {
      positionScore = 0.9;
    } else if (distance < 100) {
      positionScore = 0.8;
    } else if (distance < 200) {
      positionScore = 0.6;
    } else if (distance < maxDistance) {
      // Linear decay from 200 to maxDistance
      positionScore = 0.6 * (1 - (distance - 200) / (maxDistance - 200));
    } else {
      positionScore = 0;
    }

    // Combine position and size scores
    // Position weighted 70%, size weighted 30%
    const combinedScore = positionScore * 0.7 + sizeSim * 0.3;

    return Math.min(Math.max(combinedScore, 0), 1);
  },

  canVeto(
    candidate: CandidateElement,
    original: ElementContext,
  ): VetoResult | null {
    const originalBox = original.boundingBox;
    const candidateBox = candidate.metadata.bounding_box;

    // Can't veto if we don't have valid positions
    if (
      originalBox.width === 0 ||
      originalBox.height === 0 ||
      candidateBox.width === 0 ||
      candidateBox.height === 0
    ) {
      return null;
    }

    // Calculate distance
    const originalCenter = getCenter(originalBox);
    const candidateCenter = getCenter(candidateBox);
    const distance = calculateDistance(
      originalCenter.x,
      originalCenter.y,
      candidateCenter.x,
      candidateCenter.y,
    );

    // Soft veto for large position changes
    if (distance > VETO_CONFIG.position.softVetoDistanceThreshold) {
      return {
        factorName: "positionSimilarity",
        reason: `Element moved ${Math.round(distance)}px (threshold: ${VETO_CONFIG.position.softVetoDistanceThreshold}px)`,
        severity: "soft",
      };
    }

    return null;
  },

  getDetails(candidate: CandidateElement, original: ElementContext): string {
    const originalBox = original.boundingBox;
    const candidateBox = candidate.metadata.bounding_box;

    const originalCenter = getCenter(originalBox);
    const candidateCenter = getCenter(candidateBox);
    const distance = calculateDistance(
      originalCenter.x,
      originalCenter.y,
      candidateCenter.x,
      candidateCenter.y,
    );

    const sizeSim = sizeSimilarity(originalBox, candidateBox);

    return `Position: (${Math.round(originalCenter.x)}, ${Math.round(originalCenter.y)}) vs (${Math.round(candidateCenter.x)}, ${Math.round(candidateCenter.y)}) - Distance: ${Math.round(distance)}px, Size sim: ${sizeSim.toFixed(2)}`;
  },
};
