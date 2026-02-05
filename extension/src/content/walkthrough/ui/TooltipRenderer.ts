/**
 * Tooltip Renderer
 *
 * Renders the walkthrough tooltip with step content and handles button actions.
 * Supports three render modes: step, error, and completion.
 *
 * Features:
 * - XSS prevention via escapeHtml
 * - Smart positioning (below > above > right > left > fallback)
 * - Event delegation for button clicks
 * - Draggable header with proper handler cleanup
 * - Button enable/disable during async operations
 */

import { escapeHtml } from "../../utils/sanitize";

// ============================================================================
// ICONS (inline SVG for performance)
// ============================================================================

const ICONS = {
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
  spinner: `<svg class="walkthrough-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>`,
};

// Tooltip positioning padding
const TOOLTIP_PADDING = 16;

// ============================================================================
// TYPES
// ============================================================================

export interface TooltipRendererConfig {
  /** Enable debug logging */
  debug?: boolean;
}

export interface TooltipContent {
  stepNumber: number;
  totalSteps: number;
  fieldLabel: string;
  instruction: string;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export interface ErrorOptions {
  stepLabel: string;
  errorMessage: string;
  canRetry: boolean;
  canSkip: boolean;
}

export interface CompletionOptions {
  workflowName: string;
  totalSteps: number;
}

export interface NavigationOptions {
  targetUrl?: string;
  stepNumber: number;
  totalSteps: number;
}

export interface NavigateStepOptions {
  /** Expected destination URL for the navigate step (if captured during recording) */
  targetUrl?: string;
  stepNumber: number;
  totalSteps: number;
}

export interface HealingOptions {
  stepNumber: number;
  totalSteps: number;
  fieldLabel: string;
  /** Healing confidence score (0-1) once determined */
  confidence?: number;
  /** Whether to show confirmation UI */
  showConfirmation?: boolean;
}

/** Render modes (per Codex recommendation - ErrorDisplay folded in) */
export type TooltipMode =
  | "step"
  | "error"
  | "completion"
  | "navigation"
  | "navigate_step"
  | "healing";

/** Actions that can be triggered from tooltip buttons */
export type TooltipAction =
  | "next"
  | "back"
  | "skip"
  | "retry"
  | "exit"
  | "done"
  | "confirm_heal"
  | "reject_heal";

export type TooltipActionHandler = (action: TooltipAction) => void;

// ============================================================================
// TOOLTIP RENDERER
// ============================================================================

export class TooltipRenderer {
  private container: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private onAction: TooltipActionHandler | null = null;
  private currentMode: TooltipMode = "step";
  private config: TooltipRendererConfig;

  // Drag state (with handler refs for cleanup - Codex warning #1)
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private headerMouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private documentMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private documentMouseUpHandler: (() => void) | null = null;
  private dragSetup = false;

