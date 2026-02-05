/**
 * Walkthrough State Machine
 *
 * Lightweight XState-inspired state machine for managing walkthrough state transitions.
 * Pure functions with no DOM or chrome.* dependencies - can be used in both background
 * and content scripts.
 *
 * Design principles:
 * - All state is serializable (no Map, Set, or functions in state)
 * - Transitions are pure functions that return new state
 * - Guards prevent invalid transitions
 * - Listeners notified after each transition
 */

import type {
  WalkthroughState,
  WalkthroughMachineState,
} from "./WalkthroughState";
import type { WalkthroughEvent } from "./events";
import {
  createIdleState,
  hasNextStep,
  hasPreviousStep,
} from "./WalkthroughState";
import { SESSION_TIMEOUT_MS, MAX_ACTION_RETRIES } from "./constants";

// ============================================================================
// TYPES
// ============================================================================

/** Listener callback for state changes */
export type StateListener = (
  newState: WalkthroughState,
  event: WalkthroughEvent,
  previousState: WalkthroughState,
) => void;

/** Configuration for state machine */
export interface StateMachineConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Custom logger function */
  logger?: (message: string, ...args: unknown[]) => void;
}

/** Transition definition in the transition table */
interface TransitionDef {
  from: WalkthroughMachineState | "*";
  event: WalkthroughEvent["type"];
  to: WalkthroughMachineState;
  guard?: (state: WalkthroughState, event: WalkthroughEvent) => boolean;
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/$/, "") || "/";
}

function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Match policy for explicit navigate steps:
 * - Compare origin + normalized pathname
 * - Ignore query/hash
 * - If expected pathname is "/", treat as match for any pathname on the same origin
 */
function doesNavigateUrlMatchExpected(
  expectedUrl: string,
  actualUrl: string,
): boolean {
  const expected = safeParseUrl(expectedUrl);
  const actual = safeParseUrl(actualUrl);

  if (!expected || !actual) {
    return false;
  }

  if (expected.origin !== actual.origin) {
    return false;
  }

  const expectedPath = normalizePathname(expected.pathname);
  if (expectedPath === "/") {
    return true;
  }

  const actualPath = normalizePathname(actual.pathname);
  return expectedPath === actualPath;
}

// ============================================================================
// TRANSITION TABLE
// ============================================================================

/**
 * Complete state transition table.
 *
 * Each entry defines:
 * - from: Source state (or "*" for any state)
 * - event: Event type that triggers transition
 * - to: Target state
 * - guard: Optional condition that must be true for transition
 *
 * Order matters: first matching transition wins.
 */
