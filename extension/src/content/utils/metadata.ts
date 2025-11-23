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
 */

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
}

/**
 * Extracts visible text content from an element
 * Limits to 100 characters and trims whitespace
 */
function extractTextContent(element: Element): string | null {
  try {
    // Get text content, excluding script and style tags
    let text = '';

    if (element instanceof HTMLElement) {
      text = element.innerText || element.textContent || '';
    } else {
      text = element.textContent || '';
    }

    // Trim and normalize whitespace
    text = text.trim().replace(/\s+/g, ' ');

    // Limit to 100 characters
    if (text.length > 100) {
      text = text.substring(0, 100) + '...';
    }

    return text || null;
  } catch (error) {
    console.error('Error extracting text content:', error);
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
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
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
    console.error('Error checking element visibility:', error);
    return false;
  }
}

/**
 * Extracts parent element information
 */
function extractParentInfo(element: Element): ElementMetadata['parent'] {
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
    console.error('Error extracting parent info:', error);
    return null;
  }
}

/**
 * Main function: Extract all metadata for a given element
 */
export function extractMetadata(element: Element): ElementMetadata {
  try {
    // Basic element properties
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const type = element.getAttribute('type');
    const name = element.getAttribute('name');

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

    // Parent information
    const parent = extractParentInfo(element);

    // Visibility check
    const visible = isElementVisible(element);

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
    };
  } catch (error) {
    console.error('Error extracting metadata:', error);

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
  _actionType: string
): Record<string, any> {
  const data: Record<string, any> = {};

  try {
    if (element instanceof HTMLInputElement) {
      data.value = element.value;
      data.placeholder = element.placeholder || null;
      data.checked = element.type === 'checkbox' || element.type === 'radio'
        ? element.checked
        : undefined;
    } else if (element instanceof HTMLSelectElement) {
      data.value = element.value;
      data.selected_option = element.options[element.selectedIndex]?.text || null;
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
    console.error('Error extracting action data:', error);
  }

  return data;
}
