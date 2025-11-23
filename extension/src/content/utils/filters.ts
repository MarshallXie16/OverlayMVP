/**
 * Interaction Filtering Utility
 * Filters user interactions to capture only meaningful workflow steps
 *
 * Includes:
 * - Clicks on interactive elements (buttons, links, inputs)
 * - Input value commits (blur events, not every keystroke)
 * - Select/dropdown changes
 * - Form submissions
 * - Navigation events
 *
 * Excludes:
 * - Clicks on body/html/document
 * - Mouse moves and hovers
 * - Scroll events
 * - Keyboard navigation (arrow keys, tab)
 * - Non-interactive element clicks (div, span, etc.)
 */

/**
 * Interactive HTML elements that warrant recording clicks
 */
const INTERACTIVE_ELEMENTS = new Set([
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'option',
  'label',
  // Form elements
  'form',
  // Common interactive roles
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
]);

/**
 * Input types that should be recorded
 */
const RECORDABLE_INPUT_TYPES = new Set([
  'text',
  'email',
  'password',
  'search',
  'tel',
  'url',
  'number',
  'date',
  'datetime-local',
  'time',
  'month',
  'week',
  'checkbox',
  'radio',
]);

/**
 * Checks if an element is interactive (can be clicked meaningfully)
 */
function isInteractiveElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();

  // Check if it's a known interactive element
  if (INTERACTIVE_ELEMENTS.has(tagName)) {
    return true;
  }

  // Check for interactive role
  const role = element.getAttribute('role');
  if (role && INTERACTIVE_ELEMENTS.has(`[role="${role}"]`)) {
    return true;
  }

  // Check for onclick handler
  if (element.hasAttribute('onclick')) {
    return true;
  }

  // Check for clickable elements with tabindex
  const tabIndex = element.getAttribute('tabindex');
  if (tabIndex !== null && parseInt(tabIndex) >= 0) {
    return true;
  }

  // Check if element has cursor: pointer
  if (element instanceof HTMLElement) {
    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a click event should be recorded
 */
function isClickMeaningful(event: MouseEvent, element: Element): boolean {
  const tagName = element.tagName.toLowerCase();

  // Exclude clicks on body, html, or document
  if (tagName === 'body' || tagName === 'html') {
    return false;
  }

  // Exclude right-clicks and middle-clicks
  if (event.button !== 0) {
    return false;
  }

  // Check if element is interactive
  return isInteractiveElement(element);
}

/**
 * Checks if an input event should be recorded
 */
function isInputMeaningful(event: Event, element: Element): boolean {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  // Only record specific input types
  if (!RECORDABLE_INPUT_TYPES.has(element.type)) {
    return false;
  }

  // For blur events, check if value changed
  if (event.type === 'blur') {
    // Always meaningful - we'll capture the final value
    return true;
  }

  return false;
}

/**
 * Checks if a select change event should be recorded
 */
function isSelectChangeMeaningful(_event: Event, element: Element): boolean {
  if (!(element instanceof HTMLSelectElement)) {
    return false;
  }

  // Select changes are always meaningful
  return true;
}

/**
 * Checks if a form submit event should be recorded
 */
function isFormSubmitMeaningful(_event: Event, element: Element): boolean {
  if (!(element instanceof HTMLFormElement)) {
    return false;
  }

  // Form submissions are always meaningful
  return true;
}

/**
 * Main function: Determines if an interaction should be recorded
 */
export function isInteractionMeaningful(
  event: Event,
  element: Element
): boolean {
  try {
    const eventType = event.type;

    switch (eventType) {
      case 'click':
        return isClickMeaningful(event as MouseEvent, element);

      case 'blur':
        return isInputMeaningful(event, element);

      case 'change':
        // Could be select or input
        if (element instanceof HTMLSelectElement) {
          return isSelectChangeMeaningful(event, element);
        } else if (element instanceof HTMLInputElement) {
          // For checkboxes and radios, change event is meaningful
          return element.type === 'checkbox' || element.type === 'radio';
        }
        return false;

      case 'submit':
        return isFormSubmitMeaningful(event, element);

      case 'beforeunload':
        // Navigation is always meaningful
        return true;

      default:
        return false;
    }
  } catch (error) {
    console.error('Error checking interaction meaningfulness:', error);
    return false;
  }
}

/**
 * Determines the action type from event and element
 */
export function getActionType(
  event: Event,
  element: Element
): 'click' | 'input_commit' | 'select_change' | 'submit' | 'navigate' {
  const eventType = event.type;

  switch (eventType) {
    case 'click':
      return 'click';

    case 'blur':
      return 'input_commit';

    case 'change':
      if (element instanceof HTMLSelectElement) {
        return 'select_change';
      } else if (
        element instanceof HTMLInputElement &&
        (element.type === 'checkbox' || element.type === 'radio')
      ) {
        return 'click'; // Treat checkbox/radio as clicks
      }
      return 'input_commit';

    case 'submit':
      return 'submit';

    case 'beforeunload':
      return 'navigate';

    default:
      return 'click';
  }
}

/**
 * Debouncer for input events
 * Prevents recording every keystroke, only final values
 */
export class InputDebouncer {
  private timers: Map<Element, number> = new Map();
  private readonly delay: number = 500; // ms

  /**
   * Checks if this input event should be processed immediately
   * or if we should wait for the blur event
   */
  shouldProcessInput(_element: Element): boolean {
    // For blur events, always process
    return true;
  }

  /**
   * Debounces input events to avoid recording every keystroke
   */
  debounce(element: Element, callback: () => void): void {
    // Clear existing timer for this element
    const existingTimer = this.timers.get(element);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = window.setTimeout(() => {
      this.timers.delete(element);
      callback();
    }, this.delay);

    this.timers.set(element, timer);
  }

  /**
   * Clears all debounce timers
   */
  clear(): void {
    for (const timer of this.timers.values()) {
      window.clearTimeout(timer);
    }
    this.timers.clear();
  }
}
