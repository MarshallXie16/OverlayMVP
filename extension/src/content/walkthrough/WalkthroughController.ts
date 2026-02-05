/**
 * Walkthrough Controller
 *
 * Main orchestrator for the walkthrough system in content scripts.
 *
 * Responsibilities:
 * - Listen for state broadcasts from background
 * - Render UI based on current state
 * - Detect and report user actions
 * - Handle navigation events
 *
 * Design:
 * - Receives read-only state snapshots from background
 * - Sends events to background via chrome.runtime.sendMessage
 * - Does NOT modify state directly - all mutations go through background
 */

import type {
  WalkthroughState,
  WalkthroughMachineState,
} from "../../shared/walkthrough";
import {
  isStateChangedMessage,
  createElementStatusMessage,
  createCommandMessage,
  createHealingResultMessage,
  MAX_ACTION_RETRIES,
  ADVANCE_DELAY_CLICK,
  ADVANCE_DELAY_SELECT,
  ADVANCE_DELAY_INPUT,
  ADVANCE_DELAY_DEFAULT,
  FLASH_SUCCESS_DURATION_MS,
  FLASH_ERROR_DURATION_MS,
} from "../../shared/walkthrough";
import type { HealingResult as MessageHealingResult } from "../../shared/walkthrough/messages";
import type { StepResponse } from "../../shared/types";
import { healElement, type HealingResult as HealerResult } from "../healing";
import type { WalkthroughControllerConfig, StateChangeCallback } from "./types";
import {
  ActionDetector,
  ActionValidator,
  ClickInterceptor,
  type DetectedAction,
  type ActionType,
} from "./actions";
import { WalkthroughUI, type TooltipAction } from "./ui";
import { NavigationHandler } from "./navigation";

// ============================================================================
// CONTROLLER
// ============================================================================

/**
 * WalkthroughController - Content script orchestrator
 *
 * @example
 * ```typescript
 * const controller = new WalkthroughController({ debug: true });
 * await controller.initialize();
 *
 * // Later, when navigating away or cleaning up:
 * controller.destroy();
 * ```
 */
export class WalkthroughController {
  private currentState: WalkthroughState | null = null;
  private initialized = false;
  private messageListener: ((message: unknown) => void) | null = null;
  private stateCallbacks: Set<StateChangeCallback> = new Set();
  private config: WalkthroughControllerConfig;

  // Action detection components (Sprint 3)
  private actionDetector: ActionDetector;
  private actionValidator: ActionValidator;
  private clickInterceptor: ClickInterceptor;

  // Current step's target element (set when entering WAITING_ACTION)
  private currentTargetElement: HTMLElement | null = null;

  // Flash effect timeout for cleanup
  private flashTimeout: ReturnType<typeof setTimeout> | null = null;

  // Auto-advance timeout (for cancellation on state change or destroy)
  private advanceTimeout: ReturnType<typeof setTimeout> | null = null;

  // UI facade (Sprint 2, integrated in Sprint 4)
  private ui: WalkthroughUI;

  // Navigation handler (Sprint 4 - SPA navigation and session restoration)
  private navigationHandler: NavigationHandler;

  // Healing state (Sprint 5)
  private healingInProgress = false;
  private pendingHealResult: {
    result: HealerResult;
    step: StepResponse;
    stepIndex: number;
  } | null = null;

  constructor(config?: WalkthroughControllerConfig) {
    this.config = config ?? {};

    // Initialize action detection components
    this.actionDetector = new ActionDetector(this.onActionDetected.bind(this), {
      debug: this.config.debug,
    });
    this.actionValidator = new ActionValidator({ debug: this.config.debug });
    this.clickInterceptor = new ClickInterceptor({
      debug: this.config.debug,
      onClickBlocked: this.onClickBlocked.bind(this),
    });

    // Initialize UI facade
    this.ui = new WalkthroughUI({ debug: this.config.debug });

    // Initialize navigation handler (Sprint 4)
    // The callback handles session state restoration from background
    this.navigationHandler = new NavigationHandler(
      (state) => this.onStateChanged(state),
      { debug: this.config.debug },
    );
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize the controller
   *
   * Sets up message listeners and signals TAB_READY to background.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    this.log("Initializing...");

    // Set up message listener for state broadcasts
    this.messageListener = this.handleMessage.bind(this);
    chrome.runtime.onMessage.addListener(this.messageListener);

    // Enable click interception (session-scoped - stays on until destroy)
    this.clickInterceptor.enable();

    // Initialize UI with action handler
    this.ui.initialize(this.handleUIAction.bind(this));

    // Sprint 4: Initialize navigation handler (replaces signalTabReady)
    // This sends TAB_READY and sets up SPA navigation monitoring
    await this.navigationHandler.initialize();

    this.initialized = true;
    this.log("Initialized");
  }

