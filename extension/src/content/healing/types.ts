/**
 * Auto-Healing Core Types
 * Defines interfaces for the modular scoring system with veto power
 */

import type {
  ElementMetadata,
  FormContext,
  VisualRegion,
  NearbyLandmarks,
  ParentChainEntry,
} from "../utils/metadata";

/**
 * Element context from the original recording
 * Contains all metadata needed for comparison
 */
export interface ElementContext {
  // Core identifiers
  tagName: string;
  role: string | null;
  type: string | null;
  name: string | null;
  text: string | null;
  classes: string[];

  // Position at recording time
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  // Selectors from recording
  selectors: {
    primary: string | null;
    css: string | null;
    xpath: string | null;
    dataTestId: string | null;
  };

  // Enhanced context for healing
  parentChain: ParentChainEntry[];
  formContext: FormContext | null;
  visualRegion: VisualRegion;
  nearbyLandmarks: NearbyLandmarks;

  // User-provided context
  fieldLabel: string | null;
  instruction: string | null;
}

/**
 * Candidate element found on current page
 * Enriched with metadata for comparison
 */
export interface CandidateElement {
  element: HTMLElement;
  metadata: ElementMetadata;

  // Computed similarities (filled during scoring)
  selectorMatch?: {
    matched: boolean;
    selectorType: "primary" | "css" | "xpath" | "dataTestId" | null;
  };
}

/**
 * Result from a single scoring factor
 */
export interface FactorScore {
  factorName: string;
  score: number; // 0-1, where 1 is perfect match
  weight: number;
  weightedScore: number; // score * weight
  details?: string; // Optional explanation for debugging
}

/**
 * Veto result - when a factor blocks a match
 */
export interface VetoResult {
  factorName: string;
  reason: string;
  severity: "hard" | "soft"; // hard = reject outright, soft = reduce confidence
}

/**
 * Complete scoring result for a candidate
 */
export interface ScoringResult {
  candidate: CandidateElement;
  totalScore: number; // 0-1 combined weighted score
  factorScores: FactorScore[];
  vetoes: VetoResult[];
  isVetoed: boolean;
  softVetoCount: number;
}

/**
 * Scoring factor interface
 * Each factor provides a score and can optionally veto
 */
export interface ScoringFactor {
  name: string;
  weight: number; // Relative weight (all weights sum to 1)

  /**
   * Calculate score for a candidate
   * @returns 0-1 where 1 is perfect match
   */
  score(candidate: CandidateElement, original: ElementContext): number;

  /**
   * Optional: Can this factor veto the match?
   * @returns VetoResult if match should be blocked, null otherwise
   */
  canVeto?(
    candidate: CandidateElement,
    original: ElementContext,
  ): VetoResult | null;

  /**
   * Optional: Get details about the score for debugging
   */
  getDetails?(candidate: CandidateElement, original: ElementContext): string;
}

/**
 * Healing thresholds configuration
 */
export interface HealingThresholds {
  autoAccept: number; // >= this: accept silently (default 0.85)
  aiValidation: number; // >= this: call AI to validate (default 0.70)
  userPrompt: number; // >= this: ask user to confirm (default 0.60)
  reject: number; // < this: mark as broken (default 0.50)
}

/**
 * Full healing configuration
 */
export interface HealingConfig {
  factors: Array<{
    factor: ScoringFactor;
    weight: number;
  }>;
  thresholds: HealingThresholds;
  enableAI: boolean;
  aiWeight: number; // When AI is used, how much to weight it (default 0.4)

  // Stricter thresholds when AI unavailable
  fallbackThresholds: HealingThresholds;
}

/**
 * Result of the healing process
 */
export interface HealingResult {
  success: boolean;
  element: HTMLElement | null;
  confidence: number; // 0-1 final confidence

  // How was this resolved?
  resolution:
    | "selector_found" // Original selector worked
    | "healed_auto" // Auto-healed with high confidence
    | "healed_ai" // AI validated the healing
    | "healed_user" // User confirmed the healing
    | "user_rejected" // User said no
    | "failed"; // Could not heal

  // Debugging info
  scoringResult: ScoringResult | null;
  candidatesEvaluated: number;
  aiConfidence: number | null;

  // What happened
  healingLog: HealingLogEntry;
}

/**
 * Logging entry for healing attempts
 */
export interface HealingLogEntry {
  timestamp: number;
  stepId: number;
  workflowId: number;

  // What happened
  status:
    | "healed_deterministic"
    | "healed_ai"
    | "user_confirmed"
    | "user_rejected"
    | "failed";

  // Scores
  deterministicScore: number;
  aiConfidence: number | null;
  finalConfidence: number;

  // Context for debugging
  candidatesEvaluated: number;
  topCandidateScore: number;
  runnerUpScore: number | null;
  vetoesApplied: string[];

  // Factor breakdown
  factorScores: Record<string, number>;

  // Original vs selected context
  originalContext: Partial<ElementContext>;
  selectedContext: Partial<ElementContext> | null;
}

/**
 * User confirmation dialog result
 */
export interface UserConfirmationResult {
  confirmed: boolean;
  selectedElement: HTMLElement | null;
  feedback?: string;
}

/**
 * AI validation request
 */
export interface AIValidationRequest {
  originalContext: ElementContext;
  candidateContext: ElementContext;
  deterministicScore: number;
  screenshotOriginal?: string; // Base64 encoded
  screenshotCurrent?: string; // Base64 encoded
}

/**
 * AI validation response
 */
export interface AIValidationResponse {
  isMatch: boolean;
  confidence: number; // 0-1
  reasoning: string;
}
