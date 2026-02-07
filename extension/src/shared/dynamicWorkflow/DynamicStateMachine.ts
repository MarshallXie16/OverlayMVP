/**
 * Dynamic Workflow State Machine
 *
 * Lightweight XState-inspired state machine for managing dynamic workflow state transitions.
 * Pure functions with no DOM or chrome.* dependencies - can be used in both background
 * and content scripts.
 *
 * Design principles:
 * - All state is serializable (no Map, Set, or functions in state)
 * - Transitions are pure functions that return new state
 * - Guards prevent invalid transitions
 * - Listeners notified after each transition
 *
 * Key difference from WalkthroughStateMachine:
 * - Steps are generated dynamically by AI (not pre-loaded)
 * - The CAPTURING -> THINKING -> SHOWING_STEP loop is the core cycle
 * - Loop detection prevents infinite AI step generation
 * - Entity confirmation flow before first capture
 */

import type {
  DynamicWorkflowState,
  DynamicMachineState,
  DynamicEvent,
} from "./types";
import { createIdleDynamicState } from "./types";

// ============================================================================
// CONSTANTS
// ============================================================================

/** Session timeout: 30 minutes of inactivity */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Maximum consecutive repeated contexts before loop detection triggers */
export const MAX_LOOP_REPEATS = 3;

/**
 * Patterns that should never be auto-executed (e.g., destructive actions).
 * Phase 2 will use this when auto-execute is enabled.
 */
export const DANGER_PATTERNS =
  /delete|remove|cancel|unsubscribe|close.account|deactivate/i;

// ============================================================================
// TYPES
// ============================================================================

/** Listener callback for state changes */
export type StateListener = (
  newState: DynamicWorkflowState,
  event: DynamicEvent,
  previousState: DynamicWorkflowState,
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
  from: DynamicMachineState | "*";
  event: DynamicEvent["type"];
  to: DynamicMachineState;
  guard?: (state: DynamicWorkflowState, event: DynamicEvent) => boolean;
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
      if (event.type !== "TAB_CLOSED") return false;
      return state.tabs.primaryTabId === event.tabId;
    },
  },
  {
    from: "*",
    event: "LOOP_DETECTED",
    to: "ERROR",
  },
  {
    from: "*",
    event: "AI_ERROR",
    to: "ERROR",
  },

  // === SESSION LIFECYCLE ===
  {
    from: "IDLE",
    event: "START",
    to: "INITIALIZING",
  },
  {
    from: "INITIALIZING",
    event: "SESSION_CREATED",
    to: "CONFIRMING_ENTITIES",
  },

  // === ENTITY CONFIRMATION ===
  {
    from: "CONFIRMING_ENTITIES",
    event: "ENTITIES_CONFIRMED",
    to: "CAPTURING",
  },

  // === CONTEXT CAPTURE ===
  {
    from: "CAPTURING",
    event: "CONTEXT_CAPTURED",
    to: "THINKING",
  },

  // === AI THINKING ===
  // Phase 1: Auto-execute guard always returns false.
  // Phase 2 will enable: step.confidence >= 0.9 && step.actionType === "click" && !DANGER_PATTERNS.test(...)
  {
    from: "THINKING",
    event: "STEP_RECEIVED",
    to: "AUTO_EXECUTING",
    guard: (_state, event) => {
      if (event.type !== "STEP_RECEIVED") return false;
      // Phase 1: No auto-execute, all steps go to manual flow
      return false;
      // Phase 2 will enable:
      // const step = event.step;
      // return (
      //   step.confidence >= 0.9 &&
      //   step.actionType === "click" &&
      //   !DANGER_PATTERNS.test(step.instruction) &&
      //   !DANGER_PATTERNS.test(step.fieldLabel)
      // );
    },
  },
  {
    from: "THINKING",
    event: "STEP_RECEIVED",
    to: "SHOWING_STEP",
    // No guard needed - this is the fallback after auto-execute guard fails
  },
  {
    from: "THINKING",
    event: "GOAL_ACHIEVED",
    to: "COMPLETED",
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
    to: "CAPTURING",
    // Element not found: re-capture page context so AI can re-evaluate with fresh DOM
  },

  // === WAITING FOR USER ACTION ===
  {
    from: "WAITING_ACTION",
    event: "ACTION_COMPLETED",
    to: "CAPTURING",
    // User completed the step, capture new context for next step
  },
  {
    from: "WAITING_ACTION",
    event: "USER_CORRECTION",
    to: "THINKING",
    // User provided correction, let AI re-evaluate
  },
  {
    from: "WAITING_ACTION",
    event: "URL_CHANGED",
    to: "NAVIGATING",
  },
  {
    from: "WAITING_ACTION",
    event: "SKIP_STEP",
    to: "CAPTURING",
    // Skip this step, capture context for next one
  },

  // === AUTO-EXECUTION ===
  {
    from: "AUTO_EXECUTING",
    event: "EXECUTION_COMPLETE",
    to: "CAPTURING",
    // Auto-execution succeeded, capture new context for next step
  },
  {
    from: "AUTO_EXECUTING",
    event: "EXECUTION_FAILED",
    to: "SHOWING_STEP",
    // Auto-execution failed, fall back to manual mode
  },

  // === NAVIGATION ===
  {
    from: "NAVIGATING",
    event: "PAGE_LOADED",
    to: "CAPTURING",
    // Page loaded after navigation, capture new context
  },

  // === ERROR RECOVERY ===
  {
    from: "ERROR",
    event: "RETRY",
    to: "CAPTURING",
    // Retry from error: re-capture context and try again
  },
  {
    from: "ERROR",
    event: "USER_CORRECTION",
    to: "THINKING",
    // User provided correction from error state, let AI re-evaluate
  },

  // === TAB MANAGEMENT ===
  {
    from: "*",
    event: "TAB_READY",
    to: "CAPTURING",
    guard: (state) =>
      // Only transition to CAPTURING if we're in a state where it makes sense
      state.machineState === "NAVIGATING",
  },
];

