/**
 * Step Router (Background Script)
 *
 * Handles navigation between walkthrough steps, including cross-page jumps.
 *
 * Key responsibilities:
 * - Provide next/previous/jumpToStep methods
 * - Determine if navigation is needed based on URL comparison
 * - Initiate page navigation via chrome.tabs.update()
 * - Work with existing step format (page_context.url)
 *
 * Design decisions:
 * - Does NOT dispatch URL_CHANGED - NavigationWatcher handles that via webNavigation
 * - URL matching ignores query params and normalizes trailing slashes
 * - Gets step URL from step.page_context.url (backwards compatible)
 */

import type { SessionManager } from "./SessionManager";
import type { WalkthroughState } from "../../shared/walkthrough";
import type { StepResponse } from "../../shared/types";

// ============================================================================
// TYPES
// ============================================================================

/** Result of a navigation attempt */
export interface JumpResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Whether a page navigation was triggered */
  navigating?: boolean;
  /** Reason for failure */
  reason?:
    | "invalid_index"
    | "same_step"
    | "no_session"
    | "navigation_failed"
    | "no_target_url";
}

/** Configuration for StepRouter */
export interface StepRouterConfig {
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// STEP ROUTER CLASS
// ============================================================================

/**
 * StepRouter - Handles step navigation logic
 *
 * @example
 * ```typescript
 * const router = new StepRouter(sessionManager);
 * await router.next();       // Advance to next step
 * await router.previous();   // Go back one step
 * await router.jumpToStep(5); // Jump to specific step
 * ```
 */
export class StepRouter {
  private sessionManager: SessionManager;
  private config: StepRouterConfig;