const TRANSITIONS: TransitionDef[] = [
  // === GLOBAL TRANSITIONS (from any state) ===
  {
    from: "*",
    event: "EXIT",
    to: "IDLE",
  },
  {
    from: "*",
    event: "TAB_CLOSED",
    to: "IDLE",
    guard: (state, event) => {
      // Exit if primary tab is closed
      const tabEvent = event as { tabId: number };
      return state.tabs.primaryTabId === tabEvent.tabId;
    },
  },

  // === SESSION LIFECYCLE ===
  {
    from: "IDLE",
    event: "START",
    to: "INITIALIZING",
  },
  {
    from: "INITIALIZING",
    event: "DATA_LOADED",
    to: "SHOWING_STEP",
    guard: (_state, event) => {
      const dataEvent = event as { workflow: { steps: unknown[] } };
      return dataEvent.workflow.steps.length > 0;
    },
  },
  {
    from: "INITIALIZING",
    event: "DATA_LOADED",
    to: "ERROR",
    guard: (_state, event) => {
      const dataEvent = event as { workflow: { steps: unknown[] } };
      return dataEvent.workflow.steps.length === 0;
    },
  },
  {
    from: "INITIALIZING",
    event: "INIT_FAILED",
    to: "ERROR",
  },

  // === SHOWING STEP ===
  {
    from: "SHOWING_STEP",
    event: "ELEMENT_FOUND",
    to: "WAITING_ACTION",
  },
  {
    from: "SHOWING_STEP",
    event: "ELEMENT_NOT_FOUND",
    to: "HEALING",
  },
  {
    from: "SHOWING_STEP",
    event: "URL_CHANGED",
    to: "NAVIGATING",
  },
  // User-driven navigation from SHOWING_STEP (e.g., clicking step indicator)
  // Goes directly to SHOWING_STEP since applyTransition updates currentStepIndex
  {
    from: "SHOWING_STEP",
    event: "JUMP_TO_STEP",
    to: "SHOWING_STEP",
    guard: (state, event) => {
      const jumpEvent = event as { stepIndex: number };
      return jumpEvent.stepIndex >= 0 && jumpEvent.stepIndex < state.totalSteps;
    },
  },

  // === WAITING FOR USER ACTION ===
  {
    from: "WAITING_ACTION",
    event: "ACTION_DETECTED",
    to: "TRANSITIONING",
  },
  // ACTION_INVALID: Check max retries FIRST (guarded transition must come before unconditional)
  {
    from: "WAITING_ACTION",
    event: "ACTION_INVALID",
    to: "ERROR",
    guard: (state) => {
      // Check AFTER incrementing retry count (which happens in applyTransition)
      const retries = state.stepRetries[state.currentStepIndex] ?? 0;
      return retries >= MAX_ACTION_RETRIES - 1; // -1 because count increments after this check
    },
  },
  {
    from: "WAITING_ACTION",
    event: "ACTION_INVALID",
    to: "WAITING_ACTION", // Stay in same state when retries remaining
    guard: (state) => {
      const retries = state.stepRetries[state.currentStepIndex] ?? 0;
      return retries < MAX_ACTION_RETRIES - 1;
    },
  },
  {
    from: "WAITING_ACTION",
    event: "URL_CHANGED",
    to: "NAVIGATING",
  },
  // User-driven navigation from WAITING_ACTION (e.g., clicking step indicator)
  // Goes directly to SHOWING_STEP since applyTransition updates currentStepIndex
  {
    from: "WAITING_ACTION",
    event: "JUMP_TO_STEP",
    to: "SHOWING_STEP",
    guard: (state, event) => {
      const jumpEvent = event as { stepIndex: number };
      return jumpEvent.stepIndex >= 0 && jumpEvent.stepIndex < state.totalSteps;
    },
  },

  // === HEALING ===
  {
    from: "HEALING",
    event: "HEALING_STARTED",
    to: "HEALING", // Stay in healing, update healingInfo
  },
  {
    from: "HEALING",
    event: "HEAL_SUCCESS",
    to: "WAITING_ACTION",
  },
  {
    from: "HEALING",
    event: "HEAL_FAILED",
    to: "ERROR",
  },

  // === TRANSITIONING BETWEEN STEPS ===
  {
    from: "TRANSITIONING",
    event: "NEXT_STEP",
    to: "SHOWING_STEP",
    guard: (state) => hasNextStep(state),
  },
  {
    from: "TRANSITIONING",
    event: "NEXT_STEP",
    to: "COMPLETED",
    guard: (state) => !hasNextStep(state),
  },
  {
    from: "TRANSITIONING",
    event: "PREV_STEP",
    to: "SHOWING_STEP",
    guard: (state) => hasPreviousStep(state),
  },
  {
    from: "TRANSITIONING",
    event: "JUMP_TO_STEP",
    to: "SHOWING_STEP",
    guard: (state, event) => {
      const jumpEvent = event as { stepIndex: number };
      return jumpEvent.stepIndex >= 0 && jumpEvent.stepIndex < state.totalSteps;
    },
  },
  // Navigation can begin immediately after an action triggers TRANSITIONING
  {
    from: "TRANSITIONING",
    event: "URL_CHANGED",
    to: "NAVIGATING",
  },

  // === NAVIGATION ===
  {
    from: "NAVIGATING",
    event: "PAGE_LOADED",
    to: "SHOWING_STEP",
    // Only complete navigation if this is the navigating tab
    guard: (state, event) => {
      const pageEvent = event as { tabId: number };
      return state.navigation.tabId === pageEvent.tabId;
    },
  },
  // User can cancel navigation and jump to a different step
  {
    from: "NAVIGATING",
    event: "JUMP_TO_STEP",
    to: "SHOWING_STEP",
    guard: (state, event) => {
      const jumpEvent = event as { stepIndex: number };
      return jumpEvent.stepIndex >= 0 && jumpEvent.stepIndex < state.totalSteps;
    },
  },
  {
    from: "NAVIGATING",
    event: "URL_CHANGED",
    to: "NAVIGATING", // Stay navigating, update targetUrl (redirects) + allow navigate-step matching
  },
  {
    from: "NAVIGATING",
    event: "ACTION_DETECTED",
    to: "NAVIGATING", // Allow race ordering where navigation starts before action report arrives
  },
  {
    from: "NAVIGATING",
    event: "NEXT_STEP",
    to: "NAVIGATING",
    guard: (state) => hasNextStep(state),
  },
  {
    from: "NAVIGATING",
    event: "NEXT_STEP",
    to: "COMPLETED",
    guard: (state) => !hasNextStep(state),
  },
  {
    from: "NAVIGATING",
    event: "TAB_READY",
    to: "NAVIGATING", // Stay navigating, but record tab ready
  },
  {
    from: "NAVIGATING",
    event: "NAVIGATION_TIMEOUT",
    to: "ERROR",
  },

  // === ERROR RECOVERY ===
  {
    from: "ERROR",
    event: "RETRY",
    to: "SHOWING_STEP",
  },
  {
    from: "ERROR",
    event: "SKIP_STEP",
    to: "TRANSITIONING",
    guard: (state) => hasNextStep(state),
  },
  {
    from: "ERROR",
    event: "SKIP_STEP",
    to: "COMPLETED",
    guard: (state) => !hasNextStep(state),
  },

  // === TAB MANAGEMENT ===
  {
    from: "*",
    event: "TAB_READY",
    to: "SHOWING_STEP", // Content script ready, can show step
    guard: (state) =>
      state.machineState === "NAVIGATING" ||
      state.machineState === "SHOWING_STEP",
  },
];