// ============================================================================
// STATE MACHINE CLASS
// ============================================================================

/**
 * Dynamic Workflow State Machine
 *
 * Manages state transitions for the dynamic workflow system. Thread-safe and serializable.
 *
 * @example
 * ```typescript
 * const machine = new DynamicStateMachine();
 *
 * // Subscribe to changes
 * machine.subscribe((state, event) => {
 *   console.log(`Transitioned to ${state.machineState} via ${event.type}`);
 * });
 *
 * // Dispatch events
 * machine.dispatch({ type: 'START', goal: 'Fill out the contact form', tabId: 1 });
 * ```
 */
export class DynamicStateMachine {
  private state: DynamicWorkflowState;
  private listeners: Set<StateListener> = new Set();
  private config: StateMachineConfig;

  constructor(
    initialState?: DynamicWorkflowState,
    config?: StateMachineConfig,
  ) {
    this.state = initialState ?? createIdleDynamicState();
    this.config = config ?? {};
  }

  /**
   * Get current state (immutable snapshot).
   */
  getState(): DynamicWorkflowState {
    return this.state;
  }

  /**
   * Set state directly (used for restoring from storage).
   */
  setState(state: DynamicWorkflowState): void {
    this.state = state;
  }

  /**
   * Dispatch an event to trigger a state transition.
   *
   * @returns New state after transition (or current state if transition invalid)
   * @throws Never throws - invalid transitions are logged and ignored
   */
  dispatch(event: DynamicEvent): DynamicWorkflowState {
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
      `Transition: ${previousState.machineState} -> ${newState.machineState} via ${event.type}`,
    );

    // Notify listeners
    this.notifyListeners(newState, event, previousState);

