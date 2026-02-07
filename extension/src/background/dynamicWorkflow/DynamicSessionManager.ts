/**
 * Dynamic Workflow Session Manager
 *
 * The SINGLE SOURCE OF TRUTH for dynamic workflow state.
 *
 * Responsibilities:
 * - Owns the DynamicStateMachine instance
 * - Persists state to chrome.storage.session
 * - Broadcasts state changes to content scripts
 * - Handles session timeout
 * - Communicates with backend API for AI step generation
 * - Tracks participating tabs
 *
 * Design:
 * - All state mutations go through dispatch()
 * - State is automatically persisted after each mutation
 * - Content scripts receive state via chrome.tabs.sendMessage
 *
 * Key difference from walkthrough SessionManager:
 * - Steps are generated dynamically via backend API (not pre-loaded)
 * - The CAPTURING -> THINKING -> SHOWING_STEP -> WAITING_ACTION loop is the core cycle
 * - Entity confirmation flow before first capture
 * - Backend session creation and AI step requests
 */

import {
  DynamicStateMachine,
  SESSION_TIMEOUT_MS,
  describeState,
} from "../../shared/dynamicWorkflow/DynamicStateMachine";
import type {
  DynamicWorkflowState,
  DynamicEvent,
  DynamicStep,
  CompletedStepSummary,
  DynamicStateChangedMessage,
} from "../../shared/dynamicWorkflow/types";
import {
  createIdleDynamicState,
  isActiveDynamicWorkflow,
  DYNAMIC_MESSAGE_TYPES,
} from "../../shared/dynamicWorkflow/types";
import { makeRequest } from "../../shared/api";

// ============================================================================
// CONSTANTS
// ============================================================================

const DYNAMIC_SESSION_STORAGE_KEY = "dynamic_workflow_session";

// ============================================================================
// API HELPER
// ============================================================================

/**
 * Backend API response for session creation.
 */
interface CreateSessionResponse {
  session_id: number;
  goal_entities: Record<string, string>;
}

/**
 * Backend API response for step generation (flat, snake_case from FastAPI).
 */
interface StepApiResponse {
  instruction: string;
  field_label: string;
  action_type: string;
  element_index: number;
  selector_hint?: string;
  auto_fill_value?: string;
  confidence: number;
  reasoning: string;
  goal_achieved: boolean;
  progress_estimate: number;
  automation_level: string;
  ai_message?: string;
}

/**
 * Convert snake_case backend response to camelCase DynamicStep.
 */
function apiResponseToStep(response: StepApiResponse): DynamicStep {
  return {
    instruction: response.instruction,
    fieldLabel: response.field_label,
    actionType: response.action_type as DynamicStep["actionType"],
    elementIndex: response.element_index,
    selectorHint: response.selector_hint,
    autoFillValue: response.auto_fill_value,
    confidence: response.confidence,
    reasoning: response.reasoning,
    automationLevel:
      response.automation_level as DynamicStep["automationLevel"],
    aiMessage: response.ai_message,
    progressEstimate: response.progress_estimate * 100, // backend sends 0-1, frontend uses 0-100
  };
}

/**
 * Helper for dynamic workflow API calls.
 *
 * The apiClient singleton doesn't have dynamic workflow methods yet,
 * so we call makeRequest directly with the dynamic workflow base path.
 */
async function dynamicApi<T>(
  endpoint: string,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: unknown;
  },
): Promise<T> {
  return makeRequest<T>(`/api/dynamic-workflows${endpoint}`, {
    method: options.method,
    body: options.body,
  });
}

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for DynamicSessionManager */
export interface DynamicSessionManagerConfig {
  /** Enable debug logging */
  debug?: boolean;
}

/** Callback for dynamic session state changes */
export type DynamicStateCallback = (state: DynamicWorkflowState) => void;

// ============================================================================
// SESSION MANAGER
// ============================================================================

