/**
 * Auto-Healing Configuration
 * Easily adjustable weights and thresholds for tuning healing behavior
 */

import type { HealingThresholds } from "./types";

/**
 * Factor weights (must sum to 1.0)
 * These control how much each factor contributes to the final score
 *
 * CRITICAL: contextualProximity has the highest weight because
 * context is the most reliable way to prevent false positives
 */
export const FACTOR_WEIGHTS = {
  // CONTEXT IS KING - highest weight
  // This factor checks if element is in same form/region/near same landmarks
  contextualProximity: 0.35,

  // Semantic matching
  // Text similarity is important but can change legitimately
  textSimilarity: 0.2,

  // Role/tag matching tells us if it's the same type of element
  roleMatch: 0.15,

  // Structural matching
  // Attributes like id, name, data-* are strong signals
  attributeMatch: 0.15,

  // Position is the weakest signal - elements move around
  positionSimilarity: 0.15,
} as const;

// Validate weights sum to 1.0
const totalWeight = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(totalWeight - 1.0) > 0.001) {
  console.error(`[Healing] Factor weights must sum to 1.0, got ${totalWeight}`);
}

/**
 * Default thresholds for healing decisions
 */
export const DEFAULT_THRESHOLDS: HealingThresholds = {
  // >= 0.85: Accept silently (user won't know healing happened)
  autoAccept: 0.85,

  // >= 0.70: Call AI to validate the match (if enabled)
  aiValidation: 0.7,

  // >= 0.60: Prompt user "Is this the right element?"
  userPrompt: 0.6,

  // < 0.50: Mark as broken, don't try to use
  reject: 0.5,
};

/**
 * Stricter thresholds when AI is unavailable
 * We're more conservative without AI validation
 */
export const FALLBACK_THRESHOLDS: HealingThresholds = {
  // Require higher confidence for auto-accept when no AI backup
  autoAccept: 0.9,

  // Skip AI validation tier (no AI available)
  aiValidation: 0.9,

  // User prompt stays the same - always prompt for uncertain matches
  userPrompt: 0.6,

  // Reject threshold stays the same
  reject: 0.5,
};

/**
 * AI integration settings
 */
export const AI_CONFIG = {
  // Whether to use AI for validation in the uncertain range
  enabled: true,

  // Weight given to AI confidence when combining scores
  // Final score = (deterministicScore * (1 - aiWeight)) + (aiConfidence * aiWeight)
  weight: 0.4,

  // Timeout for AI validation request (ms)
  timeout: 10000,

  // If AI says confidence < this, cap final score at userPrompt threshold
  vetoThreshold: 0.5,
};

/**
 * Candidate discovery settings
 */
export const CANDIDATE_CONFIG = {
  // Maximum candidates to evaluate (performance limit)
  maxCandidates: 30,

  // Selectors to find potential candidates
  // These match common interactive elements
  candidateSelector: [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='menuitem']",
    "[role='tab']",
    "[role='switch']",
    "[onclick]",
    "[data-action]",
    "[data-testid]",
  ].join(", "),

  // Filter out elements that are clearly wrong
  excludeSelectors: [
    "[aria-hidden='true']",
    "[disabled]",
    ".hidden",
    ".invisible",
    "[style*='display: none']",
    "[style*='visibility: hidden']",
  ],

  // Maximum distance (px) from original position to consider
  maxPositionDistance: 500,
};

/**
 * Veto conditions configuration
 * These define when a factor should block a match entirely
 */
export const VETO_CONFIG = {
  // Context vetoes (hard rejections)
  context: {
    // If original was in a form, candidate MUST be in same form
    requireSameForm: true,

    // If original was in modal, candidate MUST be in modal
    requireSameModalContext: true,
  },

  // Role vetoes
  role: {
    // These role mismatches are always wrong
    incompatibleRoles: [
      ["button", "link"],
      ["textbox", "checkbox"],
      ["listbox", "menu"],
    ] as [string, string][],
  },

  // Position vetoes (soft rejections - reduce confidence)
  position: {
    // If element moved more than this far, apply soft veto
    softVetoDistanceThreshold: 300,
  },
};

/**
 * Logging configuration
 */
export const LOGGING_CONFIG = {
  // Log all healing attempts to console
  consoleLog: true,

  // Include detailed factor scores in logs
  includeFactorDetails: true,

  // Send healing logs to backend
  sendToBackend: true,

  // Alert admin after this many consecutive failures
  adminAlertThreshold: 3,
};

/**
 * User prompt configuration
 */
export const USER_PROMPT_CONFIG = {
  // Timeout for user response (ms) - auto-reject after this
  timeout: 30000,

  // Show confidence percentage to user
  showConfidence: true,

  // Allow user to select a different element
  allowManualSelection: true,
};

/**
 * Text similarity configuration
 */
export const TEXT_SIMILARITY_CONFIG = {
  // Minimum length for text comparison
  minTextLength: 2,

  // Weight for exact match vs fuzzy match
  exactMatchBonus: 0.3,

  // Levenshtein distance threshold for "similar" text
  similarityThreshold: 0.7,
};

/**
 * Get the appropriate thresholds based on AI availability
 */
export function getThresholds(aiAvailable: boolean): HealingThresholds {
  return aiAvailable ? DEFAULT_THRESHOLDS : FALLBACK_THRESHOLDS;
}

/**
 * Check if we should call AI for this score
 */
export function shouldCallAI(
  score: number,
  thresholds: HealingThresholds,
  aiEnabled: boolean,
): boolean {
  if (!aiEnabled) return false;
  return score >= thresholds.aiValidation && score < thresholds.autoAccept;
}

/**
 * Determine action based on final score
 */
export function getHealingAction(
  score: number,
  thresholds: HealingThresholds,
): "auto_accept" | "ai_validate" | "user_prompt" | "reject" {
  if (score >= thresholds.autoAccept) return "auto_accept";
  if (score >= thresholds.aiValidation) return "ai_validate";
  if (score >= thresholds.userPrompt) return "user_prompt";
  return "reject";
}
