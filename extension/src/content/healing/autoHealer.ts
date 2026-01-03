/**
 * Auto-Healer
 *
 * Main entry point for the auto-healing system.
 * Orchestrates candidate discovery, scoring, and decision making.
 */

import type {
  ElementContext,
  HealingResult,
  HealingLogEntry,
  ScoringResult,
} from "./types";
import { findCandidates } from "./candidateFinder";
import { scoreCandidates, getBestCandidate } from "./scorer";
import {
  DEFAULT_THRESHOLDS,
  FALLBACK_THRESHOLDS,
  AI_CONFIG,
  LOGGING_CONFIG,
  getHealingAction,
} from "./config";
import type { StepResponse } from "../../shared/types";

/**
 * Convert a StepResponse to ElementContext for healing
 */
export function stepToElementContext(step: StepResponse): ElementContext {
  return {
    tagName: step.element_meta.tag_name,
    role: step.element_meta.role,
    type: step.element_meta.type,
    name: step.element_meta.name,
    text: step.element_meta.text,
    classes: step.element_meta.classes,
    boundingBox: step.element_meta.bounding_box,
    selectors: {
      primary: step.selectors.primary,
      css: step.selectors.css,
      xpath: step.selectors.xpath,
      dataTestId: step.selectors.data_testid,
    },
    // Enhanced context (if available from recording)
    parentChain: step.element_meta.parentChain || [],
    formContext: step.element_meta.formContext || null,
    visualRegion: step.element_meta.visualRegion || "unknown",
    nearbyLandmarks: step.element_meta.nearbyLandmarks || {
      closestHeading: null,
      closestLabel: null,
      siblingTexts: [],
      containerText: null,
    },
    fieldLabel: step.field_label,
    instruction: step.instruction,
  };
}

/**
 * Attempt to heal (find) an element when original selectors fail
 */
export async function healElement(
  step: StepResponse,
  options: {
    aiEnabled?: boolean;
    onAIValidate?: (
      original: ElementContext,
      candidate: ElementContext,
      score: number,
    ) => Promise<{ isMatch: boolean; confidence: number }>;
    onUserPrompt?: (
      element: HTMLElement,
      score: number,
    ) => Promise<{ confirmed: boolean }>;
  } = {},
): Promise<HealingResult> {
  const startTime = Date.now();
  const original = stepToElementContext(step);
  const thresholds =
    (options.aiEnabled ?? AI_CONFIG.enabled)
      ? DEFAULT_THRESHOLDS
      : FALLBACK_THRESHOLDS;

  // Find candidate elements
  const candidates = findCandidates(original);

  if (candidates.length === 0) {
    return createFailedResult(original, step, "No candidates found", startTime);
  }

  // Score all candidates
  const scoringResults = scoreCandidates(candidates, original);
  const bestResult = getBestCandidate(scoringResults);

  if (!bestResult) {
    return createFailedResult(
      original,
      step,
      "All candidates were vetoed",
      startTime,
      scoringResults,
    );
  }

  // Determine action based on score
  const action = getHealingAction(bestResult.totalScore, thresholds);

  let finalResult: HealingResult;

  switch (action) {
    case "auto_accept": {
      // High confidence - accept silently
      finalResult = createSuccessResult(
        bestResult,
        "healed_auto",
        bestResult.totalScore,
        null,
        step,
        startTime,
        scoringResults.length,
      );
      break;
    }

    case "ai_validate": {
      // Medium-high confidence - call AI for validation
      if (options.onAIValidate && (options.aiEnabled ?? AI_CONFIG.enabled)) {
        try {
          const candidateContext = stepToElementContext({
            ...step,
            element_meta: bestResult.candidate
              .metadata as StepResponse["element_meta"],
            selectors: step.selectors,
          });

          const aiResult = await options.onAIValidate(
            original,
            candidateContext,
            bestResult.totalScore,
          );

          // Combine scores
          const combinedScore =
            bestResult.totalScore * (1 - AI_CONFIG.weight) +
            aiResult.confidence * AI_CONFIG.weight;

          // AI can veto if confidence is very low
          if (
            aiResult.confidence < AI_CONFIG.vetoThreshold &&
            !aiResult.isMatch
          ) {
            finalResult = createFailedResult(
              original,
              step,
              "AI rejected the match",
              startTime,
              scoringResults,
              aiResult.confidence,
            );
          } else {
            finalResult = createSuccessResult(
              bestResult,
              "healed_ai",
              combinedScore,
              aiResult.confidence,
              step,
              startTime,
              scoringResults.length,
            );
          }
        } catch (error) {
          console.warn("[Healing] AI validation failed, falling back:", error);
          // Fallback to stricter threshold check
          if (bestResult.totalScore >= FALLBACK_THRESHOLDS.autoAccept) {
            finalResult = createSuccessResult(
              bestResult,
              "healed_auto",
              bestResult.totalScore,
              null,
              step,
              startTime,
              scoringResults.length,
            );
          } else {
            // Prompt user instead
            finalResult = await handleUserPrompt(
              bestResult,
              options.onUserPrompt,
              step,
              startTime,
              scoringResults,
            );
          }
        }
      } else {
        // No AI available, check if score is high enough for auto-accept
        if (bestResult.totalScore >= FALLBACK_THRESHOLDS.autoAccept) {
          finalResult = createSuccessResult(
            bestResult,
            "healed_auto",
            bestResult.totalScore,
            null,
            step,
            startTime,
            scoringResults.length,
          );
        } else {
          // Prompt user
          finalResult = await handleUserPrompt(
            bestResult,
            options.onUserPrompt,
            step,
            startTime,
            scoringResults,
          );
        }
      }
      break;
    }

    case "user_prompt": {
      // Medium confidence - prompt user
      finalResult = await handleUserPrompt(
        bestResult,
        options.onUserPrompt,
        step,
        startTime,
        scoringResults,
      );
      break;
    }

    case "reject":
    default: {
      // Low confidence - mark as broken
      finalResult = createFailedResult(
        original,
        step,
        "Score too low",
        startTime,
        scoringResults,
      );
    }
  }

  // Log result
  if (LOGGING_CONFIG.consoleLog) {
    logHealingResult(finalResult);
  }

  return finalResult;
}

