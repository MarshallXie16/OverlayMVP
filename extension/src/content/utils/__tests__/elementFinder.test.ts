/**
 * Tests for element finder with selector fallback
 * EXT-003: Element Finder with Selector Fallback
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { findElement, isInteractable, scrollToElement } from "../elementFinder";
import type { StepResponse } from "@/shared/types";

/**
 * Helper to add getBoundingClientRect mock for visible elements
 */
function mockVisibleElement(element: HTMLElement): void {
  element.getBoundingClientRect = vi.fn().mockReturnValue({
    x: 100,
    y: 200,
    width: 120,
    height: 40,
    top: 200,
    left: 100,
    bottom: 240,
    right: 220,
    toJSON: () => ({}),
  });
  // Mock scrollIntoView
  element.scrollIntoView = vi.fn();
}

/**
 * Helper to add getBoundingClientRect mock for zero-size elements
 */
function mockZeroSizeElement(element: HTMLElement): void {
  element.getBoundingClientRect = vi.fn().mockReturnValue({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    toJSON: () => ({}),
  });
}

// Mock step factory
function createMockStep(selectors: any): StepResponse {
  return {
    id: 1,
    workflow_id: 1,
    step_number: 1,
    timestamp: null,
    action_type: "click",
    selectors,
    element_meta: {},
    page_context: {},
    action_data: null,
    dom_context: null,
    screenshot_id: null,
    field_label: null,
    instruction: null,
    ai_confidence: null,
    ai_model: null,
    ai_generated_at: null,
    label_edited: false,
    instruction_edited: false,
    edited_by: null,
    edited_at: null,
    healed_selectors: null,
    healed_at: null,
    healing_confidence: null,
    healing_method: null,
    created_at: new Date().toISOString(),
  };
}

describe("isInteractable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should return true for visible, enabled element", () => {
    const button = document.createElement("button");
    button.textContent = "Click me";
    mockVisibleElement(button);
    document.body.appendChild(button);

    expect(isInteractable(button)).toBe(true);
  });

  it("should return false for disabled element", () => {
    const button = document.createElement("button");
    button.disabled = true;
    mockVisibleElement(button);
    document.body.appendChild(button);

    expect(isInteractable(button)).toBe(false);
  });

  it("should return false for hidden element (display: none)", () => {
    const div = document.createElement("div");
    div.style.display = "none";
    mockZeroSizeElement(div); // Zero size for display: none
    document.body.appendChild(div);

    expect(isInteractable(div)).toBe(false);
  });

  it("should return false for element with visibility: hidden", () => {
    const div = document.createElement("div");
    div.style.visibility = "hidden";
    mockVisibleElement(div); // Has size but visibility hidden
    document.body.appendChild(div);

    expect(isInteractable(div)).toBe(false);
  });

  it("should return false for element with opacity: 0", () => {
    const div = document.createElement("div");
    div.style.opacity = "0";
    mockVisibleElement(div); // Has size but opacity 0
    document.body.appendChild(div);

    expect(isInteractable(div)).toBe(false);
  });
});

describe("findElement", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should find element with primary selector (ID)", async () => {
    const button = document.createElement("button");
    button.id = "submit-btn";
    button.textContent = "Submit";
    mockVisibleElement(button);
    document.body.appendChild(button);

    const step = createMockStep({
      primary: "#submit-btn",
      css: "button:nth-of-type(1)",
      xpath: "//button",
      data_testid: null,
    });

    const result = await findElement(step);

    expect(result.element).toBe(button);
    expect(result.selectorUsed).toContain("primary");
  });

  it("should fallback to CSS selector if primary fails", async () => {
    const button = document.createElement("button");
    button.className = "submit-button";
    button.textContent = "Submit";
    mockVisibleElement(button);
    document.body.appendChild(button);

    const step = createMockStep({
      primary: null,
      css: "button.submit-button",
      xpath: "//button",
      data_testid: null,
    });

    const result = await findElement(step);

    expect(result.element).toBe(button);
    expect(result.selectorUsed).toContain("css");
  });

  it("should fallback to data-testid if CSS fails", async () => {
    const button = document.createElement("button");
    button.setAttribute("data-testid", "submit-btn");
    button.textContent = "Submit";
    mockVisibleElement(button);
    document.body.appendChild(button);

    const step = createMockStep({
      primary: null,
      css: null,
      xpath: null,
      data_testid: "submit-btn",
    });

    const result = await findElement(step);

    expect(result.element).toBe(button);
    expect(result.selectorUsed).toContain("data-testid");
  });

  it("should skip non-interactable elements", async () => {
    // Create two buttons with same ID (bad practice, but test fallback)
    const hiddenButton = document.createElement("button");
    hiddenButton.id = "btn";
    hiddenButton.style.display = "none";
    mockZeroSizeElement(hiddenButton);
    document.body.appendChild(hiddenButton);

    const visibleButton = document.createElement("button");
    visibleButton.className = "submit";
    visibleButton.textContent = "Submit";
    mockVisibleElement(visibleButton);
    document.body.appendChild(visibleButton);

    const step = createMockStep({
      primary: "#btn", // Will find hidden button, should skip
      css: "button.submit", // Should use this instead
      xpath: null,
      data_testid: null,
    });

    const result = await findElement(step);

    expect(result.element).toBe(visibleButton);
    expect(result.selectorUsed).toContain("css");
  });

  it("should throw error if element not found", async () => {
    const step = createMockStep({
      primary: "#nonexistent",
      css: ".nonexistent",
      xpath: null,
      data_testid: null,
    });

    await expect(findElement(step)).rejects.toThrow("Element not found");
  });

  it("should wait for dynamically added element", async () => {
    const step = createMockStep({
      primary: "#dynamic-btn",
      css: null,
      xpath: null,
      data_testid: null,
    });

    // Add element after 500ms
    setTimeout(() => {
      const button = document.createElement("button");
      button.id = "dynamic-btn";
      button.textContent = "Dynamic";
      mockVisibleElement(button);
      document.body.appendChild(button);
    }, 500);

    const result = await findElement(step);

    expect(result.element.id).toBe("dynamic-btn");
  }, 10000); // Increase timeout for this test
});

describe("scrollToElement", () => {
  it("should call scrollIntoView on element", () => {
    const div = document.createElement("div");
    // Mock scrollIntoView since JSDOM doesn't implement it
    div.scrollIntoView = vi.fn();
    document.body.appendChild(div);

    scrollToElement(div);

    expect(div.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
  });
});
