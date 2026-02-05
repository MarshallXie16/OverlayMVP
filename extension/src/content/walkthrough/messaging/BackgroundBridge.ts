/**
 * Background Bridge
 *
 * Abstraction layer for content script communication with background service worker.
 * Provides typed message sending, retry logic, and state subscription.
 *
 * Features:
 * - Typed command sending with automatic retry on transport errors
 * - State subscription via chrome.runtime.onMessage listener
 * - Specialized methods for element status, healing results, execution logs
 * - Lifecycle management (initialize/destroy)
 *
 * Note: Does NOT implement its own queue for message serialization.
 * The background's SessionManager already has a dispatch queue that handles
 * race conditions. This bridge handles only transport-level retries.
 */

import type { WalkthroughState } from "../../../shared/walkthrough";
import {
  isStateChangedMessage,
  createCommandMessage,
  createElementStatusMessage,
  createHealingResultMessage,
  createExecutionLogMessage,
  type WalkthroughCommand,
  type CommandPayloads,
  type WalkthroughCommandResponse,
  type HealingResult,
  type ExecutionLogEntry,
} from "../../../shared/walkthrough/messages";

// ============================================================================
// TYPES
// ============================================================================

export interface BackgroundBridgeConfig {
  /** Max retry attempts for failed messages (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 500) */
  baseDelay?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export type StateListener = (state: WalkthroughState) => void;

// ============================================================================
// BACKGROUND BRIDGE
// ============================================================================

export class BackgroundBridge {
  private stateListeners: Set<StateListener> = new Set();
  private messageListener: ((message: unknown) => void) | null = null;
  private initialized = false;
  private destroyed = false;

  // Retry configuration
  private maxRetries: number;
  private baseDelay: number;
  private debug: boolean;

  // Pending retries (for cancellation on destroy or state change to IDLE)
  private pendingRetries: Set<AbortController> = new Set();

  constructor(config?: BackgroundBridgeConfig) {
    this.maxRetries = config?.maxRetries ?? 3;
    this.baseDelay = config?.baseDelay ?? 500;
    this.debug = config?.debug ?? false;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the bridge
   *
   * Sets up chrome.runtime.onMessage listener for state broadcasts.
   */
  initialize(): void {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    if (this.destroyed) {
      throw new Error(
        "BackgroundBridge has been destroyed, create a new instance",
      );
    }

    this.log("Initializing...");

    // Set up message listener for state broadcasts
    this.messageListener = this.handleMessage.bind(this);
    chrome.runtime.onMessage.addListener(this.messageListener);

    this.initialized = true;
    this.log("Initialized");
  }

  /**
   * Destroy the bridge
   *
   * Removes message listener, clears subscriptions, cancels pending retries.
   */
  destroy(): void {
    this.log("Destroying...");

    // Cancel all pending retries
    for (const controller of this.pendingRetries) {
      controller.abort();
    }
    this.pendingRetries.clear();

    // Remove message listener
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }

    // Clear subscriptions
    this.stateListeners.clear();

    this.initialized = false;
    this.destroyed = true;
    this.log("Destroyed");
  }

  // ============================================================================
  // STATE SUBSCRIPTION
  // ============================================================================

  /**
   * Subscribe to state changes
   *
   * Listener will be called whenever background broadcasts a STATE_CHANGED message.
   *
   * @returns Unsubscribe function
   */
  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  // ============================================================================
  // COMMAND SENDING
  // ============================================================================

  /**
   * Send a command to background with retry logic
   *
   * Retries only on transport errors (service worker restart, etc).
   * Business logic errors are returned without retry.
   */
  async sendCommand<T extends WalkthroughCommand>(
    command: T,
    payload: CommandPayloads[T],
  ): Promise<WalkthroughCommandResponse> {
    this.ensureInitialized();

    const message = createCommandMessage(command, payload);

    return this.sendWithRetry(
      () => chrome.runtime.sendMessage(message),
      `COMMAND:${command}`,
    );
  }

  // ============================================================================
  // SPECIALIZED METHODS
  // ============================================================================

  /**
   * Report that target element was found
   */
  async reportElementFound(stepIndex: number, tabId: number): Promise<void> {
    this.ensureInitialized();

    const message = createElementStatusMessage(stepIndex, true, tabId);
    await this.sendWithRetry(
      () => chrome.runtime.sendMessage(message),
      "ELEMENT_FOUND",
    );
  }

