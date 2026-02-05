/**
 * Walkthrough Session Manager
 *
 * The SINGLE SOURCE OF TRUTH for walkthrough state.
 *
 * Responsibilities:
 * - Owns the state machine instance
 * - Persists state to chrome.storage.session
 * - Broadcasts state changes to content scripts
 * - Handles session timeout
 * - Tracks participating tabs
 *
 * Design:
 * - All state mutations go through dispatch()
 * - State is automatically persisted after each mutation
 * - Content scripts receive state via chrome.tabs.sendMessage
 */

import {
  WalkthroughStateMachine,
  WalkthroughState,
  WalkthroughEvent,
  WALKTHROUGH_SESSION_STORAGE_KEY,
  SESSION_TIMEOUT_MS,
  createIdleState,
  isActiveWalkthrough,
  createStateChangedMessage,
  describeState,
} from "../../shared/walkthrough";

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for SessionManager */
export interface SessionManagerConfig {
  /** Enable debug logging */
  debug?: boolean;
}

/** Callback for session state changes */
export type SessionStateCallback = (state: WalkthroughState) => void;

// ============================================================================
// SESSION MANAGER
// ============================================================================

/**
 * SessionManager - Singleton that owns walkthrough state
 *
 * @example
 * ```typescript
 * // Initialize on service worker startup
 * await sessionManager.initialize();
 *
 * // Start a walkthrough
 * await sessionManager.dispatch({ type: 'START', workflowId: 123, tabId: 1 });
 *
 * // Get current state
 * const state = await sessionManager.getState();
 * ```
 */
export class SessionManager {
  private stateMachine: WalkthroughStateMachine;
  private initialized = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private stateCallbacks: Set<SessionStateCallback> = new Set();
  private config: SessionManagerConfig;

  // Dispatch queue for serialization (prevents race conditions)
  private dispatchQueue: Promise<WalkthroughState> =
    Promise.resolve(createIdleState());

