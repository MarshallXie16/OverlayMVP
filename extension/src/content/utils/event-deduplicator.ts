/**
 * Event Deduplicator
 * Groups and deduplicates DOM events to record only meaningful user actions.
 *
 * Design Principles:
 * 1. Intent over mechanics - Record what user meant to do, not every DOM event
 * 2. Event hierarchy - Pick most semantic event from related group
 * 3. Value-based recording - Only record inputs when value changes
 * 4. Deduplication window - Group events within 100ms
 *
 * Example:
 * User clicks checkbox label → Triggers: click(label), click(input), change(input)
 * Records: Only change(input) - the most semantic event
 */

/**
 * Event priority for deduplication (higher number = higher priority)
 */
const EVENT_PRIORITY = {
  submit: 100,           // Form submission (highest priority)
  change: 80,            // Select/checkbox/radio changes
  input_commit: 60,      // Text input commits (blur with value change)
  select_change: 80,     // Select dropdown changes
  click: 40,             // Clicks on buttons/links
  navigate: 100,         // Navigation events
} as const;

/**
 * Event that's pending recording
 */
interface PendingEvent {
  event: Event;
  element: Element;
  timestamp: number;
  actionType: string;
  priority: number;
}

/**
 * Manages event grouping and deduplication
 */
export class EventDeduplicator {
  private pendingEvents: PendingEvent[] = [];
  private flushTimer: number | null = null;
  private readonly bufferDelay = 100; // ms to wait before flushing events
  
  // Track input values to detect changes
  private inputValues: WeakMap<HTMLInputElement, string> = new WeakMap();
  private inputFocused: WeakMap<HTMLInputElement, boolean> = new WeakMap();

  /**
   * Records when an input is focused (to track value changes)
   */
  onInputFocus(input: HTMLInputElement): void {
    this.inputFocused.set(input, true);
    this.inputValues.set(input, this.getInputValue(input));
  }

  /**
   * Checks if input value actually changed
   */
  hasInputValueChanged(input: HTMLInputElement): boolean {
    const previousValue = this.inputValues.get(input) ?? '';
    const currentValue = this.getInputValue(input);
    return previousValue !== currentValue;
  }

  /**
   * Gets normalized input value (handles checkboxes, radios, text)
   */
  private getInputValue(input: HTMLInputElement): string {
    if (input.type === 'checkbox' || input.type === 'radio') {
      return input.checked ? 'checked' : 'unchecked';
    }
    return input.value || '';
  }

  /**
   * Adds an event to the pending queue
   * Events are buffered and deduplicated before recording
   */
  addEvent(
    event: Event,
    element: Element,
    actionType: string,
    recordCallback: (event: Event, element: Element) => void
  ): void {
    const priority = this.getEventPriority(event, element, actionType);

    // For blur events on inputs, check if value actually changed
    if (event.type === 'blur' && element instanceof HTMLInputElement) {
      if (!this.hasInputValueChanged(element)) {
        console.log('[EventDeduplicator] Skipping blur - no value change:', element);
        return;
      }
    }

    // For clicks on labels, check if it will trigger a checkbox/radio change
    if (event.type === 'click' && element instanceof HTMLLabelElement) {
      const forId = element.getAttribute('for');
      if (forId) {
        const targetInput = document.getElementById(forId);
        if (targetInput instanceof HTMLInputElement && 
            (targetInput.type === 'checkbox' || targetInput.type === 'radio')) {
          // Don't record label click - wait for change event on input
          console.log('[EventDeduplicator] Skipping label click - waiting for input change');
          return;
        }
      }
    }

    // For clicks on checkboxes/radios, don't record click - wait for change event
    if (event.type === 'click' && element instanceof HTMLInputElement) {
      if (element.type === 'checkbox' || element.type === 'radio') {
        console.log('[EventDeduplicator] Skipping checkbox/radio click - waiting for change event');
        return;
      }
    }

    // For clicks on submit buttons, don't record if we'll get form submit
    if (event.type === 'click' && element instanceof HTMLButtonElement) {
      if (element.type === 'submit' || element.getAttribute('type') === 'submit') {
        const form = element.closest('form');
        if (form) {
          console.log('[EventDeduplicator] Skipping submit button click - waiting for form submit');
          return;
        }
      }
    }

    // Add to pending events
    const pendingEvent: PendingEvent = {
      event,
      element,
      timestamp: Date.now(),
      actionType,
      priority,
    };

    this.pendingEvents.push(pendingEvent);
    console.log(`[EventDeduplicator] Buffered ${event.type} on ${element.tagName} (priority: ${priority})`);

    // Schedule flush
    this.scheduleFlush(recordCallback);
  }