  constructor(config?: TooltipRendererConfig) {
    this.config = config ?? {};
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Initialize tooltip within container, set action callback.
   */
  initialize(container: HTMLDivElement, onAction: TooltipActionHandler): void {
    this.container = container;
    this.onAction = onAction;

    // Create tooltip element
    this.tooltip = document.createElement("div");
    this.tooltip.className = "walkthrough-tooltip";
    this.container.appendChild(this.tooltip);

    // Setup event delegation
    this.setupEventDelegation();

    this.log("Initialized");
  }

  /**
   * Render tooltip content from step data (mode: 'step').
   */
  render(content: TooltipContent): void {
    if (!this.tooltip) return;

    // Remove existing drag handlers before replacing innerHTML
    // This ensures handlers are re-wired to the new header element
    this.removeDragHandlers();

    this.currentMode = "step";
    this.tooltip.className = "walkthrough-tooltip";

    const progressPercent = (content.stepNumber / content.totalSteps) * 100;

    this.tooltip.innerHTML = `
      <!-- Header -->
      <div class="walkthrough-tooltip-header">
        <div class="walkthrough-step-info">
          <span class="walkthrough-step-number">${content.stepNumber}</span>
          <span class="walkthrough-progress">Step ${content.stepNumber} of ${content.totalSteps}</span>
        </div>
        <button class="walkthrough-close-btn" id="walkthrough-close-btn" title="Close">
          ${ICONS.x}
        </button>
      </div>

      <!-- Content -->
      <div class="walkthrough-tooltip-content">
        <h3 class="walkthrough-field-label">${escapeHtml(content.fieldLabel) || "Action Required"}</h3>
        <p class="walkthrough-instruction">${escapeHtml(content.instruction) || "Complete this action to continue."}</p>
        <p class="walkthrough-error-msg hidden" id="walkthrough-error-msg"></p>
      </div>

      <!-- Footer -->
      <div class="walkthrough-tooltip-footer">
        <div class="walkthrough-footer-left">
          <button class="walkthrough-btn walkthrough-btn-back" id="walkthrough-btn-back" ${content.isFirstStep ? "disabled" : ""}>
            ${ICONS.chevronLeft}
            Back
          </button>
        </div>
        <div class="walkthrough-footer-right">
          <button class="walkthrough-btn walkthrough-btn-skip hidden" id="walkthrough-btn-skip">
            Skip
          </button>
          <button class="walkthrough-btn walkthrough-btn-exit" id="walkthrough-btn-exit">
            Exit
          </button>
          <button class="walkthrough-btn walkthrough-btn-next" id="walkthrough-btn-next">
            ${content.isLastStep ? "Complete" : "Next"}
            ${ICONS.chevronRight}
          </button>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="walkthrough-progress-bar">
        <div class="walkthrough-progress-bar-fill" style="width: ${progressPercent}%"></div>
      </div>
    `;

    // Setup drag handlers
    this.setupDragHandlers();

    this.log(`Rendered step ${content.stepNumber}/${content.totalSteps}`);
  }

  /**
   * Render error state (mode: 'error').
   * Uses same tooltip element, not a separate modal (per Codex warning #3).
   */
  renderError(options: ErrorOptions): void {
    if (!this.tooltip) return;

    // Ensure drag handlers from step mode are removed before replacing markup.
    this.removeDragHandlers();

    this.currentMode = "error";
    this.tooltip.className = "walkthrough-tooltip walkthrough-error";

    this.tooltip.innerHTML = `
      <!-- Header -->
      <div class="walkthrough-tooltip-header">
        <div class="walkthrough-step-info">
          <span class="walkthrough-step-number">!</span>
          <span class="walkthrough-progress">Error</span>
        </div>
        <button class="walkthrough-close-btn" id="walkthrough-close-btn" title="Close">
          ${ICONS.x}
        </button>
      </div>

      <!-- Content -->
      <div class="walkthrough-tooltip-content">
        <h3 class="walkthrough-field-label">
          <span class="walkthrough-error-icon">&#9888;</span>
          Element Not Found
        </h3>
        <p class="walkthrough-instruction">
          Cannot find "${escapeHtml(options.stepLabel)}". ${escapeHtml(options.errorMessage)}
        </p>
      </div>

      <!-- Footer -->
      <div class="walkthrough-tooltip-footer">
        <div class="walkthrough-footer-left">
          ${
            options.canRetry
              ? `
            <button class="walkthrough-btn walkthrough-btn-retry" id="walkthrough-btn-retry">
              Retry
            </button>
          `
              : ""
          }
        </div>
        <div class="walkthrough-footer-right">
          ${
            options.canSkip
              ? `
            <button class="walkthrough-btn walkthrough-btn-skip" id="walkthrough-btn-skip">
              Skip Step
            </button>
          `
              : ""
          }
          <button class="walkthrough-btn walkthrough-btn-exit" id="walkthrough-btn-exit">
            Exit
          </button>
        </div>
      </div>
    `;

    // Center the tooltip for error state
    this.centerTooltip();

    this.log("Rendered error state");
  }

  /**
   * Render completion state (mode: 'completion').
   */
  renderCompletion(options: CompletionOptions): void {
    if (!this.tooltip) return;

    // Ensure drag handlers from step mode are removed before replacing markup.
    this.removeDragHandlers();

    this.currentMode = "completion";
    this.tooltip.className = "walkthrough-tooltip walkthrough-complete";

    this.tooltip.innerHTML = `
      <!-- Header -->
      <div class="walkthrough-tooltip-header">
        <div class="walkthrough-step-info">
          <span class="walkthrough-step-number">&#10003;</span>
          <span class="walkthrough-progress">Complete</span>
        </div>
      </div>

      <!-- Content -->
      <div class="walkthrough-tooltip-content">
        <h3 class="walkthrough-field-label">Workflow Complete!</h3>
        <p class="walkthrough-instruction">
          You've successfully completed "${escapeHtml(options.workflowName)}". Great job!
        </p>
      </div>

      <!-- Footer -->
      <div class="walkthrough-tooltip-footer">
        <div class="walkthrough-footer-left"></div>
        <div class="walkthrough-footer-right">
          <button class="walkthrough-btn walkthrough-btn-next" id="walkthrough-btn-done">
            Done
            ${ICONS.chevronRight}
          </button>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="walkthrough-progress-bar">
        <div class="walkthrough-progress-bar-fill" style="width: 100%"></div>
      </div>
    `;

    // Center the tooltip for completion state
    this.centerTooltip();

    this.log("Rendered completion state");
  }

  /**
   * Render navigation loading state (mode: 'navigation').
   * Shows spinner while page is loading.
   */
  renderNavigation(options: NavigationOptions): void {
    if (!this.tooltip) return;

    // Ensure drag handlers from step mode are removed before replacing markup.
    this.removeDragHandlers();

    this.currentMode = "navigation";
    this.tooltip.className = "walkthrough-tooltip walkthrough-navigating";

    const progress = Math.round(
      (options.stepNumber / options.totalSteps) * 100,
    );

    this.tooltip.innerHTML = `
      <!-- Header -->
      <div class="walkthrough-tooltip-header">
        <div class="walkthrough-step-info">
          <span class="walkthrough-step-number">${options.stepNumber}</span>
          <span class="walkthrough-progress">of ${options.totalSteps}</span>
        </div>
        <button class="walkthrough-btn-close" id="walkthrough-btn-exit" title="Exit walkthrough">
          ${ICONS.x}
        </button>
      </div>

      <!-- Content with Spinner -->
      <div class="walkthrough-tooltip-content walkthrough-navigation-content">
        <div class="walkthrough-spinner-container">
          ${ICONS.spinner}
        </div>
        <h3 class="walkthrough-field-label">Navigating...</h3>
        <p class="walkthrough-instruction">
          Loading the next page
        </p>
      </div>

      <!-- Progress Bar -->
      <div class="walkthrough-progress-bar">
        <div class="walkthrough-progress-bar-fill" style="width: ${progress}%"></div>
      </div>
    `;

    // Center the tooltip for navigation state
    this.centerTooltip();

    this.log("Rendered navigation state");
  }

  /**
   * Render a navigate step (mode: 'navigate_step').
   * This is different from the loading 'navigation' mode:
   * - No spinner
   * - Message tells the user what URL to navigate to
   * - Waits for URL change to advance
   */
  renderNavigateStep(options: NavigateStepOptions): void {
    if (!this.tooltip) return;

    // Ensure drag handlers from step mode are removed before replacing markup.
    this.removeDragHandlers();

    this.currentMode = "navigate_step";
    this.tooltip.className = "walkthrough-tooltip walkthrough-navigate-step";

    const progress = Math.round(
      (options.stepNumber / options.totalSteps) * 100,
    );

    const destination = (() => {
      if (!options.targetUrl) return null;
      try {
        const u = new URL(options.targetUrl);
        return `${u.host}${u.pathname}`;
      } catch {
        return options.targetUrl;
      }
    })();

    const title = destination ? "Navigate" : "Navigate to continue";
    const instruction = destination
      ? `Please navigate to <span class="walkthrough-url">${escapeHtml(destination)}</span> to continue.`
      : "Navigate to the next page to continue.";

    this.tooltip.innerHTML = `
      <!-- Header -->
      <div class="walkthrough-tooltip-header">
        <div class="walkthrough-step-info">
          <span class="walkthrough-step-number">${options.stepNumber}</span>
          <span class="walkthrough-progress">of ${options.totalSteps}</span>
        </div>
        <button class="walkthrough-btn-close" id="walkthrough-btn-exit" title="Exit walkthrough">
          ${ICONS.x}
        </button>
      </div>

      <!-- Content -->
      <div class="walkthrough-tooltip-content walkthrough-navigation-content">
        <h3 class="walkthrough-field-label">${escapeHtml(title)}</h3>
        <p class="walkthrough-instruction">
          ${instruction}
        </p>
      </div>

      <!-- Footer -->
      <div class="walkthrough-tooltip-footer">
        <div class="walkthrough-footer-left">
          <button class="walkthrough-btn walkthrough-btn-back" id="walkthrough-btn-back">
            ${ICONS.chevronLeft}
            Back
          </button>
        </div>
        <div class="walkthrough-footer-right"></div>
      </div>

      <!-- Progress Bar -->
      <div class="walkthrough-progress-bar">
        <div class="walkthrough-progress-bar-fill" style="width: ${progress}%"></div>
      </div>
    `;

    // Center the tooltip for navigate steps
    this.centerTooltip();

    this.log("Rendered navigate step");
  }

  /**
   * Render healing state (mode: 'healing').
   * Shows spinner while healing is in progress, or confirmation UI if needed.
   */
  renderHealing(options: HealingOptions): void {
    if (!this.tooltip) return;

    // Ensure drag handlers from step mode are removed before replacing markup.
    this.removeDragHandlers();

    this.currentMode = "healing";
    this.tooltip.className = "walkthrough-tooltip walkthrough-healing";

    const progress = Math.round(
      (options.stepNumber / options.totalSteps) * 100,
    );

    // Confirmation mode: show element with confirm/reject buttons
    if (options.showConfirmation && options.confidence !== undefined) {
      const confidencePercent = Math.round(options.confidence * 100);
      this.tooltip.innerHTML = `
        <!-- Header -->
        <div class="walkthrough-tooltip-header">
          <div class="walkthrough-step-info">
            <span class="walkthrough-step-number">${options.stepNumber}</span>
            <span class="walkthrough-progress">of ${options.totalSteps}</span>
          </div>
          <button class="walkthrough-btn-close" id="walkthrough-btn-exit" title="Exit walkthrough">
            ${ICONS.x}
          </button>
        </div>

        <!-- Content -->
        <div class="walkthrough-tooltip-content">
          <h3 class="walkthrough-field-label">Confirm Element</h3>
          <p class="walkthrough-instruction">
            We found a possible match for "${escapeHtml(options.fieldLabel)}" (${confidencePercent}% confidence).
            Is this the correct element?
          </p>
        </div>

        <!-- Footer with confirm/reject buttons -->
        <div class="walkthrough-tooltip-footer">
          <div class="walkthrough-footer-left">
            <button class="walkthrough-btn walkthrough-btn-back" id="walkthrough-btn-reject-heal">
              No, Skip
            </button>
          </div>
          <div class="walkthrough-footer-right">
            <button class="walkthrough-btn walkthrough-btn-next" id="walkthrough-btn-confirm-heal">
              Yes, Continue
              ${ICONS.chevronRight}
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="walkthrough-progress-bar">
          <div class="walkthrough-progress-bar-fill" style="width: ${progress}%"></div>
        </div>
      `;
    } else {
      // Searching mode: show spinner
      this.tooltip.innerHTML = `
        <!-- Header -->
        <div class="walkthrough-tooltip-header">
          <div class="walkthrough-step-info">
            <span class="walkthrough-step-number">${options.stepNumber}</span>
            <span class="walkthrough-progress">of ${options.totalSteps}</span>
          </div>
          <button class="walkthrough-btn-close" id="walkthrough-btn-exit" title="Exit walkthrough">
            ${ICONS.x}
          </button>
        </div>

        <!-- Content with Spinner -->
        <div class="walkthrough-tooltip-content walkthrough-healing-content">
          <div class="walkthrough-spinner-container">
            ${ICONS.spinner}
          </div>
          <h3 class="walkthrough-field-label">Finding Element...</h3>
          <p class="walkthrough-instruction">
            Looking for "${escapeHtml(options.fieldLabel)}"
          </p>
        </div>

        <!-- Progress Bar -->
        <div class="walkthrough-progress-bar">
          <div class="walkthrough-progress-bar-fill" style="width: ${progress}%"></div>
        </div>
      `;
    }

    // Center the tooltip for healing state
    this.centerTooltip();

    this.log(
      `Rendered healing state (confirmation: ${options.showConfirmation ?? false})`,
    );
  }

  /**
   * Position tooltip relative to target element.
   * Uses smart positioning: below > above > right > left > fallback.
   */
  position(targetElement: HTMLElement): void {
    if (!this.tooltip) return;

    // First, clear any centering transform
    this.tooltip.style.transform = "";

    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const pos = this.calculatePosition(
      targetRect,
      tooltipRect.width,
      tooltipRect.height,
    );

    this.tooltip.style.top = `${pos.top}px`;
    this.tooltip.style.left = `${pos.left}px`;

    this.log(`Positioned at ${pos.left}, ${pos.top}`);
  }

  /**
   * Reposition tooltip (called by WalkthroughUI on scroll/resize).
   */
  reposition(targetElement: HTMLElement): void {
    // Only reposition if in step mode (error/completion are centered)
    if (this.currentMode === "step") {
      this.position(targetElement);
    }
  }

  /**
   * Show inline error message in tooltip (for step mode).
   */
  showInlineError(message: string): void {
    const errorMsg = this.tooltip?.querySelector(
      "#walkthrough-error-msg",
    ) as HTMLElement;
    if (errorMsg) {
      errorMsg.textContent = message;
      errorMsg.classList.remove("hidden");
    }
  }

  /**
   * Hide inline error message.
   */
  hideInlineError(): void {
    const errorMsg = this.tooltip?.querySelector(
      "#walkthrough-error-msg",
    ) as HTMLElement;
    if (errorMsg) {
      errorMsg.textContent = "";
      errorMsg.classList.add("hidden");
    }
  }

  /**
   * Show/hide skip button.
   */
  setSkipVisible(visible: boolean): void {
    const skipBtn = this.tooltip?.querySelector(
      "#walkthrough-btn-skip",
    ) as HTMLElement;
    if (skipBtn) {
      if (visible) {
        skipBtn.classList.remove("hidden");
      } else {
        skipBtn.classList.add("hidden");
      }
    }
  }

  /**
   * Enable/disable button interactions during async operations.
   * Exit and Close buttons are always kept enabled so users can exit.
   */
  setButtonsEnabled(enabled: boolean): void {
    if (!this.tooltip) return;

    const buttons = this.tooltip.querySelectorAll("button");
    buttons.forEach((btn) => {
      const buttonId = btn.id;
      // Always keep Exit and Close buttons enabled (user must be able to exit)
      if (
        buttonId === "walkthrough-btn-exit" ||
        buttonId === "walkthrough-close-btn"
      ) {
        (btn as HTMLButtonElement).disabled = false;
      } else {
        (btn as HTMLButtonElement).disabled = !enabled;
      }
    });
  }

  /**
   * Hide tooltip.
   */
  hide(): void {
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  }

  /**
   * Show tooltip.
   */
  show(): void {
    if (this.tooltip) {
      this.tooltip.style.display = "";
    }
  }

  /**
   * Clean up tooltip and handlers.
   */
  destroy(): void {
    // Remove drag handlers (Codex warning #1 - must remove document-level handlers)
    this.removeDragHandlers();

    // Remove tooltip from DOM
    if (this.tooltip) {
      this.tooltip.remove();
    }

    this.tooltip = null;
    this.container = null;
    this.onAction = null;

    this.log("Destroyed");
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Calculate optimal tooltip position.
   * Priority: below > above > right > left > fallback corner.
   */
  private calculatePosition(
    targetRect: DOMRect,
    tooltipWidth: number,
    tooltipHeight: number,
  ): { top: number; left: number } {
    const padding = TOOLTIP_PADDING;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Priority 1: Below target (centered)
    if (targetRect.bottom + padding + tooltipHeight < viewportHeight) {
      return {
        top: targetRect.bottom + padding,
        left: Math.max(
          padding,
          Math.min(
            targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
            viewportWidth - tooltipWidth - padding,
          ),
        ),
      };
    }

    // Priority 2: Above target
    if (targetRect.top - padding - tooltipHeight > 0) {
      return {
        top: targetRect.top - padding - tooltipHeight,
        left: Math.max(
          padding,
          Math.min(
            targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
            viewportWidth - tooltipWidth - padding,
          ),
        ),
      };
    }

    // Priority 3: Right of target
    if (targetRect.right + padding + tooltipWidth < viewportWidth) {
      return {
        top: Math.max(
          padding,
          Math.min(
            targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
            viewportHeight - tooltipHeight - padding,
          ),
        ),
        left: targetRect.right + padding,
      };
    }

    // Priority 4: Left of target
    if (targetRect.left - padding - tooltipWidth > 0) {
      return {
        top: Math.max(
          padding,
          Math.min(
            targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
            viewportHeight - tooltipHeight - padding,
          ),
        ),
        left: targetRect.left - padding - tooltipWidth,
      };
    }

    // Fallback: bottom-right corner
    return {
      top: viewportHeight - tooltipHeight - padding,
      left: viewportWidth - tooltipWidth - padding,
    };
  }

  /**
   * Center tooltip in viewport (for error/completion states).
   */
  private centerTooltip(): void {
    if (!this.tooltip) return;

    this.tooltip.style.top = "50%";
    this.tooltip.style.left = "50%";
    this.tooltip.style.transform = "translate(-50%, -50%)";
  }

  /**
   * Setup event delegation for button clicks.
   */
  private setupEventDelegation(): void {
    if (!this.tooltip) return;

    this.tooltip.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest("button");
      if (!button || !this.onAction) return;

      const buttonId = button.id;

      switch (buttonId) {
        case "walkthrough-btn-next":
          this.onAction("next");
          break;
        case "walkthrough-btn-back":
          this.onAction("back");
          break;
        case "walkthrough-btn-skip":
          this.onAction("skip");
          break;
        case "walkthrough-btn-retry":
          this.onAction("retry");
          break;
        case "walkthrough-btn-exit":
        case "walkthrough-close-btn":
          if (this.currentMode === "healing") {
            this.onAction("reject_heal");
          } else {
            this.onAction("exit");
          }
          break;
        case "walkthrough-btn-done":
          this.onAction("done");
          break;
        case "walkthrough-btn-confirm-heal":
          this.onAction("confirm_heal");
          break;
        case "walkthrough-btn-reject-heal":
          this.onAction("reject_heal");
          break;
      }
    });
  }