// ============================================================================
// STATE MACHINE CLASS
// ============================================================================

/**
 * Walkthrough State Machine
 *
 * Manages state transitions for the walkthrough system. Thread-safe and serializable.
 *
 * @example
 * ```typescript
 * const machine = new WalkthroughStateMachine();
 *
 * // Subscribe to changes
 * machine.subscribe((state, event) => {
 *   console.log(`Transitioned to ${state.machineState} via ${event.type}`);
 * });
 *
 * // Dispatch events
 * machine.dispatch({ type: 'START', workflowId: 123, tabId: 1 });
 * ```
 */
export class WalkthroughStateMachine {
  private state: WalkthroughState;
  private listeners: Set<StateListener> = new Set();
  private config: StateMachineConfig;

  constructor(initialState?: WalkthroughState, config?: StateMachineConfig) {
    this.state = initialState ?? createIdleState();
    this.config = config ?? {};
  }

  /**
   * Get current state (immutable snapshot)
   */
  getState(): WalkthroughState {
    return this.state;
  }

  /**
   * Set state directly (used for restoring from storage)
   */
  setState(state: WalkthroughState): void {
    this.state = state;
  }

  /**
   * Dispatch an event to trigger a state transition
   *
   * @returns New state after transition (or current state if transition invalid)
   * @throws Never throws - invalid transitions are logged and ignored
   */
  dispatch(event: WalkthroughEvent): WalkthroughState {
    const previousState = this.state;

    this.log(`Dispatch: ${event.type} (current: ${this.state.machineState})`);

    // Find matching transition
    const transition = this.findTransition(this.state, event);

    if (!transition) {
      this.log(
        `No valid transition for ${event.type} from ${this.state.machineState}`,
        "warn",
      );
      return this.state;
    }

    // Apply state changes based on event
    const newState = this.applyTransition(this.state, event, transition.to);

    // Update internal state
    this.state = newState;

    this.log(
      `Transition: ${previousState.machineState} → ${newState.machineState} via ${event.type}`,
    );

    // Notify listeners
    this.notifyListeners(newState, event, previousState);

    return newState;
  }