/**
 * DynamicSessionManager - Singleton that owns dynamic workflow state
 *
 * Modeled after the walkthrough SessionManager with additions for:
 * - Backend API communication (session creation, step generation, feedback)
 * - Entity confirmation flow
 * - AI-driven step loop (CAPTURING -> THINKING -> SHOWING_STEP -> WAITING_ACTION)
 *
 * @example
 * ```typescript
 * // Initialize on service worker startup
 * await dynamicSessionManager.initialize();
 *
 * // Start a dynamic workflow
 * const state = await dynamicSessionManager.startSession("Fill out the contact form", tabId);
 *
 * // Confirm entities extracted from the goal
 * await dynamicSessionManager.confirmEntities({ name: "John", email: "john@test.com" });
 *
 * // Request next step (with page context from content script)
 * await dynamicSessionManager.requestNextStep(pageContextText, url, elementCount);
 * ```
 */
export class DynamicSessionManager {
  private stateMachine: DynamicStateMachine;
  private initialized = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private stateCallbacks: Set<DynamicStateCallback> = new Set();
  private config: DynamicSessionManagerConfig;

  // Dispatch queue for serialization (prevents race conditions)
  private dispatchQueue: Promise<DynamicWorkflowState> = Promise.resolve(
    createIdleDynamicState(),
  );

