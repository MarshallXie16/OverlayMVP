/**
 * Element Finder with Selector Fallback
 *
 * Finds elements using cascading selector fallback strategy.
 * Tries selectors in priority order: primary → CSS → XPath → data-testid
 * Waits for element with MutationObserver for dynamic content.
 *
 * EXT-003: Element Finder with Selector Fallback
 */

import type { StepResponse } from "@/shared/types";

// Element finding timeout (hardcoded for MVP, easily configurable later)
const ELEMENT_FIND_TIMEOUT = 5000; // 5 seconds

// Retry interval for polling
const RETRY_INTERVAL = 500; // 500ms

/**
 * Check if element is interactable (visible and not disabled)
 */
export function isInteractable(element: HTMLElement): boolean {
  // Check if element is visible
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  // Note: We do NOT check viewport here because we scroll to elements
  // Elements off-screen are still valid targets

  // Check if element is disabled
  if (
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }

  // Check if element is hidden
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  return true;
}

/**
 * Try to find element using a specific selector
 */
function trySelector(
  selector: string,
  type: "css" | "xpath" | "attribute",
): HTMLElement | null {
  try {
    if (type === "xpath") {
      const result = document.evaluate(
        selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue as HTMLElement | null;
    } else {
      // CSS or attribute selector
      return document.querySelector(selector) as HTMLElement | null;
    }
  } catch (error) {
    console.warn(`[ElementFinder] Selector failed: ${selector}`, error);
    return null;
  }
}

/**
 * Try all selectors in priority order
 */
function tryAllSelectors(
  step: StepResponse,
): { element: HTMLElement; selectorUsed: string } | null {
  const selectors = step.selectors as any;

  // Priority 1: Primary selector (ID, data-testid, or name)
  if (selectors.primary) {
    const element = trySelector(selectors.primary, "css");
    if (element && isInteractable(element)) {
      console.log(
        `[ElementFinder] Found with primary selector: ${selectors.primary}`,
      );
      return { element, selectorUsed: `primary: ${selectors.primary}` };
    }
  }

  // Priority 2: CSS selector
  if (selectors.css) {
    const element = trySelector(selectors.css, "css");
    if (element && isInteractable(element)) {
      console.log(`[ElementFinder] Found with CSS selector: ${selectors.css}`);
      return { element, selectorUsed: `css: ${selectors.css}` };
    }
  }

  // Priority 3: XPath
  if (selectors.xpath) {
    const element = trySelector(selectors.xpath, "xpath");
    if (element && isInteractable(element)) {
      console.log(`[ElementFinder] Found with XPath: ${selectors.xpath}`);
      return { element, selectorUsed: `xpath: ${selectors.xpath}` };
    }
  }

  // Priority 4: data-testid
  if (selectors.data_testid) {
    const selector = `[data-testid="${selectors.data_testid}"]`;
    const element = trySelector(selector, "attribute");
    if (element && isInteractable(element)) {
      console.log(
        `[ElementFinder] Found with data-testid: ${selectors.data_testid}`,
      );
      return { element, selectorUsed: `data-testid: ${selectors.data_testid}` };
    }
  }

  return null;
}

/**
 * Wait for element using MutationObserver
 * Watches for DOM changes and retries finding element
 */
function waitForElement(
  step: StepResponse,
  timeoutMs: number,
): Promise<{ element: HTMLElement; selectorUsed: string }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // Try immediately first
    const immediateResult = tryAllSelectors(step);
    if (immediateResult) {
      resolve(immediateResult);
      return;
    }

    // Set up MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      const result = tryAllSelectors(step);
      if (result) {
        observer.disconnect();
        clearInterval(pollInterval);
        clearTimeout(timeoutTimer);
        resolve(result);
      }
    });

    // Observe the entire document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "disabled", "aria-disabled"],
    });

    // Also poll every RETRY_INTERVAL as a fallback
    const pollInterval = setInterval(() => {
      const result = tryAllSelectors(step);
      if (result) {
        observer.disconnect();
        clearInterval(pollInterval);
        clearTimeout(timeoutTimer);
        resolve(result);
      }

      // Check if we've exceeded timeout
      if (Date.now() - startTime > timeoutMs) {
        observer.disconnect();
        clearInterval(pollInterval);
        reject(new Error("Element not found: timeout exceeded"));
      }
    }, RETRY_INTERVAL);

    // Final timeout
    const timeoutTimer = setTimeout(() => {
      observer.disconnect();
      clearInterval(pollInterval);
      reject(new Error(`Element not found after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

/**
 * Find element for a workflow step
 *
 * Main entry point for element finding. Uses cascading selector fallback
 * with MutationObserver for dynamic content.
 *
 * @param step - Workflow step with selectors
 * @returns Promise resolving to found element and selector used
 * @throws Error if element not found after timeout
 */
export async function findElement(
  step: StepResponse,
): Promise<{ element: HTMLElement; selectorUsed: string }> {
  console.log(`[ElementFinder] Finding element for step ${step.step_number}`);

  // Try immediate find first (fast path)
  const immediateResult = tryAllSelectors(step);
  if (immediateResult) {
    return immediateResult;
  }

  // Wait for element with MutationObserver (handles dynamic content)
  console.log(
    `[ElementFinder] Element not immediately found, waiting up to ${ELEMENT_FIND_TIMEOUT}ms...`,
  );
  return waitForElement(step, ELEMENT_FIND_TIMEOUT);
}

/**
 * Scroll element into view if offscreen
 */
export function scrollToElement(element: HTMLElement): void {
  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "center",
  });
}
