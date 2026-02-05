/**
 * Navigation Watcher (Background Script)
 *
 * Listens to Chrome webNavigation events and dispatches state machine events.
 * This is the SOLE PRODUCER of URL_CHANGED and PAGE_LOADED events.
 *
 * Key responsibilities:
 * - Monitor chrome.webNavigation events for primary tab only
 * - Dispatch URL_CHANGED on navigation start (onBeforeNavigate)
 * - Dispatch PAGE_LOADED on navigation complete (onCompleted)
 * - Handle navigation timeout via chrome.alarms (survives SW restart)
 * - Filter out restricted URLs (chrome://, extension pages)
 * - Check for stuck navigations on service worker restart
 *
 * Design decisions:
 * - Single-tab MVP: Only process events from state.tabs.primaryTabId
 * - chrome.alarms: Used instead of setTimeout to survive SW restarts
 * - Event-driven: No polling or timing hacks
 */

import type { SessionManager } from "./SessionManager";
import { NAVIGATION_TIMEOUT_MS } from "../../shared/walkthrough";

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for NavigationWatcher */
export interface NavigationWatcherConfig {
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Alarm name for navigation timeout */
const NAVIGATION_ALARM_NAME = "walkthrough-navigation-timeout";

/** URLs that content scripts cannot run on */
const RESTRICTED_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "about:",
  "edge://",
  "brave://",
  "data:",
  "javascript:",
  "file://",
];

// ============================================================================
// NAVIGATION WATCHER CLASS
// ============================================================================

/**
 * NavigationWatcher - Monitors browser navigation for walkthrough sessions
 *
 * @example
 * ```typescript
 * const watcher = new NavigationWatcher(sessionManager);
 * watcher.initialize(); // Start listening
 * // ... later
 * watcher.destroy(); // Stop listening
 * ```
 */
export class NavigationWatcher {
  private sessionManager: SessionManager;
  private config: NavigationWatcherConfig;
  private initialized = false;

  // Bound handlers for cleanup
  private boundOnBeforeNavigate: (
    details: chrome.webNavigation.WebNavigationParentedCallbackDetails,
  ) => void;
  private boundOnCompleted: (
    details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
  ) => void;
  private boundOnErrorOccurred: (
    details: chrome.webNavigation.WebNavigationFramedErrorCallbackDetails,
  ) => void;
  private boundOnCommitted: (
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
  ) => void;
  private boundOnAlarm: (alarm: chrome.alarms.Alarm) => void;

  constructor(
    sessionManager: SessionManager,
    config?: NavigationWatcherConfig,
  ) {
    this.sessionManager = sessionManager;
    this.config = config ?? {};

    // Bind handlers once so we can remove them later
    this.boundOnBeforeNavigate = this.handleBeforeNavigate.bind(this);
    this.boundOnCompleted = this.handleCompleted.bind(this);
    this.boundOnErrorOccurred = this.handleErrorOccurred.bind(this);
    this.boundOnCommitted = this.handleCommitted.bind(this);
    this.boundOnAlarm = this.handleAlarm.bind(this);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Start listening for navigation events
   *
   * Also checks for any stuck navigation from SW restart.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    this.log("Initializing navigation watcher...");

    // Add webNavigation listeners
    chrome.webNavigation.onBeforeNavigate.addListener(
      this.boundOnBeforeNavigate,
    );
    chrome.webNavigation.onCompleted.addListener(this.boundOnCompleted);
    chrome.webNavigation.onErrorOccurred.addListener(this.boundOnErrorOccurred);
    chrome.webNavigation.onCommitted.addListener(this.boundOnCommitted);

    // Add alarm listener for navigation timeout
    chrome.alarms.onAlarm.addListener(this.boundOnAlarm);

    // Check for stuck navigation from SW restart
    await this.checkNavigationTimeoutOnInit();

    this.initialized = true;
    this.log("Navigation watcher initialized");
  }

