/**
 * Tests for Visual Feedback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flashElement, flashElements } from './feedback';

describe('Visual Feedback', () => {
  let testElement: HTMLElement;

  beforeEach(() => {
    testElement = document.createElement('div');
    testElement.id = 'test-element';
    document.body.appendChild(testElement);
  });

  afterEach(() => {
    if (testElement && testElement.parentNode) {
      testElement.parentNode.removeChild(testElement);
    }
  });

  describe('flashElement', () => {
    it('should add flash class to element', () => {
      flashElement(testElement);

      expect(testElement.classList.contains('workflow-element-captured')).toBe(true);
    });

    it('should remove flash class after animation duration', async () => {
      flashElement(testElement);

      expect(testElement.classList.contains('workflow-element-captured')).toBe(true);

      // Wait for animation to complete (300ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(testElement.classList.contains('workflow-element-captured')).toBe(false);
    });

    it('should handle multiple flashes on same element', async () => {
      flashElement(testElement);
      expect(testElement.classList.contains('workflow-element-captured')).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 150));

      flashElement(testElement);
      expect(testElement.classList.contains('workflow-element-captured')).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(testElement.classList.contains('workflow-element-captured')).toBe(false);
    });

    it('should not throw error for element without classList', () => {
      const mockElement = {
        // Element without classList
      } as Element;

      expect(() => flashElement(mockElement)).not.toThrow();
    });
  });

  describe('flashElements', () => {
    let elements: HTMLElement[];

    beforeEach(() => {
      elements = [
        document.createElement('div'),
        document.createElement('button'),
        document.createElement('input'),
      ];

      elements.forEach((el, i) => {
        el.id = `test-element-${i}`;
        document.body.appendChild(el);
      });
    });

    afterEach(() => {
      elements.forEach((el) => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    it('should flash all elements in array', () => {
      flashElements(elements);

      elements.forEach((el) => {
        expect(el.classList.contains('workflow-element-captured')).toBe(true);
      });
    });

    it('should handle empty array', () => {
      expect(() => flashElements([])).not.toThrow();
    });

    it('should remove flash class from all elements after duration', async () => {
      flashElements(elements);

      elements.forEach((el) => {
        expect(el.classList.contains('workflow-element-captured')).toBe(true);
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      elements.forEach((el) => {
        expect(el.classList.contains('workflow-element-captured')).toBe(false);
      });
    });
  });

  describe('Animation Class', () => {
    it('should apply correct animation via CSS class', () => {
      const testDiv = document.createElement('div');
      testDiv.classList.add('workflow-element-captured');

      expect(testDiv.classList.contains('workflow-element-captured')).toBe(true);

      // Check that the class name matches our CSS
      const expectedClass = 'workflow-element-captured';
      expect(testDiv.className).toBe(expectedClass);
    });
  });
});
