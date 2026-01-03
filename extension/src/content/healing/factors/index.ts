/**
 * Scoring Factors Index
 * Exports all scoring factors for the auto-healing system
 */

export { contextualProximityFactor } from "./contextualProximity";
export { textSimilarityFactor } from "./textSimilarity";
export { roleMatchFactor } from "./roleMatch";
export { positionSimilarityFactor } from "./positionSimilarity";
export { attributeMatchFactor } from "./attributeMatch";

import type { ScoringFactor } from "../types";
import { contextualProximityFactor } from "./contextualProximity";
import { textSimilarityFactor } from "./textSimilarity";
import { roleMatchFactor } from "./roleMatch";
import { positionSimilarityFactor } from "./positionSimilarity";
import { attributeMatchFactor } from "./attributeMatch";

/**
 * All scoring factors in weighted order
 * Total weights sum to 1.0
 */
export const ALL_FACTORS: ScoringFactor[] = [
  contextualProximityFactor, // 0.35 - highest, can hard veto
  textSimilarityFactor, // 0.20
  roleMatchFactor, // 0.15, can hard veto
  attributeMatchFactor, // 0.15
  positionSimilarityFactor, // 0.15, can soft veto
];