  /**
   * Stop listening for navigation events
   */
  destroy(): void {
    if (!this.initialized) {
      return;
    }

    this.log("Destroying navigation watcher...");

    // Remove webNavigation listeners
    chrome.webNavigation.onBeforeNavigate.removeListener(
      this.boundOnBeforeNavigate,
    );
    chrome.webNavigation.onCompleted.removeListener(this.boundOnCompleted);
    chrome.webNavigation.onErrorOccurred.removeListener(
      this.boundOnErrorOccurred,
    );
    chrome.webNavigation.onCommitted.removeListener(this.boundOnCommitted);

    // Remove alarm listener
    chrome.alarms.onAlarm.removeListener(this.boundOnAlarm);

    // Clear any pending alarm
    this.clearNavigationTimeout();

    this.initialized = false;
    this.log("Navigation watcher destroyed");
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle navigation start
   *
   * Dispatches URL_CHANGED if this is main frame navigation on primary tab.
   */
  private async handleBeforeNavigate(
    details: chrome.webNavigation.WebNavigationParentedCallbackDetails,
  ): Promise<void> {
    // Only handle main frame (not iframes)
    if (details.frameId !== 0) {
      return;
    }

    // Check if this is the primary tab
    if (!(await this.isPrimaryTab(details.tabId))) {
      return;
    }

    // Check for restricted URLs
    if (this.isRestrictedUrl(details.url)) {
      this.log(`Ignoring restricted URL: ${details.url}`);
      // Don't dispatch error - just ignore
      return;
    }

    this.log(`Navigation started: tab=${details.tabId}, url=${details.url}`);

    // Dispatch URL_CHANGED event
    await this.sessionManager.dispatch({
      type: "URL_CHANGED",
      tabId: details.tabId,
      url: details.url,
    });

    // Set navigation timeout using chrome.alarms
    this.setNavigationTimeout();
  }

  /**
   * Handle navigation complete
   *
   * Dispatches PAGE_LOADED if this is main frame navigation on primary tab.
   */
  private async handleCompleted(
    details: chrome.webNavigation.WebNavigationFramedCallbackDetails,
  ): Promise<void> {
    // Only handle main frame
    if (details.frameId !== 0) {
      return;
    }

    // Check if this is the primary tab
    if (!(await this.isPrimaryTab(details.tabId))) {
      return;
    }

    this.log(`Navigation complete: tab=${details.tabId}, url=${details.url}`);

    // Clear navigation timeout
    this.clearNavigationTimeout();

    // Dispatch PAGE_LOADED event
    await this.sessionManager.dispatch({
      type: "PAGE_LOADED",
      tabId: details.tabId,
      url: details.url,
    });
  }

  /**
   * Handle navigation error
   *
   * Dispatches NAVIGATION_TIMEOUT to trigger error state.
   */
  private async handleErrorOccurred(
    details: chrome.webNavigation.WebNavigationFramedErrorCallbackDetails,
  ): Promise<void> {
    // Only handle main frame
    if (details.frameId !== 0) {
      return;
    }

    // Check if this is the primary tab
    if (!(await this.isPrimaryTab(details.tabId))) {
      return;
    }

    this.log(
      `Navigation error: tab=${details.tabId}, url=${details.url}, error=${details.error}`,
    );

    // Clear navigation timeout
    this.clearNavigationTimeout();

    // Dispatch NAVIGATION_TIMEOUT to enter error state
    await this.sessionManager.dispatch({
      type: "NAVIGATION_TIMEOUT",
      tabId: details.tabId,
    });
  }

  /**
   * Handle navigation committed
   *
   * Used to detect browser back/forward navigation for logging purposes.
   */
  private async handleCommitted(
    details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
  ): Promise<void> {
    // Only handle main frame
    if (details.frameId !== 0) {
      return;
    }

    // Check if this is the primary tab
    if (!(await this.isPrimaryTab(details.tabId))) {
      return;
    }

    // Log back/forward navigation for debugging
    if (
      details.transitionQualifiers &&
      details.transitionQualifiers.includes("forward_back")
    ) {
      this.log(
        `Back/forward navigation detected: tab=${details.tabId}, url=${details.url}`,
      );
    }
  }

  /**
   * Handle alarm for navigation timeout
   */
  private async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    if (alarm.name !== NAVIGATION_ALARM_NAME) {
      return;
    }

    this.log("Navigation timeout alarm fired");

    // Get current state to find the navigating tab
    const state = await this.sessionManager.getState();
    if (!state || state.machineState !== "NAVIGATING") {
      this.log("Not in NAVIGATING state, ignoring timeout");
      return;
    }

    const tabId = state.navigation.tabId ?? state.tabs.primaryTabId;

    // Dispatch NAVIGATION_TIMEOUT
    await this.sessionManager.dispatch({
      type: "NAVIGATION_TIMEOUT",
      tabId,
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if a tab is the primary walkthrough tab
   */
  private async isPrimaryTab(tabId: number): Promise<boolean> {
    const state = await this.sessionManager.getState();
    if (!state) {
      return false;
    }
    return state.tabs.primaryTabId === tabId;
  }

  /**
   * Check if a URL is restricted (content script cannot run)
   */
  private isRestrictedUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return (
      RESTRICTED_URL_PREFIXES.some((prefix) =>
        lowerUrl.startsWith(prefix.toLowerCase()),
      ) || lowerUrl.endsWith(".pdf")
    );
  }

  /**
   * Set navigation timeout alarm
   *
   * Uses chrome.alarms to survive service worker restarts.
   */
  private setNavigationTimeout(): void {
    // Convert ms to minutes for chrome.alarms (minimum granularity)
    const delayMinutes = NAVIGATION_TIMEOUT_MS / 60000;
    chrome.alarms.create(NAVIGATION_ALARM_NAME, {
      delayInMinutes: delayMinutes,
    });
    this.log(`Navigation timeout set: ${NAVIGATION_TIMEOUT_MS}ms`);
  }

  /**
   * Clear navigation timeout alarm
   */
  private clearNavigationTimeout(): void {
    chrome.alarms.clear(NAVIGATION_ALARM_NAME);
    this.log("Navigation timeout cleared");
  }

  /**
   * Check for stuck navigation on service worker restart
   *
   * If the SW restarted while navigating, check if timeout should have fired.
   */
  private async checkNavigationTimeoutOnInit(): Promise<void> {
    const state = await this.sessionManager.getState();

    if (!state || state.machineState !== "NAVIGATING") {
      return;
    }

    if (!state.navigation.startedAt) {
      return;
    }

    const elapsed = Date.now() - state.navigation.startedAt;

    if (elapsed >= NAVIGATION_TIMEOUT_MS) {
      // Navigation already timed out while SW was inactive
      this.log(
        `Navigation timed out during SW restart (elapsed: ${elapsed}ms)`,
      );
      const tabId = state.navigation.tabId ?? state.tabs.primaryTabId;
      await this.sessionManager.dispatch({
        type: "NAVIGATION_TIMEOUT",
        tabId,
      });
    } else {
      // Set alarm for remaining time
      const remaining = NAVIGATION_TIMEOUT_MS - elapsed;
      const delayMinutes = remaining / 60000;
      chrome.alarms.create(NAVIGATION_ALARM_NAME, {
        delayInMinutes: delayMinutes,
      });
      this.log(`Navigation timeout set for remaining: ${remaining}ms`);
    }
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string): void {
    if (!this.config.debug) {
      return;
    }
    console.log(`[NavigationWatcher] ${message}`);
  }
}
