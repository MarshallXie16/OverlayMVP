/**
 * Candidate Finder Tests
 *
 * Tests for discovering and filtering candidate elements:
 * - isElementVisible() checks (display, visibility, opacity, dimensions)
 * - shouldExclude() filtering (overlay elements, loading spinners)
 * - findCandidates() main search algorithm
 * - findCandidatesBySelector() targeted search
 * - findCandidatesByText() XPath text search (with injection safety)
 * - findCandidatesByRole() ARIA role search
 * - Distance-based filtering and sorting
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  findCandidates,
  findCandidatesBySelector,
  findCandidatesByText,
  findCandidatesByRole,
} from "../candidateFinder";
import type { ElementContext } from "../types";
import { CANDIDATE_CONFIG } from "../config";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockContext(
  tagName: string = "BUTTON",
  x: number = 100,
  y: number = 200,
): ElementContext {
  return {
    tagName,
    role: "button",
    type: null,
    name: null,
    text: "Submit",
    classes: ["btn"],
    boundingBox: { x, y, width: 120, height: 40 },
    selectors: {
      primary: "#test-btn",
      css: ".btn",
      xpath: null,
      dataTestId: null,
    },
    parentChain: [],
    formContext: null,
    visualRegion: "main",
    nearbyLandmarks: {
      closestHeading: null,
      closestLabel: null,
      siblingTexts: [],
      containerText: null,
    },
    fieldLabel: null,
    instruction: null,
  };
}

/**
 * Create a visible button element for testing
 */
function createVisibleButton(text: string = "Test"): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = text;
  button.style.display = "block";
  button.style.visibility = "visible";
  button.style.opacity = "1";
  button.style.width = "100px";
  button.style.height = "40px";

  // Mock getBoundingClientRect to return visible dimensions
  button.getBoundingClientRect = () => ({
    x: 100,
    y: 200,
    width: 100,
    height: 40,
    top: 200,
    left: 100,
    bottom: 240,
    right: 200,
    toJSON: () => ({}),
  });

  return button;
}

/**
 * Create a hidden element for testing
 */
function createHiddenElement(
  hideMethod: "display" | "visibility" | "opacity" | "zero-size",
): HTMLElement {
  const element = document.createElement("div");
  element.textContent = "Hidden";

  switch (hideMethod) {
    case "display":
      element.style.display = "none";
      break;
    case "visibility":
      element.style.visibility = "hidden";
      break;
    case "opacity":
      element.style.opacity = "0";
      break;
    case "zero-size":
      element.style.width = "0";
      element.style.height = "0";
      break;
  }

  // Mock getBoundingClientRect
  const rect =
    hideMethod === "zero-size"
      ? { x: 100, y: 200, width: 0, height: 0 }
      : { x: 100, y: 200, width: 100, height: 40 };

  element.getBoundingClientRect = () => ({
    ...rect,
    top: rect.y,
    left: rect.x,
    bottom: rect.y + rect.height,
    right: rect.x + rect.width,
    toJSON: () => ({}),
  });

  return element;
}

// ============================================================================
// VISIBILITY TESTS
// ============================================================================