  /**
   * Gets priority for an event
   */
  private getEventPriority(event: Event, _element: Element, actionType: string): number {
    // Check action type first
    if (actionType in EVENT_PRIORITY) {
      return EVENT_PRIORITY[actionType as keyof typeof EVENT_PRIORITY];
    }

    // Fallback based on event type
    if (event.type === 'submit') return EVENT_PRIORITY.submit;
    if (event.type === 'change') return EVENT_PRIORITY.change;
    if (event.type === 'blur') return EVENT_PRIORITY.input_commit;
    if (event.type === 'click') return EVENT_PRIORITY.click;

    return 0;
  }

  /**
   * Schedules flushing pending events
   */
  private scheduleFlush(recordCallback: (event: Event, element: Element) => void): void {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
    }

    this.flushTimer = window.setTimeout(() => {
      this.flush(recordCallback);
    }, this.bufferDelay);
  }

  /**
   * Flushes pending events - deduplicates and records
   */
  private flush(recordCallback: (event: Event, element: Element) => void): void {
    if (this.pendingEvents.length === 0) {
      return;
    }

    console.log(`[EventDeduplicator] Flushing ${this.pendingEvents.length} buffered events`);

    // Group events by element or related elements
    const groups = this.groupRelatedEvents(this.pendingEvents);

    // For each group, pick the highest priority event
    for (const group of groups) {
      const bestEvent = this.pickBestEvent(group);
      if (bestEvent) {
        console.log(`[EventDeduplicator] Recording ${bestEvent.event.type} on ${bestEvent.element.tagName} (priority: ${bestEvent.priority})`);
        recordCallback(bestEvent.event, bestEvent.element);
      }
    }

    // Clear pending events
    this.pendingEvents = [];
    this.flushTimer = null;
  }

  /**
   * Groups related events (same element, form submission, label+input, etc.)
   */
  private groupRelatedEvents(events: PendingEvent[]): PendingEvent[][] {
    const groups: PendingEvent[][] = [];
    const processed = new Set<PendingEvent>();

    for (const event of events) {
      if (processed.has(event)) continue;

      const group: PendingEvent[] = [event];
      processed.add(event);

      // Find related events
      for (const otherEvent of events) {
        if (processed.has(otherEvent)) continue;

        if (this.areEventsRelated(event, otherEvent)) {
          group.push(otherEvent);
          processed.add(otherEvent);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Checks if two events are related (should be deduplicated)
   */
  private areEventsRelated(event1: PendingEvent, event2: PendingEvent): boolean {
    // Same element
    if (event1.element === event2.element) {
      return true;
    }

    // Label and its input
    if (event1.element instanceof HTMLLabelElement) {
      const forId = event1.element.getAttribute('for');
      if (forId && event2.element.id === forId) {
        return true;
      }
      // Check if label contains the input
      if (event1.element.contains(event2.element)) {
        return true;
      }
    }

    if (event2.element instanceof HTMLLabelElement) {
      const forId = event2.element.getAttribute('for');
      if (forId && event1.element.id === forId) {
        return true;
      }
      if (event2.element.contains(event1.element)) {
        return true;
      }
    }

    // Form submit and button click
    if (event1.event.type === 'submit' && event1.element instanceof HTMLFormElement) {
      if (event2.element instanceof HTMLButtonElement && event1.element.contains(event2.element)) {
        return true;
      }
    }

    if (event2.event.type === 'submit' && event2.element instanceof HTMLFormElement) {
      if (event1.element instanceof HTMLButtonElement && event2.element.contains(event1.element)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Picks the best event from a group (highest priority)
   */
  private pickBestEvent(group: PendingEvent[]): PendingEvent | null {
    if (group.length === 0) return null;
    if (group.length === 1) return group[0] ?? null;

    // Sort by priority (descending)
    group.sort((a, b) => b.priority - a.priority);

    const bestEvent = group[0];
    if (!bestEvent) return null;

    console.log(`[EventDeduplicator] Group of ${group.length} events:`, 
      group.map(e => `${e.event.type}:${e.priority}`).join(', '),
      `→ Picking: ${bestEvent.event.type}`
    );

    return bestEvent;
  }

  /**
   * Forces immediate flush (used when stopping recording)
   */
  forceFlush(recordCallback: (event: Event, element: Element) => void): void {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush(recordCallback);
  }

  /**
   * Clears all pending events
   */
  clear(): void {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingEvents = [];
  }
}
