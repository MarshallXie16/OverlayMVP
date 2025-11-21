/**
 * Visual Feedback Module
 * Provides visual feedback when elements are captured during recording
 */

// Import CSS
import './feedback.css';

const FLASH_DURATION = 300; // milliseconds
const FLASH_CLASS = 'workflow-element-captured';

/**
 * Flash an element to provide visual feedback that it was captured
 * @param element - The element to flash
 */
export function flashElement(element: Element): void {
  try {
    // Add flash animation class
    element.classList.add(FLASH_CLASS);

    // Remove class after animation completes
    setTimeout(() => {
      element.classList.remove(FLASH_CLASS);
    }, FLASH_DURATION);
  } catch (error) {
    // Silently fail if element doesn't support classList
    console.debug('Could not flash element:', error);
  }
}

/**
 * Flash multiple elements (e.g., parent and child)
 * @param elements - Array of elements to flash
 */
export function flashElements(elements: Element[]): void {
  elements.forEach((element) => flashElement(element));
}