  /**
   * Setup drag handlers for tooltip repositioning.
   */
  private setupDragHandlers(): void {
    if (!this.tooltip || this.dragSetup) return;

    const header = this.tooltip.querySelector(
      ".walkthrough-tooltip-header",
    ) as HTMLElement;
    if (!header) return;

    header.style.cursor = "grab";
    header.style.userSelect = "none";

    // Create handler functions (stored for cleanup)
    this.headerMouseDownHandler = (e: MouseEvent) => {
      // Don't drag if clicking on buttons
      if ((e.target as HTMLElement).closest("button")) return;

      this.isDragging = true;
      header.style.cursor = "grabbing";
      const rect = this.tooltip!.getBoundingClientRect();
      this.dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      e.preventDefault();
    };

    this.documentMouseMoveHandler = (e: MouseEvent) => {
      if (!this.isDragging || !this.tooltip) return;
      this.tooltip.style.left = `${e.clientX - this.dragOffset.x}px`;
      this.tooltip.style.top = `${e.clientY - this.dragOffset.y}px`;
      this.tooltip.style.transform = "";
    };

    this.documentMouseUpHandler = () => {
      if (this.isDragging) {
        this.isDragging = false;
        header.style.cursor = "grab";
      }
    };

    // Attach handlers
    header.addEventListener("mousedown", this.headerMouseDownHandler);
    document.addEventListener("mousemove", this.documentMouseMoveHandler);
    document.addEventListener("mouseup", this.documentMouseUpHandler);

    this.dragSetup = true;
  }

  /**
   * Remove drag handlers (prevents memory leaks - Codex warning #1).
   */
  private removeDragHandlers(): void {
    if (this.headerMouseDownHandler && this.tooltip) {
      const header = this.tooltip.querySelector(
        ".walkthrough-tooltip-header",
      ) as HTMLElement;
      if (header) {
        header.removeEventListener("mousedown", this.headerMouseDownHandler);
      }
    }

    if (this.documentMouseMoveHandler) {
      document.removeEventListener("mousemove", this.documentMouseMoveHandler);
    }

    if (this.documentMouseUpHandler) {
      document.removeEventListener("mouseup", this.documentMouseUpHandler);
    }

    this.headerMouseDownHandler = null;
    this.documentMouseMoveHandler = null;
    this.documentMouseUpHandler = null;
    this.dragSetup = false;
  }

  /**
   * Log message if debug enabled.
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(`[TooltipRenderer] ${message}`);
    }
  }
}
