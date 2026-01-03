/**
 * Auto-Healing System Index
 *
 * Main exports for the auto-healing system.
 * Use healElement() as the primary entry point.
 */

// Main entry point
export { healElement, stepToElementContext } from "./autoHealer";

// Types
export type {
  ElementContext,
  CandidateElement,
  ScoringResult,
  HealingResult,
  HealingLogEntry,
  ScoringFactor,
  VetoResult,
} from "./types";

// Configuration
export {
  DEFAULT_THRESHOLDS,
  FALLBACK_THRESHOLDS,
  FACTOR_WEIGHTS,
  AI_CONFIG,
  getThresholds,
  getHealingAction,
  shouldCallAI,
} from "./config";

// Scoring
export {
  scoreCandidate,
  scoreCandidates,
  getBestCandidate,
  hasClearWinner,
} from "./scorer";

// Candidate discovery
export {
  findCandidates,
  findCandidatesBySelector,
  findCandidatesByText,
  findCandidatesByRole,
} from "./candidateFinder";

// Individual factors (for testing/debugging)
export { ALL_FACTORS } from "./factors";
