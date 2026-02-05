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
export type ActionType = "click" | "input_commit" | "select_change" | "submit";

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
  element: Element;
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
  private inputBaselines: WeakMap<
    HTMLInputElement | HTMLTextAreaElement,
    string
  > = new WeakMap();
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
    }

    // 1. Capture baseline on focusin (refresh if user re-focuses)
    const focusHandler = (event: Event) => {
      const input = event.target as HTMLInputElement | HTMLTextAreaElement;
      if (
        input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement
      ) {
        this.inputBaselines.set(input, input.value);
        this.log(`Baseline refreshed on focusin: "${input.value}"`);
      }
    };
    element.addEventListener("focusin", focusHandler);
    this.track(element, "focusin", focusHandler);

    // 2. Emit on blur if value changed
    // IMPORTANT: No capture phase - matches legacy walkthrough.ts:1942
    const blurHandler = (event: Event) => {
      const input = event.target as HTMLInputElement | HTMLTextAreaElement;
      if (
        !(
          input instanceof HTMLInputElement ||
          input instanceof HTMLTextAreaElement
        )
      ) {
        return;
      }

      const baseline = this.inputBaselines.get(input) ?? "";
      if (input.value === baseline) {
        this.log(`Blur ignored: no value change (value="${input.value}")`);
        return;
      }

      this.log(`Value changed: "${baseline}" → "${input.value}"`);
      this.emit({
        type: "input_commit",
        target: element,
        event,
        value: input.value,
        timestamp: Date.now(),
      });
    };
    // Bubble phase (no capture) - matches legacy
    element.addEventListener("blur", blurHandler);
    this.track(element, "blur", blurHandler);
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

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Track a listener for cleanup.
   */
  private track(
    element: Element,
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
