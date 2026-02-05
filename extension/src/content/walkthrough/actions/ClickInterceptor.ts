/**
 * ClickInterceptor - Blocks clicks outside target during walkthrough
 *
 * Responsibilities:
 * - Capture-phase click interception
 * - Allowlist: target element, tooltip, overlay
 * - Visual feedback on blocked clicks (pulse + warning)
 * - Session-scoped lifecycle (enable on start, disable on exit)
 *
 * Key behavioral parity with legacy walkthrough.ts:
 * - Session-scoped: enabled at walkthrough start, NOT per-state (walkthrough.ts:1965)
 * - Target updated per step via setTarget()
 * - Uses isClickOnTarget for consistent shadow DOM handling (Codex review)
 */

import { isClickOnTarget } from "./ActionValidator";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration options
 */
export interface ClickInterceptorConfig {
  debug?: boolean;
  /** Callback when a click is blocked */
  onClickBlocked?: (event: MouseEvent) => void;
}

// ============================================================================
// CLICK INTERCEPTOR
// ============================================================================

/**
 * ClickInterceptor - Blocks clicks outside target during walkthrough
 *
 * SESSION-SCOPED LIFECYCLE:
 * - Call enable() when walkthrough starts
 * - Call setTarget() when showing each step
 * - Call disable() when walkthrough ends
 *
 * This differs from per-state activation because users should not be able
 * to click random elements at ANY point during a walkthrough, not just
 * during WAITING_ACTION state.
 *
 * @example
 * ```typescript
 * const interceptor = new ClickInterceptor({
 *   onClickBlocked: () => showWarningToast('Click the highlighted element')
 * });
 *
 * // When walkthrough starts
 * interceptor.enable();
 *
 * // When showing each step
 * interceptor.setTarget(targetElement, [tooltipEl, overlayEl]);
 *
 * // When walkthrough ends
 * interceptor.disable();
 * ```
 */
export class ClickInterceptor {
  private isEnabled = false;
  private targetElement: HTMLElement | null = null;
  private allowedElements: Set<HTMLElement> = new Set();
  private config: ClickInterceptorConfig;

  // Bound handler for proper cleanup
  private handleClick: (event: MouseEvent) => void;

  constructor(config?: ClickInterceptorConfig) {
    this.config = config ?? {};
    // Bind once in constructor for consistent reference in add/removeEventListener
    this.handleClick = this.onClickCapture.bind(this);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Enable click interception.
   * Call this when walkthrough starts.
   * Safe to call multiple times (idempotent).
   */
  enable(): void {
    if (this.isEnabled) {
      this.log("Already enabled, skipping");
      return;
    }

    this.log("Enabling click interception");
    // Capture phase for early interception before bubbling
    document.addEventListener("click", this.handleClick, true);
    this.isEnabled = true;
  }

  /**
   * Disable click interception.
   * Call this when walkthrough ends.
   * Safe to call multiple times (idempotent).
   */
  disable(): void {
    if (!this.isEnabled) {
      return;
    }

    this.log("Disabling click interception");
    document.removeEventListener("click", this.handleClick, true);
    this.isEnabled = false;
    this.targetElement = null;
    this.allowedElements.clear();
  }

  /**
   * Update the target element and allowed elements for current step.
   * Call this when showing each step (before entering WAITING_ACTION).
   *
   * @param element - The target element user should click
   * @param allowedElements - Additional elements that should not be blocked
   *                         (typically tooltip and overlay container)
   */
  setTarget(element: HTMLElement, allowedElements: HTMLElement[] = []): void {
    this.targetElement = element;
    this.allowedElements = new Set(allowedElements);
    this.log(
      `Target set: ${element.tagName}, ${allowedElements.length} allowed elements`,
    );
  }

  /**
   * Clear the current target.
   * Call this when step completes but walkthrough continues.
   */
  clearTarget(): void {
    this.targetElement = null;
    this.allowedElements.clear();
    this.log("Target cleared");
  }

  /**
   * Check if interception is currently enabled.
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Check if a target is currently set.
   */
  hasTarget(): boolean {
    return this.targetElement !== null;
  }

  // ============================================================================
  // CLICK HANDLING
  // ============================================================================

  /**
   * Capture-phase click handler.
   * Blocks clicks that are not on target or allowed elements.
   */
  private onClickCapture(event: MouseEvent): void {
    // If no target set, allow all clicks
    // (walkthrough may be in a state where clicks are OK)
    if (!this.targetElement) {
      return;
    }

    // Check if click is on target element (using shadow DOM aware check)
    if (isClickOnTarget(event, this.targetElement)) {
      this.log("Click on target - allowing");
      return;
    }

    // Check if click is on any allowed element (tooltip, overlay, etc.)
    for (const allowed of this.allowedElements) {
      if (isClickOnTarget(event, allowed)) {
        this.log(`Click on allowed element (${allowed.className}) - allowing`);
        return;
      }
    }

    // Check for data attribute escape hatch
    const eventTarget = event.target as HTMLElement;
    if (eventTarget?.closest?.("[data-walkthrough-allow]")) {
      this.log("Click on [data-walkthrough-allow] element - allowing");
      return;
    }

    // Block the click
    this.log("Click blocked - not on target or allowed element");
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Visual feedback
    this.pulseTarget();

    // Notify callback
    if (this.config.onClickBlocked) {
      this.config.onClickBlocked(event);
    }
  }

  // ============================================================================
  // VISUAL FEEDBACK
  // ============================================================================

  /**
   * Pulse the target element to draw attention.
   * Adds and removes a CSS class for animation.
   */
  private pulseTarget(): void {
    if (!this.targetElement) {
      return;
    }

    const PULSE_CLASS = "walkthrough-pulse";
    const PULSE_DURATION = 600; // ms, matches CSS animation

    // Remove existing pulse (if rapidly clicking)
    this.targetElement.classList.remove(PULSE_CLASS);

    // Force reflow to restart animation
    void this.targetElement.offsetWidth;

    // Add pulse class
    this.targetElement.classList.add(PULSE_CLASS);

    // Remove after animation completes
    setTimeout(() => {
      this.targetElement?.classList.remove(PULSE_CLASS);
    }, PULSE_DURATION);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Log message if debug enabled.
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[ClickInterceptor] ${message}`);
  }
}
