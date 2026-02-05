/**
 * Walkthrough Message Protocol
 *
 * Defines all messages exchanged between content scripts and background service worker.
 * Reduced from 12+ message types to 6 well-defined messages.
 */

import type { WalkthroughState } from "./WalkthroughState";

// ============================================================================
// MESSAGE TYPE CONSTANTS
// ============================================================================

export const WALKTHROUGH_MESSAGE_TYPES = {
  /** Command from content to background (START, NEXT, PREV, etc.) */
  COMMAND: "WALKTHROUGH_COMMAND",
  /** State broadcast from background to content */
  STATE_CHANGED: "WALKTHROUGH_STATE_CHANGED",
  /** Content script ready handshake */
  TAB_READY: "WALKTHROUGH_TAB_READY",
  /** Element status report from content */
  ELEMENT_STATUS: "WALKTHROUGH_ELEMENT_STATUS",
  /** Healing result from content */
  HEALING_RESULT: "WALKTHROUGH_HEALING_RESULT",
  /** Execution log entry for backend */
  EXECUTION_LOG: "WALKTHROUGH_EXECUTION_LOG",
} as const;

export type WalkthroughMessageType =
  (typeof WALKTHROUGH_MESSAGE_TYPES)[keyof typeof WALKTHROUGH_MESSAGE_TYPES];

// ============================================================================
// COMMAND TYPES
// ============================================================================

/**
 * Commands that can be sent via WALKTHROUGH_COMMAND message
 */
export type WalkthroughCommand =
  | "START"
  | "NEXT"
  | "PREV"
  | "JUMP_TO"
  | "RETRY"
  | "SKIP"
  | "EXIT"
  | "GET_STATE"
  | "REPORT_ACTION";

/**
 * Payload types for each command
 */
export interface CommandPayloads {
  START: { workflowId: number };
  NEXT: Record<string, never>;
  PREV: Record<string, never>;
  JUMP_TO: { stepIndex: number };
  RETRY: Record<string, never>;
  SKIP: Record<string, never>;
  EXIT: { reason?: "user_exit" | "timeout" | "error" };
  GET_STATE: Record<string, never>;
  /** Report detected user action (valid or invalid) to background */
  REPORT_ACTION: {
    stepIndex: number;
    actionType: string;
    valid: boolean;
    /** Indicates the action is expected to trigger page navigation (e.g. Enter submit, link click). */
    causesNavigation?: boolean;
    reason?:
      | "wrong_element"
      | "wrong_action"
      | "wrong_value"
      | "no_value_change"
      | "invalid_target";
  };
}

// ============================================================================
// MESSAGE INTERFACES
// ============================================================================

/**
 * Command message: Content → Background
 *
 * Used for all user actions and state queries.
 */
export interface WalkthroughCommandMessage<
  T extends WalkthroughCommand = WalkthroughCommand,
> {
  type: typeof WALKTHROUGH_MESSAGE_TYPES.COMMAND;
  command: T;
  payload: CommandPayloads[T];
}

/**
 * State changed broadcast: Background → Content
 *
 * Sent whenever state changes. Content scripts render based on this.
 */
export interface WalkthroughStateChangedMessage {
  type: typeof WALKTHROUGH_MESSAGE_TYPES.STATE_CHANGED;
  state: WalkthroughState;
  /** What triggered this state change */
  trigger: string;
}

/**
 * Tab ready handshake: Content → Background
 *
 * Content script sends this when it's loaded and ready to receive state.
 * Background responds with current state if a walkthrough is active.
 */
export interface WalkthroughTabReadyMessage {
  type: typeof WALKTHROUGH_MESSAGE_TYPES.TAB_READY;
  tabId: number;
  url: string;
}

/**
 * Element status report: Content → Background
 *
 * Content script reports whether target element was found.
 */
export interface WalkthroughElementStatusMessage {
  type: typeof WALKTHROUGH_MESSAGE_TYPES.ELEMENT_STATUS;
  stepIndex: number;
  found: boolean;
  tabId: number;
}

/**
 * Healing result: Content → Background
 *
 * Reports outcome of element healing attempt.
 */
export interface WalkthroughHealingResultMessage {
  type: typeof WALKTHROUGH_MESSAGE_TYPES.HEALING_RESULT;
  stepIndex: number;
  result: HealingResult;
}

/**
 * Execution log entry: Content → Background
 *
 * Logged to backend for analytics and debugging.
 */
