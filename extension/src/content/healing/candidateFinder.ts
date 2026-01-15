/**
 * Candidate Finder
 *
 * Discovers potential candidate elements on the current page
 * that might match the original recorded element.
 */

import type { CandidateElement, ElementContext } from "./types";
import { CANDIDATE_CONFIG } from "./config";
import { extractMetadata } from "../utils/metadata";
import { escapeXPathString } from "../utils/sanitize";

/**
 * Check if an element is visible and interactable
 */
function isElementVisible(element: HTMLElement): boolean {
  // Check computed style
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.opacity === "0"
  ) {
    return false;
  }

  // Check dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return false;
  }

  // Check if element is in viewport (with some margin)
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  if (
    rect.bottom < -100 ||
    rect.top > viewportHeight + 100 ||
    rect.right < -100 ||
    rect.left > viewportWidth + 100
  ) {
    return false;
  }

  return true;
}

/**
 * Check if element should be excluded
 */
function shouldExclude(element: HTMLElement): boolean {
  // Check against exclude selectors
  for (const selector of CANDIDATE_CONFIG.excludeSelectors) {
    try {
      if (element.matches(selector)) {
        return true;
      }
    } catch {
      // Invalid selector - ignore
    }
  }

  // Skip elements inside SVG (usually icons, not interactive)
  if (element.closest("svg")) {
    return true;
  }

  // Skip elements in excluded containers
  if (
    element.closest(
      '[aria-hidden="true"], [data-testid="loading"], .loading-spinner',
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate distance between two points
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Find all candidate elements on the page
 */
export function findCandidates(original: ElementContext): CandidateElement[] {
  const candidates: CandidateElement[] = [];

  // Find elements matching the candidate selector
  const elements = document.querySelectorAll<HTMLElement>(
    CANDIDATE_CONFIG.candidateSelector,
  );

  // Also include elements with same tag as original
  const sameTagElements = document.querySelectorAll<HTMLElement>(
    original.tagName,
  );

  // Combine and deduplicate
  const allElements = new Set<HTMLElement>([...elements, ...sameTagElements]);

  // Original element center for distance calculation
  const originalCenter = {
    x: original.boundingBox.x + original.boundingBox.width / 2,
    y: original.boundingBox.y + original.boundingBox.height / 2,
  };

  // Evaluate each element
  for (const element of allElements) {
    // Skip excluded elements
    if (shouldExclude(element)) {
      continue;
    }

    // Skip invisible elements
    if (!isElementVisible(element)) {
      continue;
    }

    // Extract metadata for the candidate
    const metadata = extractMetadata(element);

    // Calculate distance from original position
    const rect = element.getBoundingClientRect();
    const candidateCenter = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    };
    const dist = distance(
      originalCenter.x,
      originalCenter.y,
      candidateCenter.x,
      candidateCenter.y,
    );

    // Skip if too far from original position
    if (dist > CANDIDATE_CONFIG.maxPositionDistance) {
      continue;
    }

    candidates.push({
      element,
      metadata,
    });
  }

  // Sort by distance and limit to max candidates
  candidates.sort((a, b) => {
    const aRect = a.element.getBoundingClientRect();
    const bRect = b.element.getBoundingClientRect();

    const aDist = distance(
      originalCenter.x,
      originalCenter.y,
      aRect.x + aRect.width / 2,
      aRect.y + aRect.height / 2,
    );
    const bDist = distance(
      originalCenter.x,
      originalCenter.y,
      bRect.x + bRect.width / 2,
      bRect.y + bRect.height / 2,
    );

    return aDist - bDist;
  });

  // Limit candidates
  return candidates.slice(0, CANDIDATE_CONFIG.maxCandidates);
}

/**
 * Find candidates with specific criteria
 */
export function findCandidatesBySelector(selector: string): CandidateElement[] {
  const candidates: CandidateElement[] = [];

  try {
    const elements = document.querySelectorAll<HTMLElement>(selector);

    for (const element of elements) {
      if (shouldExclude(element) || !isElementVisible(element)) {
        continue;
      }

      candidates.push({
        element,
        metadata: extractMetadata(element),
      });
    }
  } catch (error) {
    console.error("[Healing] Invalid selector:", selector, error);
  }

  return candidates;
}

/**
 * Find candidates by text content
 */
export function findCandidatesByText(
  text: string,
  options: { exact?: boolean; tagName?: string } = {},
): CandidateElement[] {
  const candidates: CandidateElement[] = [];
  const normalizedText = text.toLowerCase().trim();

  // SECURITY-001: Escape text to prevent XPath injection
  const escapedText = escapeXPathString(text);
  const escapedNormalizedText = escapeXPathString(normalizedText);

  // Use XPath for text search (more flexible)
  const xpath = options.exact
    ? `//*[normalize-space(text())=${escapedText}]`
    : `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), ${escapedNormalizedText})]`;

  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );

    for (let i = 0; i < result.snapshotLength; i++) {
      const element = result.snapshotItem(i) as HTMLElement;
      if (!element) continue;

      // Filter by tag if specified
      if (
        options.tagName &&
        element.tagName.toLowerCase() !== options.tagName.toLowerCase()
      ) {
        continue;
      }

      if (shouldExclude(element) || !isElementVisible(element)) {
        continue;
      }

      candidates.push({
        element,
        metadata: extractMetadata(element),
      });
    }
  } catch (error) {
    console.error("[Healing] XPath search failed:", error);
  }

  return candidates;
}

/**
 * Find candidates by role (ARIA or implicit)
 */
export function findCandidatesByRole(role: string): CandidateElement[] {
  const candidates: CandidateElement[] = [];

  // Find by explicit ARIA role
  const explicitRole = document.querySelectorAll<HTMLElement>(
    `[role="${role}"]`,
  );

  // Map role to implicit tags
  const implicitTags: Record<string, string[]> = {
    button: ["button", 'input[type="button"]', 'input[type="submit"]'],
    link: ["a[href]"],
    textbox: ["input:not([type])", 'input[type="text"]', "textarea"],
    checkbox: ['input[type="checkbox"]'],
    radio: ['input[type="radio"]'],
    listbox: ["select"],
    menuitem: ["menuitem"],
    tab: ["[role=tab]"],
  };

  const implicitSelectors = implicitTags[role] || [];
  const implicitElements = implicitSelectors.flatMap((sel) =>
    Array.from(document.querySelectorAll<HTMLElement>(sel)),
  );

  // Combine and deduplicate
  const allElements = new Set<HTMLElement>([
    ...explicitRole,
    ...implicitElements,
  ]);

  for (const element of allElements) {
    if (shouldExclude(element) || !isElementVisible(element)) {
      continue;
    }

    candidates.push({
      element,
      metadata: extractMetadata(element),
    });
  }

  return candidates;
}
