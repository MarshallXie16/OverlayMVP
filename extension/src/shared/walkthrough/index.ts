/**
 * Walkthrough Shared Module
 *
 * Exports all shared types, constants, and utilities for the walkthrough system.
 * Used by both background service worker and content scripts.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export {
  // Storage
  WALKTHROUGH_SESSION_STORAGE_KEY,
  // Timeouts
  SESSION_TIMEOUT_MS,
  NAVIGATION_TIMEOUT_MS,
  ELEMENT_FIND_TIMEOUT_MS,
  TAB_READY_TIMEOUT_MS,
  // Retry limits
  MAX_ACTION_RETRIES,
  MAX_ELEMENT_FIND_RETRIES,
  MAX_HEALING_RETRIES,
  // Healing thresholds
  HEALING_CONFIDENCE_HIGH,
  HEALING_CONFIDENCE_MEDIUM_HIGH,
  HEALING_CONFIDENCE_MEDIUM,
  // Auto-advance delays
  ADVANCE_DELAY_CLICK,
  ADVANCE_DELAY_SELECT,
  ADVANCE_DELAY_INPUT,
  ADVANCE_DELAY_DEFAULT,
  // UI
  SPOTLIGHT_PADDING,
  SPOTLIGHT_UPDATE_DEBOUNCE_MS,
  FLASH_SUCCESS_DURATION_MS,
  FLASH_ERROR_DURATION_MS,
} from "./constants";

// ============================================================================
// STATE TYPES
// ============================================================================

export type {
  WalkthroughMachineState,
  WalkthroughState,
  WalkthroughStateSnapshot,
  WalkthroughStateUpdate,
} from "./WalkthroughState";

export {
  createIdleState,
  isActiveWalkthrough,
  allowsUserInteraction,
  getCurrentStep,
  hasNextStep,
  hasPreviousStep,
} from "./WalkthroughState";

// ============================================================================
// EVENTS
// ============================================================================

export type {
  WalkthroughEvent,
  // Session lifecycle
  StartEvent,
  DataLoadedEvent,
  InitFailedEvent,
  ExitEvent,
  // Step navigation
  NextStepEvent,
  PrevStepEvent,
  JumpToStepEvent,
  RetryEvent,
  SkipStepEvent,
  // Element finding
  ElementFoundEvent,
  ElementNotFoundEvent,
  // User actions
  ActionDetectedEvent,
  ActionInvalidEvent,
  // Healing
  HealingStartedEvent,
  HealSuccessEvent,
  HealFailedEvent,
  // Navigation
  UrlChangedEvent,
  PageLoadedEvent,
  NavigationTimeoutEvent,
  // Tab management
  TabReadyEvent,
  TabClosedEvent,
} from "./events";

export { isWalkthroughEvent, describeEvent } from "./events";

// ============================================================================
// MESSAGES
// ============================================================================

export {
  WALKTHROUGH_MESSAGE_TYPES,
  // Type guards
  isWalkthroughMessage,
  isCommandMessage,
  isStateChangedMessage,
  isTabReadyMessage,
  // Helper functions
  createCommandMessage,
  createStateChangedMessage,
  createTabReadyMessage,
  createElementStatusMessage,
  createHealingResultMessage,
  createExecutionLogMessage,
} from "./messages";

export type {
  WalkthroughMessageType,
  WalkthroughCommand,
  CommandPayloads,
  // Messages
  WalkthroughMessage,
  WalkthroughCommandMessage,
  WalkthroughStateChangedMessage,
  WalkthroughTabReadyMessage,
  WalkthroughElementStatusMessage,
  WalkthroughHealingResultMessage,
  WalkthroughExecutionLogMessage,
  // Supporting types
  HealingResult,
  ExecutionLogEntry,
  // Responses
  WalkthroughCommandResponse,
  WalkthroughTabReadyResponse,
} from "./messages";

// ============================================================================
// STATE MACHINE
// ============================================================================

export {
  WalkthroughStateMachine,
  isSessionExpired,
  describeState,
} from "./StateMachine";

export type { StateListener, StateMachineConfig } from "./StateMachine";
