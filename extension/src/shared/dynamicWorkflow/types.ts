/**
 * Types for the Dynamic Workflow system.
 *
 * The dynamic workflow system guides users through web tasks using AI.
 * Unlike recorded walkthroughs (pre-defined steps), dynamic workflows
 * generate steps on-the-fly based on the current page context.
 */

// ============================================================================
// STATE MACHINE STATES
// ============================================================================

/**
 * All possible states for the dynamic workflow state machine.
 *
 * State transitions:
 * IDLE -> INITIALIZING -> CONFIRMING_ENTITIES -> CAPTURING -> THINKING -> SHOWING_STEP -> WAITING_ACTION -> CAPTURING (loop)
 *                                                    |                        |                |
 *                                                    v                        v                v
 *                                              AUTO_EXECUTING            NAVIGATING         THINKING
 *                                                    |                        |
 *                                                    v                        v
 *                                                CAPTURING              CAPTURING
 *
 * Any state -> ERROR (on failures)
 * Any state -> IDLE (on EXIT or primary TAB_CLOSED)
 * THINKING -> COMPLETED (on GOAL_ACHIEVED)
 */
export type DynamicMachineState =
  | "IDLE" // No active dynamic workflow
  | "INITIALIZING" // Creating session with backend, extracting entities
  | "CONFIRMING_ENTITIES" // Waiting for user to confirm extracted entities
  | "CAPTURING" // Capturing page context (DOM snapshot)
  | "THINKING" // AI is processing context and generating next step
  | "SHOWING_STEP" // Displaying step instruction, finding target element
  | "WAITING_ACTION" // Element found, waiting for user to perform action
  | "AUTO_EXECUTING" // Automatically performing a high-confidence action
  | "NAVIGATING" // Page navigation in progress
  | "ERROR" // Error state (with retry options)
  | "COMPLETED"; // Goal achieved

// ============================================================================
// EVENT TYPES
// ============================================================================

/**
 * Union type of all possible dynamic workflow events.
 *
 * Each event has a `type` discriminator and optional payload fields.
 */
export type DynamicEvent =
  // === Session Lifecycle ===
  | StartEvent
  | SessionCreatedEvent
  | EntitiesConfirmedEvent
  | ExitEvent

  // === Context Capture ===
  | ContextCapturedEvent

  // === AI Responses ===
  | StepReceivedEvent
  | GoalAchievedEvent
  | AiErrorEvent

  // === Element Finding ===
  | ElementFoundEvent
  | ElementNotFoundEvent

  // === User Actions ===
  | ActionCompletedEvent
  | UserCorrectionEvent

  // === Auto-Execution ===
  | ExecutionCompleteEvent
  | ExecutionFailedEvent

  // === Navigation ===
  | UrlChangedEvent
  | PageLoadedEvent

  // === Step Control ===
  | RetryEvent
  | SkipStepEvent

  // === Tab Management ===
  | TabReadyEvent
  | TabClosedEvent

  // === Safety ===
  | LoopDetectedEvent;

// ============================================================================
// SESSION LIFECYCLE EVENTS
// ============================================================================

/** Start a new dynamic workflow session */
export interface StartEvent {
  type: "START";
  goal: string;
  tabId: number;
}

/** Backend session created, entities extracted from goal */
export interface SessionCreatedEvent {
  type: "SESSION_CREATED";
  sessionId: string;
  backendSessionId: number;
  goalEntities: Record<string, string>;
}

/** User confirmed or edited the extracted entities */
export interface EntitiesConfirmedEvent {
  type: "ENTITIES_CONFIRMED";
  confirmedEntities: Record<string, string>;
}

/** User or system requested to exit the workflow */
export interface ExitEvent {
  type: "EXIT";
  reason?: string;
}

// ============================================================================
// CONTEXT CAPTURE EVENTS
// ============================================================================

/** Page context successfully captured */
export interface ContextCapturedEvent {
  type: "CONTEXT_CAPTURED";
  pageContextText: string;
  url: string;
  elementCount: number;
}

