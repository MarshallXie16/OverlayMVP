/**
 * WalkthroughUI Facade
 *
 * Single coordinator that owns UI lifecycle and scroll/resize handling.
 * Fixes the cross-component drift issue identified by Codex review.
 *
 * Responsibilities:
 * - Owns overlay lifecycle (creates on first showStep, destroys on destroy)
 * - Centralizes scroll/resize handling for Spotlight + Tooltip sync
 * - Provides renderId for async cancellation during rapid state changes
 * - Coordinates Spotlight and Tooltip updates
 */

import type { WalkthroughState } from "../../../shared/walkthrough";
import { SPOTLIGHT_UPDATE_DEBOUNCE_MS } from "../../../shared/walkthrough";
import { OverlayManager } from "./OverlayManager";
import { SpotlightRenderer } from "./SpotlightRenderer";
import {
  TooltipRenderer,
  type TooltipAction,
  type HealingOptions,
} from "./TooltipRenderer";

// ============================================================================
// TYPES
// ============================================================================

export interface WalkthroughUIConfig {
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// DEBOUNCE UTILITY
// ============================================================================

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = ((...args: unknown[]) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  }) as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

// ============================================================================
// WALKTHROUGH UI FACADE
// ============================================================================

export class WalkthroughUI {
  private overlayManager = new OverlayManager();
  private spotlightRenderer: SpotlightRenderer | null = null;
  private tooltipRenderer: TooltipRenderer | null = null;

  // Async cancellation (Codex critical issue #2)
  private renderId = 0;

  // Current state
  private currentElement: HTMLElement | null = null;
  private isInitialized = false;

  // Scroll/resize handler (Codex critical issue #4)
  private debouncedScrollResize: (() => void) & { cancel: () => void };
  private boundScrollHandler: () => void;
  private boundResizeHandler: () => void;

  // Action callback
  private onAction: ((action: TooltipAction) => void) | null = null;

  // Config
  private config: WalkthroughUIConfig;