/**
 * Handle user prompt flow
 */
async function handleUserPrompt(
  bestResult: ScoringResult,
  onUserPrompt:
    | ((element: HTMLElement, score: number) => Promise<{ confirmed: boolean }>)
    | undefined,
  step: StepResponse,
  startTime: number,
  scoringResults: ScoringResult[],
): Promise<HealingResult> {
  if (onUserPrompt) {
    try {
      const userResult = await onUserPrompt(
        bestResult.candidate.element,
        bestResult.totalScore,
      );

      if (userResult.confirmed) {
        return createSuccessResult(
          bestResult,
          "healed_user",
          bestResult.totalScore,
          null,
          step,
          startTime,
          scoringResults.length,
        );
      } else {
        return createFailedResult(
          stepToElementContext(step),
          step,
          "User rejected the match",
          startTime,
          scoringResults,
        );
      }
    } catch (error) {
      console.warn("[Healing] User prompt failed:", error);
    }
  }

  // No user prompt handler or it failed - fail gracefully
  return createFailedResult(
    stepToElementContext(step),
    step,
    "No user confirmation available",
    startTime,
    scoringResults,
  );
}

/**
 * Create a successful healing result
 */
function createSuccessResult(
  bestResult: ScoringResult,
  resolution: HealingResult["resolution"],
  confidence: number,
  aiConfidence: number | null,
  step: StepResponse,
  _startTime: number,
  candidatesEvaluated: number,
): HealingResult {
  const log = createLogEntry(
    step,
    resolution === "healed_ai"
      ? "healed_ai"
      : resolution === "healed_user"
        ? "user_confirmed"
        : "healed_deterministic",
    bestResult.totalScore,
    aiConfidence,
    confidence,
    candidatesEvaluated,
    bestResult,
    stepToElementContext(step),
  );

  return {
    success: true,
    element: bestResult.candidate.element,
    confidence,
    resolution,
    scoringResult: bestResult,
    candidatesEvaluated,
    aiConfidence,
    healingLog: log,
  };
}

/**
 * Create a failed healing result
 */
function createFailedResult(
  original: ElementContext,
  step: StepResponse,
  _reason: string,
  _startTime: number,
  scoringResults?: ScoringResult[],
  aiConfidence?: number,
): HealingResult {
  const bestResult = scoringResults?.[0];

  const log = createLogEntry(
    step,
    "failed",
    bestResult?.totalScore || 0,
    aiConfidence || null,
    0,
    scoringResults?.length || 0,
    bestResult || null,
    original,
  );

  return {
    success: false,
    element: null,
    confidence: 0,
    resolution: "failed",
    scoringResult: bestResult || null,
    candidatesEvaluated: scoringResults?.length || 0,
    aiConfidence: aiConfidence || null,
    healingLog: log,
  };
}

/**
 * Create a logging entry
 */
function createLogEntry(
  step: StepResponse,
  status: HealingLogEntry["status"],
  deterministicScore: number,
  aiConfidence: number | null,
  finalConfidence: number,
  candidatesEvaluated: number,
  bestResult: ScoringResult | null,
  original: ElementContext,
): HealingLogEntry {
  return {
    timestamp: Date.now(),
    stepId: step.id,
    workflowId: step.workflow_id,
    status,
    deterministicScore,
    aiConfidence,
    finalConfidence,
    candidatesEvaluated,
    topCandidateScore: bestResult?.totalScore || 0,
    runnerUpScore: null,
    vetoesApplied: bestResult?.vetoes.map((v) => v.reason) || [],
    factorScores: bestResult
      ? Object.fromEntries(
          bestResult.factorScores.map((fs) => [fs.factorName, fs.score]),
        )
      : {},
    originalContext: {
      tagName: original.tagName,
      text: original.text,
      formContext: original.formContext,
      visualRegion: original.visualRegion,
    },
    selectedContext: bestResult
      ? {
          tagName: bestResult.candidate.metadata.tag_name,
          text: bestResult.candidate.metadata.text,
          formContext: bestResult.candidate.metadata.formContext,
          visualRegion: bestResult.candidate.metadata.visualRegion,
        }
      : null,
  };
}

/**
 * Log healing result to console
 */
function logHealingResult(result: HealingResult): void {
  const icon = result.success ? "✅" : "❌";
  const resolution = result.resolution;

  console.log(
    `[Healing] ${icon} ${resolution} - Confidence: ${(result.confidence * 100).toFixed(1)}%`,
  );

  if (result.success && result.element) {
    console.log(
      `[Healing] Found element: <${result.element.tagName.toLowerCase()}> "${result.element.textContent?.substring(0, 50)}"`,
    );
  }

  if (result.aiConfidence !== null) {
    console.log(
      `[Healing] AI confidence: ${(result.aiConfidence * 100).toFixed(1)}%`,
    );
  }

  if (!result.success) {
    console.log(
      `[Healing] Vetoes: ${result.healingLog.vetoesApplied.join(", ") || "none"}`,
    );
  }
}

/**
 * Export types for use by walkthrough
 */
export type { HealingResult, ElementContext, HealingLogEntry };