  /**
   * Get current walkthrough state
   */
  getState(): WalkthroughState | null {
    return this.currentState;
  }

  /**
   * Subscribe to state changes
   *
   * @returns Unsubscribe function
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Send a command to background
   */
  async sendCommand(
    command: "NEXT" | "PREV" | "RETRY" | "SKIP" | "EXIT" | "REPORT_ACTION",
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const message = createCommandMessage(command, payload as never);
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      this.log(`Failed to send command: ${error}`, "error");
    }
  }

  /**
   * Report element found status to background
   */
  async reportElementStatus(stepIndex: number, found: boolean): Promise<void> {
    const tabId = await this.getCurrentTabId();
    if (tabId === null) {
      this.log("Cannot report element status: no tab ID", "error");
      return;
    }

    const message = createElementStatusMessage(stepIndex, found, tabId);
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      this.log(`Failed to report element status: ${error}`, "error");
    }
  }

  /**
   * Clean up and destroy the controller
   */
  destroy(): void {
    this.log("Destroying...");

    // Remove message listener
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }

    // Clean up action detection components
    this.actionDetector.detach();
    this.clickInterceptor.disable();
    this.actionValidator.resetAllRetryCounts();

    // Clean up navigation handler (Sprint 4)
    this.navigationHandler.destroy();

    // Clean up flash timeout
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
      this.flashTimeout = null;
    }

    // Clean up advance timeout (Critical: prevent stray NEXT commands after teardown)
    if (this.advanceTimeout) {
      clearTimeout(this.advanceTimeout);
      this.advanceTimeout = null;
    }

    // Clean up healing state
    this.healingInProgress = false;
    this.pendingHealResult = null;
    if (this.healingConfirmResolver) {
      // Reject any pending healing confirmation
      this.healingConfirmResolver({ confirmed: false });
      this.healingConfirmResolver = null;
    }

    // Clean up UI (placeholder for Sprint 2)
    this.cleanupUI();

    // Clear state
    this.currentState = null;
    this.currentTargetElement = null;
    this.stateCallbacks.clear();
    this.initialized = false;

    this.log("Destroyed");
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  /**
   * Handle incoming messages from background
   */
  private handleMessage(message: unknown): void {
    if (!isStateChangedMessage(message)) {
      return;
    }

    this.log(
      `Received state: ${message.state.machineState} (trigger: ${message.trigger})`,
    );
    this.onStateChanged(message.state);
  }

  /**
   * Handle state change from background
   */
  private onStateChanged(state: WalkthroughState): void {
    const previousState = this.currentState;
    this.currentState = state;

    // Notify callbacks
    for (const callback of this.stateCallbacks) {
      try {
        callback(state);
      } catch (error) {
        this.log(`Callback error: ${error}`, "error");
      }
    }

    // Handle machine state
    this.handleMachineState(
      state.machineState,
      previousState?.machineState ?? null,
    );
  }

  // ============================================================================
  // STATE MACHINE HANDLING
  // ============================================================================

  /**
   * Handle machine state transitions
   *
   * This is where we render UI, set up listeners, etc. based on state.
   */
  private handleMachineState(
    state: WalkthroughMachineState,
    previousState: WalkthroughMachineState | null,
  ): void {
    this.log(`State: ${previousState ?? "null"} → ${state}`);

    // Clean up when leaving WAITING_ACTION (Critical: prevent stale listeners/targets)
    if (previousState === "WAITING_ACTION" && state !== "WAITING_ACTION") {
      this.cleanupActionState();
    }

    // Clean up when leaving HEALING state (Critical: prevent stale healing state)
    if (previousState === "HEALING" && state !== "HEALING") {
      this.cleanupHealingState();
    }

    switch (state) {
      case "IDLE":
        this.cleanupUI();
        break;

      case "INITIALIZING":
        // Show loading indicator (placeholder)
        this.showLoading();
        break;

      case "SHOWING_STEP":
        // Find element and show step UI (placeholder)
        this.showStep();
        break;

      case "WAITING_ACTION":
        // Set up action listeners (placeholder)
        this.setupActionListeners();
        break;

      case "HEALING":
        // Show healing indicator and perform healing (async, fire-and-forget)
        // Result is reported to background via message, which triggers state transition
        this.showHealingIndicator().catch((error) => {
          this.log(`Healing failed: ${error}`, "error");
        });
        break;

      case "NAVIGATING":
        // Navigation in progress, maybe show loading
        this.showNavigating();
        break;

      case "TRANSITIONING":
        // Brief transition state, usually auto-advances
        break;

      case "ERROR":
        // Show error UI with retry/skip options (placeholder)
        this.showError();
        break;

      case "COMPLETED":
        // Show completion UI (placeholder)
        this.showCompleted();
        break;
    }
  }

  /**
   * Clean up action detection state when leaving WAITING_ACTION.
   * Critical: Prevents stale listeners/targets from persisting across transitions.
   */
  private cleanupActionState(): void {
    this.log("Cleaning up action state");

    // Detach action listeners
    this.actionDetector.detach();

    // Clear click interceptor target (but keep enabled - session-scoped)
    this.clickInterceptor.clearTarget();

    // Cancel any pending auto-advance
    if (this.advanceTimeout) {
      clearTimeout(this.advanceTimeout);
      this.advanceTimeout = null;
    }

    // Clear target element reference
    this.currentTargetElement = null;
  }

  /**
   * Clean up healing state when leaving HEALING.
   * Critical: Prevents stale healing state from persisting across transitions.
   */
  private cleanupHealingState(): void {
    this.log("Cleaning up healing state");

    // Reset healing flags
    this.healingInProgress = false;
    this.pendingHealResult = null;

    // Reject any pending healing confirmation promise
    if (this.healingConfirmResolver) {
      this.healingConfirmResolver({ confirmed: false });
      this.healingConfirmResolver = null;
    }
  }

  // ============================================================================
  // UI PLACEHOLDERS (Sprint 2)
  // ============================================================================

  /**
   * Show loading indicator
   */
  private showLoading(): void {
    this.log("UI: showLoading (placeholder)");
    // TODO: Sprint 2 - Implement loading UI
  }

  /**
   * Show current step UI (spotlight, tooltip)
   */
  private showStep(): void {
    if (!this.currentState) {
      this.log("Cannot show step: no current state", "warn");
      return;
    }

    const step = this.getCurrentStep();
    if (!step) {
      this.log("Cannot show step: no current step", "warn");
      return;
    }

    const targetElement = this.findTargetElement(step);
    if (!targetElement) {
      this.log("Cannot show step: target element not found", "warn");
      // TODO: Report element not found to background for healing
      return;
    }

    // Show UI with spotlight and tooltip
    this.ui.showStep(targetElement, this.currentState);
    this.log(
      `UI: showStep ${this.currentState.currentStepIndex + 1}/${this.currentState.totalSteps}`,
    );
  }

  /**
   * Set up action listeners for current step.
   *
   * Called when entering WAITING_ACTION state.
   * Attaches appropriate event listeners based on action type.
   */
  private setupActionListeners(): void {
    if (!this.currentState) {
      this.log("Cannot setup listeners: no current state", "warn");
      return;
    }

    const step = this.getCurrentStep();
    if (!step) {
      this.log("Cannot setup listeners: no current step", "warn");
      return;
    }

    // Find target element - in full implementation, this comes from element finder
    // For now, try to find by selector from step
    const targetElement = this.findTargetElement(step);
    if (!targetElement) {
      this.log("Cannot setup listeners: target element not found", "warn");
      return;
    }

    this.currentTargetElement = targetElement;

    // Get action type from step
    const actionType = this.getActionTypeFromStep(step);

    // Update click interceptor target (includes allowed elements like tooltip)
    const allowedElements = this.getAllowedElements();
    this.clickInterceptor.setTarget(targetElement, allowedElements);

    // Attach action detector listeners
    this.actionDetector.attach(targetElement, actionType);

    this.log(
      `Action listeners set up for ${actionType} on ${targetElement.tagName}`,
    );
  }

  /**
   * Get the current step from state.
   */
  private getCurrentStep(): Record<string, unknown> | null {
    if (!this.currentState?.steps) {
      return null;
    }
    const index = this.currentState.currentStepIndex;
    const step = this.currentState.steps[index];
    return step ? (step as unknown as Record<string, unknown>) : null;
  }

  /**
   * Find target element for the current step.
   * Uses the selectors object stored by recording: { primary, css, xpath, data_testid, stable_attrs }
   */
  private findTargetElement(step: Record<string, unknown>): HTMLElement | null {
    // Get selectors object from step (matches recording format)
    const selectors = step.selectors as
      | {
          primary?: string | null;
          css?: string;
          xpath?: string;
          data_testid?: string | null;
          stable_attrs?: Record<string, string>;
        }
      | undefined;

    if (!selectors) {
      this.log("Step has no selectors", "warn");
      return null;
    }

    // Try selectors in priority order: primary → data-testid → css
    const selectorOrder: string[] = [];

    // 1. Primary selector (ID, data-testid, or name)
    if (selectors.primary) {
      selectorOrder.push(selectors.primary);
    }

    // 2. Data-testid selector
    if (selectors.data_testid) {
      selectorOrder.push(`[data-testid="${selectors.data_testid}"]`);
    }

    // 3. CSS selector (most reliable fallback)
    if (selectors.css) {
      selectorOrder.push(selectors.css);
    }

    // Try each selector in order
    for (const selector of selectorOrder) {
      try {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) {
          this.log(
            `Found element with selector: ${selector.substring(0, 50)}...`,
          );
          return element;
        }
      } catch {
        // Invalid selector, try next
      }
    }

    // Try XPath as last resort
    if (selectors.xpath) {
      try {
        const result = document.evaluate(
          selectors.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        const element = result.singleNodeValue;
        if (element instanceof HTMLElement) {
          this.log(`Found element with XPath`);
          return element;
        }
      } catch {
        // Invalid XPath
      }
    }

    this.log("No selector matched any element", "warn");
    return null;
  }

  /**
   * Get action type from step definition.
   * API uses snake_case: action_type (not eventType)
   */
  private getActionTypeFromStep(step: Record<string, unknown>): ActionType {
    // API returns snake_case field name
    const actionType = step.action_type as string | undefined;

    switch (actionType) {
      case "click":
        return "click";
      case "input_commit":
        return "input_commit";
      case "select_change":
        return "select_change";
      case "submit":
        return "submit";
      default:
        // Default to click for unknown types
        return "click";
    }
  }

  /**
   * Get elements that should be allowed through click interception.
   * Includes UI elements like tooltip, overlay.
   */
  private getAllowedElements(): HTMLElement[] {
    const allowed: HTMLElement[] = [];

    // Get tooltip element
    const tooltip = document.querySelector(".walkthrough-tooltip");
    if (tooltip instanceof HTMLElement) {
      allowed.push(tooltip);
    }

    // Get overlay container
    const overlay = document.getElementById("walkthrough-overlay");
    if (overlay instanceof HTMLElement) {
      allowed.push(overlay);
    }

    return allowed;
  }

  // ============================================================================
  // ACTION HANDLING
  // ============================================================================

  /**
   * Handle detected action from ActionDetector.
   * Validates action and reports to background.
   */
  private onActionDetected(action: DetectedAction): void {
    if (!this.currentState || !this.currentTargetElement) {
      this.log("Cannot handle action: no current state or target", "warn");
      return;
    }

    const step = this.getCurrentStep();
    if (!step) {
      this.log("Cannot handle action: no current step", "warn");
      return;
    }

    const expectedActionType = this.getActionTypeFromStep(step);
    const stepIndex = this.currentState.currentStepIndex;

    // Validate the action
    const result = this.actionValidator.validate(
      action,
      this.currentTargetElement,
      expectedActionType,
      stepIndex,
    );

    this.log(
      `Action ${action.type} validation: ${result.valid ? "VALID" : `INVALID (${result.reason})`}`,
    );

    // Determine if this action will cause navigation
    // - submit actions always cause navigation
    // - input_commit (Enter key) inside a form causes navigation
    // - click on a link causes navigation
    const causesNavigation = this.actionCausesNavigation(
      action.type,
      action.target,
    );

    // Report to background - it will dispatch ACTION_DETECTED or ACTION_INVALID
    this.sendCommand("REPORT_ACTION", {
      stepIndex,
      actionType: action.type,
      valid: result.valid,
      reason: result.reason,
      causesNavigation,
    });

    if (result.valid) {
      // Show success flash and detach listeners
      this.flashSuccess(action.target);
      this.actionDetector.detach();
      this.clickInterceptor.clearTarget();

      // Cancel any existing advance timeout
      if (this.advanceTimeout) {
        clearTimeout(this.advanceTimeout);
      }

      // Schedule auto-advance after delay (background will handle state transition)
      // Store timeout for cancellation on state change or destroy
      const delay = this.getAdvanceDelay(action.type);
      this.advanceTimeout = setTimeout(() => {
        this.advanceTimeout = null;
        this.sendCommand("NEXT", {});
      }, delay);
    } else {
      // Show error flash
      this.flashError(action.target);

      // Check if should show Skip button
      if (result.retryCount >= MAX_ACTION_RETRIES) {
        this.showSkipHint();
      }
    }
  }

  /**
   * Handle blocked click from ClickInterceptor.
   * Shows warning toast to user.
   */
  private onClickBlocked(_event: MouseEvent): void {
    this.showBlockedClickWarning();
  }

  /**
   * Handle UI action from tooltip buttons.
   */
  private handleUIAction(action: TooltipAction): void {
    this.log(`UI action: ${action}`);

    switch (action) {
      case "next":
        this.sendCommand("NEXT");
        break;
      case "back":
        this.sendCommand("PREV");
        break;
      case "skip":
        this.sendCommand("SKIP");
        break;
      case "retry":
        this.sendCommand("RETRY");
        break;
      case "exit":
      case "done":
        this.sendCommand("EXIT");
        break;
      case "confirm_heal":
        this.handleHealingConfirmation(true);
        break;
      case "reject_heal":
        this.handleHealingConfirmation(false);
        break;
    }
  }

  /**
   * Handle healing confirmation from user.
   */
  private handleHealingConfirmation(confirmed: boolean): void {
    this.log(`Healing confirmation: ${confirmed ? "CONFIRMED" : "REJECTED"}`);

    // Resolve the pending promise from onUserPrompt
    if (this.healingConfirmResolver) {
      this.healingConfirmResolver({ confirmed });
      this.healingConfirmResolver = null;
    }

    // If we have a pending result, handle it
    if (this.pendingHealResult) {
      const { result, step, stepIndex } = this.pendingHealResult;

      if (confirmed) {
        // User confirmed - report success
        result.resolution = "healed_user";
        result.healingLog.status = "user_confirmed";
        this.handleHealingResult(result, step, stepIndex);
      } else {
        // User rejected - report failure
        result.success = false;
        result.resolution = "user_rejected";
        result.healingLog.status = "user_rejected";
        this.handleHealingResult(result, step, stepIndex);
      }
    }
  }

  /**
   * Determine if an action will cause page navigation.
   * Used to signal background to auto-advance since content script
   * may be destroyed before it can send NEXT command.
   */
  private actionCausesNavigation(
    actionType: ActionType,
    target: HTMLElement,
  ): boolean {
    // Submit actions always cause navigation
    if (actionType === "submit") {
      return true;
    }

    // Input commit (Enter key) inside a form causes form submission
    if (actionType === "input_commit") {
      // Check if input is inside a form
      const form = target.closest("form");
      if (form) {
        // Check if form has an action or will submit
        const hasAction = form.hasAttribute("action");
        const method = form.getAttribute("method")?.toLowerCase();
        // Forms without method="dialog" typically navigate
        if (method !== "dialog") {
          return hasAction || true; // Default form submit navigates
        }
      }
      // Even without a form, some inputs (like search boxes) navigate on Enter
      // Google search is a good example - pressing Enter navigates
      const type = target.getAttribute("type")?.toLowerCase();
      if (type === "search" || target.getAttribute("role") === "combobox") {
        return true;
      }
    }

    // Click on a link causes navigation
    if (actionType === "click") {
      const link = target.closest("a");
      if (link && link.hasAttribute("href")) {
        const href = link.getAttribute("href");
        // Internal links that don't start with # navigate
        if (href && !href.startsWith("#") && !href.startsWith("javascript:")) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get auto-advance delay based on action type.
   */
  private getAdvanceDelay(actionType: ActionType): number {
    switch (actionType) {
      case "click":
      case "submit":
        return ADVANCE_DELAY_CLICK;
      case "select_change":
        return ADVANCE_DELAY_SELECT;
      case "input_commit":
        return ADVANCE_DELAY_INPUT;
      default:
        return ADVANCE_DELAY_DEFAULT;
    }
  }

  /**
   * Show success flash on element.
   */
  private flashSuccess(element: HTMLElement): void {
    const FLASH_CLASS = "walkthrough-flash-success";

    // Clear any existing flash
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
    }

    element.classList.add(FLASH_CLASS);
    this.flashTimeout = setTimeout(() => {
      element.classList.remove(FLASH_CLASS);
      this.flashTimeout = null;
    }, FLASH_SUCCESS_DURATION_MS);
  }

  /**
   * Show error flash on element.
   */
  private flashError(element: HTMLElement): void {
    const FLASH_CLASS = "walkthrough-flash-error";

    // Clear any existing flash
    if (this.flashTimeout) {
      clearTimeout(this.flashTimeout);
    }

    element.classList.add(FLASH_CLASS);
    this.flashTimeout = setTimeout(() => {
      element.classList.remove(FLASH_CLASS);
      this.flashTimeout = null;
    }, FLASH_ERROR_DURATION_MS);
  }

  /**
   * Show hint that Skip button is now available.
   */
  private showSkipHint(): void {
    this.log("UI: showSkipHint (placeholder)");
    // TODO: Integrate with tooltip - highlight/show Skip button
  }

  /**
   * Show warning when click is blocked.
   */
  private showBlockedClickWarning(): void {
    this.log("UI: showBlockedClickWarning (placeholder)");
    // TODO: Show toast like "Click the highlighted element to continue"
  }

  // ============================================================================
  // UI PLACEHOLDERS
  // ============================================================================

  /**
   * Show healing in progress indicator and perform healing.
   *
   * Healing flow:
   * 1. Show healing spinner UI
   * 2. Call healElement() to find element
   * 3. Based on confidence:
   *    - >= 85%: Auto-accept, report success
   *    - >= 60%: Show confirmation UI, wait for user
   *    - < 60%: Report failure
   * 4. Report result to background
   */
  private async showHealingIndicator(): Promise<void> {
    if (!this.currentState) {
      this.log("Cannot heal: no current state", "warn");
      return;
    }

    if (this.healingInProgress) {
      this.log("Healing already in progress, skipping", "warn");
      return;
    }

    const step = this.currentState.steps[this.currentState.currentStepIndex];
    if (!step) {
      this.log("Cannot heal: no current step", "warn");
      return;
    }

    const stepIndex = this.currentState.currentStepIndex;
    this.healingInProgress = true;

    this.log(`Starting healing for step ${stepIndex}: ${step.field_label}`);

    // Show healing spinner UI
    this.ui.showHealing(this.currentState);

    try {
      // Perform healing with user prompt callback
      const result = await healElement(step, {
        aiEnabled: false, // AI disabled for now
        onUserPrompt: async (element, score) => {
          // Store pending result for UI confirmation
          this.pendingHealResult = {
            result: {
              success: true,
              element,
              confidence: score,
              resolution: "healed_user",
              scoringResult: null,
              candidatesEvaluated: 0,
              aiConfidence: null,
              healingLog: {
                timestamp: Date.now(),
                stepId: step.id,
                workflowId: step.workflow_id,
                status: "user_confirmed",
                deterministicScore: score,
                aiConfidence: null,
                finalConfidence: score,
                candidatesEvaluated: 0,
                topCandidateScore: score,
                runnerUpScore: null,
                vetoesApplied: [],
                factorScores: {},
                originalContext: {},
                selectedContext: null,
              },
            },
            step,
            stepIndex,
          };

          // Show confirmation UI with confidence
          this.ui.showHealing(this.currentState!, {
            confidence: score,
            showConfirmation: true,
          });

          // Highlight the candidate element
          this.ui.showHealedElement(element, this.currentState!);

          // Wait for user confirmation (handled by handleUIAction)
          return new Promise<{ confirmed: boolean }>((resolve) => {
            // Store resolver to be called by handleUIAction
            this.healingConfirmResolver = resolve;
          });
        },
      });

      // Clear pending if we got a result (auto-accept or reject)
      if (!this.pendingHealResult) {
        await this.handleHealingResult(result, step, stepIndex);
      }
      // If pendingHealResult exists, user confirmation flow is active
    } catch (error) {
      this.log(`Healing error: ${error}`, "error");
      await this.handleHealingResult(
        {
          success: false,
          element: null,
          confidence: 0,
          resolution: "failed",
          scoringResult: null,
          candidatesEvaluated: 0,
          aiConfidence: null,
          healingLog: {
            timestamp: Date.now(),
            stepId: step.id,
            workflowId: step.workflow_id,
            status: "failed",
            deterministicScore: 0,
            aiConfidence: null,
            finalConfidence: 0,
            candidatesEvaluated: 0,
            topCandidateScore: 0,
            runnerUpScore: null,
            vetoesApplied: [],
            factorScores: {},
            originalContext: {},
            selectedContext: null,
          },
        },
        step,
        stepIndex,
      );
    }
  }

  // Resolver for user confirmation promise
  private healingConfirmResolver:
    | ((value: { confirmed: boolean }) => void)
    | null = null;

  /**
   * Handle healing result and report to background.
   */
  private async handleHealingResult(
    result: HealerResult,
    _step: StepResponse,
    stepIndex: number,
  ): Promise<void> {
    this.healingInProgress = false;
    this.pendingHealResult = null;

    this.log(
      `Healing result: ${result.success ? "SUCCESS" : "FAILED"} (${Math.round(result.confidence * 100)}%)`,
    );

    // Generate a CSS selector for the healed element if successful
    let healedSelector: string | undefined;
    if (result.success && result.element) {
      healedSelector = this.generateSelector(result.element);
    }

    // Convert healing module result to message protocol format
    const messageResult: MessageHealingResult = {
      success: result.success,
      confidence: result.confidence,
      aiValidated: result.resolution === "healed_ai",
      healedSelector,
      failureReason: result.success
        ? undefined
        : result.healingLog.vetoesApplied.join(", ") ||
          "No suitable element found",
      candidatesEvaluated: result.candidatesEvaluated,
    };

    // Report to background
    const message = createHealingResultMessage(stepIndex, messageResult);
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      this.log(`Failed to report healing result: ${error}`, "error");
    }

    // If successful, store the healed element for use in WAITING_ACTION
    if (result.success && result.element) {
      this.currentTargetElement = result.element;
    }
  }

  /**
   * Show navigation in progress
   */
  private showNavigating(): void {
    this.log("UI: showNavigating");
    if (!this.currentState) {
      this.log("Cannot show navigation: no current state", "warn");
      return;
    }
    this.ui.showNavigating(this.currentState);
  }

  /**
   * Show error UI with retry/skip options
   */
  private showError(): void {
    this.log("UI: showError (placeholder)");
    // TODO: Sprint 2 - Implement error UI
  }

  /**
   * Show completion UI
   */
  private showCompleted(): void {
    this.log("UI: showCompleted (placeholder)");
    // TODO: Sprint 2 - Implement completion UI
  }

  /**
   * Clean up all UI elements
   */
  private cleanupUI(): void {
    this.log("UI: cleanupUI");
    this.ui.destroy();
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get current tab ID
   */
  private async getCurrentTabId(): Promise<number | null> {
    try {
      // In content scripts, we need to query for the current tab
      const response = await chrome.runtime.sendMessage({ type: "GET_TAB_ID" });
      return response?.tabId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Generate a CSS selector for an element.
   * Uses ID if available, otherwise generates a path-based selector.
   */
  private generateSelector(element: HTMLElement): string {
    // Best case: element has an ID
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    // Check for data-testid attribute
    const testId = element.getAttribute("data-testid");
    if (testId) {
      return `[data-testid="${CSS.escape(testId)}"]`;
    }

    // Fallback: generate a path-based selector
    const parts: string[] = [];
    let current: Element | null = element as Element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add nth-of-type if there are siblings with the same tag
      const parentEl: HTMLElement | null = current.parentElement;
      if (parentEl) {
        const currentTag = current.tagName;
        const children = parentEl.children;
        const siblings: Element[] = [];
        for (let i = 0; i < children.length; i++) {
          const child = children.item(i);
          if (child && child.tagName === currentTag) {
            siblings.push(child);
          }
        }
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(selector);
      current = parentEl;
    }

    return parts.join(" > ");
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[WalkthroughController] ${message}`);
  }
}
