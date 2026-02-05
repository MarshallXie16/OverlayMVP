/**
 * Tab Manager (Background Script)
 *
 * Tracks tabs participating in walkthrough sessions and handles tab lifecycle.
 *
 * Key responsibilities:
 * - Listen for tab close events
 * - End session when primary tab closes (MVP approach)
 * - Track active tabs in session
 *
 * Design decisions:
 * - Single-tab MVP: Primary tab closure ends session (no promotion)
 * - Uses SessionManager's existing tab tracking (activeTabIds, readyTabIds)
 * - Integrates with chrome.tabs.onRemoved
 */

import type { SessionManager } from "./SessionManager";

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for TabManager */
export interface TabManagerConfig {
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// TAB MANAGER CLASS
// ============================================================================

/**
 * TabManager - Handles tab lifecycle for walkthrough sessions
 *
 * @example
 * ```typescript
 * const tabManager = new TabManager(sessionManager);
 * tabManager.initialize(); // Start listening
 * // ... later
 * tabManager.destroy(); // Stop listening
 * ```
 */
export class TabManager {
  private sessionManager: SessionManager;
  private config: TabManagerConfig;
  private initialized = false;

  // Bound handler for cleanup
  private boundOnTabRemoved: (
    tabId: number,
    removeInfo: chrome.tabs.TabRemoveInfo,
  ) => void;

  constructor(sessionManager: SessionManager, config?: TabManagerConfig) {
    this.sessionManager = sessionManager;
    this.config = config ?? {};

    // Bind handler
    this.boundOnTabRemoved = this.handleTabRemoved.bind(this);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Start listening for tab events
   */
  initialize(): void {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    this.log("Initializing...");

    // Listen for tab closures
    chrome.tabs.onRemoved.addListener(this.boundOnTabRemoved);

    this.initialized = true;
    this.log("Initialized");
  }

  /**
   * Stop listening for tab events
   */
  destroy(): void {
    if (!this.initialized) {
      return;
    }

    this.log("Destroying...");

    chrome.tabs.onRemoved.removeListener(this.boundOnTabRemoved);

    this.initialized = false;
    this.log("Destroyed");
  }

  /**
   * Add a tab to the current session
   */
  async addTab(tabId: number): Promise<void> {
    await this.sessionManager.addTab(tabId);
    this.log(`Added tab ${tabId} to session`);
  }

  /**
   * Remove a tab from the current session
   *
   * If primary tab, ends the session.
   */
  async removeTab(tabId: number): Promise<void> {
    await this.sessionManager.removeTab(tabId);
    this.log(`Removed tab ${tabId} from session`);
  }

  /**
   * Get the primary tab ID
   */
  async getPrimaryTab(): Promise<number | null> {
    const state = await this.sessionManager.getState();
    return state?.tabs.primaryTabId ?? null;
  }

  /**
   * Get all active tabs in the session
   */
  async getAllTabs(): Promise<number[]> {
    const state = await this.sessionManager.getState();
    return state?.tabs.activeTabIds ?? [];
  }

  /**
   * Check if a tab is part of the current session
   */
  async isSessionTab(tabId: number): Promise<boolean> {
    const state = await this.sessionManager.getState();
    if (!state) {
      return false;
    }
    return state.tabs.activeTabIds.includes(tabId);
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle tab removed event
   *
   * If the closed tab is part of the session, remove it.
   * If it's the primary tab, the session will be ended.
   */
  private async handleTabRemoved(
    tabId: number,
    _removeInfo: chrome.tabs.TabRemoveInfo,
  ): Promise<void> {
    // Check if this tab is part of the session
    if (!(await this.isSessionTab(tabId))) {
      return;
    }

    this.log(`Session tab ${tabId} closed`);

    // SessionManager.removeTab handles primary tab check
    await this.sessionManager.removeTab(tabId);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Log message if debug enabled
   */
  private log(message: string): void {
    if (!this.config.debug) {
      return;
    }
    console.log(`[TabManager] ${message}`);
  }
}
