/**
 * ActionValidator - Validates detected actions against expected steps
 *
 * Responsibilities:
 * - Check if action occurred on target element (or descendant)
 * - Check if action type matches expected type
 * - Apply per-action validation rules (legacy parity)
 * - Track retry counts per step
 *
 * Key behavioral parity with legacy walkthrough.ts:
 * - isClickOnTarget: direct match → contains() → composedPath() (walkthrough.ts:1765-1788)
 * - select_change: accepts event.target OR targetElement as <select> (walkthrough.ts:1817)
 * - submit: only checks event.type (walkthrough.ts:1825-1826)
 */

import type { DetectedAction, ActionType } from "./ActionDetector";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of action validation
 */
export interface ValidationResult {
  valid: boolean;
  reason?:
    | "wrong_element"
    | "wrong_action"
    | "no_value_change"
    | "invalid_target";
  retryCount: number;
}

/**
 * Configuration options
 */
export interface ActionValidatorConfig {
  debug?: boolean;
}

// ============================================================================
// EXPORTED UTILITY: isClickOnTarget
// ============================================================================

/**
 * Check if event occurred on target element or descendant.
 *
 * Three-tier approach matching legacy walkthrough.ts:1765-1788:
 * 1. Direct match: event.target === targetElement
 * 2. Contains check: targetElement.contains(event.target) - handles child elements
 * 3. Shadow DOM: event.composedPath().includes(targetElement)
 *
 * EXPORTED for use by ClickInterceptor (Codex review: shadow DOM consistency)
 */
export function isClickOnTarget(
  event: Event,
  targetElement: HTMLElement,
): boolean {
  const eventTarget = event.target as HTMLElement;
  if (!eventTarget) {
    return false;
  }

  // 1. Direct match
  if (eventTarget === targetElement) {
    return true;
  }

  // 2. Contains check (handles icons inside buttons, etc.)
  if (targetElement.contains(eventTarget)) {
    return true;
  }

  // 3. Shadow DOM support via composedPath
  if (event.composedPath) {
    const path = event.composedPath();
    return path.includes(targetElement);
  }

  return false;
}

// ============================================================================
// ACTION VALIDATOR
// ============================================================================

/**
 * ActionValidator - Validates detected actions against expected steps
 *
 * @example
 * ```typescript
 * const validator = new ActionValidator();
 *
 * const result = validator.validate(
 *   detectedAction,
 *   expectedElement,
 *   expectedActionType,
 *   currentStepIndex
 * );
 *
 * if (result.valid) {
 *   // Advance to next step
 * } else {
 *   // Show error, retry logic
 * }
 * ```
 */
export class ActionValidator {
  private retryCount: Map<number, number> = new Map();
  private config: ActionValidatorConfig;