// ============================================================================
// AI RESPONSE EVENTS
// ============================================================================

/** AI generated a next step */
export interface StepReceivedEvent {
  type: "STEP_RECEIVED";
  step: DynamicStep;
}

/** AI determined the goal has been achieved */
export interface GoalAchievedEvent {
  type: "GOAL_ACHIEVED";
  message?: string;
}

/** AI returned an error */
export interface AiErrorEvent {
  type: "AI_ERROR";
  error: string;
}

// ============================================================================
// ELEMENT FINDING EVENTS
// ============================================================================

/** Target element found and interactable */
export interface ElementFoundEvent {
  type: "ELEMENT_FOUND";
}

/** Target element not found in DOM */
export interface ElementNotFoundEvent {
  type: "ELEMENT_NOT_FOUND";
  reason: string;
}

// ============================================================================
// USER ACTION EVENTS
// ============================================================================

/** User completed the action for the current step */
export interface ActionCompletedEvent {
  type: "ACTION_COMPLETED";
  summary: CompletedStepSummary;
}

/** User provided a correction or additional context */
export interface UserCorrectionEvent {
  type: "USER_CORRECTION";
  correctionText: string;
}

// ============================================================================
// AUTO-EXECUTION EVENTS
// ============================================================================

/** Auto-execution completed successfully */
export interface ExecutionCompleteEvent {
  type: "EXECUTION_COMPLETE";
  summary: CompletedStepSummary;
}

/** Auto-execution failed */
export interface ExecutionFailedEvent {
  type: "EXECUTION_FAILED";
  reason: string;
}

// ============================================================================
// NAVIGATION EVENTS
// ============================================================================

/** URL changed (navigation started or redirect) */
export interface UrlChangedEvent {
  type: "URL_CHANGED";
  url: string;
}

/** Page finished loading after navigation */
export interface PageLoadedEvent {
  type: "PAGE_LOADED";
  url: string;
}

// ============================================================================
// STEP CONTROL EVENTS
// ============================================================================

/** Retry from error state */
export interface RetryEvent {
  type: "RETRY";
}

/** Skip the current step */
export interface SkipStepEvent {
  type: "SKIP_STEP";
}

// ============================================================================
// TAB MANAGEMENT EVENTS
// ============================================================================

/** Content script is ready in a tab */
export interface TabReadyEvent {
  type: "TAB_READY";
  tabId: number;
}

/** Tab was closed */
export interface TabClosedEvent {
  type: "TAB_CLOSED";
  tabId: number;
}

// ============================================================================
// SAFETY EVENTS
// ============================================================================

/** Loop detected in AI step generation */
export interface LoopDetectedEvent {
  type: "LOOP_DETECTED";
  message: string;
}

// ============================================================================
// DOMAIN TYPES
// ============================================================================

/**
 * A single step generated by the AI.
 *
 * Contains the instruction for the user, the target element information,
 * and metadata about confidence and automation level.
 */
export interface DynamicStep {
  /** Human-readable instruction for the user */
  instruction: string;
  /** Label of the target field/element */
  fieldLabel: string;
  /** Type of action to perform */
  actionType:
    | "click"
    | "input_commit"
    | "select_change"
    | "submit"
    | "navigate"
    | "wait";
  /** Index of target element in the captured context */
  elementIndex: number;
  /** CSS selector hint for finding the element */
  selectorHint?: string;
  /** Value to auto-fill for input fields */
  autoFillValue?: string;
  /** AI confidence score (0-1) */
  confidence: number;
  /** AI reasoning for this step */
  reasoning: string;
  /** Automation level: auto (execute without confirmation), confirm (show then execute), manual (user does it) */
  automationLevel: "auto" | "confirm" | "manual";
  /** Optional message from AI to display to user */
  aiMessage?: string;
  /** Estimated progress toward goal completion (0-100) */
  progressEstimate: number;
}