describe("candidateFinder - Element Visibility", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should find visible elements", () => {
    const button = createVisibleButton("Submit");
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.element === button)).toBe(true);
  });

  it("should exclude elements with display:none", () => {
    const hidden = createHiddenElement("display");
    hidden.setAttribute("role", "button");
    document.body.appendChild(hidden);

    const original = createMockContext("DIV");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === hidden)).toBe(false);
  });

  it("should exclude elements with visibility:hidden", () => {
    const hidden = createHiddenElement("visibility");
    hidden.setAttribute("role", "button");
    document.body.appendChild(hidden);

    const original = createMockContext("DIV");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === hidden)).toBe(false);
  });

  it("should exclude elements with opacity:0", () => {
    const hidden = createHiddenElement("opacity");
    hidden.setAttribute("role", "button");
    document.body.appendChild(hidden);

    const original = createMockContext("DIV");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === hidden)).toBe(false);
  });

  it("should exclude zero-size elements", () => {
    const hidden = createHiddenElement("zero-size");
    hidden.setAttribute("role", "button");
    document.body.appendChild(hidden);

    const original = createMockContext("DIV");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === hidden)).toBe(false);
  });

  it("should exclude off-screen elements (far above viewport)", () => {
    const button = createVisibleButton("Off-screen");
    button.getBoundingClientRect = () => ({
      x: 100,
      y: -200, // Far above viewport
      width: 100,
      height: 40,
      top: -200,
      left: 100,
      bottom: -160,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude off-screen elements (far below viewport)", () => {
    const button = createVisibleButton("Off-screen");
    button.getBoundingClientRect = () => ({
      x: 100,
      y: window.innerHeight + 200, // Far below viewport
      width: 100,
      height: 40,
      top: window.innerHeight + 200,
      left: 100,
      bottom: window.innerHeight + 240,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude off-screen elements (far left)", () => {
    const button = createVisibleButton("Off-screen");
    button.getBoundingClientRect = () => ({
      x: -200, // Far left of viewport
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: -200,
      bottom: 240,
      right: -100,
      toJSON: () => ({}),
    });
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude off-screen elements (far right)", () => {
    const button = createVisibleButton("Off-screen");
    button.getBoundingClientRect = () => ({
      x: window.innerWidth + 200, // Far right of viewport
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: window.innerWidth + 200,
      bottom: 240,
      right: window.innerWidth + 300,
      toJSON: () => ({}),
    });
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should include elements slightly off-screen (within 100px margin)", () => {
    const button = createVisibleButton("Partially visible");
    button.getBoundingClientRect = () => ({
      x: 100,
      y: -50, // 50px above viewport (within 100px margin)
      width: 100,
      height: 40,
      top: -50,
      left: 100,
      bottom: -10,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(true);
  });
});

// ============================================================================
// EXCLUSION TESTS
// ============================================================================

describe("candidateFinder - Element Exclusion", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should exclude elements with aria-hidden=true", () => {
    const button = createVisibleButton("Hidden");
    button.setAttribute("aria-hidden", "true");
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude disabled elements", () => {
    const button = createVisibleButton("Disabled");
    button.disabled = true;
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude elements with .hidden class", () => {
    const button = createVisibleButton("Hidden");
    button.className = "hidden";
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude elements with .invisible class", () => {
    const button = createVisibleButton("Invisible");
    button.className = "invisible";
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude elements inside SVG", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    svg.appendChild(rect);
    document.body.appendChild(svg);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    // SVG children should not be candidates
    expect(candidates.some((c) => c.element === rect)).toBe(false);
  });

  it("should exclude elements in loading spinner containers", () => {
    const container = document.createElement("div");
    container.className = "loading-spinner";
    const button = createVisibleButton("Loading");
    container.appendChild(button);
    document.body.appendChild(container);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });

  it("should exclude elements with data-testid=loading", () => {
    const container = document.createElement("div");
    container.setAttribute("data-testid", "loading");
    const button = createVisibleButton("Loading");
    container.appendChild(button);
    document.body.appendChild(container);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(false);
  });
});

// ============================================================================
// FIND CANDIDATES - MAIN ALGORITHM TESTS
// ============================================================================

describe("candidateFinder - findCandidates()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should find elements matching candidate selector", () => {
    const button = createVisibleButton("Submit");
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]!.element).toBe(button);
    expect(candidates[0]!.metadata).toBeDefined();
  });

  it("should find elements with same tag as original", () => {
    const div1 = document.createElement("div");
    div1.textContent = "Div 1";
    div1.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 100,
      bottom: 240,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(div1);

    const original = createMockContext("DIV");
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === div1)).toBe(true);
  });

  it("should deduplicate elements found by multiple selectors", () => {
    const button = createVisibleButton("Submit");
    button.setAttribute("role", "button");
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    // Button matches both BUTTON tag and role="button"
    // Should only appear once
    const buttonCount = candidates.filter((c) => c.element === button).length;
    expect(buttonCount).toBe(1);
  });

  it("should filter by max position distance", () => {
    const nearButton = createVisibleButton("Near");
    nearButton.getBoundingClientRect = () => ({
      x: 150,
      y: 250,
      width: 100,
      height: 40,
      top: 250,
      left: 150,
      bottom: 290,
      right: 250,
      toJSON: () => ({}),
    });

    const farButton = createVisibleButton("Far");
    farButton.getBoundingClientRect = () => ({
      x: 700, // 600px away horizontally
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 700,
      bottom: 240,
      right: 800,
      toJSON: () => ({}),
    });

    document.body.appendChild(nearButton);
    document.body.appendChild(farButton);

    const original = createMockContext("BUTTON", 100, 200);
    const candidates = findCandidates(original);

    // Near button should be included
    expect(candidates.some((c) => c.element === nearButton)).toBe(true);

    // Far button should be excluded (beyond maxPositionDistance)
    expect(candidates.some((c) => c.element === farButton)).toBe(false);
  });

  it("should sort candidates by distance from original", () => {
    const button1 = createVisibleButton("Button 1");
    button1.getBoundingClientRect = () => ({
      x: 200,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 200,
      bottom: 240,
      right: 300,
      toJSON: () => ({}),
    }); // 100px away

    const button2 = createVisibleButton("Button 2");
    button2.getBoundingClientRect = () => ({
      x: 150,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 150,
      bottom: 240,
      right: 250,
      toJSON: () => ({}),
    }); // 50px away

    const button3 = createVisibleButton("Button 3");
    button3.getBoundingClientRect = () => ({
      x: 300,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 300,
      bottom: 240,
      right: 400,
      toJSON: () => ({}),
    }); // 200px away

    document.body.appendChild(button1);
    document.body.appendChild(button2);
    document.body.appendChild(button3);

    const original = createMockContext("BUTTON", 100, 200);
    const candidates = findCandidates(original);

    // Should be sorted by distance: button2, button1, button3
    expect(candidates[0]!.element).toBe(button2);
    expect(candidates[1]!.element).toBe(button1);
    expect(candidates[2]!.element).toBe(button3);
  });

  it("should limit to max candidates", () => {
    // Create more buttons than maxCandidates
    const buttonsCount = CANDIDATE_CONFIG.maxCandidates + 10;

    for (let i = 0; i < buttonsCount; i++) {
      const button = createVisibleButton(`Button ${i}`);
      button.getBoundingClientRect = () => ({
        x: 100 + i * 10,
        y: 200,
        width: 100,
        height: 40,
        top: 200,
        left: 100 + i * 10,
        bottom: 240,
        right: 200 + i * 10,
        toJSON: () => ({}),
      });
      document.body.appendChild(button);
    }

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.length).toBeLessThanOrEqual(
      CANDIDATE_CONFIG.maxCandidates,
    );
  });

  it("should return empty array when no candidates found", () => {
    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates).toEqual([]);
  });
});

