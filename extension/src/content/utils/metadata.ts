/**
 * Metadata Extraction Utility
 * Extracts element metadata for context and debugging
 *
 * Captures:
 * - Tag name, role, type, name
 * - Text content (trimmed to 100 chars)
 * - CSS classes
 * - Bounding box position and dimensions
 * - Parent element information
 * - Parent chain (for auto-healing context)
 * - Form context (critical for false positive prevention)
 * - Visual region (header/main/footer/sidebar/modal)
 * - Nearby landmarks (headings, labels, siblings)
 */

/**
 * Parent chain entry for hierarchical context
 */
export interface ParentChainEntry {
  tag: string;
  id: string | null;
  classes: string[];
  role: string | null;
}

/**
 * Form context for elements within forms
 * Critical for preventing false positives (e.g., same "Submit" button in different forms)
 */
export interface FormContext {
  formId: string | null;
  formAction: string | null;
  formName: string | null;
  formClasses: string[];
  fieldIndex: number; // Position within form (0-indexed)
  totalFields: number; // Total interactable fields in form
}

/**
 * Visual region of the page
 * Used to prevent matching elements in wrong page sections
 */
export type VisualRegion =
  | "header"
  | "main"
  | "footer"
  | "sidebar"
  | "modal"
  | "unknown";

/**
 * Nearby landmarks for contextual anchoring
 * Helps distinguish elements with same text in different contexts
 */
export interface NearbyLandmarks {
  closestHeading: {
    text: string;
    level: number; // h1=1, h2=2, etc.
    distance: number; // Pixel distance
  } | null;
  closestLabel: {
    text: string;
    forId: string | null;
  } | null;
  siblingTexts: string[]; // Text content of adjacent siblings (max 3 each direction)
  containerText: string | null; // Text of nearest container with semantic meaning
}

/**
 * Element metadata structure
 */
export interface ElementMetadata {
  tag_name: string;
  role: string | null;
  type: string | null;
  name: string | null;
  text: string | null;
  classes: string[];
  bounding_box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  parent: {
    tag_name: string;
    id: string | null;
    classes: string[];
  } | null;
  visible: boolean;

  // Enhanced context for auto-healing
  parentChain: ParentChainEntry[];
  formContext: FormContext | null;
  visualRegion: VisualRegion;
  nearbyLandmarks: NearbyLandmarks;
}

/**
 * Extracts visible text content from an element
 * Limits to 100 characters and trims whitespace
 */
function extractTextContent(element: Element): string | null {
  try {
    // Get text content, excluding script and style tags
    let text = "";

    if (element instanceof HTMLElement) {
      text = element.innerText || element.textContent || "";
    } else {
      text = element.textContent || "";
    }

    // Trim and normalize whitespace
    text = text.trim().replace(/\s+/g, " ");

    // Limit to 100 characters
    if (text.length > 100) {
      text = text.substring(0, 100) + "...";
    }

    return text || null;
  } catch (error) {
    console.error("Error extracting text content:", error);
    return null;
  }
}

/**
 * Checks if an element is visible in the viewport
 */
function isElementVisible(element: Element): boolean {
  try {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    // Check computed style
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    // Check if element has dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error checking element visibility:", error);
    return false;
  }
}

/**
 * Extracts parent element information
 */
function extractParentInfo(element: Element): ElementMetadata["parent"] {
  try {
    const parent = element.parentElement;
    if (!parent) {
      return null;
    }

    return {
      tag_name: parent.tagName.toLowerCase(),
      id: parent.id || null,
      classes: Array.from(parent.classList),
    };
  } catch (error) {
    console.error("Error extracting parent info:", error);
    return null;
  }
}

/**
 * Extracts parent chain up to 5 levels or until stable ID found
 * Provides hierarchical context for auto-healing
 */
function extractParentChain(element: Element): ParentChainEntry[] {
  const chain: ParentChainEntry[] = [];
  let current = element.parentElement;
  const maxLevels = 5;

  try {
    while (current && chain.length < maxLevels) {
      const entry: ParentChainEntry = {
        tag: current.tagName.toLowerCase(),
        id: current.id || null,
        classes: Array.from(current.classList),
        role: current.getAttribute("role"),
      };
      chain.push(entry);

      // Stop if we hit an element with a stable ID (likely unique)
      if (
        current.id &&
        !current.id.includes("react") &&
        !current.id.includes("ember")
      ) {
        break;
      }

      current = current.parentElement;
    }
  } catch (error) {
    console.error("Error extracting parent chain:", error);
  }

  return chain;
}

/**
 * Extracts form context if element is within a form
 * Critical for preventing false positives with same-text buttons in different forms
 */
