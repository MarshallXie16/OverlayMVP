/**
 * Action Detection Module
 *
 * This module handles user action detection during walkthrough playback.
 * It extracts and modularizes the action detection logic from the legacy
 * walkthrough.ts into focused, testable components.
 *
 * Components:
 * - ActionDetector: Event listener management
 * - ActionValidator: Action validation logic
 * - ClickInterceptor: Block non-target clicks
 *
 * @module walkthrough/actions
 */

// ============================================================================
// ACTION DETECTOR
// ============================================================================

export {
  ActionDetector,
  type ActionType,
  type DetectedAction,
  type ActionDetectorConfig,
} from "./ActionDetector";

// ============================================================================
// ACTION VALIDATOR
// ============================================================================

export {
  ActionValidator,
  isClickOnTarget,
  type ValidationResult,
  type ActionValidatorConfig,
} from "./ActionValidator";

// ============================================================================
// CLICK INTERCEPTOR
// ============================================================================

export {
  ClickInterceptor,
  type ClickInterceptorConfig,
} from "./ClickInterceptor";