  constructor(sessionManager: SessionManager, config?: StepRouterConfig) {
    this.sessionManager = sessionManager;
    this.config = config ?? {};
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Advance to the next step
   *
   * If the next step is on a different page, triggers navigation.
   */
  async next(): Promise<JumpResult> {
    const state = await this.getCurrentState();
    if (!state) {
      return { success: false, reason: "no_session" };
    }

    const targetIndex = state.currentStepIndex + 1;
    if (targetIndex >= state.totalSteps) {
      // This shouldn't happen - UI should handle completion
      return { success: false, reason: "invalid_index" };
    }

    return this.jumpToStep(targetIndex);
  }

  /**
   * Go back to the previous step
   *
   * If the previous step is on a different page, triggers navigation.
   */
  async previous(): Promise<JumpResult> {
    const state = await this.getCurrentState();
    if (!state) {
      return { success: false, reason: "no_session" };
    }

    const targetIndex = state.currentStepIndex - 1;
    if (targetIndex < 0) {
      return { success: false, reason: "invalid_index" };
    }

    return this.jumpToStep(targetIndex);
  }

  /**
   * Jump to a specific step by index
   *
   * Handles both same-page and cross-page navigation.
   *
   * @param targetIndex Zero-based step index
   */
  async jumpToStep(targetIndex: number): Promise<JumpResult> {
    const state = await this.getCurrentState();
    if (!state) {
      return { success: false, reason: "no_session" };
    }

    // Validate target index
    if (targetIndex < 0 || targetIndex >= state.totalSteps) {
      return { success: false, reason: "invalid_index" };
    }

    // Check if already on this step
    if (targetIndex === state.currentStepIndex) {
      return { success: false, reason: "same_step" };
    }

    const targetStep = state.steps[targetIndex];
    if (!targetStep) {
      return { success: false, reason: "invalid_index" };
    }
    const targetUrl = this.getStepUrl(targetStep);
    const currentUrl = await this.getCurrentTabUrl(state.tabs.primaryTabId);

    this.log(
      `Jump to step ${targetIndex}: currentUrl=${currentUrl}, targetUrl=${targetUrl}`,
    );

    // Check if we need to navigate
    const needsNavigation = this.needsNavigation(currentUrl, targetUrl);

    if (needsNavigation && targetUrl) {
      // Cross-page jump
      // CRITICAL: Dispatch JUMP_TO_STEP BEFORE navigation to ensure correct stepIndex
      // when URL_CHANGED and PAGE_LOADED events arrive from NavigationWatcher.
      // This prevents race conditions where the wrong step is briefly shown.
      await this.sessionManager.dispatch({
        type: "JUMP_TO_STEP",
        stepIndex: targetIndex,
      });

      // Now trigger navigation
      // NavigationWatcher will detect this via webNavigation.onBeforeNavigate
      // and dispatch URL_CHANGED → NAVIGATING, then PAGE_LOADED → SHOWING_STEP
      const navSuccess = await this.initiateNavigation(
        state.tabs.primaryTabId,
        targetUrl,
      );

      if (!navSuccess) {
        // Navigation failed, but step index is already updated
        // User will need to manually navigate or retry
        return { success: false, reason: "navigation_failed" };
      }

      return { success: true, navigating: true };
    } else {
      // Same-page jump - just update the step index
      await this.sessionManager.dispatch({
        type: "JUMP_TO_STEP",
        stepIndex: targetIndex,
      });

      return { success: true, navigating: false };
    }
  }

  /**
   * Retry the current step
   *
   * Re-dispatches SHOWING_STEP for the current step.
   */
  async retry(): Promise<JumpResult> {
    const state = await this.getCurrentState();
    if (!state) {
      return { success: false, reason: "no_session" };
    }

    await this.sessionManager.dispatch({ type: "RETRY" });
    return { success: true };
  }

  /**
   * Restart the walkthrough from step 0
   */
  async restart(): Promise<JumpResult> {
    return this.jumpToStep(0);
  }

  // ============================================================================
  // URL HANDLING
  // ============================================================================

  /**
   * Get URL from a step's page_context
   *
   * Steps store the departing page URL in page_context.url
   */
  private getStepUrl(step: StepResponse): string | null {
    // The step stores page_context which contains the URL at time of recording
    const pageContext = step.page_context as
      | Record<string, unknown>
      | undefined;
    return (pageContext?.url as string) ?? null;
  }

  /**
   * Check if two URLs match (for navigation purposes)
   *
   * Ignores query parameters and normalizes trailing slashes.
   */
  private urlsMatch(url1: string, url2: string): boolean {
    try {
      const u1 = new URL(url1);
      const u2 = new URL(url2);

      // Compare origin + pathname, ignore query params and hash
      const path1 = this.normalizePath(u1.pathname);
      const path2 = this.normalizePath(u2.pathname);

      return u1.origin === u2.origin && path1 === path2;
    } catch {
      // Fallback: simple comparison without query string
      const base1 = url1.split("?")[0]?.split("#")[0] ?? "";
      const base2 = url2.split("?")[0]?.split("#")[0] ?? "";
      return this.normalizePath(base1) === this.normalizePath(base2);
    }
  }

  /**
   * Normalize a URL path (remove trailing slashes, handle empty)
   *
   * Note: Does NOT lowercase - paths are case-sensitive on many servers.
   * Only the hostname/origin is case-insensitive.
   */
  private normalizePath(path: string): string {
    // Remove trailing slash, but keep "/" for root
    return path.replace(/\/$/, "") || "/";
  }

  /**
   * Parse a URL safely.
   */
  private safeParseUrl(url: string): URL | null {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  /**
   * Some workflows store/sanitize step URLs as the site root ("/").
   * After user actions that naturally navigate within the same origin (e.g. Google search),
   * forcing a navigation back to "/" is counterproductive and can appear as a step "jump".
   *
   * Treat a target URL of "/" as matching any current URL on the same origin.
   */
  private shouldTreatTargetRootAsMatch(
    currentUrl: string,
    targetUrl: string,
  ): boolean {
    const current = this.safeParseUrl(currentUrl);
    const target = this.safeParseUrl(targetUrl);

    if (!current || !target) {
      return false;
    }

    const targetPath = this.normalizePath(target.pathname);
    if (targetPath !== "/") {
      return false;
    }

    return current.origin === target.origin;
  }

  /**
   * Determine if navigation is needed to reach the target URL
   */
  private needsNavigation(
    currentUrl: string | null,
    targetUrl: string | null,
  ): boolean {
    // If we don't have a current URL, we can't determine - assume no navigation
    if (!currentUrl) {
      return false;
    }

    // If target URL is unknown, assume same page
    if (!targetUrl) {
      return false;
    }

    if (this.urlsMatch(currentUrl, targetUrl)) {
      return false;
    }

    if (this.shouldTreatTargetRootAsMatch(currentUrl, targetUrl)) {
      this.log(
        `Treating target root URL as same-origin match: currentUrl=${currentUrl}, targetUrl=${targetUrl}`,
      );
      return false;
    }

    return true;
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  /**
   * Initiate page navigation using chrome.tabs.update
   */
  private async initiateNavigation(
    tabId: number,
    url: string,
  ): Promise<boolean> {
    try {
      this.log(`Navigating tab ${tabId} to ${url}`);
      await chrome.tabs.update(tabId, { url });
      return true;
    } catch (error) {
      this.log(`Navigation failed: ${error}`, "error");
      return false;
    }
  }

  /**
   * Get the current URL of a tab
   */
  private async getCurrentTabUrl(tabId: number): Promise<string | null> {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.url ?? null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get current walkthrough state
   */
  private async getCurrentState(): Promise<WalkthroughState | null> {
    return this.sessionManager.getState();
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, level: "log" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[StepRouter] ${message}`);
  }
}
