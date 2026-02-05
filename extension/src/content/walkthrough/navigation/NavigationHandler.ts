/**
 * Navigation Handler (Content Script)
 *
 * Handles session restoration after page navigation and monitors for
 * SPA route changes that don't trigger webNavigation events.
 *
 * Key responsibilities:
 * - Send TAB_READY message on content script load
 * - Monitor for SPA navigation (popstate, hashchange)
 * - Report URL changes to background for single-page app navigation
 *
 * Note: Full page navigations are handled by NavigationWatcher (background).
 * This handler only catches client-side routing that doesn't reload the page.
 */

import type { WalkthroughState } from "../../../shared/walkthrough";
import { createTabReadyMessage } from "../../../shared/walkthrough";

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for NavigationHandler */
export interface NavigationHandlerConfig {
  /** Enable debug logging */
  debug?: boolean;
}

/** Callback for when state is restored */
export type StateRestoredCallback = (state: WalkthroughState) => void;

// ============================================================================
// NAVIGATION HANDLER CLASS
// ============================================================================

/**
 * NavigationHandler - Handles content script navigation lifecycle
 *
 * @example
 * ```typescript
 * const handler = new NavigationHandler({
 *   onStateRestored: (state) => controller.onStateChanged(state)
 * });
 * await handler.initialize();
 * ```
 */
export class NavigationHandler {
  private config: NavigationHandlerConfig;
  private onStateRestored: StateRestoredCallback;
  private initialized = false;
  private lastUrl: string = "";

  // Bound handlers for cleanup
  private boundOnPopState: () => void;
  private boundOnHashChange: () => void;

  constructor(
    onStateRestored: StateRestoredCallback,
    config?: NavigationHandlerConfig,
  ) {
    this.onStateRestored = onStateRestored;
    this.config = config ?? {};
    this.lastUrl = window.location.href;

    // Bind handlers
    this.boundOnPopState = this.handlePopState.bind(this);
    this.boundOnHashChange = this.handleHashChange.bind(this);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize the handler
   *
   * Signals TAB_READY and sets up SPA navigation listeners.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    this.log("Initializing...");

    // Check for active session and restore state
    await this.checkAndRestore();

    // Set up SPA navigation listeners
    window.addEventListener("popstate", this.boundOnPopState);
    window.addEventListener("hashchange", this.boundOnHashChange);

    this.initialized = true;
    this.log("Initialized");
  }

  /**
   * Clean up listeners
   */
  destroy(): void {
    if (!this.initialized) {
      return;
    }

    window.removeEventListener("popstate", this.boundOnPopState);
    window.removeEventListener("hashchange", this.boundOnHashChange);

    this.initialized = false;
    this.log("Destroyed");
  }

  // ============================================================================
  // SESSION RESTORATION
  // ============================================================================

  /**
   * Check for active session and restore state
   *
   * Sends TAB_READY message to background and receives active session state if any.
   */
  private async checkAndRestore(): Promise<void> {
    const tabId = await this.getCurrentTabId();
    if (tabId === null) {
      this.log("Cannot check session: no tab ID", "warn");
      return;
    }

    const message = createTabReadyMessage(tabId, window.location.href);

    try {
      const response = await chrome.runtime.sendMessage(message);

      if (response?.hasActiveSession && response.state) {
        this.log("Active session found, restoring state");
        this.onStateRestored(response.state);
      } else {
        this.log("No active session");
      }
    } catch (error) {
      // Extension might not be ready yet - this is expected on initial load
      this.log(`Failed to check session: ${error}`, "warn");
    }
  }

  // ============================================================================
  // SPA NAVIGATION HANDLERS
  // ============================================================================

  /**
   * Handle popstate event (browser back/forward in SPA)
   */
  private async handlePopState(): Promise<void> {
    const newUrl = window.location.href;

    if (newUrl === this.lastUrl) {
      return;
    }

    this.log(`SPA navigation (popstate): ${this.lastUrl} -> ${newUrl}`);
    this.lastUrl = newUrl;

    // Notify background of URL change
    await this.notifyUrlChange(newUrl);
  }

  /**
   * Handle hashchange event
   */
  private async handleHashChange(): Promise<void> {
    const newUrl = window.location.href;

    if (newUrl === this.lastUrl) {
      return;
    }

    this.log(`SPA navigation (hashchange): ${this.lastUrl} -> ${newUrl}`);
    this.lastUrl = newUrl;

    // Notify background of URL change
    await this.notifyUrlChange(newUrl);
  }

  /**
   * Notify background of URL change from SPA navigation
   *
   * Note: This only sends a notification. The background will decide
   * whether to dispatch URL_CHANGED based on session state.
   */
  private async notifyUrlChange(url: string): Promise<void> {
    const tabId = await this.getCurrentTabId();
    if (tabId === null) {
      return;
    }

    try {
      // Send URL directly on message (not in payload)
      // tabId is derived from sender.tab?.id in background for security
      await chrome.runtime.sendMessage({
        type: "SPA_NAVIGATION",
        url,
      });
    } catch (error) {
      this.log(`Failed to notify URL change: ${error}`, "warn");
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get current tab ID from background
   */
  private async getCurrentTabId(): Promise<number | null> {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_TAB_ID" });
      return response?.tabId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[NavigationHandler] ${message}`);
  }
}
