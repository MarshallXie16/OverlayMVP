/**
 * PageContextCapture -- Builds compact accessibility tree of current page for AI.
 *
 * Runs in content script context (has access to DOM).
 * Used by DynamicWalkthroughController to capture page state for AI analysis.
 *
 * The module walks the DOM to find all interactive elements, assigns them
 * numbered indices, and produces a text format that the AI reads to determine
 * the next action. It also maintains a Map<number, HTMLElement> so the
 * controller can look up elements by index without re-querying the DOM.
 *
 * Key behaviors:
 * - Caps element list at MAX_ELEMENTS (100) to keep AI context compact
 * - Redacts sensitive data (passwords never included; CC and SSN patterns masked)
 * - Skips elements inside our own walkthrough/dynamic overlay containers
 * - Builds reasonably unique CSS selectors as fallback identifiers (no XPath)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface InteractiveElement {
  index: number;
  tagName: string;
  role: string;
  /** Accessible name (aria-label, label text, visible text, etc.) */
  name: string;
  /** Input type (omitted when default "text") */
  type?: string;
  value?: string;
  placeholder?: string;
  /** First 10 option texts for <select> elements */
  options?: string[];
  /** CSS selector for fallback element lookup */
  selector: string;
  isVisible: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

export interface PageContextResult {
  url: string;
  title: string;
  interactiveElements: InteractiveElement[];
  statusText: string;
  /** The full formatted text to send to the AI */
  formattedText: string;
  elementCount: number;
  /** Map of index to HTMLElement for direct lookup */
  elementMap: Map<number, HTMLElement>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Patterns for sensitive data that must be redacted from AI context */
const CREDIT_CARD_PATTERN = /\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}/g;
const SSN_PATTERN = /\d{3}-\d{2}-\d{4}/g;
const EMAIL_PATTERN = /\S+@\S+\.\S+/g;
const PHONE_PATTERN = /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g;

/** Input name/placeholder keywords that indicate sensitive data */
const SENSITIVE_FIELD_KEYWORDS =
  /ssn|social|account|routing|card|cvv|pin|dob|birth|passport/i;

/** Maximum characters to include for any single element value */
const MAX_VALUE_LENGTH = 100;

/** Maximum interactive elements to include (keeps AI context compact) */
const MAX_ELEMENTS = 100;

/**
 * Selectors that match our own overlay containers.
 * Elements inside these are excluded from the page context.
 */
const OVERLAY_SELECTORS = [
  "[data-walkthrough-overlay]",
  "[data-dynamic-overlay]",
] as const;

/**
 * CSS selector that matches all interactive elements we care about.
 * Covers native interactive elements, ARIA roles, and contenteditable.
 */
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// ============================================================================
// PAGE CONTEXT CAPTURE
// ============================================================================

export class PageContextCapture {
  private elementMap: Map<number, HTMLElement> = new Map();

  /**
   * Capture the current page context.
   * Returns structured data AND formatted text for the AI.
   */
  capture(): PageContextResult {
    this.elementMap = new Map();

    const url = window.location.href;
    const title = document.title;

    // 1. Find all interactive elements
    const interactiveElements = this.findInteractiveElements();

    // 2. Capture status text (headings, alerts, success/error messages)
    const statusText = this.captureStatusText();

    // 3. Build formatted text for AI
    const formattedText = this.formatForAI(
      url,
      title,
      interactiveElements,
      statusText,
    );

    return {
      url,
      title,
      interactiveElements,
      statusText,
      formattedText,
      elementCount: interactiveElements.length,
      elementMap: this.elementMap,
    };
  }

  /**
   * Look up an element by its index from the last capture.
   * Returns null if the index was not part of the last capture.
   */
  getElementByIndex(index: number): HTMLElement | null {
    return this.elementMap.get(index) ?? null;
  }

  // ============================================================================
  // Private: Element Discovery
  // ============================================================================