/**
 * Summary of a completed step for history tracking.
 */
export interface CompletedStepSummary {
  /** Step number (1-based) */
  stepNumber: number;
  /** The instruction that was shown */
  instruction: string;
  /** Type of action performed */
  actionType: string;
  /** Label of the field/element */
  fieldLabel: string;
  /** Whether the step completed successfully */
  success: boolean;
  /** Value that was entered (for input steps) */
  valueEntered?: string;
}

// ============================================================================
// UNIFIED STATE INTERFACE
// ============================================================================

/**
 * Complete dynamic workflow state.
 *
 * This interface is:
 * - Stored in chrome.storage.session by the session manager
 * - Broadcast to content scripts on every change
 * - Fully serializable (no Map, Set, or functions)
 */
export interface DynamicWorkflowState {
  // === State Machine ===
  /** Current state machine state */
  machineState: DynamicMachineState;

  // === Session Identity ===
  /** Client-side session ID */
  sessionId: string | null;
  /** Backend session ID for API calls */
  backendSessionId: number | null;

  // === Goal & Entities ===
  /** The user's stated goal */
  goal: string;
  /** Entities extracted from the goal (e.g., { "name": "John", "email": "john@example.com" }) */
  goalEntities: Record<string, string>;
  /** Whether entities have been confirmed by the user */
  confirmedEntities: boolean;

  // === Current Step ===
  /** The current step being shown/executed */
  currentStep: DynamicStep | null;
  /** History of completed steps */
  stepHistory: CompletedStepSummary[];
  /** Total number of steps completed so far */
  stepCount: number;

  // === Context Capture ===
  /** URL of the last page context capture */
  lastCaptureUrl: string | null;
  /** Timestamp of the last page context capture */
  lastCaptureTimestamp: number | null;

  // === AI State ===
  /** Whether the AI is currently processing */
  aiThinking: boolean;
  /** Latest message from the AI to display */
  aiMessage: string | null;
  /** Estimated progress toward goal (0-100) */
  progressEstimate: number;

  // === Error State ===
  errorInfo: {
    /** Type of error */
    type: string | null;
    /** Human-readable error message */
    message: string | null;
  };

  // === Navigation State ===
  navigation: {
    /** Is a page navigation in progress? */
    inProgress: boolean;
    /** URL we're navigating to */
    targetUrl: string | null;
  };

  // === Tab Management ===
  tabs: {
    /** Primary tab where workflow started */
    primaryTabId: number | null;
    /** All tabs participating in workflow */
    activeTabIds: number[];
  };

  // === Timing ===
  timing: {
    /** When session was created */
    startedAt: number | null;
    /** Last state update timestamp */
    lastActivityAt: number | null;
    /** When session expires */
    expiresAt: number | null;
  };

  // === Loop Detection ===
  loopDetection: {
    /** Hash of the last page context sent to AI */
    lastContextHash: string | null;
    /** Number of consecutive times the same context was sent */
    consecutiveRepeats: number;
    /** Last action type attempted */
    lastAction: string | null;
  };
}

// ============================================================================
// MESSAGE PROTOCOL
// ============================================================================

/**
 * Message type constants for cross-context communication.
 * Follows the same pattern as WALKTHROUGH_MESSAGE_TYPES.
 */
export const DYNAMIC_MESSAGE_TYPES = {
  /** Command from content/popup to background */
  COMMAND: "DYNAMIC_COMMAND",
  /** State broadcast from background to content */
  STATE_CHANGED: "DYNAMIC_STATE_CHANGED",
  /** Content script ready handshake */
  TAB_READY: "DYNAMIC_TAB_READY",
  /** Context report from content to background */
  REPORT_CONTEXT: "DYNAMIC_REPORT_CONTEXT",
} as const;

export type DynamicMessageType =
  (typeof DYNAMIC_MESSAGE_TYPES)[keyof typeof DYNAMIC_MESSAGE_TYPES];

