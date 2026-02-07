/**
 * DynamicWalkthroughController
 *
 * Content script orchestrator for AI-guided dynamic workflows.
 * Receives state broadcasts from the background script, renders overlay UI
 * (spotlight + tooltips), captures page context, and reports user actions back
 * to the background.
 *
 * Key loop:
 *   CAPTURING -> THINKING -> SHOWING_STEP -> WAITING_ACTION -> CAPTURING (repeat)
 *
 * Design:
 * - Receives read-only state snapshots from background via DYNAMIC_STATE_CHANGED messages
 * - Sends events to background via chrome.runtime.sendMessage (DYNAMIC_COMMAND, DYNAMIC_REPORT_CONTEXT)
 * - Does NOT modify state directly -- all mutations go through the background state machine
 * - Uses PageContextCapture for element discovery (index-based lookup, not findElement)
 * - Renders its own tooltip DOM instead of reusing WalkthroughUI's TooltipRenderer,
 *   because the button set is different ("I did it" / "That's wrong" / "Skip" / "Exit")
 * - Reuses OverlayManager and SpotlightRenderer from the walkthrough UI module
 */

import {
  isDynamicStateChangedMessage,
  type DynamicWorkflowState,
  type DynamicMachineState,
  type DynamicStep,
  type CompletedStepSummary,
  DYNAMIC_MESSAGE_TYPES,
  type DynamicCommandMessage,
  type DynamicReportContextMessage,
  type DynamicCommand,
} from "../../shared/dynamicWorkflow/types";
import { PageContextCapture } from "./PageContextCapture";

// Reuse existing UI components from walkthrough
import { OverlayManager } from "../walkthrough/ui/OverlayManager";
import { SpotlightRenderer } from "../walkthrough/ui/SpotlightRenderer";

// ============================================================================
// TYPES
// ============================================================================

export interface DynamicControllerConfig {
  debug?: boolean;
}

// ============================================================================
// CONTROLLER
// ============================================================================

/**
 * DynamicWalkthroughController - Content script orchestrator for dynamic workflows.
 *
 * @example
 * ```typescript
 * const controller = new DynamicWalkthroughController({ debug: true });
 * await controller.initialize();
 *
 * // Later, when navigating away or cleaning up:
 * controller.destroy();
 * ```
 */
export class DynamicWalkthroughController {
  private currentState: DynamicWorkflowState | null = null;
  private initialized = false;
  private messageListener: ((message: unknown) => void) | null = null;
  private config: DynamicControllerConfig;

  // Page context capture
  private pageCapture: PageContextCapture;

  // UI components (reused from walkthrough)
  private overlayManager: OverlayManager;
  private spotlightRenderer: SpotlightRenderer;

  // Current step's target element
  private currentTargetElement: HTMLElement | null = null;

  // Tooltip DOM element (managed directly, not through TooltipRenderer)
  private tooltipElement: HTMLElement | null = null;

  // Action detection: event names attached to currentTargetElement
  private attachedActionEvents: string[] = [];
  private actionHandler: ((e: Event) => void) | null = null;

  // Render cancellation guard (prevents stale renders after rapid state transitions)
  private renderId = 0;

  // Scroll/resize listener for repositioning spotlight and tooltip (W10)
  private scrollResizeHandler: (() => void) | null = null;
  private scrollResizeRafId: number | null = null;

  constructor(config?: DynamicControllerConfig) {
    this.config = config ?? {};
    this.pageCapture = new PageContextCapture();
    this.overlayManager = new OverlayManager();
    this.spotlightRenderer = new SpotlightRenderer({
      debug: this.config.debug,
    });
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize the controller.
   *
   * Sets up the message listener for state broadcasts from the background
   * and sends TAB_READY to discover any existing active session.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Listen for state broadcasts from background
    this.messageListener = this.handleMessage.bind(this);
    chrome.runtime.onMessage.addListener(this.messageListener);

    // Signal TAB_READY to background
    try {
      const response = await chrome.runtime.sendMessage({
        type: DYNAMIC_MESSAGE_TYPES.TAB_READY,
        tabId: 0, // Background will use sender.tab.id
        url: window.location.href,
      });

      // If there is an active session, process the state immediately
      if (response?.hasActiveSession && response?.state) {
        this.onStateChanged(response.state);
      }
    } catch (error) {
      this.log(`TAB_READY failed: ${error}`, "error");
    }

    this.initialized = true;
    this.log("Initialized");
  }