  /**
   * Walks the DOM to find interactive elements, assigns indices, and
   * stores references in the element map.
   */
  private findInteractiveElements(): InteractiveElement[] {
    const elements: InteractiveElement[] = [];
    const allElements =
      document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
    let index = 0;

    for (const el of allElements) {
      if (index >= MAX_ELEMENTS) break;

      // Skip elements inside our own overlay
      if (this.isInsideOverlay(el)) {
        continue;
      }

      const rect = el.getBoundingClientRect();
      const isVisible = this.isElementVisible(el, rect);

      // Skip elements with zero dimensions that are also not visible
      if (!isVisible && rect.width === 0 && rect.height === 0) {
        continue;
      }

      const interactiveEl = this.buildInteractiveElement(
        el,
        index,
        rect,
        isVisible,
      );
      elements.push(interactiveEl);
      this.elementMap.set(index, el);
      index++;
    }

    return elements;
  }

  /**
   * Returns true if the element is inside one of our overlay containers.
   */
  private isInsideOverlay(el: HTMLElement): boolean {
    for (const selector of OVERLAY_SELECTORS) {
      if (el.closest(selector)) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // Private: Element Analysis
  // ============================================================================

  /**
   * Builds the InteractiveElement descriptor for a single DOM element.
   */
  private buildInteractiveElement(
    el: HTMLElement,
    index: number,
    rect: DOMRect,
    isVisible: boolean,
  ): InteractiveElement {
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || this.getImplicitRole(el);
    const name = this.getAccessibleName(el);
    const rawType = (el as HTMLInputElement).type || undefined;

    // Get value (with sensitive data redaction)
    let value = this.getElementValue(el);
    if (value) {
      value = this.redactSensitiveData(value, rawType);
    }

    const placeholder = (el as HTMLInputElement).placeholder || undefined;

    // Get select options (cap at 10)
    let options: string[] | undefined;
    if (tagName === "select") {
      const selectEl = el as HTMLSelectElement;
      options = Array.from(selectEl.options)
        .slice(0, 10)
        .map((opt) => opt.text.trim());
    }

    // Build a reasonably unique CSS selector
    const selector = this.buildSelector(el);

    return {
      index,
      tagName,
      role,
      name,
      // Omit default input type "text" to reduce noise
      type: rawType && rawType !== "text" ? rawType : undefined,
      value: value || undefined,
      placeholder,
      options,
      selector,
      isVisible,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  /**
   * Computes the accessible name for an element following a simplified
   * version of the WAI-ARIA accessible name computation:
   * aria-label > aria-labelledby > label[for] > parent label > text content > title > placeholder > name attr
   */
  private getAccessibleName(el: HTMLElement): string {
    // 1. aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel.trim();

    // 2. aria-labelledby
    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl?.textContent) {
        return labelEl.textContent.trim().substring(0, 100);
      }
    }

    // 3. Associated label via for/id
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent) {
        return label.textContent.trim().substring(0, 100);
      }
    }

    // 4. Parent label element (label wrapping the input)
    const parentLabel = el.closest("label");
    if (parentLabel?.textContent) {
      // Get label text excluding the input element itself
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll("input, select, textarea")
        .forEach((child) => child.remove());
      const text = clone.textContent?.trim();
      if (text) return text.substring(0, 100);
    }

    // 5. Visible text content (for buttons, links)
    const textContent = el.textContent?.trim();
    if (textContent && textContent.length < 100) return textContent;

    // 6. Title attribute
    const titleAttr = el.getAttribute("title");
    if (titleAttr) return titleAttr.trim().substring(0, 100);

    // 7. Placeholder
    const placeholderAttr = (el as HTMLInputElement).placeholder;
    if (placeholderAttr) return placeholderAttr.trim().substring(0, 100);

    // 8. Name attribute
    const nameAttr = el.getAttribute("name");
    if (nameAttr) return nameAttr;

    return "";
  }

