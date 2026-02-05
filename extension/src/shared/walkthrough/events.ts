/**
 * Walkthrough State Machine Events
 *
 * All events that can trigger state transitions in the walkthrough state machine.
 * Events are dispatched to the SessionManager which updates state and broadcasts changes.
 */

import type { WorkflowResponse } from "../types";

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Union type of all possible walkthrough events.
 *
 * Each event has a `type` discriminator and optional payload.
 */
export type WalkthroughEvent =
  // === Session Lifecycle ===
  | StartEvent
  | DataLoadedEvent
  | InitFailedEvent
  | ExitEvent

  // === Step Navigation ===
  | NextStepEvent
  | PrevStepEvent
  | JumpToStepEvent
  | RetryEvent
  | SkipStepEvent

  // === Element Finding ===
  | ElementFoundEvent
  | ElementNotFoundEvent

  // === User Actions ===
  | ActionDetectedEvent
  | ActionInvalidEvent

  // === Healing ===
  | HealingStartedEvent
  | HealSuccessEvent
  | HealFailedEvent

  // === Navigation ===
  | UrlChangedEvent
  | PageLoadedEvent
  | NavigationTimeoutEvent

  // === Tab Management ===
  | TabReadyEvent
  | TabClosedEvent;

// ============================================================================
// SESSION LIFECYCLE EVENTS
// ============================================================================

/** Start a new walkthrough session */
export interface StartEvent {
  type: "START";
  workflowId: number;
  tabId: number;
}

/** Workflow data successfully loaded from API */
export interface DataLoadedEvent {
  type: "DATA_LOADED";
  workflow: WorkflowResponse;
  tabId: number;
}

/** Failed to initialize walkthrough (API error, invalid workflow, etc.) */
export interface InitFailedEvent {
  type: "INIT_FAILED";
  error: string;
}

/** User requested to exit walkthrough */
export interface ExitEvent {
  type: "EXIT";
  reason: "user_exit" | "timeout" | "error";
}

// ============================================================================
// STEP NAVIGATION EVENTS
// ============================================================================

/** Advance to next step */
export interface NextStepEvent {
  type: "NEXT_STEP";
}

/** Go back to previous step */
export interface PrevStepEvent {
  type: "PREV_STEP";
}

/** Jump to a specific step (for non-linear navigation) */
export interface JumpToStepEvent {
  type: "JUMP_TO_STEP";
  stepIndex: number;
}

/** Retry the current step after error */
export interface RetryEvent {
  type: "RETRY";
}

/** Skip the current step (after max retries) */
export interface SkipStepEvent {
  type: "SKIP_STEP";
}

// ============================================================================
// ELEMENT FINDING EVENTS
// ============================================================================

/** Target element found and interactable */
export interface ElementFoundEvent {
  type: "ELEMENT_FOUND";
  stepIndex: number;
}

/** Target element not found in DOM */
export interface ElementNotFoundEvent {
  type: "ELEMENT_NOT_FOUND";
  stepIndex: number;
}

// ============================================================================
// USER ACTION EVENTS
// ============================================================================

/** User performed the correct action on target element */
export interface ActionDetectedEvent {
  type: "ACTION_DETECTED";
  stepIndex: number;
  actionType: "click" | "input_commit" | "select_change" | "submit" | "copy";
}

/** User action was invalid (wrong element, wrong action type) */
export interface ActionInvalidEvent {
  type: "ACTION_INVALID";
  stepIndex: number;
  reason: "wrong_element" | "wrong_action" | "wrong_value" | "no_value_change" | "invalid_target";
}

// ============================================================================
// HEALING EVENTS
// ============================================================================

/** Healing process started */
export interface HealingStartedEvent {
  type: "HEALING_STARTED";
  stepIndex: number;
  candidateCount: number;
}

/** Healing succeeded - found alternative element */
export interface HealSuccessEvent {
  type: "HEAL_SUCCESS";
  stepIndex: number;
  confidence: number;
  aiValidated: boolean;
}