export interface WalkthroughExecutionLogMessage {
  type: typeof WALKTHROUGH_MESSAGE_TYPES.EXECUTION_LOG;
  entry: ExecutionLogEntry;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Result of element healing attempt
 */
export interface HealingResult {
  success: boolean;
  /** Confidence score 0-1 */
  confidence: number;
  /** Was AI validation used? */
  aiValidated: boolean;
  /** If successful, the healed selector */
  healedSelector?: string;
  /** If failed, reason for failure */
  failureReason?: string;
  /** Number of candidates evaluated */
  candidatesEvaluated: number;
}

/**
 * Entry for execution logging
 */
export interface ExecutionLogEntry {
  timestamp: number;
  sessionId: string;
  stepIndex: number;
  eventType:
    | "step_shown"
    | "action_detected"
    | "action_validated"
    | "action_invalid"
    | "element_found"
    | "element_not_found"
    | "healing_started"
    | "healing_success"
    | "healing_failed"
    | "navigation_started"
    | "navigation_completed"
    | "step_completed"
    | "step_skipped"
    | "workflow_completed"
    | "workflow_exited"
    | "error";
  details?: Record<string, unknown>;
}

// ============================================================================
// UNION TYPE
// ============================================================================

/**
 * Union of all walkthrough messages
 */
export type WalkthroughMessage =
  | WalkthroughCommandMessage
  | WalkthroughStateChangedMessage
  | WalkthroughTabReadyMessage
  | WalkthroughElementStatusMessage
  | WalkthroughHealingResultMessage
  | WalkthroughExecutionLogMessage;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Standard response for command messages
 */
export interface WalkthroughCommandResponse {
  success: boolean;
  state?: WalkthroughState;
  error?: string;
}

/**
 * Response for TAB_READY message
 */
export interface WalkthroughTabReadyResponse {
  /** Is there an active walkthrough session? */
  hasActiveSession: boolean;
  /** Current state if session exists */
  state?: WalkthroughState;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a message is a walkthrough message
 */
export function isWalkthroughMessage(msg: unknown): msg is WalkthroughMessage {
  if (typeof msg !== "object" || msg === null) {
    return false;
  }

  const message = msg as { type?: string };
  if (typeof message.type !== "string") {
    return false;
  }

  return Object.values(WALKTHROUGH_MESSAGE_TYPES).includes(
    message.type as WalkthroughMessageType,
  );
}

/**
 * Type guard for command messages
 */
export function isCommandMessage(
  msg: unknown,
): msg is WalkthroughCommandMessage {
  return (
    isWalkthroughMessage(msg) && msg.type === WALKTHROUGH_MESSAGE_TYPES.COMMAND
  );
}

/**
 * Type guard for state changed messages
 */
export function isStateChangedMessage(
  msg: unknown,
): msg is WalkthroughStateChangedMessage {
  return (
    isWalkthroughMessage(msg) &&
    msg.type === WALKTHROUGH_MESSAGE_TYPES.STATE_CHANGED
  );
}

/**
 * Type guard for tab ready messages
 */
export function isTabReadyMessage(
  msg: unknown,
): msg is WalkthroughTabReadyMessage {
  return (
    isWalkthroughMessage(msg) &&
    msg.type === WALKTHROUGH_MESSAGE_TYPES.TAB_READY
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a command message with proper typing
 */
export function createCommandMessage<T extends WalkthroughCommand>(
  command: T,
  payload: CommandPayloads[T],
): WalkthroughCommandMessage<T> {
  return {
    type: WALKTHROUGH_MESSAGE_TYPES.COMMAND,
    command,
    payload,
  };
}

/**
 * Create a state changed broadcast message
 */
export function createStateChangedMessage(
  state: WalkthroughState,
  trigger: string,
): WalkthroughStateChangedMessage {
  return {
    type: WALKTHROUGH_MESSAGE_TYPES.STATE_CHANGED,
    state,
    trigger,
  };
}

/**
 * Create a tab ready message
 */
export function createTabReadyMessage(
  tabId: number,
  url: string,
): WalkthroughTabReadyMessage {
  return {
    type: WALKTHROUGH_MESSAGE_TYPES.TAB_READY,
    tabId,
    url,
  };
}

/**
 * Create an element status message
 */
export function createElementStatusMessage(
  stepIndex: number,
  found: boolean,
  tabId: number,
): WalkthroughElementStatusMessage {
  return {
    type: WALKTHROUGH_MESSAGE_TYPES.ELEMENT_STATUS,
    stepIndex,
    found,
    tabId,
  };
}

/**
 * Create a healing result message
 */
export function createHealingResultMessage(
  stepIndex: number,
  result: HealingResult,
): WalkthroughHealingResultMessage {
  return {
    type: WALKTHROUGH_MESSAGE_TYPES.HEALING_RESULT,
    stepIndex,
    result,
  };
}

/**
 * Create an execution log message
 */
export function createExecutionLogMessage(
  entry: ExecutionLogEntry,
): WalkthroughExecutionLogMessage {
  return {
    type: WALKTHROUGH_MESSAGE_TYPES.EXECUTION_LOG,
    entry,
  };
}