// ============================================================================
// COMMAND TYPES
// ============================================================================

/**
 * Commands that can be sent via DYNAMIC_COMMAND message.
 */
export type DynamicCommand =
  | "START"
  | "REPORT_ACTION"
  | "REPORT_CONTEXT"
  | "FEEDBACK"
  | "SKIP"
  | "EXIT"
  | "GET_STATE"
  | "CONFIRM_ENTITIES";

// ============================================================================
// MESSAGE INTERFACES
// ============================================================================

/**
 * Command message: Content/Popup -> Background
 */
export interface DynamicCommandMessage {
  type: typeof DYNAMIC_MESSAGE_TYPES.COMMAND;
  command: DynamicCommand;
  payload?: Record<string, unknown>;
}

/**
 * State changed broadcast: Background -> Content
 */
export interface DynamicStateChangedMessage {
  type: typeof DYNAMIC_MESSAGE_TYPES.STATE_CHANGED;
  state: DynamicWorkflowState;
  /** What triggered this state change */
  trigger: string;
}

/**
 * Tab ready handshake: Content -> Background
 */
export interface DynamicTabReadyMessage {
  type: typeof DYNAMIC_MESSAGE_TYPES.TAB_READY;
  tabId: number;
  url: string;
}

/**
 * Context report: Content -> Background
 */
export interface DynamicReportContextMessage {
  type: typeof DYNAMIC_MESSAGE_TYPES.REPORT_CONTEXT;
  pageContextText: string;
  url: string;
  title: string;
  elementCount: number;
}

/**
 * Union of all dynamic workflow messages.
 */
export type DynamicMessage =
  | DynamicCommandMessage
  | DynamicStateChangedMessage
  | DynamicTabReadyMessage
  | DynamicReportContextMessage;

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Standard response for command messages.
 */
export interface DynamicCommandResponse {
  success: boolean;
  state?: DynamicWorkflowState;
  error?: string;
}

/**
 * Response for TAB_READY message.
 */