/** Healing failed - no suitable element found */
export interface HealFailedEvent {
  type: "HEAL_FAILED";
  stepIndex: number;
  reason: string;
}

// ============================================================================
// NAVIGATION EVENTS
// ============================================================================

/** URL is changing (navigation started) */
export interface UrlChangedEvent {
  type: "URL_CHANGED";
  tabId: number;
  url: string;
}

/** Page finished loading after navigation */
export interface PageLoadedEvent {
  type: "PAGE_LOADED";
  tabId: number;
  url: string;
}

/** Navigation took too long */
export interface NavigationTimeoutEvent {
  type: "NAVIGATION_TIMEOUT";
  tabId: number;
}

// ============================================================================
// TAB MANAGEMENT EVENTS
// ============================================================================

/** Content script is ready in a tab */
export interface TabReadyEvent {
  type: "TAB_READY";
  tabId: number;
  url: string;
}

/** Tab was closed */
export interface TabClosedEvent {
  type: "TAB_CLOSED";
  tabId: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Type guard to check if an object is a valid WalkthroughEvent
 */
export function isWalkthroughEvent(obj: unknown): obj is WalkthroughEvent {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const event = obj as { type?: string };
  if (typeof event.type !== "string") {
    return false;
  }

  const validTypes = [
    "START",
    "DATA_LOADED",
    "INIT_FAILED",
    "EXIT",
    "NEXT_STEP",
    "PREV_STEP",
    "JUMP_TO_STEP",
    "RETRY",
    "SKIP_STEP",
    "ELEMENT_FOUND",
    "ELEMENT_NOT_FOUND",
    "ACTION_DETECTED",
    "ACTION_INVALID",
    "HEALING_STARTED",
    "HEAL_SUCCESS",
    "HEAL_FAILED",
    "URL_CHANGED",
    "PAGE_LOADED",
    "NAVIGATION_TIMEOUT",
    "TAB_READY",
    "TAB_CLOSED",
  ];

  return validTypes.includes(event.type);
}

/**
 * Get human-readable description of an event
 */
export function describeEvent(event: WalkthroughEvent): string {
  switch (event.type) {
    case "START":
      return `Starting walkthrough for workflow ${event.workflowId}`;
    case "DATA_LOADED":
      return `Loaded workflow "${event.workflow.name}"`;
    case "INIT_FAILED":
      return `Initialization failed: ${event.error}`;
    case "EXIT":
      return `Exiting: ${event.reason}`;
    case "NEXT_STEP":
      return "Advancing to next step";
    case "PREV_STEP":
      return "Going back to previous step";
    case "JUMP_TO_STEP":
      return `Jumping to step ${event.stepIndex + 1}`;
    case "RETRY":
      return "Retrying current step";
    case "SKIP_STEP":
      return "Skipping current step";
    case "ELEMENT_FOUND":
      return `Element found for step ${event.stepIndex + 1}`;
    case "ELEMENT_NOT_FOUND":
      return `Element not found for step ${event.stepIndex + 1}`;
    case "ACTION_DETECTED":
      return `Detected ${event.actionType} on step ${event.stepIndex + 1}`;
    case "ACTION_INVALID":
      return `Invalid action on step ${event.stepIndex + 1}: ${event.reason}`;
    case "HEALING_STARTED":
      return `Healing step ${event.stepIndex + 1} with ${event.candidateCount} candidates`;
    case "HEAL_SUCCESS":
      return `Healed step ${event.stepIndex + 1} (confidence: ${Math.round(event.confidence * 100)}%)`;
    case "HEAL_FAILED":
      return `Healing failed for step ${event.stepIndex + 1}: ${event.reason}`;
    case "URL_CHANGED":
      return `Navigating to ${event.url}`;
    case "PAGE_LOADED":
      return `Page loaded: ${event.url}`;
    case "NAVIGATION_TIMEOUT":
      return `Navigation timeout for tab ${event.tabId}`;
    case "TAB_READY":
      return `Tab ${event.tabId} ready at ${event.url}`;
    case "TAB_CLOSED":
      return `Tab ${event.tabId} closed`;
  }
}