  /**
   * Report that target element was not found
   */
  async reportElementNotFound(stepIndex: number, tabId: number): Promise<void> {
    this.ensureInitialized();

    const message = createElementStatusMessage(stepIndex, false, tabId);
    await this.sendWithRetry(
      () => chrome.runtime.sendMessage(message),
      "ELEMENT_NOT_FOUND",
    );
  }

  /**
   * Report healing result
   */
  async reportHealingResult(
    stepIndex: number,
    result: HealingResult,
  ): Promise<void> {
    this.ensureInitialized();

    const message = createHealingResultMessage(stepIndex, result);
    await this.sendWithRetry(
      () => chrome.runtime.sendMessage(message),
      "HEALING_RESULT",
    );
  }

  /**
   * Log execution entry (for analytics)
   */
  async logExecution(entry: ExecutionLogEntry): Promise<void> {
    this.ensureInitialized();

    const message = createExecutionLogMessage(entry);

    // Execution logging is fire-and-forget, no retry
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      this.log(`Failed to log execution: ${error}`, "warn");
    }
  }

  /**
   * Get current tab ID from background
   */
  async getTabId(): Promise<number | null> {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_TAB_ID" });
      return response?.tabId ?? null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Handle incoming messages from background
   */
  private handleMessage(message: unknown): void {
    if (!isStateChangedMessage(message)) {
      return;
    }

    this.log(`Received state: ${message.state.machineState}`);

    // Cancel pending retries if session ended
    if (message.state.machineState === "IDLE") {
      this.cancelPendingRetries();
    }

    // Notify all listeners
    for (const listener of this.stateListeners) {
      try {
        listener(message.state);
      } catch (error) {
        this.log(`Listener error: ${error}`, "error");
      }
    }
  }

  /**
   * Send message with exponential backoff retry
   *
   * Only retries on transport errors, not business logic failures.
   */
  private async sendWithRetry<T>(
    sendFn: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    const abortController = new AbortController();
    this.pendingRetries.add(abortController);

    try {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        // Check if aborted
        if (abortController.signal.aborted) {
          throw new Error(`${operationName} cancelled`);
        }

        try {
          const result = await sendFn();

          // Success - return result
          this.pendingRetries.delete(abortController);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // Check if this is a transport error worth retrying
          if (!this.isRetryableError(lastError)) {
            this.pendingRetries.delete(abortController);
            throw lastError;
          }

          // Don't retry if we've exhausted attempts
          if (attempt >= this.maxRetries) {
            break;
          }

          // Exponential backoff
          const delay = this.baseDelay * Math.pow(2, attempt);
          this.log(
            `${operationName} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`,
          );

          await this.delay(delay, abortController.signal);
        }
      }

      this.pendingRetries.delete(abortController);
      throw (
        lastError ??
        new Error(`${operationName} failed after ${this.maxRetries} retries`)
      );
    } catch (error) {
      this.pendingRetries.delete(abortController);
      throw error;
    }
  }

  /**
   * Check if error is retryable (transport-level error)
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Service worker restart
    if (message.includes("receiving end does not exist")) {
      return true;
    }

    // Extension context invalidated
    if (message.includes("extension context invalidated")) {
      return true;
    }

    // Connection errors
    if (message.includes("could not establish connection")) {
      return true;
    }

    return false;
  }

  /**
   * Delay with abort support
   */
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          reject(new Error("Delay aborted"));
        },
        { once: true },
      );
    });
  }

  /**
   * Cancel all pending retries
   */
  private cancelPendingRetries(): void {
    for (const controller of this.pendingRetries) {
      controller.abort();
    }
    this.pendingRetries.clear();
    this.log("Cancelled pending retries");
  }

  /**
   * Ensure bridge is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "BackgroundBridge not initialized. Call initialize() first.",
      );
    }
    if (this.destroyed) {
      throw new Error("BackgroundBridge has been destroyed.");
    }
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.debug && level === "log") {
      return;
    }
    console[level](`[BackgroundBridge] ${message}`);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton background bridge instance for content scripts
 *
 * Usage:
 * ```typescript
 * import { backgroundBridge } from './messaging';
 *
 * // Initialize once at content script startup
 * backgroundBridge.initialize();
 *
 * // Subscribe to state changes
 * backgroundBridge.subscribe((state) => {
 *   console.log('New state:', state);
 * });
 *
 * // Send commands
 * await backgroundBridge.sendCommand('NEXT', {});
 *
 * // Report element status
 * const tabId = await backgroundBridge.getTabId();
 * await backgroundBridge.reportElementFound(stepIndex, tabId);
 *
 * // Cleanup
 * backgroundBridge.destroy();
 * ```
 */
export const backgroundBridge = new BackgroundBridge({ debug: true });