function extractFormContext(element: Element): FormContext | null {
  try {
    const form = element.closest("form");
    if (!form) {
      return null;
    }

    // Get all interactable fields in the form
    const fields = form.querySelectorAll(
      "input, button, select, textarea, [role='button'], [role='checkbox'], [role='radio']",
    );

    // Find this element's index in the form
    let fieldIndex = -1;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (field && (field === element || field.contains(element))) {
        fieldIndex = i;
        break;
      }
    }

    return {
      formId: form.id || null,
      formAction: form.getAttribute("action") || null,
      formName: form.getAttribute("name") || null,
      formClasses: Array.from(form.classList),
      fieldIndex: fieldIndex >= 0 ? fieldIndex : 0,
      totalFields: fields.length,
    };
  } catch (error) {
    console.error("Error extracting form context:", error);
    return null;
  }
}

/**
 * Detects which visual region of the page the element is in
 * Uses semantic elements, ARIA roles, and position heuristics
 */
function detectVisualRegion(element: Element): VisualRegion {
  try {
    // Check for modal first (highest priority - modals overlay other regions)
    if (
      element.closest(
        '[role="dialog"], [role="alertdialog"], .modal, [data-modal], [aria-modal="true"]',
      )
    ) {
      return "modal";
    }

    // Check semantic elements and ARIA landmarks
    if (element.closest("header, [role='banner']")) {
      return "header";
    }

    if (element.closest("footer, [role='contentinfo']")) {
      return "footer";
    }

    if (
      element.closest(
        "aside, [role='complementary'], nav:not(header nav), [role='navigation']:not(header *)",
      )
    ) {
      return "sidebar";
    }

    if (element.closest("main, [role='main'], article, [role='article']")) {
      return "main";
    }

    // Position-based heuristic as fallback
    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const pageHeight = document.documentElement.scrollHeight;

    // Element is in top 15% of viewport - likely header
    if (rect.top < viewportHeight * 0.15 && rect.top >= 0) {
      return "header";
    }

    // Element is in bottom 15% of page - likely footer
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const elementPageY = rect.top + scrollTop;
    if (elementPageY > pageHeight * 0.85) {
      return "footer";
    }

    // Element is on far left or right edge - likely sidebar
    const viewportWidth = window.innerWidth;
    if (rect.left < viewportWidth * 0.2 || rect.right > viewportWidth * 0.8) {
      // Check if it's narrow (sidebar characteristic)
      if (rect.width < viewportWidth * 0.3) {
        return "sidebar";
      }
    }

    return "unknown";
  } catch (error) {
    console.error("Error detecting visual region:", error);
    return "unknown";
  }
}

/**
 * Calculates pixel distance between two element centers
 */
function calculateDistance(rect1: DOMRect, rect2: DOMRect): number {
  const center1 = {
    x: rect1.left + rect1.width / 2,
    y: rect1.top + rect1.height / 2,
  };
  const center2 = {
    x: rect2.left + rect2.width / 2,
    y: rect2.top + rect2.height / 2,
  };
  return Math.sqrt(
    Math.pow(center2.x - center1.x, 2) + Math.pow(center2.y - center1.y, 2),
  );
}

/**
 * Extracts nearby landmarks for contextual anchoring
 * Helps distinguish elements with same text in different contexts
 */