    return newState;
  }

  /**
   * Check if a transition is valid without executing it.
   */
  canTransition(event: DynamicEvent): boolean {
    return this.findTransition(this.state, event) !== null;
  }

  /**
   * Get all valid event types for current state.
   */
  getValidEvents(): DynamicEvent["type"][] {
    const currentState = this.state.machineState;
    const validTypes = new Set<DynamicEvent["type"]>();

    for (const transition of TRANSITIONS) {
      if (transition.from === currentState || transition.from === "*") {
        validTypes.add(transition.event);
      }
    }

    return Array.from(validTypes);
  }

  /**
   * Subscribe to state changes.
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
   * Find the first matching transition for the given state and event.
   */
  private findTransition(
    state: DynamicWorkflowState,
    event: DynamicEvent,
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
   * Apply state changes based on event and return new state.
   *
   * This is where the actual state mutations happen (immutably).
   * Each event type updates the relevant fields of the state.
   */
  private applyTransition(
    state: DynamicWorkflowState,
    event: DynamicEvent,
    nextMachineState: DynamicMachineState,
  ): DynamicWorkflowState {
    const now = Date.now();

    // Base state update: set new machine state and update timing
    let newState: DynamicWorkflowState = {
      ...state,
      machineState: nextMachineState,
      timing: {
        ...state.timing,
        lastActivityAt: now,
      },
    };

    // Apply event-specific state changes
    switch (event.type) {
      case "START": {
        newState = {
          ...newState,
          sessionId: generateSessionId(),
          backendSessionId: null,
          goal: event.goal,
          goalEntities: {},
          confirmedEntities: false,
          currentStep: null,
          stepHistory: [],
          stepCount: 0,
          lastCaptureUrl: null,
          lastCaptureTimestamp: null,
          aiThinking: false,
          aiMessage: null,
          progressEstimate: 0,
          errorInfo: { type: null, message: null },
          navigation: { inProgress: false, targetUrl: null },
          tabs: {
            primaryTabId: event.tabId,
            activeTabIds: [event.tabId],
          },
          timing: {
            startedAt: now,
            lastActivityAt: now,
            expiresAt: now + SESSION_TIMEOUT_MS,
          },
          loopDetection: {
            lastContextHash: null,
            consecutiveRepeats: 0,
            lastAction: null,
          },
        };
        break;
      }

      case "SESSION_CREATED": {
        newState = {
          ...newState,
          sessionId: event.sessionId,
          backendSessionId: event.backendSessionId,
          goalEntities: event.goalEntities,
        };
        break;
      }

      case "ENTITIES_CONFIRMED": {
        newState = {
          ...newState,
          goalEntities: event.confirmedEntities,
          confirmedEntities: true,
        };
        break;
      }

      case "CONTEXT_CAPTURED": {
        newState = {
          ...newState,
          lastCaptureUrl: event.url,
          lastCaptureTimestamp: now,
          aiThinking: true,
        };
        break;
      }

      case "STEP_RECEIVED": {
        const step = event.step;
        // Determine automation level based on confidence and action type
        let automationLevel: "auto" | "confirm" | "manual";
        if (
          step.confidence >= 0.9 &&
          step.actionType === "click" &&
          !DANGER_PATTERNS.test(step.instruction) &&
          !DANGER_PATTERNS.test(step.fieldLabel)
        ) {
          automationLevel = "auto";
        } else if (step.confidence >= 0.7) {
          automationLevel = "confirm";
        } else {
          automationLevel = "manual";
        }

        newState = {
          ...newState,
          currentStep: {
            ...step,
            automationLevel,
          },
          aiThinking: false,
          aiMessage: step.aiMessage ?? null,
          progressEstimate: step.progressEstimate,
          // Reset loop detection on new step
          loopDetection: {
            ...state.loopDetection,
            lastAction: step.actionType,
          },
        };
        break;
      }

      case "GOAL_ACHIEVED": {
        newState = {
          ...newState,
          aiThinking: false,
          aiMessage: event.message ?? "Goal achieved!",
          progressEstimate: 100,
          currentStep: null,
        };
        break;
      }

      case "AI_ERROR": {
        newState = {
          ...newState,
          aiThinking: false,
          errorInfo: {
            type: "ai_error",
            message: event.error,
          },
        };
        break;
      }

      case "ELEMENT_FOUND": {
        // Clear any prior error, element is ready for interaction
        newState = {
          ...newState,
          errorInfo: { type: null, message: null },
        };
        break;
      }

      case "ELEMENT_NOT_FOUND": {
        // Re-capture page context so AI can re-evaluate with fresh DOM
        newState = {
          ...newState,
          aiThinking: false,
          aiMessage: `Element not found, re-analyzing page...`,
          currentStep: null,
        };
        break;
      }

      case "ACTION_COMPLETED": {
        const summary = event.summary;
        newState = {
          ...newState,
          stepHistory: [...state.stepHistory, summary],
          stepCount: state.stepCount + 1,
          currentStep: null,
          // Reset loop detection on successful action
          loopDetection: {
            lastContextHash: null,
            consecutiveRepeats: 0,
            lastAction: null,
          },
        };
        break;
      }

      case "USER_CORRECTION": {
        newState = {
          ...newState,
          aiThinking: true,
          aiMessage: "Processing your feedback...",
        };
        break;
      }

      case "URL_CHANGED": {
        newState = {
          ...newState,
          navigation: {
            inProgress: true,
            targetUrl: event.url,
          },
        };
        break;
      }

      case "PAGE_LOADED": {
        newState = {
          ...newState,
          navigation: {
            inProgress: false,
            targetUrl: null,
          },
        };
        break;
      }

      case "EXECUTION_COMPLETE": {
        const execSummary = event.summary;
        newState = {
          ...newState,
          stepHistory: [...state.stepHistory, execSummary],
          stepCount: state.stepCount + 1,
          currentStep: null,
          // Reset loop detection on successful execution
          loopDetection: {
            lastContextHash: null,
            consecutiveRepeats: 0,
            lastAction: null,
          },
        };
        break;
      }

      case "EXECUTION_FAILED": {
        // Fall back to SHOWING_STEP with error context
        // The currentStep is preserved so it can be shown to the user
        newState = {
          ...newState,
          aiMessage: `Auto-execution failed: ${event.reason}. Please complete this step manually.`,
        };
        break;
      }

      case "RETRY": {
        newState = {
          ...newState,
          errorInfo: { type: null, message: null },
        };
        break;
      }

      case "SKIP_STEP": {
        newState = {
          ...newState,
          stepHistory: [
            ...state.stepHistory,
            {
              stepNumber: state.stepCount + 1,
              instruction: state.currentStep?.instruction ?? "Skipped step",
              actionType: state.currentStep?.actionType ?? "unknown",
              fieldLabel: state.currentStep?.fieldLabel ?? "",
              success: false,
            },
          ],
          stepCount: state.stepCount + 1,
          currentStep: null,
          errorInfo: { type: null, message: null },
        };
        break;
      }

      case "TAB_READY": {
        // Reset navigation state since the page is now loaded and ready
        newState = {
          ...newState,
          navigation: {
            inProgress: false,
            targetUrl: null,
          },
        };
        if (!state.tabs.activeTabIds.includes(event.tabId)) {
          newState = {
            ...newState,
            tabs: {
              ...state.tabs,
              activeTabIds: [...state.tabs.activeTabIds, event.tabId],
            },
          };
        }
        break;
      }

      case "TAB_CLOSED": {
        if (event.tabId === state.tabs.primaryTabId) {
          // Primary tab closed: reset to idle (preserving sessionId for final log)
          newState = {
            ...createIdleDynamicState(),
            sessionId: state.sessionId,
          };
        } else {
          // Non-primary tab: just remove from active list
          newState = {
            ...newState,
            tabs: {
              ...state.tabs,
              activeTabIds: state.tabs.activeTabIds.filter(
                (id) => id !== event.tabId,
              ),
            },
          };
        }
        break;
      }

      case "EXIT": {
        // Reset to idle state but preserve session ID for logging
        newState = {
          ...createIdleDynamicState(),
          sessionId: state.sessionId,
        };
        break;
      }

      case "LOOP_DETECTED": {
        newState = {
          ...newState,
          aiThinking: false,
          errorInfo: {
            type: "loop_detected",
            message: event.message,
          },
        };
        break;
      }
    }

    return newState;
  }

  /**
   * Notify all listeners of state change.
   */
  private notifyListeners(
    newState: DynamicWorkflowState,
    event: DynamicEvent,
    previousState: DynamicWorkflowState,
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
   * Log message if debug enabled.
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug) {
      return;
    }

    const logger = this.config.logger ?? console[level];
    logger(`[DynamicStateMachine] ${message}`);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique session ID for dynamic workflows.
 */
function generateSessionId(): string {
  return `dw_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if session is expired based on timing.
 */
export function isSessionExpired(state: DynamicWorkflowState): boolean {
  if (state.timing.expiresAt === null) {
    return false;
  }
  return Date.now() > state.timing.expiresAt;
}

/**
 * Get human-readable description of current state.
 */
export function describeState(state: DynamicWorkflowState): string {
  const stepInfo =
    state.stepCount > 0 ? ` (${state.stepCount} steps completed)` : "";

  switch (state.machineState) {
    case "IDLE":
      return "No active dynamic workflow";
    case "INITIALIZING":
      return `Setting up workflow for: "${state.goal}"`;
    case "CONFIRMING_ENTITIES":
      return "Confirming extracted information";
    case "CAPTURING":
      return `Capturing page context${stepInfo}`;
    case "THINKING":
      return `AI is thinking${stepInfo}`;
    case "SHOWING_STEP":
      return `Showing step: ${state.currentStep?.instruction ?? ""}${stepInfo}`;
    case "WAITING_ACTION":
      return `Waiting for action${stepInfo}`;
    case "AUTO_EXECUTING":
      return `Auto-executing step${stepInfo}`;
    case "NAVIGATING":
      return `Navigating to ${state.navigation.targetUrl}...`;
    case "ERROR":
      return `Error: ${state.errorInfo.message ?? "Unknown error"}`;
    case "COMPLETED":
      return `Completed! ${state.stepCount} steps finished. ${state.aiMessage ?? ""}`;
  }
}
