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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getElementText(element: Element): string {
  // Prefer textContent for consistency across environments (e.g., JSDOM),
  // but fall back to innerText in browsers when textContent is empty.
  const textContent = element.textContent || "";
  if (textContent.trim()) {
    return textContent;
  }

  if (element instanceof HTMLElement) {
    return element.innerText || "";
  }

  return "";
}

function normalizeTargetForClick(element: HTMLElement): HTMLElement {
  const clickable = element.closest(
    "a[href], button, [role='button'], [role='link']",
  ) as HTMLElement | null;
  return clickable ?? element;
}

function normalizeUrlForMatch(input: string): { origin: string; pathname: string } | null {
  try {
    const url = new URL(input, window.location.href);
    return { origin: url.origin, pathname: url.pathname.replace(/\/+$/, "") || "/" };
  } catch {
    return null;
  }
}

function extractGoogleRedirectTarget(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    if (!/google\./i.test(url.hostname)) {
      return null;
    }
    const q = url.searchParams.get("q");
    if (q && /^https?:\/\//i.test(q)) {
      return q;
    }
    return null;
  } catch {
    return null;
  }
}

function tryFindByHrefStableAttr(
  href: string,
): HTMLElement | null {
  const expectedRedirectTarget = extractGoogleRedirectTarget(href);
  const expectedKey = normalizeUrlForMatch(expectedRedirectTarget ?? href);
  if (!expectedKey) {
    return null;
  }

  const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLElement[];
  const matches: HTMLElement[] = [];

  for (const anchor of anchors) {
    const rawHref =
      (anchor as HTMLAnchorElement).getAttribute("href") ??
      (anchor as HTMLAnchorElement).href;
    if (!rawHref) continue;

    const redirectTarget = extractGoogleRedirectTarget(rawHref);
    const key = normalizeUrlForMatch(redirectTarget ?? rawHref);
    if (!key) continue;

    if (key.origin === expectedKey.origin && key.pathname === expectedKey.pathname) {
      if (isInteractable(anchor)) {
        matches.push(anchor);
      }
    }
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  return null;
}

function escapeAttributeValue(value: string): string {
  // CSS attribute selector escaping for the common case.
  // We quote with double-quotes and escape backslashes/double-quotes.
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function tryFindByStableAttributes(
  step: StepResponse,
  selectors: Record<string, any>,
): { element: HTMLElement; selectorUsed: string } | null {
  const stableAttrs = selectors?.stable_attrs as Record<string, unknown> | undefined;
  if (!stableAttrs) {
    return null;
  }

  const href = stableAttrs["href"];
  if (typeof href === "string" && href.trim()) {
    const element = tryFindByHrefStableAttr(href);
    if (element) {
      return { element, selectorUsed: `stable_attrs.href` };
    }
  }

  const tagName =
    typeof (step.element_meta as any)?.tag_name === "string"
      ? String((step.element_meta as any).tag_name).toLowerCase()
      : null;

  // Try a few high-signal attributes deterministically.
  const attrPriority = [
    "data-testid",
    "aria-label",
    "name",
    "placeholder",
    "title",
    "alt",
    "role",
    "type",
    "value",
  ];

  for (const attr of attrPriority) {
    const value = stableAttrs[attr];
    if (typeof value !== "string" || !value.trim()) continue;

    const escaped = escapeAttributeValue(value.trim());
    const baseSelector = `[${attr}="${escaped}"]`;
    const selector = tagName ? `${tagName}${baseSelector}` : baseSelector;
    const elements = Array.from(
      document.querySelectorAll(selector),
    ) as HTMLElement[];
    const interactable = elements.filter((el) => isInteractable(el));
    if (interactable.length === 1) {
      return { element: interactable[0]!, selectorUsed: `stable_attrs.${attr}` };
    }
  }

  return null;
}

function tryFindByRecordedText(
  step: StepResponse,
): { element: HTMLElement; selectorUsed: string } | null {
  const recordedText =
    typeof (step.element_meta as any)?.text === "string"
      ? normalizeWhitespace(String((step.element_meta as any).text))
      : "";
  if (!recordedText) {
    return null;
  }

  const expected = recordedText;
  const actionType = String(step.action_type || "").toLowerCase();

  const selectorsToSearch: string[] = [];

  const tagName =
    typeof (step.element_meta as any)?.tag_name === "string"
      ? String((step.element_meta as any).tag_name).toLowerCase()
      : null;

  if (tagName) {
    selectorsToSearch.push(tagName);
  }

  if (actionType === "click") {
    selectorsToSearch.push("a,button,[role='button'],[role='link']");
    selectorsToSearch.push("h1,h2,h3");
  }

  const seen = new Set<HTMLElement>();
  const matches = new Set<HTMLElement>();

  for (const selector of selectorsToSearch) {
    const elements = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    for (const el of elements) {
      if (seen.has(el)) continue;
      seen.add(el);

      const text = normalizeWhitespace(getElementText(el));
      if (text !== expected) continue;

      const candidate =
        actionType === "click" ? normalizeTargetForClick(el) : el;

      if (candidate && isInteractable(candidate)) {
        matches.add(candidate);
      }
    }
  }

  if (matches.size === 1) {
    const [only] = Array.from(matches);
    return { element: only!, selectorUsed: "text_match" };
  }

  return null;
}

/**
 * Try all selectors in priority order
 */
function tryAllSelectors(
  step: StepResponse,
): { element: HTMLElement; selectorUsed: string } | null {
  const selectorSets: Array<{ label: string; selectors: Record<string, any> }> =
    [];

  if (step.healed_selectors) {
    selectorSets.push({ label: "healed", selectors: step.healed_selectors as any });
  }
  selectorSets.push({ label: "original", selectors: step.selectors as any });

  for (const { label, selectors } of selectorSets) {
    const stableResult = tryFindByStableAttributes(step, selectors);
    if (stableResult) {
      const element =
        String(step.action_type || "").toLowerCase() === "click"
          ? normalizeTargetForClick(stableResult.element)
          : stableResult.element;
      return { element, selectorUsed: `${label}:${stableResult.selectorUsed}` };
    }

    // Priority 1: Primary selector (ID, data-testid, or name)
    if (selectors.primary) {
      const element = trySelector(selectors.primary, "css");
      if (element && isInteractable(element)) {
        console.log(
          `[ElementFinder] Found with primary selector: ${selectors.primary}`,
        );
        const normalized =
          String(step.action_type || "").toLowerCase() === "click"
            ? normalizeTargetForClick(element)
            : element;
        return {
          element: normalized,
          selectorUsed: `${label}:primary: ${selectors.primary}`,
        };
      }
    }

    // Priority 2: CSS selector
    if (selectors.css) {
      const element = trySelector(selectors.css, "css");
      if (element && isInteractable(element)) {
        console.log(`[ElementFinder] Found with CSS selector: ${selectors.css}`);
        const normalized =
          String(step.action_type || "").toLowerCase() === "click"
            ? normalizeTargetForClick(element)
            : element;
        return {
          element: normalized,
          selectorUsed: `${label}:css: ${selectors.css}`,
        };
      }
    }

    // Priority 3: XPath
    if (selectors.xpath) {
      const element = trySelector(selectors.xpath, "xpath");
      if (element && isInteractable(element)) {
        console.log(`[ElementFinder] Found with XPath: ${selectors.xpath}`);
        const normalized =
          String(step.action_type || "").toLowerCase() === "click"
            ? normalizeTargetForClick(element)
            : element;
        return {
          element: normalized,
          selectorUsed: `${label}:xpath: ${selectors.xpath}`,
        };
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
        const normalized =
          String(step.action_type || "").toLowerCase() === "click"
            ? normalizeTargetForClick(element)
            : element;
        return {
          element: normalized,
          selectorUsed: `${label}:data-testid: ${selectors.data_testid}`,
        };
      }
    }
  }

  // Final fallback: strict text match (only if unique).
  const textResult = tryFindByRecordedText(step);
  if (textResult) {
    const element =
      String(step.action_type || "").toLowerCase() === "click"
        ? normalizeTargetForClick(textResult.element)
        : textResult.element;
    return { element, selectorUsed: textResult.selectorUsed };
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