  constructor(config?: ActionValidatorConfig) {
    this.config = config ?? {};
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Validate a detected action against expected step requirements.
   *
   * @param action - The detected action from ActionDetector
   * @param expectedElement - The target element for this step
   * @param expectedActionType - The expected action type for this step
   * @param stepIndex - The current step index (for retry tracking)
   */
  validate(
    action: DetectedAction,
    expectedElement: HTMLElement,
    expectedActionType: ActionType,
    stepIndex: number,
  ): ValidationResult {
    this.log(
      `Validating ${action.type} against expected ${expectedActionType}`,
    );

    // Apply per-action validation rules (legacy parity)
    const validationResult = this.validateAction(
      action,
      expectedElement,
      expectedActionType,
    );

    if (!validationResult.valid) {
      this.incrementRetry(stepIndex);
      return {
        valid: false,
        reason: validationResult.reason,
        retryCount: this.getRetryCount(stepIndex),
      };
    }

    // Valid action - reset retry count for this step
    this.resetRetryCount(stepIndex);
    return {
      valid: true,
      retryCount: 0,
    };
  }

  /**
   * Get retry count for a specific step.
   */
  getRetryCount(stepIndex: number): number {
    return this.retryCount.get(stepIndex) ?? 0;
  }

  /**
   * Reset retry count for a specific step.
   */
  resetRetryCount(stepIndex: number): void {
    this.retryCount.delete(stepIndex);
  }

  /**
   * Reset all retry counts (e.g., when starting new walkthrough).
   */
  resetAllRetryCounts(): void {
    this.retryCount.clear();
  }

  // ============================================================================
  // VALIDATION RULES
  // ============================================================================

  /**
   * Apply per-action validation rules.
   * Mirrors legacy walkthrough.ts:1793-1831 validateAction function.
   */
  private validateAction(
    action: DetectedAction,
    expectedElement: HTMLElement,
    expectedActionType: ActionType,
  ): { valid: boolean; reason?: ValidationResult["reason"] } {
    const eventTarget = action.event.target as HTMLElement;

    // Different validation for each action type
    switch (expectedActionType) {
      case "click":
        return this.validateClick(action, expectedElement);

      case "input_commit":
        return this.validateInputCommit(action, expectedElement, eventTarget);

      case "select_change":
        return this.validateSelectChange(action, expectedElement, eventTarget);

      case "submit":
        return this.validateSubmit(action);

      default:
        this.log(`Unknown action type: ${expectedActionType}`, "warn");
        return { valid: false, reason: "wrong_action" };
    }
  }

  /**
   * Validate click action.
   * - Must be click event
   * - Must be on target element (or descendant)
   */
  private validateClick(
    action: DetectedAction,
    expectedElement: HTMLElement,
  ): { valid: boolean; reason?: ValidationResult["reason"] } {
    // Check action type
    if (action.type !== "click") {
      this.log(`Wrong action type: expected click, got ${action.type}`);
      return { valid: false, reason: "wrong_action" };
    }

    // Check element target
    if (!isClickOnTarget(action.event, expectedElement)) {
      this.log("Click not on target element");
      return { valid: false, reason: "wrong_element" };
    }

    return { valid: true };
  }

  /**
   * Validate input_commit action.
   * - Must be input_commit action (blur event)
   * - Must be on target element
   * - Value must have changed (already enforced by ActionDetector)
   *
   * Note: ActionDetector only emits input_commit if value changed,
   * so we don't need to re-check value change here.
   */
  private validateInputCommit(
    action: DetectedAction,
    expectedElement: HTMLElement,
    _eventTarget: HTMLElement,
  ): { valid: boolean; reason?: ValidationResult["reason"] } {
    // Check action type
    if (action.type !== "input_commit") {
      this.log(`Wrong action type: expected input_commit, got ${action.type}`);
      return { valid: false, reason: "wrong_action" };
    }

    // Check element target - use eventTarget for blur validation
    // (matches walkthrough.ts:1814-1815)
    if (!isClickOnTarget(action.event, expectedElement)) {
      this.log("Input blur not on target element");
      return { valid: false, reason: "wrong_element" };
    }

    // Value change already validated by ActionDetector (only emits if changed)
    return { valid: true };
  }

  /**
   * Validate select_change action.
   *
   * LEGACY PARITY (walkthrough.ts:1817-1823):
   * Accepts if EITHER event.target OR targetElement is a <select>
   * This handles edge cases where event might bubble from within select.
   */
  private validateSelectChange(
    action: DetectedAction,
    expectedElement: HTMLElement,
    eventTarget: HTMLElement,
  ): { valid: boolean; reason?: ValidationResult["reason"] } {
    // Check action type
    if (action.type !== "select_change") {
      this.log(`Wrong action type: expected select_change, got ${action.type}`);
      return { valid: false, reason: "wrong_action" };
    }

    // LEGACY PARITY: Accept if event.target OR expectedElement is a select
    // (walkthrough.ts:1817-1823)
    const isEventTargetSelect = eventTarget instanceof HTMLSelectElement;
    const isExpectedSelect = expectedElement instanceof HTMLSelectElement;

    if (!isEventTargetSelect && !isExpectedSelect) {
      this.log("Neither event target nor expected element is a select");
      return { valid: false, reason: "wrong_element" };
    }

    // Also check the element relationship
    if (!isClickOnTarget(action.event, expectedElement)) {
      this.log("Select change not on target element");
      return { valid: false, reason: "wrong_element" };
    }

    return { valid: true };
  }

  /**
   * Validate submit action.
   *
   * LEGACY PARITY (walkthrough.ts:1825-1826):
   * Only checks event.type === 'submit'
   * Does NOT use isClickOnTarget (submit event target is form, not button)
   */
  private validateSubmit(action: DetectedAction): {
    valid: boolean;
    reason?: ValidationResult["reason"];
  } {
    // Check action type
    if (action.type !== "submit") {
      this.log(`Wrong action type: expected submit, got ${action.type}`);
      return { valid: false, reason: "wrong_action" };
    }

    // LEGACY PARITY: Only check event type
    // Submit event target is always the form, which matches our listener target
    return { valid: true };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Increment retry count for a step.
   */
  private incrementRetry(stepIndex: number): void {
    const current = this.retryCount.get(stepIndex) ?? 0;
    this.retryCount.set(stepIndex, current + 1);
    this.log(`Retry count for step ${stepIndex}: ${current + 1}`);
  }

  /**
   * Log message if debug enabled.
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[ActionValidator] ${message}`);
  }
}