  constructor(config?: DynamicSessionManagerConfig) {
    this.config = config ?? {};
    this.stateMachine = new DynamicStateMachine(undefined, {
      debug: this.config.debug,
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize the session manager.
   *
   * Must be called once when service worker starts. Restores any persisted state.
   * Idempotent - safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    this.log("Initializing...");

    // Try to restore persisted state
    const savedState = await this.loadState();

    if (savedState && isActiveDynamicWorkflow(savedState)) {
      // Check if session is expired
      if (
        savedState.timing.expiresAt !== null &&
        Date.now() > savedState.timing.expiresAt
      ) {
        this.log("Session expired, clearing state");
        await this.clearState();
      } else {
        this.log(`Restored session: ${describeState(savedState)}`);
        this.stateMachine.setState(savedState);
        this.startTimeoutTimer();
      }
    }

    this.initialized = true;
    this.log("Initialized");
  }

  /**
   * Get current dynamic workflow state.
   *
   * @returns Current state or null if no active session (IDLE)
   */
  async getState(): Promise<DynamicWorkflowState | null> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();
    if (state.machineState === "IDLE") {
      return null;
    }
    return state;
  }

  /**
   * Check if there's an active dynamic workflow.
   */
  hasActiveSession(): boolean {
    return isActiveDynamicWorkflow(this.stateMachine.getState());
  }

  /**
   * Dispatch an event to the state machine.
   *
   * This is the primary way to mutate state. Events are validated by the
   * state machine, which will reject invalid transitions.
   *
   * Uses a promise queue to serialize dispatch calls and prevent race conditions
   * when multiple events are dispatched rapidly.
   *
   * @param event The event to dispatch
   * @returns New state after transition
   */
  async dispatch(event: DynamicEvent): Promise<DynamicWorkflowState> {
    this.ensureInitialized();

    // Create a promise for this dispatch that will be added to the queue
    const dispatchPromise = this.dispatchQueue
      .catch(() => {
        // Ignore errors from previous dispatches to prevent queue blockage.
        // Each dispatch will handle its own errors.
      })
      .then(async () => {
        return this.dispatchInternal(event);
      });

    // Update queue to include this dispatch
    this.dispatchQueue = dispatchPromise;

    return dispatchPromise;
  }

  // ============================================================================
  // CORE WORKFLOW METHODS
  // ============================================================================

  /**
   * Start a new dynamic workflow session.
   *
   * 1. Dispatches START event to transition IDLE -> INITIALIZING
   * 2. Calls backend API to create session and extract entities
   * 3. Dispatches SESSION_CREATED to transition INITIALIZING -> CONFIRMING_ENTITIES
   *
   * @param goal The user's stated goal (e.g., "Fill out the contact form with my info")
   * @param tabId The tab where the workflow was initiated
   * @returns State in CONFIRMING_ENTITIES (or ERROR if API call fails)
   */
  async startSession(
    goal: string,
    tabId: number,
  ): Promise<DynamicWorkflowState> {
    this.log(`Starting session: "${goal}" on tab ${tabId}`);

    // Step 1: Dispatch START event
    await this.dispatch({ type: "START", goal, tabId });

    // Step 2: Call backend API to create session
    try {
      // Get the starting URL from the primary tab
      let startingUrl = "unknown";
      const currentState = this.stateMachine.getState();
      if (currentState.tabs.primaryTabId) {
        try {
          const tab = await chrome.tabs.get(currentState.tabs.primaryTabId);
          startingUrl = tab.url || "unknown";
        } catch {
          // Tab might not exist yet
        }
      }

      const response = await dynamicApi<CreateSessionResponse>("/sessions", {
        method: "POST",
        body: { goal, starting_url: startingUrl },
      });

      // Step 3: Dispatch SESSION_CREATED with backend response
      const newState = await this.dispatch({
        type: "SESSION_CREATED",
        sessionId: this.stateMachine.getState().sessionId ?? `dw_${Date.now()}`,
        backendSessionId: response.session_id,
        goalEntities: response.goal_entities,
      });

      return newState;
    } catch (error) {
      // API call failed - transition to ERROR state
      this.log(`Failed to create session: ${error}`, "error");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create session";
      const errorState = await this.dispatch({
        type: "AI_ERROR",
        error: errorMessage,
      });
      return errorState;
    }
  }

  /**
   * Confirm entities extracted from the user's goal.
   *
   * Dispatches ENTITIES_CONFIRMED to transition CONFIRMING_ENTITIES -> CAPTURING.
   *
   * @param confirmedEntities The user-confirmed (and potentially edited) entities
   * @returns State in CAPTURING
   */
  async confirmEntities(
    confirmedEntities: Record<string, string>,
  ): Promise<DynamicWorkflowState> {
    this.log(
      `Confirming entities: ${Object.keys(confirmedEntities).length} fields`,
    );
    return this.dispatch({
      type: "ENTITIES_CONFIRMED",
      confirmedEntities,
    });
  }

  /**
   * Request the next step from the AI backend.
   *
   * 1. Dispatches CONTEXT_CAPTURED to transition CAPTURING -> THINKING
   * 2. Calls backend API with page context for step generation
   * 3. Checks if goal is achieved -> dispatches GOAL_ACHIEVED or STEP_RECEIVED
   * 4. On error -> dispatches AI_ERROR
   *
   * @param pageContextText The serialized page context from the content script
   * @param url The current page URL
   * @param elementCount The number of interactive elements captured
   * @returns State with next step (SHOWING_STEP) or completed/error state
   */
  async requestNextStep(
    pageContextText: string,
    url: string,
    title: string,
    elementCount: number,
  ): Promise<DynamicWorkflowState> {
    this.log(`Requesting next step for ${url} (${elementCount} elements)`);

    // Step 1: Dispatch CONTEXT_CAPTURED -> THINKING
    await this.dispatch({
      type: "CONTEXT_CAPTURED",
      pageContextText,
      url,
      elementCount,
    });

    // Step 2: Call backend API for step generation
    const currentState = this.stateMachine.getState();
    const backendSessionId = currentState.backendSessionId;

    if (backendSessionId === null) {
      this.log("No backend session ID, cannot request step", "error");
      return this.dispatch({
        type: "AI_ERROR",
        error: "No backend session. Please restart the workflow.",
      });
    }

    try {
      const response = await dynamicApi<StepApiResponse>(
        `/sessions/${backendSessionId}/step`,
        {
          method: "POST",
          body: {
            page_context: {
              url,
              title,
              interactive_elements: pageContextText,
              status_text: "",
              element_count: elementCount,
            },
          },
        },
      );

      // Step 3: Check response type
      if (response.goal_achieved) {
        return this.dispatch({
          type: "GOAL_ACHIEVED",
          message: response.ai_message || "Goal achieved!",
        });
      }

      // Convert snake_case API response to camelCase DynamicStep
      const step = apiResponseToStep(response);
      return this.dispatch({
        type: "STEP_RECEIVED",
        step,
      });
    } catch (error) {
      // Step 4: Handle API errors
      this.log(`Failed to get next step: ${error}`, "error");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get next step";
      return this.dispatch({
        type: "AI_ERROR",
        error: errorMessage,
      });
    }
  }

  /**
   * Report that the user completed the current step's action.
   *
   * Dispatches ACTION_COMPLETED to transition WAITING_ACTION -> CAPTURING.
   *
   * @param summary Summary of the completed step for history tracking
   * @returns State in CAPTURING (ready for next context capture)
   */
  async reportAction(
    summary: CompletedStepSummary,
  ): Promise<DynamicWorkflowState> {
    this.log(`Action completed: step ${summary.stepNumber}`);
    return this.dispatch({
      type: "ACTION_COMPLETED",
      summary,
    });
  }

  /**
   * Report user feedback/correction for the current step.
   *
   * 1. Dispatches USER_CORRECTION to transition to THINKING
   * 2. Calls backend API with the correction text
   * 3. Dispatches STEP_RECEIVED with the revised step
   *
   * @param correctionText The user's correction or additional context
   * @returns State with revised step (SHOWING_STEP) or error state
   */
  async reportFeedback(correctionText: string): Promise<DynamicWorkflowState> {
    this.log(`User feedback: "${correctionText}"`);

    // Step 1: Dispatch USER_CORRECTION -> THINKING
    await this.dispatch({
      type: "USER_CORRECTION",
      correctionText,
    });

    // Step 2: Call backend API with feedback
    const currentState = this.stateMachine.getState();
    const backendSessionId = currentState.backendSessionId;

    if (backendSessionId === null) {
      this.log("No backend session ID, cannot send feedback", "error");
      return this.dispatch({
        type: "AI_ERROR",
        error: "No backend session. Please restart the workflow.",
      });
    }

    try {
      const response = await dynamicApi<StepApiResponse>(
        `/sessions/${backendSessionId}/feedback`,
        {
          method: "POST",
          body: {
            correction_text: correctionText,
            step_context: currentState.currentStep
              ? `${currentState.currentStep.actionType} on "${currentState.currentStep.fieldLabel}"`
              : undefined,
          },
        },
      );

      // Step 3: Dispatch the revised step
      if (response.goal_achieved) {
        return this.dispatch({
          type: "GOAL_ACHIEVED",
          message: response.ai_message || "Goal achieved!",
        });
      }

      const step = apiResponseToStep(response);
      return this.dispatch({
        type: "STEP_RECEIVED",
        step,
      });
    } catch (error) {
      this.log(`Failed to process feedback: ${error}`, "error");
      const errorMessage =
        error instanceof Error ? error.message : "Failed to process feedback";
      return this.dispatch({
        type: "AI_ERROR",
        error: errorMessage,
      });
    }
  }

  /**
   * End the current dynamic workflow session.
   *
   * 1. Calls backend API to mark session as complete (best effort)
   * 2. Dispatches EXIT to transition to IDLE
   *
   * @param reason Why the session is ending (for logging/analytics)
   */
  async endSession(reason: string = "user_exit"): Promise<void> {
    this.ensureInitialized();

    if (!this.hasActiveSession()) {
      return;
    }

    this.log(`Ending session: ${reason}`);

    // Best-effort API call to mark session as complete on the backend
    const currentState = this.stateMachine.getState();
    const backendSessionId = currentState.backendSessionId;

    if (backendSessionId !== null) {
      try {
        const apiReason =
          reason === "user_exit" || reason === "timeout"
            ? "abandoned"
            : "completed";
        await dynamicApi<void>(`/sessions/${backendSessionId}/complete`, {
          method: "POST",
          body: { reason: apiReason },
        });
      } catch (error) {
        // Don't block session end on API failure
        this.log(`Failed to notify backend of session end: ${error}`, "warn");
      }
    }

    // Dispatch EXIT to transition to IDLE
    await this.dispatch({ type: "EXIT", reason });
  }

  /**
   * Get state for a specific tab (used by content scripts for restoration).
   *
   * @param tabId Tab ID to check
   * @returns State if tab is in session, null otherwise
   */
  async getStateForTab(
    tabId: number,
  ): Promise<{ state: DynamicWorkflowState | null; shouldRestore: boolean }> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();

    if (state.machineState === "IDLE") {
      return { state: null, shouldRestore: false };
    }

    const isInSession = state.tabs.activeTabIds.includes(tabId);
    const shouldRestore = isInSession && isActiveDynamicWorkflow(state);

    return { state: shouldRestore ? state : null, shouldRestore };
  }