// ============================================================================
// FIND BY SELECTOR TESTS
// ============================================================================

describe("candidateFinder - findCandidatesBySelector()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should find elements by CSS selector", () => {
    const button = createVisibleButton("Submit");
    button.className = "submit-btn";
    document.body.appendChild(button);

    const candidates = findCandidatesBySelector(".submit-btn");

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(button);
  });

  it("should handle complex selectors", () => {
    const form = document.createElement("form");
    form.id = "checkout-form";
    const button = createVisibleButton("Submit");
    form.appendChild(button);
    document.body.appendChild(form);

    const candidates = findCandidatesBySelector("#checkout-form button");

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(button);
  });

  it("should exclude hidden elements", () => {
    const visible = createVisibleButton("Visible");
    visible.className = "btn";
    const hidden = createHiddenElement("display");
    hidden.className = "btn";

    document.body.appendChild(visible);
    document.body.appendChild(hidden);

    const candidates = findCandidatesBySelector(".btn");

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(visible);
  });

  it("should handle invalid selectors gracefully", () => {
    const candidates = findCandidatesBySelector("::invalid::selector");

    // Should return empty array, not throw
    expect(candidates).toEqual([]);
  });

  it("should return empty array when no matches", () => {
    const candidates = findCandidatesBySelector(".non-existent");

    expect(candidates).toEqual([]);
  });
});

