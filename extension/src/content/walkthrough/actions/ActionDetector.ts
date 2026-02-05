/**
 * ActionDetector - Listens for user actions on target elements
 *
 * Responsibilities:
 * - Attach event listeners based on action type
 * - Track input value changes (baseline at attach time + refresh on focusin)
 * - Emit detected actions via callback
 * - Clean up listeners on detach
 *
 * Key behavioral parity with legacy walkthrough.ts:
 * - Input baseline set IMMEDIATELY on attach (not just focusin)
 * - Blur listener uses bubble phase (no capture) - matches walkthrough.ts:1942
 * - Submit listener attached to parent form, not button - matches walkthrough.ts:1946
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported action types (matches recording system, minus navigate/clipboard)
 */
export type ActionType =
  | "click"
  | "input_commit"
  | "select_change"
  | "submit"
  | "copy";

/**
 * Detected action event emitted by ActionDetector
 */
export interface DetectedAction {
  type: ActionType;
  target: HTMLElement;
  event: Event;
  value?: string; // For inputs/selects - the new value
  timestamp: number;
}

/**
 * Listener tracking for cleanup
 */
interface TrackedListener {
  element: EventTarget;
  eventType: string;
  handler: EventListener;
  options?: boolean | AddEventListenerOptions;
}

/**
 * Configuration options
 */
export interface ActionDetectorConfig {
  debug?: boolean;
}

// ============================================================================
// ACTION DETECTOR
// ============================================================================

/**
 * ActionDetector - Listens for user actions on target elements
 *
 * @example
 * ```typescript
 * const detector = new ActionDetector((action) => {
 *   console.log(`Detected ${action.type} on ${action.target.tagName}`);
 * });
 *
 * detector.attach(buttonElement, 'click');
 * // ... user clicks button ...
 * detector.detach();
 * ```
 */
export class ActionDetector {
  private onActionDetected: (action: DetectedAction) => void;
  private activeListeners: TrackedListener[] = [];
  private inputBaselines: WeakMap<HTMLElement, string> = new WeakMap();
  private config: ActionDetectorConfig;