  /**
   * Add a tab to the dynamic workflow session.
   */
  async addTab(tabId: number): Promise<void> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();
    if (!isActiveDynamicWorkflow(state)) {
      return;
    }

    if (!state.tabs.activeTabIds.includes(tabId)) {
      // Directly update state for tab management (not a state machine event)
      const updatedState: DynamicWorkflowState = {
        ...state,
        tabs: {
          ...state.tabs,
          activeTabIds: [...state.tabs.activeTabIds, tabId],
        },
      };
      this.stateMachine.setState(updatedState);
      await this.persistState(updatedState);

      // Broadcast updated state to all tabs (including the newly added one)
      await this.broadcastState(updatedState, "TAB_ADDED", state);

      this.log(`Added tab ${tabId}`);
    }
  }

  /**
   * Remove a tab from the dynamic workflow session.
   */
  async removeTab(tabId: number): Promise<void> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();
    if (!isActiveDynamicWorkflow(state)) {
      return;
    }

    // If primary tab is closed, end the session
    if (tabId === state.tabs.primaryTabId) {
      this.log("Primary tab closed, ending session");
      await this.dispatch({ type: "TAB_CLOSED", tabId });
      return;
    }

    // Remove from active tabs
    if (state.tabs.activeTabIds.includes(tabId)) {
      const updatedState: DynamicWorkflowState = {
        ...state,
        tabs: {
          ...state.tabs,
          activeTabIds: state.tabs.activeTabIds.filter((id) => id !== tabId),
        },
      };
      this.stateMachine.setState(updatedState);
      await this.persistState(updatedState);

      // Broadcast updated state to remaining tabs (use previous state for tab list)
      await this.broadcastState(updatedState, "TAB_REMOVED", state);

      this.log(`Removed tab ${tabId}`);
    }
  }

  /**
   * Subscribe to state changes.
   *
   * @returns Unsubscribe function
   */
  onStateChange(callback: DynamicStateCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Internal dispatch implementation (called from serialized queue).
   */
  private async dispatchInternal(
    event: DynamicEvent,
  ): Promise<DynamicWorkflowState> {
    this.log(`Dispatching: ${event.type}`);

    const prevState = this.stateMachine.getState();
    const newState = this.stateMachine.dispatch(event);

    // Only handle state change if there was actually a transition
    if (newState !== prevState) {
      // CRITICAL: Await side effects to prevent race conditions
      await this.handleStateChange(newState, event, prevState);
    }

    return newState;
  }

  /**
   * Handle state change from state machine.
   *
   * Persists state, broadcasts to content scripts, and notifies local callbacks.
   *
   * @param newState - The new state after transition
   * @param event - The event that triggered the transition
   * @param previousState - The state before the transition (needed for EXIT broadcasts)
   */
  private async handleStateChange(
    newState: DynamicWorkflowState,
    event: DynamicEvent,
    previousState: DynamicWorkflowState,
  ): Promise<void> {
    let stateToSave = newState;

    // Reset timeout timer on activity and update expiresAt in state
    if (isActiveDynamicWorkflow(newState)) {
      // CRITICAL: Update expiresAt in the state so service worker restart uses correct expiry
      const now = Date.now();
      stateToSave = {
        ...newState,
        timing: {
          ...newState.timing,
          lastActivityAt: now,
          expiresAt: now + SESSION_TIMEOUT_MS,
        },
      };
      // Update state machine with new timing
      this.stateMachine.setState(stateToSave);
      this.startTimeoutTimer();
    } else {
      this.stopTimeoutTimer();
    }

    // Persist state (with updated timing if applicable)
    await this.persistState(stateToSave);

    // Broadcast to content scripts
    // CRITICAL: For EXIT transitions, use previous state's tabs (new state has empty tabs)
    await this.broadcastState(stateToSave, event.type, previousState);

    // Notify local callbacks
    for (const callback of this.stateCallbacks) {
      try {
        callback(stateToSave);
      } catch (error) {
        this.log(`Callback error: ${error}`, "error");
      }
    }
  }

  /**
   * Persist state to chrome.storage.session.
   */
  private async persistState(state: DynamicWorkflowState): Promise<void> {
    try {
      if (state.machineState === "IDLE") {
        await chrome.storage.session.remove(DYNAMIC_SESSION_STORAGE_KEY);
      } else {
        await chrome.storage.session.set({
          [DYNAMIC_SESSION_STORAGE_KEY]: state,
        });
      }
    } catch (error) {
      this.log(`Failed to persist state: ${error}`, "error");
    }
  }

  /**
   * Load state from chrome.storage.session.
   */
  private async loadState(): Promise<DynamicWorkflowState | null> {
    try {
      const result = await chrome.storage.session.get(
        DYNAMIC_SESSION_STORAGE_KEY,
      );
      const state = result[DYNAMIC_SESSION_STORAGE_KEY] as
        | DynamicWorkflowState
        | undefined;
      return state ?? null;
    } catch (error) {
      this.log(`Failed to load state: ${error}`, "error");
      return null;
    }
  }

  /**
   * Clear persisted state.
   */
  private async clearState(): Promise<void> {
    try {
      await chrome.storage.session.remove(DYNAMIC_SESSION_STORAGE_KEY);
      this.stateMachine.setState(createIdleDynamicState());
    } catch (error) {
      this.log(`Failed to clear state: ${error}`, "error");
    }
  }

  /**
   * Broadcast state to all participating tabs.
   *
   * @param state - The new state to broadcast
   * @param trigger - The event type that triggered the broadcast
   * @param previousState - The previous state (used for EXIT to get old tab list)
   */
  private async broadcastState(
    state: DynamicWorkflowState,
    trigger: string,
    previousState: DynamicWorkflowState,
  ): Promise<void> {
    const message: DynamicStateChangedMessage = {
      type: DYNAMIC_MESSAGE_TYPES.STATE_CHANGED,
      state,
      trigger,
    };

    // CRITICAL: For EXIT/IDLE transitions, the new state has empty tabs.
    // We need to broadcast to the PREVIOUS state's tabs so they know to clean up.
    const tabIds =
      state.machineState === "IDLE"
        ? previousState.tabs.activeTabIds
        : state.tabs.activeTabIds;

    this.log(`Broadcasting to ${tabIds.length} tabs: ${trigger}`);

    // Send to all active tabs in parallel
    const sendPromises = tabIds.map(async (tabId) => {
      try {
        await chrome.tabs.sendMessage(tabId, message);
      } catch (error) {
        // Tab might be closed or not have content script
        this.log(`Failed to send to tab ${tabId}: ${error}`);
      }
    });

    await Promise.allSettled(sendPromises);
  }

  /**
   * Start session timeout timer.
   */
  private startTimeoutTimer(): void {
    this.stopTimeoutTimer();

    this.timeoutTimer = setTimeout(async () => {
      this.log("Session timed out");
      await this.endSession("timeout");
    }, SESSION_TIMEOUT_MS);
  }

  /**
   * Stop session timeout timer.
   */
  private stopTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Ensure manager is initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "DynamicSessionManager not initialized. Call initialize() first.",
      );
    }
  }

  /**
   * Log message if debug enabled.
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[DynamicSessionManager] ${message}`);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton dynamic session manager instance for the background service worker.
 */
export const dynamicSessionManager = new DynamicSessionManager({ debug: true });