// ============================================================================
// FIND BY TEXT TESTS
// ============================================================================

describe("candidateFinder - findCandidatesByText()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should find elements by exact text", () => {
    const button = createVisibleButton("Submit Order");
    document.body.appendChild(button);

    const candidates = findCandidatesByText("Submit Order", { exact: true });

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(button);
  });

  it("should find elements by partial text (case-insensitive)", () => {
    const button = createVisibleButton("Submit Order");
    document.body.appendChild(button);

    const candidates = findCandidatesByText("submit");

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(button);
  });

  it("should be case-insensitive by default", () => {
    const button = createVisibleButton("SUBMIT");
    document.body.appendChild(button);

    const candidates = findCandidatesByText("submit");

    expect(candidates.length).toBe(1);
  });

  it("should filter by tag name when specified", () => {
    const button = createVisibleButton("Submit");
    const div = document.createElement("div");
    div.textContent = "Submit";
    div.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 100,
      bottom: 240,
      right: 200,
      toJSON: () => ({}),
    });

    document.body.appendChild(button);
    document.body.appendChild(div);

    const candidates = findCandidatesByText("Submit", { tagName: "button" });

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(button);
  });

  it("should exclude hidden elements", () => {
    const visible = createVisibleButton("Submit");
    const hidden = createHiddenElement("display");
    hidden.textContent = "Submit";

    document.body.appendChild(visible);
    document.body.appendChild(hidden);

    const candidates = findCandidatesByText("Submit");

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(visible);
  });

  it("should handle text with special characters safely (no XPath injection)", () => {
    const button = createVisibleButton("Submit's Order");
    document.body.appendChild(button);

    // This should not cause XPath injection
    const candidates = findCandidatesByText("Submit's Order");

    expect(candidates.length).toBe(1);
    expect(candidates[0]!.element).toBe(button);
  });

  it("should handle quotes in text safely", () => {
    const button = createVisibleButton('Click "Here"');
    document.body.appendChild(button);

    const candidates = findCandidatesByText('Click "Here"');

    expect(candidates.length).toBe(1);
  });

  it("should return empty array when no matches", () => {
    const button = createVisibleButton("Submit");
    document.body.appendChild(button);

    const candidates = findCandidatesByText("Non-existent text");

    expect(candidates).toEqual([]);
  });

  it("should handle XPath search failure gracefully", () => {
    // Test with invalid characters that might break XPath
    const candidates = findCandidatesByText("test\x00invalid");

    // Should return empty array, not throw
    expect(candidates).toEqual([]);
  });
});

// ============================================================================
// FIND BY ROLE TESTS
// ============================================================================