  /**
   * Clean up and destroy the controller.
   * Removes all listeners and DOM elements.
   *
   * Order matters: detach action listeners first (needs currentTargetElement),
   * then clean up UI (which nulls currentTargetElement), then destroy spotlight.
   */
  destroy(): void {
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }

    this.removeScrollResizeListeners();
    this.detachActionListeners();
    this.cleanupUI();
    this.spotlightRenderer.destroy();
    this.currentState = null;
    this.currentTargetElement = null;
    this.initialized = false;
    this.log("Destroyed");
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  /**
   * Handle incoming messages from background.
   * Only processes DYNAMIC_STATE_CHANGED messages.
   */
  private handleMessage(message: unknown): void {
    if (!isDynamicStateChangedMessage(message)) return;

    this.log(
      `State received: ${message.state.machineState} (trigger: ${message.trigger})`,
    );
    this.onStateChanged(message.state);
  }

  /**
   * Process a state change: store the new state and handle the machine state.
   */
  private onStateChanged(state: DynamicWorkflowState): void {
    const previousState = this.currentState;
    this.currentState = state;

    this.handleMachineState(
      state.machineState,
      previousState?.machineState ?? null,
    );
  }

  // ============================================================================
  // STATE MACHINE HANDLING
  // ============================================================================

  /**
   * Handle machine state transitions.
   *
   * Each state maps to a specific rendering / action setup behavior.
   * When leaving WAITING_ACTION, action listeners and the target element
   * reference are cleaned up to prevent stale state.
   */
  private handleMachineState(
    state: DynamicMachineState,
    previousState: DynamicMachineState | null,
  ): void {
    this.log(`State: ${previousState ?? "null"} -> ${state}`);

    // Clean up when leaving action states
    if (previousState === "WAITING_ACTION" && state !== "WAITING_ACTION") {
      this.detachActionListeners();
      this.currentTargetElement = null;
    }

    switch (state) {
      case "IDLE":
        this.cleanupUI();
        break;

      case "CAPTURING":
        this.captureAndSendContext();
        break;

      case "THINKING":
        this.showThinking();
        break;

      case "SHOWING_STEP":
        this.showDynamicStep();
        break;

      case "WAITING_ACTION":
        this.setupActionDetection();
        break;

      case "NAVIGATING":
        this.showNavigating();
        break;

      case "ERROR":
        this.showError();
        break;

      case "COMPLETED":
        this.showCompleted();
        break;

      case "CONFIRMING_ENTITIES":
        // Entity confirmation happens in the popup, not the content script
        break;

      case "INITIALIZING":
      case "AUTO_EXECUTING":
        // Handled by background; content script just waits
        break;
    }
  }

  // ============================================================================
  // CAPTURING -- Send page context to background
  // ============================================================================

  /**
   * Capture the current page context via PageContextCapture and send
   * the result to the background as a DYNAMIC_REPORT_CONTEXT message.
   */
  private captureAndSendContext(): void {
    this.log("Capturing page context...");

    try {
      const result = this.pageCapture.capture();

      this.log(`Captured ${result.elementCount} elements`);

      const message: DynamicReportContextMessage = {
        type: DYNAMIC_MESSAGE_TYPES.REPORT_CONTEXT,
        pageContextText: result.formattedText,
        url: result.url,
        title: document.title,
        elementCount: result.elementCount,
      };

      chrome.runtime.sendMessage(message).catch((error) => {
        this.log(`Failed to send context: ${error}`, "error");
      });
    } catch (error) {
      this.log(`Context capture failed: ${error}`, "error");
    }
  }

  // ============================================================================
  // SHOWING_STEP -- Find element and show overlay
  // ============================================================================

