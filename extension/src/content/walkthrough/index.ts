/**
 * Content Script Walkthrough Module
 *
 * Exports all content-side walkthrough components.
 */

export { WalkthroughController } from "./WalkthroughController";
export type {
  WalkthroughControllerConfig,
  StateChangeCallback,
  TargetElementInfo,
  TooltipPosition,
  UILayerConfig,
  ActionInvalidReason,
  HealingCandidate,
} from "./types";

// UI Components (Sprint 2, Navigation in Sprint 4)
export {
  WalkthroughUI,
  OverlayManager,
  SpotlightRenderer,
  TooltipRenderer,
  type WalkthroughUIConfig,
  type TooltipContent,
  type TooltipMode,
  type TooltipAction,
  type TooltipActionHandler,
  type ErrorOptions,
  type CompletionOptions,
  type NavigationOptions,
} from "./ui";

// Action Detection Components (Sprint 3)
export {
  ActionDetector,
  ActionValidator,
  ClickInterceptor,
  isClickOnTarget,
  type ActionType,
  type DetectedAction,
  type ActionDetectorConfig,
  type ValidationResult,
  type ActionValidatorConfig,
  type ClickInterceptorConfig,
} from "./actions";

// Navigation Components (Sprint 4)
export {
  NavigationHandler,
  type NavigationHandlerConfig,
  type StateRestoredCallback,
} from "./navigation";