function extractNearbyLandmarks(element: Element): NearbyLandmarks {
  const landmarks: NearbyLandmarks = {
    closestHeading: null,
    closestLabel: null,
    siblingTexts: [],
    containerText: null,
  };

  try {
    const elementRect = element.getBoundingClientRect();

    // Find closest heading (h1-h6)
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    let closestHeadingData: { element: Element; distance: number } | null =
      null;

    for (const heading of headings) {
      const headingRect = heading.getBoundingClientRect();
      const distance = calculateDistance(elementRect, headingRect);

      // Only consider headings within 500px and above the element
      if (distance < 500 && headingRect.top <= elementRect.top) {
        if (!closestHeadingData || distance < closestHeadingData.distance) {
          closestHeadingData = { element: heading, distance };
        }
      }
    }

    if (closestHeadingData) {
      const headingEl = closestHeadingData.element;
      const tagName = headingEl.tagName.toLowerCase();
      landmarks.closestHeading = {
        text: (headingEl.textContent || "").trim().substring(0, 100),
        level: parseInt(tagName.charAt(1), 10),
        distance: Math.round(closestHeadingData.distance),
      };
    }

    // Find closest label
    const labels = document.querySelectorAll("label");
    let closestLabelData: {
      element: HTMLLabelElement;
      distance: number;
    } | null = null;

    for (const label of labels) {
      const labelRect = label.getBoundingClientRect();
      const distance = calculateDistance(elementRect, labelRect);

      // Only consider labels within 200px
      if (distance < 200) {
        if (!closestLabelData || distance < closestLabelData.distance) {
          closestLabelData = { element: label, distance };
        }
      }
    }

    if (closestLabelData) {
      landmarks.closestLabel = {
        text: (closestLabelData.element.textContent || "")
          .trim()
          .substring(0, 100),
        forId: closestLabelData.element.getAttribute("for"),
      };
    }

    // Get sibling texts (up to 3 before and 3 after)
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const elementIndex = siblings.indexOf(element as Element);

      const siblingTexts: string[] = [];

      // Previous siblings (up to 3)
      for (let i = Math.max(0, elementIndex - 3); i < elementIndex; i++) {
        const sibling = siblings[i];
        if (sibling) {
          const text = (sibling.textContent || "").trim().substring(0, 50);
          if (text) siblingTexts.push(text);
        }
      }

      // Next siblings (up to 3)
      for (
        let i = elementIndex + 1;
        i <= Math.min(siblings.length - 1, elementIndex + 3);
        i++
      ) {
        const sibling = siblings[i];
        if (sibling) {
          const text = (sibling.textContent || "").trim().substring(0, 50);
          if (text) siblingTexts.push(text);
        }
      }

      landmarks.siblingTexts = siblingTexts;
    }

    // Find nearest semantic container with meaningful text
    const semanticContainers = [
      "section",
      "article",
      "fieldset",
      "div[class*='card']",
      "div[class*='panel']",
    ];
    for (const selector of semanticContainers) {
      const container = element.closest(selector);
      if (container) {
        // Get the first heading or legend in the container
        const containerHeading = container.querySelector(
          "h1, h2, h3, h4, h5, h6, legend",
        );
        if (containerHeading) {
          landmarks.containerText = (containerHeading.textContent || "")
            .trim()
            .substring(0, 100);
          break;
        }
      }
    }
  } catch (error) {
    console.error("Error extracting nearby landmarks:", error);
  }

  return landmarks;
}

/**
 * Main function: Extract all metadata for a given element
 * Includes enhanced context for auto-healing
 */
export function extractMetadata(element: Element): ElementMetadata {
  try {
    // Basic element properties
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    const type = element.getAttribute("type");
    const name = element.getAttribute("name");

    // Text content
    const text = extractTextContent(element);

    // CSS classes
    const classes = Array.from(element.classList);

    // Bounding box
    const rect = element.getBoundingClientRect();
    const boundingBox = {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    // Parent information (legacy - kept for backwards compatibility)
    const parent = extractParentInfo(element);

    // Visibility check
    const visible = isElementVisible(element);

    // Enhanced context for auto-healing
    const parentChain = extractParentChain(element);
    const formContext = extractFormContext(element);
    const visualRegion = detectVisualRegion(element);
    const nearbyLandmarks = extractNearbyLandmarks(element);

    return {
      tag_name: tagName,
      role,
      type,
      name,
      text,
      classes,
      bounding_box: boundingBox,
      parent,
      visible,
      // Enhanced context
      parentChain,
      formContext,
      visualRegion,
      nearbyLandmarks,
    };
  } catch (error) {
    console.error("Error extracting metadata:", error);

    // Fallback to minimal metadata
    return {
      tag_name: element.tagName.toLowerCase(),
      role: null,
      type: null,
      name: null,
      text: null,
      classes: [],
      bounding_box: { x: 0, y: 0, width: 0, height: 0 },
      parent: null,
      visible: false,
      // Enhanced context fallbacks
      parentChain: [],
      formContext: null,
      visualRegion: "unknown",
      nearbyLandmarks: {
        closestHeading: null,
        closestLabel: null,
        siblingTexts: [],
        containerText: null,
      },
    };
  }
}

/**
 * Extracts action-specific data based on element type
 * For inputs: value, placeholder
 * For selects: selected option
 * For links: href
 */
export function extractActionData(
  element: Element,
  _actionType: string,
): Record<string, any> {
  const data: Record<string, any> = {};

  try {
    if (element instanceof HTMLInputElement) {
      data.value = element.value;
      data.placeholder = element.placeholder || null;
      data.checked =
        element.type === "checkbox" || element.type === "radio"
          ? element.checked
          : undefined;
    } else if (element instanceof HTMLSelectElement) {
      data.value = element.value;
      data.selected_option =
        element.options[element.selectedIndex]?.text || null;
      data.selected_index = element.selectedIndex;
    } else if (element instanceof HTMLTextAreaElement) {
      data.value = element.value;
      data.placeholder = element.placeholder || null;
    } else if (element instanceof HTMLAnchorElement) {
      data.href = element.href;
      data.target = element.target || null;
    } else if (element instanceof HTMLButtonElement) {
      data.button_type = element.type;
    }
  } catch (error) {
    console.error("Error extracting action data:", error);
  }

  return data;
}