  /**
   * Render the current step: look up the target element by index from the
   * last page context capture, spotlight it, and show the instruction tooltip.
   *
   * Reports ELEMENT_FOUND or ELEMENT_NOT_FOUND back to the background so
   * the state machine can transition to WAITING_ACTION or ERROR.
   */
  private showDynamicStep(): void {
    if (!this.currentState?.currentStep) {
      this.log("No current step to show", "warn");
      return;
    }

    const step = this.currentState.currentStep;
    const renderId = ++this.renderId;

    // Look up element by index from last capture
    let element = this.pageCapture.getElementByIndex(step.elementIndex);

    if (!element) {
      this.log(
        `Element not found at index ${step.elementIndex}, trying selector fallback`,
        "warn",
      );

      // Try CSS selector fallback (C10: wrap in try/catch for invalid selectors)
      if (step.selectorHint) {
        try {
          element = document.querySelector<HTMLElement>(step.selectorHint);
        } catch {
          this.log(
            `Invalid CSS selector "${step.selectorHint}", treating as not found`,
            "warn",
          );
        }
      }
    }

    // W7: Verify element is connected and has non-zero dimensions
    if (element) {
      if (!this.isElementUsable(element)) {
        this.log(
          `Element found but not usable (disconnected or zero-size)`,
          "warn",
        );
        element = null;
      }
    }

    if (!element) {
      // Element truly not found -- notify background
      this.sendCommand("REPORT_ACTION", {
        type: "ELEMENT_NOT_FOUND",
        reason: `Element [${step.elementIndex}] not in DOM`,
      });
      return;
    }

    this.showStepOnElement(element, step, renderId);

    // Attach scroll/resize listeners (W10)
    this.attachScrollResizeListeners();

    // Report element found -> transitions to WAITING_ACTION in background
    this.sendCommand("REPORT_ACTION", { type: "ELEMENT_FOUND" });
  }