  /**
   * Check if a transition is valid without executing it
   */
  canTransition(event: WalkthroughEvent): boolean {
    return this.findTransition(this.state, event) !== null;
  }

  /**
   * Get all valid event types for current state
   */
  getValidEvents(): WalkthroughEvent["type"][] {
    const currentState = this.state.machineState;
    const validTypes = new Set<WalkthroughEvent["type"]>();

    for (const transition of TRANSITIONS) {
      if (transition.from === currentState || transition.from === "*") {
        validTypes.add(transition.event);
      }
    }

    return Array.from(validTypes);
  }

  /**
   * Subscribe to state changes
   *
   * @returns Unsubscribe function
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Find the first matching transition for the given state and event
   */
  private findTransition(
    state: WalkthroughState,
    event: WalkthroughEvent,
  ): TransitionDef | null {
    for (const transition of TRANSITIONS) {
      // Check if transition matches current state
      if (transition.from !== state.machineState && transition.from !== "*") {
        continue;
      }

      // Check if transition matches event type
      if (transition.event !== event.type) {
        continue;
      }

      // Check guard condition
      if (transition.guard && !transition.guard(state, event)) {
        continue;
      }

      return transition;
    }

    return null;
  }

  /**
   * Apply state changes based on event and return new state
   *
   * This is where the actual state mutations happen (immutably).
   */
  private applyTransition(
    state: WalkthroughState,
    event: WalkthroughEvent,
    nextMachineState: WalkthroughMachineState,
  ): WalkthroughState {
    const now = Date.now();

    // Base state update
    let newState: WalkthroughState = {
      ...state,
      machineState: nextMachineState,
      previousState: state.machineState,
      timing: {
        ...state.timing,
        lastActivityAt: now,
      },
    };

    // Apply event-specific state changes
    switch (event.type) {
      case "START": {
        const startEvent = event as { workflowId: number; tabId: number };
        newState = {
          ...newState,
          sessionId: generateSessionId(),
          workflowId: startEvent.workflowId,
          tabs: {
            primaryTabId: startEvent.tabId,
            activeTabIds: [startEvent.tabId],
            readyTabIds: [],
          },
          timing: {
            sessionStartedAt: now,
            lastActivityAt: now,
            expiresAt: now + SESSION_TIMEOUT_MS,
          },
        };
        break;
      }

      case "DATA_LOADED": {
        const dataEvent = event as {
          workflow: {
            name: string;
            starting_url: string;
            steps: unknown[];
          };
          tabId: number;
        };
        newState = {
          ...newState,
          workflowName: dataEvent.workflow.name,
          startingUrl: dataEvent.workflow.starting_url,
          steps: dataEvent.workflow.steps as WalkthroughState["steps"],
          totalSteps: dataEvent.workflow.steps.length,
          currentStepIndex: 0,
          completedStepIndexes: [],
        };
        break;
      }

      case "INIT_FAILED": {
        const failEvent = event as { error: string };
        newState = {
          ...newState,
          errorInfo: {
            type: "api_error",
            message: failEvent.error,
            stepIndex: null,
            retryCount: 0,
          },
        };
        break;
      }

      case "ELEMENT_FOUND": {
        // Clear any error state
        newState = {
          ...newState,
          errorInfo: {
            type: null,
            message: null,
            stepIndex: null,
            retryCount: 0,
          },
          healingInfo: null,
        };
        break;
      }

      case "ELEMENT_NOT_FOUND": {
        const notFoundEvent = event as { stepIndex: number };
        newState = {
          ...newState,
          healingInfo: {
            inProgress: true,
            candidateCount: 0,
            bestScore: null,
            aiValidationRequested: false,
          },
          errorInfo: {
            type: "element_not_found",
            message: "Target element not found",
            stepIndex: notFoundEvent.stepIndex,
            retryCount: state.errorInfo.retryCount,
          },
        };
        break;
      }

      case "ACTION_DETECTED": {
        const actionEvent = event as { stepIndex: number };
        // Mark step as completed
        newState = {
          ...newState,
          completedStepIndexes: [
            ...state.completedStepIndexes,
            actionEvent.stepIndex,
          ],
        };
        break;
      }

      case "ACTION_INVALID": {
        const invalidEvent = event as { stepIndex: number };
        const currentRetries = state.stepRetries[invalidEvent.stepIndex] ?? 0;
        newState = {
          ...newState,
          stepRetries: {
            ...state.stepRetries,
            [invalidEvent.stepIndex]: currentRetries + 1,
          },
        };
        break;
      }

      case "HEALING_STARTED": {
        const healStartEvent = event as { candidateCount: number };
        newState = {
          ...newState,
          healingInfo: {
            inProgress: true,
            candidateCount: healStartEvent.candidateCount,
            bestScore: null,
            aiValidationRequested: false,
          },
        };
        break;
      }

      case "HEAL_SUCCESS": {
        const healSuccessEvent = event as {
          confidence: number;
          aiValidated: boolean;
        };
        newState = {
          ...newState,
          healingInfo: {
            inProgress: false,
            candidateCount: state.healingInfo?.candidateCount ?? 0,
            bestScore: healSuccessEvent.confidence,
            aiValidationRequested: healSuccessEvent.aiValidated,
          },
          errorInfo: {
            type: null,
            message: null,
            stepIndex: null,
            retryCount: 0,
          },
        };
        break;
      }

      case "HEAL_FAILED": {
        const healFailEvent = event as { reason: string; stepIndex: number };
        newState = {
          ...newState,
          healingInfo: {
            inProgress: false,
            candidateCount: state.healingInfo?.candidateCount ?? 0,
            bestScore: null,
            aiValidationRequested: false,
          },
          errorInfo: {
            type: "healing_failed",
            message: healFailEvent.reason,
            stepIndex: healFailEvent.stepIndex,
            retryCount: state.errorInfo.retryCount,
          },
        };
        break;
      }

      case "NEXT_STEP": {
        if (hasNextStep(state)) {
          newState = {
            ...newState,
            currentStepIndex: state.currentStepIndex + 1,
          };
        }
        break;
      }

      case "PREV_STEP": {
        if (hasPreviousStep(state)) {
          newState = {
            ...newState,
            currentStepIndex: state.currentStepIndex - 1,
          };
        }
        break;
      }

      case "JUMP_TO_STEP": {
        const jumpEvent = event as { stepIndex: number };
        newState = {
          ...newState,
          currentStepIndex: jumpEvent.stepIndex,
          // Clear navigation state if we were navigating
          navigation: {
            inProgress: false,
            tabId: null,
            sourceUrl: null,
            targetUrl: null,
            startedAt: null,
          },
        };
        break;
      }

      case "URL_CHANGED": {
        const urlEvent = event as { tabId: number; url: string };

        // Special-case: explicit navigate steps can complete themselves on URL change.
        // This prevents "navigate" steps (with empty selectors) from blocking progress.
        const currentStep = state.steps[state.currentStepIndex] as
          | { action_type?: string; action_data?: unknown }
          | undefined;
        if (currentStep?.action_type === "navigate") {
          const actionData = currentStep.action_data as
            | Record<string, unknown>
            | null
            | undefined;
          const expectedUrl =
            (typeof actionData?.target_url === "string"
              ? actionData?.target_url
              : undefined) ??
            (typeof actionData?.targetUrl === "string"
              ? actionData?.targetUrl
              : undefined);

          const shouldAdvance = expectedUrl
            ? doesNavigateUrlMatchExpected(expectedUrl, urlEvent.url)
            : true; // Legacy navigate steps: advance on any URL change

          if (shouldAdvance) {
            newState = {
              ...newState,
              completedStepIndexes: state.completedStepIndexes.includes(
                state.currentStepIndex,
              )
                ? state.completedStepIndexes
                : [...state.completedStepIndexes, state.currentStepIndex],
              currentStepIndex: hasNextStep(state)
                ? state.currentStepIndex + 1
                : state.currentStepIndex,
            };
          }
        }

        newState = {
          ...newState,
          navigation: {
            inProgress: true,
            tabId: urlEvent.tabId,
            sourceUrl: state.navigation.targetUrl ?? state.startingUrl,
            targetUrl: urlEvent.url,
            startedAt: now,
          },
        };
        break;
      }

      case "PAGE_LOADED": {
        newState = {
          ...newState,
          navigation: {
            inProgress: false,
            tabId: null,
            sourceUrl: null,
            targetUrl: null,
            startedAt: null,
          },
        };
        break;
      }

      case "NAVIGATION_TIMEOUT": {
        newState = {
          ...newState,
          navigation: {
            ...state.navigation,
            inProgress: false,
            tabId: null,
          },
          errorInfo: {
            type: "navigation_timeout",
            message: "Page navigation timed out",
            stepIndex: state.currentStepIndex,
            retryCount: state.errorInfo.retryCount,
          },
        };
        break;
      }

      case "TAB_READY": {
        const tabReadyEvent = event as { tabId: number };
        if (!state.tabs.readyTabIds.includes(tabReadyEvent.tabId)) {
          newState = {
            ...newState,
            tabs: {
              ...state.tabs,
              readyTabIds: [...state.tabs.readyTabIds, tabReadyEvent.tabId],
            },
          };
        }
        break;
      }

      case "TAB_CLOSED": {
        const tabClosedEvent = event as { tabId: number };
        // If primary tab closed, reset to idle state (like EXIT)
        if (tabClosedEvent.tabId === state.tabs.primaryTabId) {
          newState = {
            ...createIdleState(),
            sessionId: state.sessionId, // Keep for final log
          };
        } else {
          // Non-primary tab: just remove from lists
          newState = {
            ...newState,
            tabs: {
              ...state.tabs,
              activeTabIds: state.tabs.activeTabIds.filter(
                (id) => id !== tabClosedEvent.tabId,
              ),
              readyTabIds: state.tabs.readyTabIds.filter(
                (id) => id !== tabClosedEvent.tabId,
              ),
            },
          };
        }
        break;
      }

      case "RETRY": {
        newState = {
          ...newState,
          errorInfo: {
            type: null,
            message: null,
            stepIndex: null,
            retryCount: state.errorInfo.retryCount + 1,
          },
        };
        break;
      }

      case "SKIP_STEP": {
        if (hasNextStep(state)) {
          newState = {
            ...newState,
            currentStepIndex: state.currentStepIndex + 1,
            errorInfo: {
              type: null,
              message: null,
              stepIndex: null,
              retryCount: 0,
            },
          };
        }
        break;
      }

      case "EXIT": {
        // Reset to idle state but preserve session ID for logging
        newState = {
          ...createIdleState(),
          sessionId: state.sessionId, // Keep for final log
        };
        break;
      }
    }

    return newState;
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(
    newState: WalkthroughState,
    event: WalkthroughEvent,
    previousState: WalkthroughState,
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(newState, event, previousState);
      } catch (error) {
        this.log(`Listener error: ${error}`, "error");
      }
    }
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug) {
      return;
    }

    const logger = this.config.logger ?? console[level];
    logger(`[StateMachine] ${message}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `wt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if state is expired based on timing
 */
export function isSessionExpired(state: WalkthroughState): boolean {
  return Date.now() > state.timing.expiresAt;
}

/**
 * Get human-readable description of current state
 */
export function describeState(state: WalkthroughState): string {
  const stepInfo =
    state.totalSteps > 0
      ? ` (step ${state.currentStepIndex + 1}/${state.totalSteps})`
      : "";

  switch (state.machineState) {
    case "IDLE":
      return "No active walkthrough";
    case "INITIALIZING":
      return `Loading workflow ${state.workflowId}...`;
    case "NAVIGATING":
      return `Navigating to ${state.navigation.targetUrl}...`;
    case "SHOWING_STEP":
      return `Showing step${stepInfo}`;
    case "WAITING_ACTION":
      return `Waiting for action${stepInfo}`;
    case "HEALING":
      return `Healing element${stepInfo}`;
    case "TRANSITIONING":
      return `Moving to next step${stepInfo}`;
    case "ERROR":
      return `Error: ${state.errorInfo.message ?? "Unknown error"}`;
    case "COMPLETED":
      return `Completed! ${state.totalSteps} steps finished`;
  }
}