  constructor(config?: SessionManagerConfig) {
    this.config = config ?? {};
    this.stateMachine = new WalkthroughStateMachine(undefined, {
      debug: this.config.debug,
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize the session manager
   *
   * Must be called once when service worker starts. Restores any persisted state.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    this.log("Initializing...");

    // Try to restore persisted state
    const savedState = await this.loadState();

    if (savedState && isActiveWalkthrough(savedState)) {
      // Check if session is expired
      if (Date.now() > savedState.timing.expiresAt) {
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
   * Get current walkthrough state
   *
   * @returns Current state or null if no active session
   */
  async getState(): Promise<WalkthroughState | null> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();
    if (state.machineState === "IDLE") {
      return null;
    }
    return state;
  }

  /**
   * Check if there's an active walkthrough
   */
  hasActiveSession(): boolean {
    return isActiveWalkthrough(this.stateMachine.getState());
  }

  /**
   * Dispatch an event to the state machine
   *
   * This is the primary way to mutate state. Events are validated by the
   * state machine, which will reject invalid transitions.
   *
   * Uses a promise queue to serialize dispatch calls and prevent race conditions
   * when multiple events are dispatched rapidly (e.g., URL_CHANGED + JUMP_TO_STEP).
   *
   * @param event The event to dispatch
   * @returns New state after transition
   */
  async dispatch(event: WalkthroughEvent): Promise<WalkthroughState> {
    this.ensureInitialized();

    // Create a promise for this dispatch that will be added to the queue
    const dispatchPromise = this.dispatchQueue
      .catch(() => {
        // Ignore errors from previous dispatches to prevent queue blockage
        // Each dispatch will handle its own errors
      })
      .then(async () => {
        return this.dispatchInternal(event);
      });

    // Update queue to include this dispatch
    this.dispatchQueue = dispatchPromise;

    return dispatchPromise;
  }

  /**
   * Internal dispatch implementation (called from serialized queue)
   */
  private async dispatchInternal(
    event: WalkthroughEvent,
  ): Promise<WalkthroughState> {
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
   * Add a tab to the walkthrough session
   */
  async addTab(tabId: number): Promise<void> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();
    if (!isActiveWalkthrough(state)) {
      return;
    }

    if (!state.tabs.activeTabIds.includes(tabId)) {
      // Directly update state for tab management (not a state machine event)
      const updatedState: WalkthroughState = {
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
   * Remove a tab from the walkthrough session
   */
  async removeTab(tabId: number): Promise<void> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();
    if (!isActiveWalkthrough(state)) {
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
      const updatedState: WalkthroughState = {
        ...state,
        tabs: {
          ...state.tabs,
          activeTabIds: state.tabs.activeTabIds.filter((id) => id !== tabId),
          readyTabIds: state.tabs.readyTabIds.filter((id) => id !== tabId),
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
   * End the current session
   */
  async endSession(
    reason: "user_exit" | "timeout" | "error" = "user_exit",
  ): Promise<void> {
    this.ensureInitialized();

    if (!this.hasActiveSession()) {
      return;
    }

    this.log(`Ending session: ${reason}`);
    await this.dispatch({ type: "EXIT", reason });
  }

  /**
   * Subscribe to state changes
   *
   * @returns Unsubscribe function
   */
  onStateChange(callback: SessionStateCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Get state for a specific tab (used by content scripts for restoration)
   *
   * @param tabId Tab ID to check
   * @returns State if tab is in session, null otherwise
   */
  async getStateForTab(
    tabId: number,
  ): Promise<{ state: WalkthroughState | null; shouldRestore: boolean }> {
    this.ensureInitialized();

    const state = this.stateMachine.getState();

    if (state.machineState === "IDLE") {
      return { state: null, shouldRestore: false };
    }

    const isInSession = state.tabs.activeTabIds.includes(tabId);
    const shouldRestore = isInSession && isActiveWalkthrough(state);

    return { state: shouldRestore ? state : null, shouldRestore };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Handle state change from state machine
   *
   * @param newState - The new state after transition
   * @param event - The event that triggered the transition
   * @param previousState - The state before the transition (needed for EXIT broadcasts)
   */
  private async handleStateChange(
    newState: WalkthroughState,
    event: WalkthroughEvent,
    previousState: WalkthroughState,
  ): Promise<void> {
    let stateToSave = newState;

    // Reset timeout timer on activity and update expiresAt in state
    if (isActiveWalkthrough(newState)) {
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
   * Persist state to chrome.storage.session
   */
  private async persistState(state: WalkthroughState): Promise<void> {
    try {
      if (state.machineState === "IDLE") {
        await chrome.storage.session.remove(WALKTHROUGH_SESSION_STORAGE_KEY);
      } else {
        await chrome.storage.session.set({
          [WALKTHROUGH_SESSION_STORAGE_KEY]: state,
        });
      }
    } catch (error) {
      this.log(`Failed to persist state: ${error}`, "error");
    }
  }

  /**
   * Load state from chrome.storage.session
   */
  private async loadState(): Promise<WalkthroughState | null> {
    try {
      const result = await chrome.storage.session.get(
        WALKTHROUGH_SESSION_STORAGE_KEY,
      );
      const state = result[WALKTHROUGH_SESSION_STORAGE_KEY] as
        | WalkthroughState
        | undefined;
      return state ?? null;
    } catch (error) {
      this.log(`Failed to load state: ${error}`, "error");
      return null;
    }
  }

  /**
   * Clear persisted state
   */
  private async clearState(): Promise<void> {
    try {
      await chrome.storage.session.remove(WALKTHROUGH_SESSION_STORAGE_KEY);
      this.stateMachine.setState(createIdleState());
    } catch (error) {
      this.log(`Failed to clear state: ${error}`, "error");
    }
  }

  /**
   * Broadcast state to all participating tabs
   *
   * @param state - The new state to broadcast
   * @param trigger - The event that triggered the broadcast
   * @param previousState - The previous state (used for EXIT to get old tab list)
   */
  private async broadcastState(
    state: WalkthroughState,
    trigger: string,
    previousState: WalkthroughState,
  ): Promise<void> {
    const message = createStateChangedMessage(state, trigger);

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
   * Start session timeout timer
   */
  private startTimeoutTimer(): void {
    this.stopTimeoutTimer();

    this.timeoutTimer = setTimeout(async () => {
      this.log("Session timed out");
      await this.endSession("timeout");
    }, SESSION_TIMEOUT_MS);
  }

  /**
   * Stop session timeout timer
   */
  private stopTimeoutTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Ensure manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "SessionManager not initialized. Call initialize() first.",
      );
    }
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[SessionManager] ${message}`);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton session manager instance for the background service worker
 */
export const sessionManager = new SessionManager({ debug: true });