  /**
   * Check that an element is connected to the DOM and has non-zero dimensions.
   * An element that fails these checks cannot be interacted with.
   */
  private isElementUsable(element: HTMLElement): boolean {
    if (!element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Spotlight an element, scroll it into view, and render the instruction tooltip.
   */
  private showStepOnElement(
    element: HTMLElement,
    step: DynamicStep,
    _renderId: number,
  ): void {
    this.currentTargetElement = element;

    // Ensure overlay is created (idempotent check)
    this.ensureOverlay();

    // Spotlight the element
    this.spotlightRenderer.highlight(element);

    // Scroll element into view
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    // Show tooltip near element
    this.showDynamicTooltip(element, step);
  }

  // ============================================================================
  // TOOLTIP RENDERING
  // ============================================================================

  /**
   * Render the main step tooltip with action buttons:
   * "I did it", "That's wrong", "Skip", and an exit (X) button.
   */
  private showDynamicTooltip(element: HTMLElement, step: DynamicStep): void {
    this.removeTooltip();

    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-dynamic-overlay", "tooltip");
    tooltip.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 16px;
      max-width: 340px;
      min-width: 260px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      border: 2px solid #6366f1;
    `;

    // Progress indicator
    const progress = this.currentState?.progressEstimate ?? 0;
    const stepCount = this.currentState?.stepCount ?? 0;

    // Build tooltip content
    tooltip.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 12px; color: #6366f1; font-weight: 600;">
          Step ${stepCount + 1} ${progress > 0 ? `&middot; ${Math.round(progress)}%` : ""}
        </span>
        <button data-action="exit" style="background: none; border: none; cursor: pointer; padding: 4px; color: #9ca3af; line-height: 0;" title="Exit walkthrough">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button>
      </div>
      <div style="font-weight: 500; margin-bottom: 4px;">${this.escapeHtml(step.fieldLabel)}</div>
      <div style="color: #4b5563; margin-bottom: 12px;">${this.escapeHtml(step.instruction)}</div>
      ${
        step.autoFillValue
          ? `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px; margin-bottom: 12px; font-size: 13px; color: #166534;">Value: <strong>${this.escapeHtml(step.autoFillValue)}</strong></div>`
          : ""
      }
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button data-action="did-it" style="flex: 1; padding: 8px 12px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;">I did it</button>
        <button data-action="wrong" style="padding: 8px 12px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; border-radius: 8px; cursor: pointer; font-size: 13px;">That's wrong</button>
        <button data-action="skip" style="padding: 8px 12px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">Skip</button>
      </div>
    `;

    // Position tooltip near element
    this.positionTooltip(tooltip, element);

    document.body.appendChild(tooltip);
    this.tooltipElement = tooltip;

    // Event delegation for buttons
    tooltip.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("[data-action]");
      if (!target) return;

      const action = target.getAttribute("data-action");
      this.handleTooltipAction(action, step);
    });
  }

  /**
   * Render the "thinking" tooltip: a spinner with the AI's message, fixed
   * at the bottom-right corner. Shown during THINKING and NAVIGATING states.
   */
  private showThinkingTooltip(): void {
    this.removeTooltip();

    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-dynamic-overlay", "tooltip");
    tooltip.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 16px;
      max-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      border: 2px solid #6366f1;
    `;

    const message = this.currentState?.aiMessage || "Analyzing page...";

    tooltip.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 24px; height: 24px; flex-shrink: 0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" style="animation: dynamic-spin 1s linear infinite; width: 24px; height: 24px;">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
          </svg>
        </div>
        <span style="color: #4b5563;">${this.escapeHtml(message)}</span>
      </div>
      <button data-action="exit" style="position: absolute; top: 8px; right: 8px; background: none; border: none; cursor: pointer; padding: 4px; color: #9ca3af;" title="Exit walkthrough">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>
    `;

    // Add spinner animation style if not already present
    this.ensureSpinnerStyle();

    document.body.appendChild(tooltip);
    this.tooltipElement = tooltip;

    tooltip.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("[data-action]");
      if (!target) return;
      if (target.getAttribute("data-action") === "exit") {
        this.sendCommand("EXIT");
      }
    });
  }

  /**
   * Render a feedback input tooltip so the user can explain what went wrong.
   * Triggered when the user clicks "That's wrong" on the step tooltip.
   */
  private showFeedbackInput(step: DynamicStep): void {
    this.removeTooltip();

    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-dynamic-overlay", "tooltip");
    tooltip.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 16px;
      max-width: 340px;
      min-width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      border: 2px solid #f59e0b;
    `;

    tooltip.innerHTML = `
      <div style="font-weight: 500; margin-bottom: 8px; color: #92400e;">What went wrong?</div>
      <textarea data-feedback-input style="width: 100%; min-height: 60px; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; font-family: inherit; resize: vertical; box-sizing: border-box;" placeholder="e.g., That's the wrong field, use the Total box instead"></textarea>
      <div style="display: flex; gap: 8px; margin-top: 8px;">
        <button data-action="send-feedback" style="flex: 1; padding: 8px 12px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;">Send correction</button>
        <button data-action="cancel-feedback" style="padding: 8px 12px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">Cancel</button>
      </div>
    `;

    document.body.appendChild(tooltip);
    this.tooltipElement = tooltip;

    // Focus the textarea
    const textarea = tooltip.querySelector(
      "[data-feedback-input]",
    ) as HTMLTextAreaElement;
    if (textarea) textarea.focus();

    tooltip.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("[data-action]");
      if (!target) return;

      const action = target.getAttribute("data-action");
      if (action === "send-feedback") {
        const text = textarea?.value?.trim();
        if (text) {
          this.sendCommand("FEEDBACK", { correctionText: text });
        }
      } else if (action === "cancel-feedback") {
        // Re-show the step tooltip
        if (this.currentTargetElement && step) {
          this.showDynamicTooltip(this.currentTargetElement, step);
        }
      }
    });
  }

  // ============================================================================
  // TOOLTIP ACTIONS
  // ============================================================================

  /**
   * Handle button clicks from the step tooltip.
   */
  private handleTooltipAction(action: string | null, step: DynamicStep): void {
    if (!action) return;

    switch (action) {
      case "did-it": {
        const summary: CompletedStepSummary = {
          stepNumber: (this.currentState?.stepCount ?? 0) + 1,
          instruction: step.instruction,
          actionType: step.actionType,
          fieldLabel: step.fieldLabel,
          success: true,
        };
        this.sendCommand("REPORT_ACTION", { summary });
        break;
      }
      case "wrong":
        this.showFeedbackInput(step);
        break;
      case "skip":
        this.sendCommand("SKIP");
        break;
      case "exit":
        this.sendCommand("EXIT");
        break;
    }
  }

  // ============================================================================
  // THINKING STATE
  // ============================================================================

  /**
   * Enter the THINKING state: clear the spotlight and show a thinking tooltip.
   */
  private showThinking(): void {
    this.spotlightRenderer.hide();
    this.showThinkingTooltip();
  }

  // ============================================================================
  // NAVIGATING STATE
  // ============================================================================

  /**
   * Enter the NAVIGATING state: show a minimal "navigating..." indicator.
   */
  private showNavigating(): void {
    this.showThinkingTooltip();
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================

  /**
   * Render the error tooltip with "Retry" and "Exit" buttons.
   */
  private showError(): void {
    this.removeTooltip();

    const errorMessage =
      this.currentState?.errorInfo?.message || "Something went wrong";

    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-dynamic-overlay", "tooltip");
    tooltip.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 16px;
      max-width: 340px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      border: 2px solid #ef4444;
    `;

    tooltip.innerHTML = `
      <div style="font-weight: 500; color: #dc2626; margin-bottom: 8px;">Error</div>
      <div style="color: #4b5563; margin-bottom: 12px;">${this.escapeHtml(errorMessage)}</div>
      <div style="display: flex; gap: 8px;">
        <button data-action="retry" style="flex: 1; padding: 8px 12px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">Retry</button>
        <button data-action="exit" style="padding: 8px 12px; background: #f3f4f6; color: #6b7280; border: none; border-radius: 8px; cursor: pointer; font-size: 13px;">Exit</button>
      </div>
    `;

    document.body.appendChild(tooltip);
    this.tooltipElement = tooltip;

    tooltip.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("[data-action]");
      if (!target) return;

      const action = target.getAttribute("data-action");
      if (action === "retry") {
        this.sendCommand("REPORT_ACTION", { type: "RETRY" });
      } else if (action === "exit") {
        this.sendCommand("EXIT");
      }
    });
  }

  // ============================================================================
  // COMPLETED STATE
  // ============================================================================

  /**
   * Render the completion tooltip with a checkmark and step count summary.
   */
  private showCompleted(): void {
    this.removeTooltip();
    this.spotlightRenderer.hide();

    const message = this.currentState?.aiMessage || "Goal achieved!";
    const stepCount = this.currentState?.stepCount ?? 0;

    const tooltip = document.createElement("div");
    tooltip.setAttribute("data-dynamic-overlay", "tooltip");
    tooltip.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      padding: 20px;
      max-width: 340px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1a1a1a;
      border: 2px solid #22c55e;
    `;

    tooltip.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 32px; margin-bottom: 8px;">&#10003;</div>
        <div style="font-weight: 600; font-size: 16px; color: #166534; margin-bottom: 4px;">Complete!</div>
        <div style="color: #4b5563; margin-bottom: 12px;">${this.escapeHtml(message)}</div>
        <div style="font-size: 12px; color: #9ca3af; margin-bottom: 12px;">${stepCount} step${stepCount !== 1 ? "s" : ""} completed</div>
        <button data-action="exit" style="padding: 8px 20px; background: #22c55e; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">Done</button>
      </div>
    `;

    document.body.appendChild(tooltip);
    this.tooltipElement = tooltip;

    tooltip.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest("[data-action]");
      if (!target) return;
      if (target.getAttribute("data-action") === "exit") {
        this.sendCommand("EXIT");
      }
    });
  }

  // ============================================================================
  // ACTION DETECTION
  // ============================================================================

  /**
   * Set up DOM event listeners on the current target element to auto-detect
   * when the user completes the requested action.
   *
   * Listens for click, change, blur, or submit depending on the action type.
   * When a matching event fires, sends an ACTION_COMPLETED report to background.
   */
  private setupActionDetection(): void {
    if (!this.currentTargetElement || !this.currentState?.currentStep) return;

    const step = this.currentState.currentStep;
    const element = this.currentTargetElement;

    // Clean up any previous listeners
    this.detachActionListeners();

    const handler = (_e: Event) => {
      const summary: CompletedStepSummary = {
        stepNumber: (this.currentState?.stepCount ?? 0) + 1,
        instruction: step.instruction,
        actionType: step.actionType,
        fieldLabel: step.fieldLabel,
        success: true,
        valueEntered: this.getSafeValueEntered(element),
      };
      this.sendCommand("REPORT_ACTION", { summary });

      // Once the action fires, detach all listeners for this step
      this.detachActionListeners();
    };

    this.actionHandler = handler;

    // Attach appropriate listeners based on action type
    const events = this.getEventsForAction(step.actionType);
    for (const eventName of events) {
      element.addEventListener(eventName, handler, { once: true });
    }
    this.attachedActionEvents = events;
  }

  /**
   * Map an action type to the DOM events that indicate completion.
   */
  private getEventsForAction(actionType: string): string[] {
    switch (actionType) {
      case "click":
        return ["click"];
      case "input_commit":
        return ["change", "blur"];
      case "select_change":
        return ["change"];
      case "submit":
        return ["submit", "click"]; // forms and submit buttons
      default:
        return ["click"];
    }
  }

  /**
   * Remove all action event listeners from the current target element.
   */
  private detachActionListeners(): void {
    if (this.actionHandler && this.currentTargetElement) {
      for (const eventName of this.attachedActionEvents) {
        this.currentTargetElement.removeEventListener(
          eventName,
          this.actionHandler,
        );
      }
    }
    this.actionHandler = null;
    this.attachedActionEvents = [];
  }

  // ============================================================================
  // OVERLAY MANAGEMENT
  // ============================================================================

  /**
   * Ensure the overlay and spotlight renderer are initialized.
   * Idempotent -- safe to call multiple times.
   */
  private ensureOverlay(): void {
    if (!this.overlayManager.isCreated()) {
      const { spotlightCutout } = this.overlayManager.create();
      this.spotlightRenderer.initialize(spotlightCutout);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Send a command message to the background script.
   */
  private sendCommand(
    command: DynamicCommand,
    payload?: Record<string, unknown>,
  ): void {
    const message: DynamicCommandMessage = {
      type: DYNAMIC_MESSAGE_TYPES.COMMAND,
      command,
      payload,
    };

    chrome.runtime.sendMessage(message).catch((error) => {
      this.log(`Failed to send command ${command}: ${error}`, "error");
    });
  }

  /**
   * Position a tooltip element near a target element.
   * Tries below first, then above, then falls back to bottom-right corner.
   */
  private positionTooltip(tooltip: HTMLElement, element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const padding = 16;

    // Try below the element first
    let top = rect.bottom + padding;
    let left = rect.left;

    // If below would go off-screen, try above
    if (top + 200 > window.innerHeight) {
      top = rect.top - 200 - padding;
    }

    // If above would also go off-screen, use bottom-right corner
    if (top < 0) {
      top = window.innerHeight - 220;
      left = window.innerWidth - 360;
    }

    // Ensure left is not off-screen
    if (left + 340 > window.innerWidth) {
      left = window.innerWidth - 360;
    }
    if (left < 8) left = 8;

    tooltip.style.top = `${Math.max(8, top)}px`;
    tooltip.style.left = `${Math.max(8, left)}px`;
  }

  /**
   * Remove the current tooltip element from the DOM.
   */
  private removeTooltip(): void {
    if (this.tooltipElement) {
      this.tooltipElement.remove();
      this.tooltipElement = null;
    }
  }

  /**
   * Clean up all UI elements: tooltip, spotlight, and overlay.
   */
  private cleanupUI(): void {
    this.removeScrollResizeListeners();
    this.removeTooltip();
    this.spotlightRenderer.hide();
    this.overlayManager.destroy();
    this.currentTargetElement = null;
    this.removeSpinnerStyle();
  }

  // ============================================================================
  // SCROLL / RESIZE REPOSITIONING (W10)
  // ============================================================================

  /**
   * Attach throttled scroll and resize listeners to reposition the spotlight
   * and tooltip when the viewport changes. Uses requestAnimationFrame for throttling.
   */
  private attachScrollResizeListeners(): void {
    // Remove any existing listeners first
    this.removeScrollResizeListeners();

    const handler = () => {
      if (this.scrollResizeRafId !== null) return;
      this.scrollResizeRafId = requestAnimationFrame(() => {
        this.scrollResizeRafId = null;
        if (this.currentTargetElement) {
          this.spotlightRenderer.highlight(this.currentTargetElement);
          if (this.tooltipElement) {
            this.positionTooltip(
              this.tooltipElement,
              this.currentTargetElement,
            );
          }
        }
      });
    };

    this.scrollResizeHandler = handler;
    window.addEventListener("scroll", handler, { passive: true });
    window.addEventListener("resize", handler, { passive: true });
  }

  /**
   * Remove scroll and resize listeners and cancel any pending RAF.
   */
  private removeScrollResizeListeners(): void {
    if (this.scrollResizeHandler) {
      window.removeEventListener("scroll", this.scrollResizeHandler);
      window.removeEventListener("resize", this.scrollResizeHandler);
      this.scrollResizeHandler = null;
    }
    if (this.scrollResizeRafId !== null) {
      cancelAnimationFrame(this.scrollResizeRafId);
      this.scrollResizeRafId = null;
    }
  }

  // ============================================================================
  // VALUE REDACTION FOR COMPLETED STEP SUMMARIES (C11)
  // ============================================================================

  /** Sensitive field keywords matching name/placeholder attributes */
  private static readonly SENSITIVE_KEYWORDS =
    /ssn|social|account|routing|card|cvv|pin|dob|birth|passport/i;

  /** Patterns to redact from entered values */
  private static readonly REDACT_PATTERNS: [RegExp, string][] = [
    [/\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}/g, "****-****-****-****"],
    [/\d{3}-\d{2}-\d{4}/g, "***-**-****"],
    [/\S+@\S+\.\S+/g, "***@***.***"],
    [/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "***-***-XXXX"],
  ];

  /**
   * Extracts a safe, redacted version of the value entered by the user
   * for step history tracking. Omits values for sensitive field types.
   */
  private getSafeValueEntered(element: HTMLElement): string | undefined {
    const inputEl = element as HTMLInputElement;
    const value = inputEl.value;
    if (!value) return undefined;

    // Never include values for sensitive input types
    const type = (inputEl.type || "").toLowerCase();
    if (type === "password" || type === "email" || type === "tel") {
      return undefined;
    }

    // Never include values for fields with sensitive name/placeholder
    const name = (inputEl.name || "").toLowerCase();
    const placeholder = (inputEl.placeholder || "").toLowerCase();
    if (
      DynamicWalkthroughController.SENSITIVE_KEYWORDS.test(name) ||
      DynamicWalkthroughController.SENSITIVE_KEYWORDS.test(placeholder)
    ) {
      return undefined;
    }

    // Apply redaction patterns
    let redacted = value;
    for (const [
      pattern,
      replacement,
    ] of DynamicWalkthroughController.REDACT_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }

    // Truncate to 50 chars
    if (redacted.length > 50) {
      redacted = redacted.substring(0, 50) + "...";
    }

    return redacted || undefined;
  }

  // ============================================================================
  // OTHER HELPERS
  // ============================================================================

  /**
   * Escape HTML to prevent XSS when injecting AI / user text into tooltips.
   */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Inject the CSS keyframe animation for the thinking spinner
   * if it is not already in the document head.
   */
  private ensureSpinnerStyle(): void {
    if (!document.getElementById("dynamic-spinner-style")) {
      const style = document.createElement("style");
      style.id = "dynamic-spinner-style";
      style.textContent =
        "@keyframes dynamic-spin { to { transform: rotate(360deg); } }";
      document.head.appendChild(style);
    }
  }

  /**
   * Remove the spinner keyframe style element if it exists.
   */
  private removeSpinnerStyle(): void {
    const style = document.getElementById("dynamic-spinner-style");
    if (style) style.remove();
  }

  /**
   * Log a message to the console.
   * Debug-level messages are suppressed unless config.debug is true.
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") return;
    console[level](`[DynamicController] ${message}`);
  }
}
