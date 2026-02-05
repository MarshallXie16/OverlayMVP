/**
 * Walkthrough State Types
 *
 * Unified state interface for the walkthrough state machine.
 * This is the SINGLE SOURCE OF TRUTH stored in background's SessionManager.
 * Content scripts receive read-only snapshots via message broadcasts.
 */

import type { StepResponse } from "../types";

// ============================================================================
// STATE MACHINE STATES
// ============================================================================

/**
 * All possible states for the walkthrough state machine.
 *
 * State transitions:
 * IDLE → INITIALIZING → SHOWING_STEP ↔ WAITING_ACTION → TRANSITIONING → COMPLETED
 *                            ↓              ↓              ↓
 *                       NAVIGATING      HEALING         ERROR
 */
export type WalkthroughMachineState =
  | "IDLE" // No active walkthrough
  | "INITIALIZING" // Loading workflow data, creating session
  | "NAVIGATING" // Page transition in progress
  | "SHOWING_STEP" // Finding element, rendering UI for current step
  | "WAITING_ACTION" // Listening for user action on current step
  | "HEALING" // Auto-healing element selector
  | "TRANSITIONING" // Moving to next/previous step
  | "ERROR" // Unrecoverable error state (with retry/skip options)
  | "COMPLETED"; // Workflow finished successfully

// ============================================================================
// UNIFIED STATE INTERFACE
// ============================================================================

/**
 * Complete walkthrough state.
 *
 * This interface is:
 * - Stored in chrome.storage.session by SessionManager
 * - Broadcast to content scripts on every change
 * - Fully serializable (no Map, Set, or functions)
 */
export interface WalkthroughState {
  // === Session Identity ===
  /** UUID for this walkthrough session */
  sessionId: string;

  // === State Machine ===
  /** Current state machine state */
  machineState: WalkthroughMachineState;
  /** Previous state (for debugging and transition validation) */
  previousState: WalkthroughMachineState | null;

  // === Workflow Data ===
  /** Workflow ID from backend */
  workflowId: number;
  /** Workflow name for display */
  workflowName: string;
  /** Starting URL for the workflow */
  startingUrl: string;
  /** All steps in the workflow */
  steps: StepResponse[];
  /** Total number of steps */
  totalSteps: number;

  // === Progress ===
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** Set of completed step indexes (for non-linear navigation) */
  completedStepIndexes: number[];

  // === Error State ===
  errorInfo: {
    /** Type of error */
    type:
      | "element_not_found"
      | "navigation_timeout"
      | "healing_failed"
      | "api_error"
      | null;
    /** Human-readable error message */
    message: string | null;
    /** Which step the error occurred on */
    stepIndex: number | null;
    /** How many times we've retried this step */
    retryCount: number;
  };

  // === Healing State ===
  healingInfo: {
    /** Is healing in progress? */
    inProgress: boolean;
    /** Number of candidate elements found */
    candidateCount: number;
    /** Best healing confidence score */
    bestScore: number | null;
    /** Was AI validation requested? */
    aiValidationRequested: boolean;
  } | null;

  // === Navigation State ===
  navigation: {
    /** Is a page navigation in progress? */
    inProgress: boolean;
    /** Which tab is navigating (for multi-tab sessions) */
    tabId: number | null;
    /** URL we came from */
    sourceUrl: string | null;
    /** URL we're navigating to */
    targetUrl: string | null;
    /** When navigation started */
    startedAt: number | null;
  };

  // === Tab Management ===
  tabs: {
    /** Primary tab where walkthrough started */
    primaryTabId: number;
    /** All tabs participating in walkthrough */
    activeTabIds: number[];
    /** Tabs that have signaled TAB_READY */
    readyTabIds: number[];
  };

  // === Timing ===
  timing: {
    /** When session was created */
    sessionStartedAt: number;
    /** Last state update timestamp */
    lastActivityAt: number;
    /** When session expires (30 min timeout) */
    expiresAt: number;
  };

  // === Step Retry Tracking ===
  /** Map of stepIndex -> retry count for user action failures */
  stepRetries: Record<number, number>;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

/** Read-only snapshot of state for content scripts */
export type WalkthroughStateSnapshot = Readonly<WalkthroughState>;

/** Subset of state that can be updated by content scripts */
export interface WalkthroughStateUpdate {
  currentStepIndex?: number;
  errorInfo?: WalkthroughState["errorInfo"];
  healingInfo?: WalkthroughState["healingInfo"];
  stepRetries?: Record<number, number>;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create initial IDLE state
 */
export function createIdleState(): WalkthroughState {
  return {
    sessionId: "",
    machineState: "IDLE",
    previousState: null,
    workflowId: 0,
    workflowName: "",
    startingUrl: "",
    steps: [],
    totalSteps: 0,
    currentStepIndex: 0,
    completedStepIndexes: [],
    errorInfo: {
      type: null,
      message: null,
      stepIndex: null,
      retryCount: 0,
    },
    healingInfo: null,
    navigation: {
      inProgress: false,
      tabId: null,
      sourceUrl: null,
      targetUrl: null,
      startedAt: null,
    },
    tabs: {
      primaryTabId: 0,
      activeTabIds: [],
      readyTabIds: [],
    },
    timing: {
      sessionStartedAt: 0,
      lastActivityAt: 0,
      expiresAt: 0,
    },
    stepRetries: {},
  };
}

/**
 * Check if state is in an active walkthrough
 */
export function isActiveWalkthrough(state: WalkthroughState): boolean {
  return (
    state.machineState !== "IDLE" &&
    state.machineState !== "COMPLETED" &&
    state.machineState !== "ERROR"
  );
}

/**
 * Check if state allows user interaction (Next, Back, Skip buttons)
 */
export function allowsUserInteraction(state: WalkthroughState): boolean {
  return (
    state.machineState === "WAITING_ACTION" ||
    state.machineState === "SHOWING_STEP" ||
    state.machineState === "ERROR"
  );
}

/**
 * Get current step from state
 */
export function getCurrentStep(state: WalkthroughState): StepResponse | null {
  if (
    state.currentStepIndex < 0 ||
    state.currentStepIndex >= state.steps.length
  ) {
    return null;
  }
  return state.steps[state.currentStepIndex] ?? null;
}

/**
 * Check if there's a next step
 */
export function hasNextStep(state: WalkthroughState): boolean {
  return state.currentStepIndex < state.totalSteps - 1;
}

/**
 * Check if there's a previous step
 */
export function hasPreviousStep(state: WalkthroughState): boolean {
  return state.currentStepIndex > 0;
}