  constructor(config?: WalkthroughUIConfig) {
    this.config = config ?? {};

    // Create debounced handler for scroll/resize
    this.debouncedScrollResize = debounce(
      () => this.handleScrollResize(),
      SPOTLIGHT_UPDATE_DEBOUNCE_MS,
    );

    // Bind handlers for proper cleanup
    this.boundScrollHandler = () => this.debouncedScrollResize();
    this.boundResizeHandler = () => this.debouncedScrollResize();
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize UI facade with action callback.
   */
  initialize(onAction: (action: TooltipAction) => void): void {
    if (this.isInitialized) {
      this.log("Already initialized");
      return;
    }

    this.onAction = onAction;
    this.isInitialized = true;
    this.log("Initialized");
  }

  /**
   * Show step UI.
   * Returns renderId for cancellation check.
   * Caller should verify renderId matches after async operations.
   */
  showStep(
    element: HTMLElement,
    state: WalkthroughState,
  ): { renderId: number } {
    // Increment renderId on every call for async cancellation
    const thisRenderId = ++this.renderId;
    this.currentElement = element;

    // DEBUG: Always log to trace spotlight issues
    console.log(
      "[WalkthroughUI] showStep() called for step",
      state.currentStepIndex + 1,
      "element:",
      element?.tagName,
    );

    this.log(
      `showStep: step ${state.currentStepIndex + 1}/${state.totalSteps}`,
    );

    // Ensure overlay exists
    if (!this.overlayManager.isCreated()) {
      console.log("[WalkthroughUI] Creating UI (overlay not yet created)");
      this.createUI();
    }

    // DEBUG: Check if spotlight renderer exists
    console.log(
      "[WalkthroughUI] spotlightRenderer:",
      this.spotlightRenderer ? "valid" : "NULL",
    );

    // Update spotlight - use double rAF to ensure DOM layout is ready
    // This mirrors the legacy code's waitForLayout() pattern which is critical
    // for accurate element measurements after overlay creation
    if (this.spotlightRenderer) {
      const renderer = this.spotlightRenderer;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Verify render is still current (handles rapid state changes)
          if (this.renderId === thisRenderId && this.currentElement) {
            renderer.highlight(this.currentElement);
            console.log(
              "[WalkthroughUI] Spotlight highlight executed after layout wait",
            );
          } else {
            console.log(
              "[WalkthroughUI] Spotlight highlight skipped (stale renderId)",
            );
          }
        });
      });
    } else {
      console.warn(
        "[WalkthroughUI] spotlightRenderer is null! Spotlight will not be shown.",
      );
    }

    // Update tooltip
    if (this.tooltipRenderer) {
      // Ensure tooltip is visible (in case hide() was called previously)
      this.tooltipRenderer.show();
      this.tooltipRenderer.render({
        stepNumber: state.currentStepIndex + 1,
        totalSteps: state.totalSteps,
        fieldLabel: state.steps[state.currentStepIndex]?.field_label ?? "",
        instruction: state.steps[state.currentStepIndex]?.instruction ?? "",
        isFirstStep: state.currentStepIndex === 0,
        isLastStep: state.currentStepIndex === state.totalSteps - 1,
      });
      this.tooltipRenderer.position(element);
    }

    return { renderId: thisRenderId };
  }

  /**
   * Check if a renderId is still current (for async cancellation).
   */
  isRenderIdCurrent(id: number): boolean {
    return id === this.renderId;
  }

  /**
   * Show error state (mode within tooltip).
   */
  showError(state: WalkthroughState): void {
    this.log("showError");

    // Ensure overlay exists
    if (!this.overlayManager.isCreated()) {
      this.createUI();
    }

    // Hide spotlight for error state and clear element to prevent
    // scroll/resize from re-showing it (Codex critical fix)
    if (this.spotlightRenderer) {
      this.spotlightRenderer.hide();
    }
    this.currentElement = null;

    // Show error in tooltip
    if (this.tooltipRenderer) {
      const step = state.steps[state.currentStepIndex];
      this.tooltipRenderer.renderError({
        stepLabel: step?.field_label ?? `Step ${state.currentStepIndex + 1}`,
        errorMessage: state.errorInfo.message ?? "An error occurred",
        canRetry: state.errorInfo.retryCount < 3,
        canSkip: state.currentStepIndex < state.totalSteps - 1,
      });
    }
  }

  /**
   * Show navigation loading state (during page transition).
   */
  showNavigating(state: WalkthroughState): void {
    this.log("showNavigating");

    // Ensure overlay exists
    if (!this.overlayManager.isCreated()) {
      this.createUI();
    }

    // Hide spotlight during navigation and clear element to prevent
    // scroll/resize from re-showing it
    if (this.spotlightRenderer) {
      this.spotlightRenderer.hide();
    }
    this.currentElement = null;

    // Show navigation loading in tooltip
    if (this.tooltipRenderer) {
      this.tooltipRenderer.renderNavigation({
        stepNumber: state.currentStepIndex + 1,
        totalSteps: state.totalSteps,
        targetUrl: state.navigation.targetUrl ?? undefined,
      });
    }
  }

  /**
   * Show healing state (searching for element or confirmation).
   */
  showHealing(
    state: WalkthroughState,
    options?: Partial<HealingOptions>,
  ): void {
    this.log("showHealing");

    // Ensure overlay exists
    if (!this.overlayManager.isCreated()) {
      this.createUI();
    }

    // Hide spotlight during healing and clear element to prevent
    // scroll/resize from re-showing it (will be shown after successful heal)
    if (this.spotlightRenderer) {
      this.spotlightRenderer.hide();
    }
    this.currentElement = null;

    // Show healing UI in tooltip
    if (this.tooltipRenderer) {
      const step = state.steps[state.currentStepIndex];
      this.tooltipRenderer.renderHealing({
        stepNumber: state.currentStepIndex + 1,
        totalSteps: state.totalSteps,
        fieldLabel: step?.field_label ?? `Step ${state.currentStepIndex + 1}`,
        confidence: options?.confidence,
        showConfirmation: options?.showConfirmation,
      });
    }
  }

  /**
   * Show healed element with spotlight (after successful healing).
   */
  showHealedElement(element: HTMLElement, _state: WalkthroughState): void {
    this.log("showHealedElement");

    this.currentElement = element;

    // Show spotlight on healed element
    if (this.spotlightRenderer) {
      this.spotlightRenderer.highlight(element);
    }
  }

  /**
   * Show completion state.
   */
  showCompletion(state: WalkthroughState): void {
    this.log("showCompletion");

    // Ensure overlay exists
    if (!this.overlayManager.isCreated()) {
      this.createUI();
    }

    // Hide spotlight for completion and clear element to prevent
    // scroll/resize from re-showing it (Codex critical fix)
    if (this.spotlightRenderer) {
      this.spotlightRenderer.hide();
    }
    this.currentElement = null;

    // Show completion in tooltip
    if (this.tooltipRenderer) {
      this.tooltipRenderer.renderCompletion({
        workflowName: state.workflowName,
        totalSteps: state.totalSteps,
      });
    }
  }

  /**
   * Hide all UI (but keep DOM for quick re-show).
   */
  hide(): void {
    this.log("hide");

    if (this.spotlightRenderer) {
      this.spotlightRenderer.hide();
    }

    if (this.tooltipRenderer) {
      this.tooltipRenderer.hide();
    }

    this.currentElement = null;
  }

  /**
   * Full cleanup - remove all listeners and DOM.
   */
  destroy(): void {
    this.log("destroy");

    // Cancel pending debounced calls
    this.debouncedScrollResize.cancel();

    // Remove scroll/resize handlers
    this.removeScrollResizeHandlers();

    // Destroy components
    if (this.spotlightRenderer) {
      this.spotlightRenderer.destroy();
      this.spotlightRenderer = null;
    }

    if (this.tooltipRenderer) {
      this.tooltipRenderer.destroy();
      this.tooltipRenderer = null;
    }

    // Destroy overlay
    this.overlayManager.destroy();

    // Reset state
    this.currentElement = null;
    this.isInitialized = false;
    this.onAction = null;
    this.renderId = 0;
  }

  /**
   * Enable/disable button interactions during async operations.
   */
  setButtonsEnabled(enabled: boolean): void {
    if (this.tooltipRenderer) {
      this.tooltipRenderer.setButtonsEnabled(enabled);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Create UI components on first use.
   */
  private createUI(): void {
    console.log("[WalkthroughUI] createUI() starting...");

    // Create overlay container
    const { spotlightCutout, container } = this.overlayManager.create();

    // DEBUG: Check if spotlightCutout is valid
    console.log(
      "[WalkthroughUI] Overlay created, spotlightCutout:",
      spotlightCutout ? "valid SVGRectElement" : "NULL",
    );

    // Create spotlight renderer
    this.spotlightRenderer = new SpotlightRenderer({
      debug: this.config.debug,
    });
    this.spotlightRenderer.initialize(spotlightCutout);

    console.log(
      "[WalkthroughUI] SpotlightRenderer created and initialized:",
      this.spotlightRenderer ? "valid" : "NULL",
    );

    // Create tooltip renderer
    this.tooltipRenderer = new TooltipRenderer({
      debug: this.config.debug,
    });
    this.tooltipRenderer.initialize(container, this.handleAction);

    // Setup scroll/resize handlers (centralized in facade)
    this.setupScrollResizeHandlers();

    console.log("[WalkthroughUI] createUI() completed");
    this.log("UI created");
  }

  /**
   * Handle tooltip action and forward to controller.
   */
  private handleAction = (action: TooltipAction): void => {
    if (this.onAction) {
      this.onAction(action);
    }
  };

  /**
   * Setup scroll/resize handlers (centralized - Codex critical issue #4).
   */
  private setupScrollResizeHandlers(): void {
    // Use capture phase for scroll to catch it early
    window.addEventListener("scroll", this.boundScrollHandler, true);
    window.addEventListener("resize", this.boundResizeHandler);
    this.log("Scroll/resize handlers setup");
  }

  /**
   * Remove scroll/resize handlers.
   */
  private removeScrollResizeHandlers(): void {
    window.removeEventListener("scroll", this.boundScrollHandler, true);
    window.removeEventListener("resize", this.boundResizeHandler);
    this.log("Scroll/resize handlers removed");
  }

  /**
   * Handle scroll/resize - update BOTH spotlight and tooltip in sync.
   */
  private handleScrollResize(): void {
    if (!this.currentElement) return;

    // Update both components in sync (fixes Codex critical issue #4)
    if (this.spotlightRenderer) {
      this.spotlightRenderer.updatePosition(this.currentElement);
    }

    if (this.tooltipRenderer) {
      this.tooltipRenderer.reposition(this.currentElement);
    }
  }

  /**
   * Log message if debug enabled.
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[WalkthroughUI] ${message}`);
    }
  }
}
