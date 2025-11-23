/**
 * Selector Extraction Utility
 * Extracts robust selectors for DOM elements to enable reliable element targeting
 *
 * Returns multiple selector types for redundancy and self-healing:
 * - Primary: ID, data-testid, or name attribute
 * - CSS: Unique CSS path from element to root
 * - XPath: XPath expression for elements
 * - Stable attributes: aria-label, role, placeholder, etc.
 */

/**
 * Selector extraction result
 */
export interface ElementSelectors {
  primary: string | null;
  css: string;
  xpath: string;
  data_testid: string | null;
  stable_attrs: Record<string, string>;
}

/**
 * Checks if an ID is likely to be stable (not dynamically generated)
 */
function isStableId(id: string): boolean {
  // Reject IDs that look dynamically generated
  const dynamicPatterns = [
    /^[a-f0-9]{8,}$/i,           // Long hex strings
    /^[0-9]{10,}$/,              // Timestamps
    /^(mui|react|ember)-/i,      // Framework-generated IDs
    /:r[0-9]+:/,                 // React 18 IDs
    /^__/,                       // Private/generated IDs
  ];

  return !dynamicPatterns.some(pattern => pattern.test(id));
}

/**
 * Escapes special characters in CSS selectors
 */
function escapeCssSelector(str: string): string {
  return str.replace(/([\[\](){}:.,>+~#$^*=|\\])/g, '\\$1');
}

/**
 * Generates a unique CSS selector path for an element
 */
function generateCssSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    // Try to use ID if stable
    if (current.id && isStableId(current.id)) {
      selector += `#${escapeCssSelector(current.id)}`;
      path.unshift(selector);
      break; // ID is unique, stop here
    }

    // Add nth-child if there are siblings of same type
    if (current.parentElement) {
      const siblings = Array.from(current.parentElement.children);
      const sameTypeSiblings = siblings.filter(
        s => s.tagName === current!.tagName
      );

      if (sameTypeSiblings.length > 1) {
        const index = sameTypeSiblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;

    // Stop at body to keep selectors reasonably short
    if (current?.tagName.toLowerCase() === 'body') {
      path.unshift('body');
      break;
    }
  }

  return path.join(' > ');
}

/**
 * Generates an XPath expression for an element
 */
function generateXPath(element: Element): string {
  if (element.id && isStableId(element.id)) {
    return `//*[@id="${element.id}"]`;
  }

  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling: Element | null = current;

    // Count preceding siblings of same type
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = current.tagName.toLowerCase();
    const xpathIndex = index > 0 ? `[${index}]` : '';
    path.unshift(`${tagName}${xpathIndex}`);

    current = current.parentElement;
  }

  return `/${path.join('/')}`;
}

/**
 * Extracts stable attributes that can be used for element identification
 */
function extractStableAttributes(element: Element): Record<string, string> {
  const stableAttrs: Record<string, string> = {};

  const attributesToCheck = [
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'role',
    'placeholder',
    'title',
    'alt',
    'type',
    'value',
    'href',
    'name',
  ];

  for (const attr of attributesToCheck) {
    const value = element.getAttribute(attr);
    if (value && value.trim()) {
      stableAttrs[attr] = value.trim();
    }
  }

  return stableAttrs;
}

/**
 * Main function: Extract all selectors for a given element
 */
export function extractSelectors(element: Element): ElementSelectors {
  try {
    // Extract primary selector (ID, data-testid, or name)
    let primary: string | null = null;

    if (element.id && isStableId(element.id)) {
      primary = `#${element.id}`;
    } else if (element.getAttribute('data-testid')) {
      primary = `[data-testid="${element.getAttribute('data-testid')}"]`;
    } else if (element.getAttribute('name')) {
      primary = `[name="${element.getAttribute('name')}"]`;
    }

    // Extract data-testid separately
    const dataTestId = element.getAttribute('data-testid');

    // Generate CSS selector
    const cssSelector = generateCssSelector(element);

    // Generate XPath
    const xpath = generateXPath(element);

    // Extract stable attributes
    const stableAttrs = extractStableAttributes(element);

    return {
      primary,
      css: cssSelector,
      xpath,
      data_testid: dataTestId,
      stable_attrs: stableAttrs,
    };
  } catch (error) {
    console.error('Error extracting selectors:', error);

    // Fallback to minimal selector
    return {
      primary: null,
      css: element.tagName.toLowerCase(),
      xpath: `//${element.tagName.toLowerCase()}`,
      data_testid: null,
      stable_attrs: {},
    };
  }
}