export interface DynamicTabReadyResponse {
  /** Is there an active dynamic workflow session? */
  hasActiveSession: boolean;
  /** Current state if session exists */
  state?: DynamicWorkflowState;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard: is message a DynamicMessage?
 */
export function isDynamicMessage(msg: unknown): msg is DynamicMessage {
  if (typeof msg !== "object" || msg === null) {
    return false;
  }

  const message = msg as { type?: string };
  if (typeof message.type !== "string") {
    return false;
  }

  return Object.values(DYNAMIC_MESSAGE_TYPES).includes(
    message.type as DynamicMessageType,
  );
}

/**
 * Type guard for command messages.
 */
export function isDynamicCommandMessage(
  msg: unknown,
): msg is DynamicCommandMessage {
  return isDynamicMessage(msg) && msg.type === DYNAMIC_MESSAGE_TYPES.COMMAND;
}

/**
 * Type guard for state changed messages.
 */
export function isDynamicStateChangedMessage(
  msg: unknown,
): msg is DynamicStateChangedMessage {
  return (
    isDynamicMessage(msg) && msg.type === DYNAMIC_MESSAGE_TYPES.STATE_CHANGED
  );
}

/**
 * Type guard for tab ready messages.
 */
export function isDynamicTabReadyMessage(
  msg: unknown,
): msg is DynamicTabReadyMessage {
  return isDynamicMessage(msg) && msg.type === DYNAMIC_MESSAGE_TYPES.TAB_READY;
}

/**
 * Type guard for context report messages.
 */
export function isDynamicReportContextMessage(
  msg: unknown,
): msg is DynamicReportContextMessage {
  return (
    isDynamicMessage(msg) && msg.type === DYNAMIC_MESSAGE_TYPES.REPORT_CONTEXT
  );
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create initial IDLE state for the dynamic workflow.
 */
export function createIdleDynamicState(): DynamicWorkflowState {
  return {
    machineState: "IDLE",
    sessionId: null,
    backendSessionId: null,
    goal: "",
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
    tabs: { primaryTabId: null, activeTabIds: [] },
    timing: { startedAt: null, lastActivityAt: null, expiresAt: null },
    loopDetection: {
      lastContextHash: null,
      consecutiveRepeats: 0,
      lastAction: null,
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if state is in an active dynamic workflow.
 */
export function isActiveDynamicWorkflow(state: DynamicWorkflowState): boolean {
  return state.machineState !== "IDLE";
}

/**
 * Check if state allows user interaction (skip, feedback, correction).
 */
export function allowsDynamicUserInteraction(
  state: DynamicWorkflowState,
): boolean {
  return (
    state.machineState === "WAITING_ACTION" ||
    state.machineState === "SHOWING_STEP" ||
    state.machineState === "ERROR"
  );
}

/**
 * Type guard to check if an object is a valid DynamicEvent.
 */
export function isDynamicEvent(obj: unknown): obj is DynamicEvent {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const event = obj as { type?: string };
  if (typeof event.type !== "string") {
    return false;
  }

  const validTypes = [
    "START",
    "SESSION_CREATED",
    "ENTITIES_CONFIRMED",
    "CONTEXT_CAPTURED",
    "STEP_RECEIVED",
    "GOAL_ACHIEVED",
    "AI_ERROR",
    "ELEMENT_FOUND",
    "ELEMENT_NOT_FOUND",
    "ACTION_COMPLETED",
    "USER_CORRECTION",
    "URL_CHANGED",
    "PAGE_LOADED",
    "EXECUTION_COMPLETE",
    "EXECUTION_FAILED",
    "RETRY",
    "SKIP_STEP",
    "TAB_READY",
    "TAB_CLOSED",
    "EXIT",
    "LOOP_DETECTED",
  ];

  return validTypes.includes(event.type);
}

/**
 * Get human-readable description of an event.
 */
export function describeDynamicEvent(event: DynamicEvent): string {
  switch (event.type) {
    case "START":
      return `Starting dynamic workflow: "${event.goal}"`;
    case "SESSION_CREATED":
      return `Session created (backend ID: ${event.backendSessionId})`;
    case "ENTITIES_CONFIRMED":
      return `Entities confirmed: ${Object.keys(event.confirmedEntities).length} fields`;
    case "CONTEXT_CAPTURED":
      return `Context captured from ${event.url} (${event.elementCount} elements)`;
    case "STEP_RECEIVED":
      return `Step received: ${event.step.instruction} (confidence: ${Math.round(event.step.confidence * 100)}%)`;
    case "GOAL_ACHIEVED":
      return `Goal achieved${event.message ? `: ${event.message}` : ""}`;
    case "AI_ERROR":
      return `AI error: ${event.error}`;
    case "ELEMENT_FOUND":
      return "Target element found";
    case "ELEMENT_NOT_FOUND":
      return `Element not found: ${event.reason}`;
    case "ACTION_COMPLETED":
      return `Action completed: step ${event.summary.stepNumber}`;
    case "USER_CORRECTION":
      return `User correction: "${event.correctionText}"`;
    case "URL_CHANGED":
      return `URL changed to ${event.url}`;
    case "PAGE_LOADED":
      return `Page loaded: ${event.url}`;
    case "EXECUTION_COMPLETE":
      return `Auto-execution complete: step ${event.summary.stepNumber}`;
    case "EXECUTION_FAILED":
      return `Auto-execution failed: ${event.reason}`;
    case "RETRY":
      return "Retrying from error";
    case "SKIP_STEP":
      return "Skipping current step";
    case "TAB_READY":
      return `Tab ${event.tabId} ready`;
    case "TAB_CLOSED":
      return `Tab ${event.tabId} closed`;
    case "EXIT":
      return `Exiting${event.reason ? `: ${event.reason}` : ""}`;
    case "LOOP_DETECTED":
      return `Loop detected: ${event.message}`;
  }
}