  /**
   * Returns the implicit ARIA role for a native HTML element.
   */
  private getImplicitRole(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case "button":
        return "button";
      case "a":
        return "link";
      case "input": {
        const type = (el as HTMLInputElement).type;
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        if (type === "submit") return "button";
        return "textbox";
      }
      case "select":
        return "combobox";
      case "textarea":
        return "textbox";
      default:
        return "";
    }
  }

  /**
   * Extracts the current value of a form element.
   * Returns null for password fields (never expose passwords).
   * Redacts values for email, tel, number types and fields with sensitive name/placeholder.
   */
  private getElementValue(el: HTMLElement): string | null {
    const tag = el.tagName.toLowerCase();

    if (tag === "input" || tag === "textarea") {
      const inputEl = el as HTMLInputElement;
      // NEVER return password values
      if (inputEl.type === "password") return null;

      const value = inputEl.value;
      if (!value) return null;

      // Check if field name/placeholder indicates sensitive data
      const fieldName = (inputEl.name || "").toLowerCase();
      const fieldPlaceholder = (inputEl.placeholder || "").toLowerCase();
      if (
        SENSITIVE_FIELD_KEYWORDS.test(fieldName) ||
        SENSITIVE_FIELD_KEYWORDS.test(fieldPlaceholder)
      ) {
        return "[REDACTED]";
      }

      // Redact by input type
      if (inputEl.type === "email") return "***@***.***";
      if (inputEl.type === "tel") return "***-***-XXXX";

      return value;
    }

    if (tag === "select") {
      const selectEl = el as HTMLSelectElement;
      const selectedOption = selectEl.options[selectEl.selectedIndex];
      return selectedOption?.text ?? null;
    }

    return null;
  }

  // ============================================================================
  // Private: Sensitive Data Handling
  // ============================================================================

  /**
   * Redacts known sensitive data patterns from element values.
   * - Password type inputs are stripped entirely
   * - Credit card number patterns are masked
   * - SSN patterns are masked
   * - Email patterns are masked
   * - Phone patterns are masked
   * - Long values are truncated
   */
  private redactSensitiveData(value: string, type?: string): string {
    if (!value) return value;

    // Strip password values entirely
    if (type === "password") return "";

    // Redact credit card patterns
    let redacted = value.replace(CREDIT_CARD_PATTERN, "****-****-****-****");

    // Redact SSN patterns
    redacted = redacted.replace(SSN_PATTERN, "***-**-****");

    // Redact email patterns
    redacted = redacted.replace(EMAIL_PATTERN, "***@***.***");

    // Redact phone patterns
    redacted = redacted.replace(PHONE_PATTERN, "***-***-XXXX");

    // Truncate long values
    if (redacted.length > MAX_VALUE_LENGTH) {
      redacted = redacted.substring(0, MAX_VALUE_LENGTH) + "...";
    }

    return redacted;
  }

  // ============================================================================
  // Private: Visibility Detection
  // ============================================================================

  /**
   * Determines whether an element is visible to the user.
   * Checks computed styles and viewport intersection (with generous margin
   * to include elements that could be scrolled into view).
   */
  private isElementVisible(el: HTMLElement, rect: DOMRect): boolean {
    if (rect.width === 0 && rect.height === 0) return false;

    const style = getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (style.opacity === "0") return false;

    // Check if in viewport (with generous margin for scrollable content)
    const viewHeight = window.innerHeight;
    const viewWidth = window.innerWidth;
    return (
      rect.bottom > -viewHeight &&
      rect.top < viewHeight * 2 &&
      rect.right > -viewWidth &&
      rect.left < viewWidth * 2
    );
  }

  // ============================================================================
  // Private: CSS Selector Generation
  // ============================================================================

  /**
   * Builds a reasonably unique CSS selector for an element.
   * Priority: id > name attr > data-testid > tag+class with nth-of-type.
   * No XPath -- CSS selectors only.
   */
  private buildSelector(el: HTMLElement): string {
    // 1. ID selector (strongest)
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }

    // 2. Name attribute
    const nameAttr = el.getAttribute("name");
    if (nameAttr) {
      const tag = el.tagName.toLowerCase();
      return `${tag}[name="${CSS.escape(nameAttr)}"]`;
    }

    // 3. data-testid
    const testId = el.getAttribute("data-testid");
    if (testId) {
      return `[data-testid="${CSS.escape(testId)}"]`;
    }

    // 4. Fallback: tag + class + nth-of-type
    const tag = el.tagName.toLowerCase();
    const className =
      el.className && typeof el.className === "string"
        ? "." +
          el.className
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((c) => CSS.escape(c))
            .join(".")
        : "";

    // Add nth-of-type for uniqueness when there are multiple siblings
    const parent = el.parentElement;
    if (parent) {
      const selectorBase = `${tag}${className}`;
      const siblings = Array.from(
        parent.querySelectorAll(`:scope > ${selectorBase || tag}`),
      );
      const siblingIndex = siblings.indexOf(el);
      if (siblings.length > 1 && siblingIndex >= 0) {
        return `${tag}${className}:nth-of-type(${siblingIndex + 1})`;
      }
    }

    return `${tag}${className}`;
  }

  // ============================================================================
  // Private: Status Text Capture
  // ============================================================================

  /**
   * Captures status text from the page: headings, ARIA alerts/live regions,
   * and common notification patterns. This gives the AI context about
   * what the page is showing beyond just interactive elements.
   */
  private captureStatusText(): string {
    const parts: string[] = [];

    // 1. Capture headings (h1-h3)
    document.querySelectorAll("h1, h2, h3").forEach((heading) => {
      // Skip headings inside our overlay
      if (
        heading.closest("[data-walkthrough-overlay]") ||
        heading.closest("[data-dynamic-overlay]")
      ) {
        return;
      }
      const text = heading.textContent?.trim();
      if (text && text.length < 200) {
        parts.push(`${heading.tagName.toLowerCase()}: "${text}"`);
      }
    });

    // 2. Capture ARIA alert and live region elements
    document.querySelectorAll("[role='alert'], [aria-live]").forEach((el) => {
      if (
        el.closest("[data-walkthrough-overlay]") ||
        el.closest("[data-dynamic-overlay]")
      ) {
        return;
      }
      const text = el.textContent?.trim();
      if (text && text.length < 200) {
        parts.push(`alert: "${text}"`);
      }
    });

    // 3. Capture common status/notification elements by class patterns
    const statusSelectors = [
      ".success",
      ".error",
      ".warning",
      ".alert",
      ".notification",
      ".toast",
      ".banner",
      ".message",
      '[class*="success"]',
      '[class*="error"]',
      '[class*="notification"]',
    ].join(", ");

    try {
      document.querySelectorAll(statusSelectors).forEach((el) => {
        // Skip if already captured as alert/live region
        if (
          el.getAttribute("role") === "alert" ||
          el.getAttribute("aria-live")
        ) {
          return;
        }
        // Skip overlay elements
        if (
          el.closest("[data-walkthrough-overlay]") ||
          el.closest("[data-dynamic-overlay]")
        ) {
          return;
        }

        const text = el.textContent?.trim();
        if (text && text.length > 0 && text.length < 200) {
          parts.push(`status: "${text}"`);
        }
      });
    } catch {
      // Some selectors might fail on certain pages; that is acceptable
    }

    if (parts.length === 0) {
      parts.push("[No alerts or status messages]");
    }

    return parts.join("\n");
  }

  // ============================================================================
  // Private: AI Format Output
  // ============================================================================

  /**
   * Builds the formatted text string that gets sent to the AI.
   * The format is designed to be compact (~500-800 tokens for a typical page)
   * and easy for the AI to parse.
   *
   * Example output:
   * ```
   * URL: https://expenses.corp.com/new
   * Title: New Expense Report
   *
   * INTERACTIVE ELEMENTS:
   * [0] button "Back to Dashboard" (visible, x:20 y:80)
   * [1] input[number] "Amount" placeholder="0.00" (visible, x:200 y:360, empty)
   * [2] select "Category" options=["Travel", "Office"] (visible, x:200 y:420, value="Select...")
   *
   * STATUS TEXT:
   * h1: "New Expense Report"
   * ```
   */
  private formatForAI(
    url: string,
    title: string,
    elements: InteractiveElement[],
    statusText: string,
  ): string {
    const lines: string[] = [];

    lines.push(`URL: ${url}`);
    lines.push(`Title: ${title}`);
    lines.push("");
    lines.push("INTERACTIVE ELEMENTS:");

    for (const el of elements) {
      let line = `[${el.index}] ${el.tagName}`;

      if (el.type) line += `[${el.type}]`;
      if (el.name) line += ` "${el.name}"`;
      if (el.placeholder) line += ` placeholder="${el.placeholder}"`;
      if (el.options) {
        line += ` options=${JSON.stringify(el.options.slice(0, 5))}`;
      }

      const vis = el.isVisible ? "visible" : "hidden";
      line += ` (${vis}, x:${el.rect.x} y:${el.rect.y}`;

      if (el.value) {
        line += `, value="${el.value}"`;
      } else if (el.tagName === "input" || el.tagName === "textarea") {
        line += ", empty";
      }

      line += ")";

      lines.push(line);
    }

    if (elements.length === 0) {
      lines.push("[No interactive elements found]");
    }

    lines.push("");
    lines.push("STATUS TEXT:");
    lines.push(statusText);

    return lines.join("\n");
  }
}