  constructor(
    onActionDetected: (action: DetectedAction) => void,
    config?: ActionDetectorConfig,
  ) {
    this.onActionDetected = onActionDetected;
    this.config = config ?? {};
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Attach listeners for a specific action type.
   * Call this when entering WAITING_ACTION state.
   */
  attach(element: HTMLElement, actionType: ActionType): void {
    // Clean up any existing listeners first
    this.detach();

    this.log(`Attaching listeners for ${actionType} on ${element.tagName}`);

    switch (actionType) {
      case "click":
        this.setupClickListener(element);
        break;

      case "input_commit":
        this.setupInputListeners(element);
        break;

      case "select_change":
        this.setupSelectListener(element);
        break;

      case "submit":
        this.setupSubmitListener(element);
        break;

      case "copy":
        this.setupCopyListener(element);
        break;

      default:
        this.log(`Unknown action type: ${actionType}`, "warn");
    }
  }

  /**
   * Detach all listeners.
   * Call this when leaving WAITING_ACTION state or on cleanup.
   */
  detach(): void {
    if (this.activeListeners.length === 0) {
      return;
    }

    this.log(`Detaching ${this.activeListeners.length} listeners`);

    for (const { element, eventType, handler, options } of this
      .activeListeners) {
      element.removeEventListener(eventType, handler, options);
    }

    this.activeListeners = [];
    // Note: WeakMap entries will be garbage collected automatically
  }

  /**
   * Check if listeners are currently attached.
   */
  isAttached(): boolean {
    return this.activeListeners.length > 0;
  }

  // ============================================================================
  // LISTENER SETUP
  // ============================================================================

  /**
   * Setup click listener for click action type.
   */
  private setupClickListener(element: HTMLElement): void {
    const handler = (event: Event) => {
      this.emit({
        type: "click",
        target: element,
        event,
        timestamp: Date.now(),
      });
    };

    element.addEventListener("click", handler);
    this.track(element, "click", handler);
  }

  /**
   * Setup input listeners for input_commit action type.
   *
   * CRITICAL: Legacy parity requires:
   * 1. Set baseline immediately on attach (not just focusin)
   * 2. Refresh baseline on focusin
   * 3. Emit on blur ONLY if value changed
   * 4. Blur listener uses bubble phase (no capture) - matches walkthrough.ts:1942
   */
  private setupInputListeners(element: HTMLElement): void {
    // CRITICAL: Set baseline immediately on attach (legacy parity - walkthrough.ts:1901)
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      this.inputBaselines.set(element, element.value);
      this.log(`Initial baseline set: "${element.value}"`);
    } else if (element.isContentEditable) {
      const value = element.innerText || element.textContent || "";
      this.inputBaselines.set(element, value);
      this.log(`Initial baseline set (contenteditable)`);
    }

    // 1. Capture baseline on focusin (refresh if user re-focuses)
    const focusHandler = (event: Event) => {
      const input = event.target as HTMLElement;
      if (
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement
      ) {
        this.inputBaselines.set(input, input.value);
        this.log(`Baseline refreshed on focusin: "${input.value}"`);
      } else if (input instanceof HTMLElement && input.isContentEditable) {
        const value = input.innerText || input.textContent || "";
        this.inputBaselines.set(input, value);
        this.log(`Baseline refreshed on focusin (contenteditable)`);
      }
    };
    element.addEventListener("focusin", focusHandler);
    this.track(element, "focusin", focusHandler);

    // If an input/contenteditable within the target is already focused when we attach,
    // initialize its baseline immediately so the first focusout isn't compared to "".
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active.isContentEditable) &&
      (active === element || element.contains(active))
    ) {
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        this.inputBaselines.set(active, active.value);
      } else {
        const value = active.innerText || active.textContent || "";
        this.inputBaselines.set(active, value);
      }
    }

    // 2. Emit on Enter keydown (critical for pages that navigate immediately on Enter,
    // e.g., Google search). This must run before blur, and should update baseline
    // to avoid double-emitting on subsequent blur.
    const keydownHandler = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) {
        return;
      }
      if (event.key !== "Enter") {
        return;
      }

      const input = event.target as HTMLInputElement | HTMLTextAreaElement;
      if (
        !(
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement
        )
      ) {
        return;
      }

      // Ignore Shift+Enter in textarea (treat as newline, not commit)
      if (input instanceof HTMLTextAreaElement && event.shiftKey) {
        return;
      }

      const baseline = this.inputBaselines.get(input) ?? "";
      if (input.value === baseline) {
        this.log(`Enter ignored: no value change (value="${input.value}")`);
        return;
      }

      this.log(`Enter commit: "${baseline}" → "${input.value}"`);

      this.emit({
        type: "input_commit",
        target: element,
        event,
        value: input.value,
        timestamp: Date.now(),
      });

      // Prevent blur from double-emitting for the same value
      this.inputBaselines.set(input, input.value);
    };
    // Capture phase helps ensure we run before navigation can tear down the page
    element.addEventListener("keydown", keydownHandler, { capture: true });
    this.track(element, "keydown", keydownHandler, { capture: true });

    // 3. Emit on focusout (bubbles) if value changed.
    // NOTE: blur does not bubble, which breaks cases where the highlighted target is a container
    // and the actual editable input is a descendant (e.g., Google Docs title field).
    const focusOutHandler = (event: Event) => {
      const target = event.target as HTMLElement;

      // Handle normal inputs/textareas
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        const baseline = this.inputBaselines.get(target) ?? "";
        if (target.value === baseline) {
          this.log(
            `Focusout ignored: no value change (value="${target.value}")`,
          );
          return;
        }

        this.log(`Value changed: "${baseline}" → "${target.value}"`);
        this.emit({
          type: "input_commit",
          target: element,
          event,
          value: target.value,
          timestamp: Date.now(),
        });
        return;
      }

      // Handle contenteditable elements
      if (
        target instanceof HTMLElement &&
        target.isContentEditable
      ) {
        const value = target.innerText || target.textContent || "";
        const baseline = this.inputBaselines.get(target) ?? "";
        if (value === baseline) {
          this.log(`Focusout ignored: no value change (contenteditable)`);
          return;
        }

        this.log(`Contenteditable changed`);
        this.emit({
          type: "input_commit",
          target: element,
          event,
          value,
          timestamp: Date.now(),
        });
      }
    };
    element.addEventListener("focusout", focusOutHandler);
    this.track(element, "focusout", focusOutHandler);
  }

  /**
   * Setup change listener for select_change action type.
   */
  private setupSelectListener(element: HTMLElement): void {
    const handler = (event: Event) => {
      const select = event.target as HTMLSelectElement;
      const value =
        select instanceof HTMLSelectElement ? select.value : undefined;

      this.emit({
        type: "select_change",
        target: element,
        event,
        value,
        timestamp: Date.now(),
      });
    };

    element.addEventListener("change", handler);
    this.track(element, "change", handler);
  }

  /**
   * Setup submit listener for submit action type.
   *
   * CRITICAL: Legacy parity requires attaching to FORM, not button.
   * (walkthrough.ts:1946-1957)
   */
  private setupSubmitListener(element: HTMLElement): void {
    // CRITICAL: Attach to form, not button
    const form = element.closest("form");
    if (!form) {
      this.log("No form found for submit action, skipping listener", "warn");
      return;
    }

    const handler = (event: Event) => {
      this.emit({
        type: "submit",
        target: element, // Original target element (button or form)
        event,
        timestamp: Date.now(),
      });
    };

    form.addEventListener("submit", handler);
    this.track(form, "submit", handler);
  }

  /**
   * Setup copy listener for copy action type.
   *
   * Uses document selection text to avoid clipboard permission issues.
   * Filters by event target relationship to expected element.
   */
  private setupCopyListener(element: HTMLElement): void {
    const handler = (event: Event) => {
      // Prefer clipboardData (matches recorder semantics), fall back to selection text.
      const clipboardText =
        event instanceof ClipboardEvent
          ? event.clipboardData?.getData("text/plain") ?? ""
          : "";

      const selection = window.getSelection?.();
      const selectedText = selection ? selection.toString() : "";

      const value = clipboardText || selectedText || undefined;

      this.emit({
        type: "copy",
        target: element,
        event,
        value,
        timestamp: Date.now(),
      });
    };

    // Capture phase so we see it early and consistently across pages/editors.
    document.addEventListener("copy", handler, { capture: true });
    this.track(document, "copy", handler, { capture: true });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Track a listener for cleanup.
   */
  private track(
    element: EventTarget,
    eventType: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.activeListeners.push({ element, eventType, handler, options });
  }

  /**
   * Emit a detected action to the callback.
   */
  private emit(action: DetectedAction): void {
    this.log(`Emitting ${action.type} action`);
    this.onActionDetected(action);
  }

  /**
   * Log message if debug enabled.
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") {
      return;
    }
    console[level](`[ActionDetector] ${message}`);
  }
}