describe("candidateFinder - findCandidatesByRole()", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should find elements by explicit ARIA role", () => {
    const div = document.createElement("div");
    div.setAttribute("role", "button");
    div.textContent = "Click me";
    div.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 100,
      bottom: 240,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(div);

    const candidates = findCandidatesByRole("button");

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => c.element === div)).toBe(true);
  });

  it("should find buttons by implicit role", () => {
    const button = createVisibleButton("Submit");
    document.body.appendChild(button);

    const candidates = findCandidatesByRole("button");

    expect(candidates.some((c) => c.element === button)).toBe(true);
  });

  it("should find submit inputs by button role", () => {
    const input = document.createElement("input");
    input.type = "submit";
    input.value = "Submit";
    input.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 100,
      bottom: 240,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(input);

    const candidates = findCandidatesByRole("button");

    expect(candidates.some((c) => c.element === input)).toBe(true);
  });

  it("should find links by implicit role", () => {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "Click";
    link.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 100,
      bottom: 240,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(link);

    const candidates = findCandidatesByRole("link");

    expect(candidates.some((c) => c.element === link)).toBe(true);
  });

  it("should find text inputs by textbox role", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      width: 100,
      height: 40,
      top: 200,
      left: 100,
      bottom: 240,
      right: 200,
      toJSON: () => ({}),
    });
    document.body.appendChild(input);

    const candidates = findCandidatesByRole("textbox");

    expect(candidates.some((c) => c.element === input)).toBe(true);
  });

  it("should find checkboxes by role", () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.getBoundingClientRect = () => ({
      x: 100,
      y: 200,
      width: 20,
      height: 20,
      top: 200,
      left: 100,
      bottom: 220,
      right: 120,
      toJSON: () => ({}),
    });
    document.body.appendChild(checkbox);

    const candidates = findCandidatesByRole("checkbox");

    expect(candidates.some((c) => c.element === checkbox)).toBe(true);
  });

  it("should deduplicate explicit and implicit role matches", () => {
    const button = createVisibleButton("Submit");
    button.setAttribute("role", "button"); // Redundant role
    document.body.appendChild(button);

    const candidates = findCandidatesByRole("button");

    const buttonCount = candidates.filter((c) => c.element === button).length;
    expect(buttonCount).toBe(1);
  });

  it("should exclude hidden elements", () => {
    const visible = createVisibleButton("Visible");
    const hidden = createHiddenElement("display");
    hidden.setAttribute("role", "button");

    document.body.appendChild(visible);
    document.body.appendChild(hidden);

    const candidates = findCandidatesByRole("button");

    expect(candidates.some((c) => c.element === visible)).toBe(true);
    expect(candidates.some((c) => c.element === hidden)).toBe(false);
  });

  it("should return empty array for unknown roles", () => {
    const candidates = findCandidatesByRole("non-existent-role");

    expect(candidates).toEqual([]);
  });
});

// ============================================================================
// METADATA EXTRACTION TESTS
// ============================================================================

describe("candidateFinder - Metadata Extraction", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should extract metadata for found candidates", () => {
    const button = createVisibleButton("Submit");
    button.id = "submit-btn";
    button.className = "btn btn-primary";
    document.body.appendChild(button);

    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates.length).toBeGreaterThan(0);
    const candidate = candidates[0]!;

    expect(candidate.metadata.tag_name).toBe("BUTTON");
    expect(candidate.metadata.text).toBe("Submit");
    expect(candidate.metadata.classes).toContain("btn");
    expect(candidate.metadata.classes).toContain("btn-primary");
    expect(candidate.metadata.bounding_box).toBeDefined();
    expect(candidate.metadata.bounding_box.width).toBe(100);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe("candidateFinder - Edge Cases", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("should handle empty document", () => {
    const original = createMockContext("BUTTON");
    const candidates = findCandidates(original);

    expect(candidates).toEqual([]);
  });

  it("should handle elements at viewport boundaries", () => {
    const button = createVisibleButton("Edge");
    button.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 100,
      toJSON: () => ({}),
    });
    document.body.appendChild(button);

    const original = createMockContext("BUTTON", 0, 0);
    const candidates = findCandidates(original);

    expect(candidates.some((c) => c.element === button)).toBe(true);
  });

  it("should handle very large documents efficiently", () => {
    // Create many elements
    for (let i = 0; i < 100; i++) {
      const div = document.createElement("div");
      div.textContent = `Div ${i}`;
      div.getBoundingClientRect = () => ({
        x: 100 + i,
        y: 200 + i,
        width: 100,
        height: 40,
        top: 200 + i,
        left: 100 + i,
        bottom: 240 + i,
        right: 200 + i,
        toJSON: () => ({}),
      });
      document.body.appendChild(div);
    }

    const original = createMockContext("DIV");

    const start = Date.now();
    const candidates = findCandidates(original);
    const duration = Date.now() - start;

    // Should complete quickly even with many elements
    expect(duration).toBeLessThan(100);
    expect(candidates.length).toBeLessThanOrEqual(
      CANDIDATE_CONFIG.maxCandidates,
    );
  });
});
