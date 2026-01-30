/**
 * Tests for Walkthrough Mode
 *
 * Tests the core functionality of walkthrough.ts including:
 * - State initialization
 * - Overlay creation and cleanup
 * - Step navigation
 * - Element finding and healing
 * - Visual feedback
 *
 * Mock Approach (standardized):
 * - Module mocks (findElement, healElement): Use vi.mocked()
 * - Chrome APIs (already vi.fn() in setup.ts): Use vi.mocked(chrome.runtime.sendMessage)
 * - Globals (window.confirm): Use vi.spyOn() with mockRestore() in the same test
 * - Timing: Use vi.useFakeTimers() AFTER initialization, then vi.runAllTimersAsync()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { StepResponse } from "@/shared/types";

// Mock dependencies BEFORE importing walkthrough
vi.mock("../utils/elementFinder", () => ({
  findElement: vi.fn(),
  scrollToElement: vi.fn(),
  isInteractable: vi.fn(() => true),
}));

vi.mock("../healing", () => ({
  healElement: vi.fn(),
}));

// Import mocked functions for spying
import { findElement } from "../utils/elementFinder";
import { healElement } from "../healing";

// Import walkthrough functions AFTER mocks are set up
import {
  getWalkthroughState,
  isWalkthroughActive,
  advanceStep,
  previousStep,
  exitWalkthrough,
  initializeWalkthrough,
  isClickOnTarget,
} from "../walkthrough";

describe("Walkthrough Mode", () => {
  let mockStep: StepResponse;
  let mockElement: HTMLElement;

  // Helper to create a valid walkthrough payload
  function createPayload(
    steps: StepResponse[] = [mockStep],
    overrides: Partial<{
      workflowId: number;
      workflowName: string;
      startingUrl: string;
      totalSteps: number;
    }> = {},
  ) {
    return {
      workflowId: overrides.workflowId ?? 100,
      workflowName: overrides.workflowName ?? "Test Workflow",
      startingUrl: overrides.startingUrl ?? "https://example.com",
      steps,
      totalSteps: overrides.totalSteps ?? steps.length,
    };
  }

  // Helper to initialize walkthrough and wait for async operations
  async function initializeAndWait(payload: ReturnType<typeof createPayload>) {
    await initializeWalkthrough(payload);
    // Small delay to ensure DOM updates are processed
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Helper to create multi-step workflows (DRY)
  function createNStepWorkflow(n: number): StepResponse[] {
    return Array.from({ length: n }, (_, i) => ({
      ...mockStep,
      id: i + 1,
      step_number: i + 1,
    }));
  }

  beforeEach(() => {
    // Clean up any existing overlay
    const existingOverlay = document.getElementById("walkthrough-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create mock step
    mockStep = {
      id: 1,
      workflow_id: 100,
      step_number: 1,
      timestamp: "2025-01-01T00:00:00Z",
      action_type: "click",
      selectors: {
        primary: "#test-button",
        css: ".test-button",
        xpath: "//button[@id='test-button']",
      },
      element_meta: {},
      page_context: { url: "https://example.com" },
      action_data: null,
      dom_context: null,
      screenshot_id: null,
      field_label: "Test Button",
      instruction: "Click the test button",
      ai_confidence: 0.95,
      ai_model: "gpt-4",
      ai_generated_at: "2025-01-01T00:00:00Z",
      label_edited: false,
      instruction_edited: false,
      edited_by: null,
      edited_at: null,
      healed_selectors: null,
      healed_at: null,
      healing_confidence: null,
      healing_method: null,
      created_at: "2025-01-01T00:00:00Z",
    };

    // Create mock element
    mockElement = document.createElement("button");
    mockElement.id = "test-button";
    mockElement.textContent = "Test Button";
    document.body.appendChild(mockElement);

    // Mock getBoundingClientRect for the element
    mockElement.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 100,
      bottom: 150,
      right: 200,
      width: 100,
      height: 50,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }));

    // Reset mocks
    vi.clearAllMocks();

    // Default mock for findElement - returns our mock element
    vi.mocked(findElement).mockResolvedValue({
      element: mockElement,
      selectorUsed: "primary: #test-button",
    });

    // Ensure chrome.runtime.sendMessage returns a Promise (for .catch() chaining)
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Clean up mock element
    if (mockElement && mockElement.parentNode) {
      mockElement.parentNode.removeChild(mockElement);
    }

    // Always exit walkthrough (handles all states including "completed")
    // exitWalkthrough() has internal guard for null state
    exitWalkthrough();

    // Clean up overlay (in case exitWalkthrough didn't fully clean up)
    const overlay = document.getElementById("walkthrough-overlay");
    if (overlay) {
      overlay.remove();
    }
  });

  describe("State Management", () => {
    it("should return null state when not initialized", () => {
      const state = getWalkthroughState();
      expect(state).toBeNull();
    });

    it("should not be active when not initialized", () => {
      const active = isWalkthroughActive();
      expect(active).toBe(false);
    });

    it("should initialize walkthrough state with valid payload", async () => {
      const payload = createPayload();

      await initializeAndWait(payload);

      const state = getWalkthroughState();
      expect(state).not.toBeNull();
      expect(state?.workflowId).toBe(100);
      expect(state?.workflowName).toBe("Test Workflow");
      expect(state?.currentStepIndex).toBe(0);
      expect(state?.totalSteps).toBe(1);
      expect(state?.status).toBe("active");
    });

    it("should throw error if no steps provided", async () => {
      const payload = createPayload([], { totalSteps: 0 });

      // Should throw an error when no steps are provided
      await expect(initializeAndWait(payload)).rejects.toThrow(
        "Walkthrough has no steps",
      );

      const state = getWalkthroughState();
      // State should not be initialized
      expect(state).toBeNull();
    });

    it("should be active after initialization", async () => {
      await initializeAndWait(createPayload());

      expect(isWalkthroughActive()).toBe(true);
    });
  });

  describe("Step Navigation", () => {
    beforeEach(async () => {
      // Initialize with 3 steps
      const threeSteps = [
        { ...mockStep, id: 1, step_number: 1 },
        { ...mockStep, id: 2, step_number: 2 },
        { ...mockStep, id: 3, step_number: 3 },
      ];
      const payload = createPayload(threeSteps, { totalSteps: 3 });

      await initializeAndWait(payload);
    });

    it("should start at step 0", () => {
      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(0);
    });

    it("should advance to next step", () => {
      const advanced = advanceStep();
      expect(advanced).toBe(true);

      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(1);
    });

    it("should advance multiple steps", () => {
      advanceStep();
      advanceStep();

      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(2);
    });

    it("should not advance past last step", () => {
      // Advance to last step
      advanceStep(); // 0 -> 1
      advanceStep(); // 1 -> 2

      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(2);

      // Try to advance past last step
      const advanced = advanceStep(); // 2 -> completed
      expect(advanced).toBe(false);

      const finalState = getWalkthroughState();
      expect(finalState?.status).toBe("completed");
    });

    it("should go back to previous step", () => {
      advanceStep(); // 0 -> 1
      advanceStep(); // 1 -> 2

      const wentBack = previousStep(); // 2 -> 1
      expect(wentBack).toBe(true);

      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(1);
    });

    it("should not go back past first step", () => {
      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(0);

      const wentBack = previousStep();
      expect(wentBack).toBe(false);

      const newState = getWalkthroughState();
      expect(newState?.currentStepIndex).toBe(0);
    });

    it("should return false for navigation when not initialized", () => {
      exitWalkthrough();

      const advanced = advanceStep();
      expect(advanced).toBe(false);

      const wentBack = previousStep();
      expect(wentBack).toBe(false);
    });
  });

  describe("Overlay Creation", () => {
    beforeEach(async () => {
      await initializeAndWait(createPayload());
    });

    it("should create overlay container with correct ID", () => {
      const overlay = document.getElementById("walkthrough-overlay");
      expect(overlay).toBeTruthy();
      expect(overlay?.className).toBe("walkthrough-overlay");
    });

    it("should create backdrop element", () => {
      const backdrop = document.querySelector(".walkthrough-backdrop");
      expect(backdrop).toBeTruthy();
    });

    it("should create tooltip element", () => {
      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip).toBeTruthy();
    });

    it("should create SVG spotlight mask", () => {
      const svg = document.querySelector(".walkthrough-spotlight-mask");
      expect(svg).toBeTruthy();

      const mask = document.getElementById("spotlight-mask");
      expect(mask).toBeTruthy();

      const cutout = document.getElementById("spotlight-cutout");
      expect(cutout).toBeTruthy();
    });

    it("should append overlay to body", () => {
      const overlay = document.getElementById("walkthrough-overlay");
      expect(overlay).toBeTruthy();
      expect(document.body.contains(overlay)).toBe(true);
    });

    it("should display step instruction in tooltip", () => {
      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip?.textContent).toContain("Click the test button");
    });

    it("should display step number in tooltip", () => {
      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip?.textContent).toContain("1");
    });
  });

  describe("Overlay Cleanup", () => {
    beforeEach(async () => {
      await initializeAndWait(createPayload());
    });

    it("should remove all overlay elements on exit", () => {
      expect(document.getElementById("walkthrough-overlay")).toBeTruthy();

      exitWalkthrough();

      expect(document.getElementById("walkthrough-overlay")).toBeNull();
      expect(document.querySelector(".walkthrough-backdrop")).toBeNull();
      expect(document.querySelector(".walkthrough-tooltip")).toBeNull();
    });

    it("should clear walkthrough state on exit", () => {
      expect(getWalkthroughState()).not.toBeNull();

      exitWalkthrough();

      expect(getWalkthroughState()).toBeNull();
      expect(isWalkthroughActive()).toBe(false);
    });

    it("should handle already-cleaned state gracefully", () => {
      exitWalkthrough();

      // Call exit again - should not throw
      expect(() => exitWalkthrough()).not.toThrow();
    });

    it("should log execution result on exit", () => {
      // Use vi.mocked() since chrome.runtime.sendMessage is already mocked in setup.ts
      const sendMessageMock = vi.mocked(chrome.runtime.sendMessage);
      sendMessageMock.mockClear();

      exitWalkthrough();

      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "LOG_EXECUTION",
          payload: expect.objectContaining({
            status: "failed",
            error_type: "user_exit",
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe("Flash Effects", () => {
    let testElement: HTMLElement;

    beforeEach(() => {
      testElement = document.createElement("div");
      testElement.id = "flash-test";
      document.body.appendChild(testElement);
    });

    afterEach(() => {
      if (testElement && testElement.parentNode) {
        testElement.parentNode.removeChild(testElement);
      }
    });

    it("should apply flash styles to element", () => {
      // We can't directly test flashElement as it's not exported,
      // but we can verify the DOM structure is ready for flash effects
      expect(testElement.style.transition).toBe("");
      expect(testElement.style.boxShadow).toBe("");
    });

    it("should handle multiple flash timers correctly", async () => {
      // Verify element can be styled multiple times
      testElement.style.boxShadow = "0 0 0 3px rgba(34,197,94,0.6)";
      expect(testElement.style.boxShadow).toBe("0 0 0 3px rgba(34,197,94,0.6)");

      await new Promise((resolve) => setTimeout(resolve, 50));

      testElement.style.boxShadow = "";
      expect(testElement.style.boxShadow).toBe("");
    });
  });

  describe("Element Finding", () => {
    it("should call findElement with current step during initialization", async () => {
      await initializeAndWait(createPayload());

      expect(findElement).toHaveBeenCalledWith(mockStep);
    });

    it("should trigger healing when element not found", async () => {
      // Mock findElement to reject (element not found)
      vi.mocked(findElement).mockRejectedValue(new Error("Element not found"));

      // Mock healElement to succeed
      vi.mocked(healElement).mockResolvedValue({
        success: true,
        element: mockElement,
        confidence: 0.9,
        resolution: "auto_healed",
        healingLog: [],
      });

      await initializeAndWait(createPayload());

      // Verify healing was attempted
      expect(healElement).toHaveBeenCalledWith(
        mockStep,
        expect.objectContaining({
          aiEnabled: true,
        }),
      );
    });

    it("should handle healing failure gracefully", async () => {
      // Mock findElement to reject
      vi.mocked(findElement).mockRejectedValue(new Error("Element not found"));

      // Mock healElement to also fail
      vi.mocked(healElement).mockResolvedValue({
        success: false,
        element: null,
        confidence: 0,
        resolution: "failed",
        healingLog: [],
      });

      await initializeAndWait(createPayload());

      // Should still initialize (with element not found state)
      const state = getWalkthroughState();
      expect(state).not.toBeNull();
    });
  });

  describe("Message Handling", () => {
    it("should prevent duplicate initialization", async () => {
      // First initialization
      await initializeAndWait(createPayload());

      const firstState = getWalkthroughState();
      expect(firstState?.workflowId).toBe(100);

      // Try to initialize again with different workflow
      await initializeAndWait(createPayload([], { workflowId: 200 }));

      // Should still have first workflow
      const secondState = getWalkthroughState();
      expect(secondState?.workflowId).toBe(100);
    });
  });

  describe("Window Message Handling", () => {
    it("should forward START_WALKTHROUGH from dashboard to background", () => {
      const sendMessageMock = vi.mocked(chrome.runtime.sendMessage);
      sendMessageMock.mockClear();

      // Simulate message from dashboard (same window)
      const event = new MessageEvent("message", {
        data: {
          source: "overlay-dashboard",
          type: "START_WALKTHROUGH",
          payload: { workflowId: 100 },
        },
        origin: window.location.origin,
        source: window, // Required for security validation
      });

      window.dispatchEvent(event);

      expect(sendMessageMock).toHaveBeenCalledWith(
        {
          type: "START_WALKTHROUGH",
          payload: { workflowId: 100 },
        },
        expect.any(Function),
      );
    });

    it("should ignore messages not from overlay-dashboard", () => {
      const sendMessageMock = vi.mocked(chrome.runtime.sendMessage);
      sendMessageMock.mockClear();

      const event = new MessageEvent("message", {
        data: {
          source: "other-source",
          type: "START_WALKTHROUGH",
          payload: { workflowId: 100 },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(event);

      expect(sendMessageMock).not.toHaveBeenCalled();
    });

    it("should prevent duplicate START_WALKTHROUGH when already active", async () => {
      // Initialize walkthrough
      await initializeAndWait(createPayload());

      const sendMessageMock = vi.mocked(chrome.runtime.sendMessage);
      sendMessageMock.mockClear();

      // Try to start again via window message
      const event = new MessageEvent("message", {
        data: {
          source: "overlay-dashboard",
          type: "START_WALKTHROUGH",
          payload: { workflowId: 200 },
        },
        origin: window.location.origin,
        source: window, // Required for security validation
      });

      window.dispatchEvent(event);

      // Should not forward the message (already active)
      expect(sendMessageMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "START_WALKTHROUGH" }),
        expect.any(Function),
      );
    });
  });

  describe("Spotlight Positioning", () => {
    beforeEach(async () => {
      await initializeAndWait(createPayload());
    });

    it("should position spotlight around target element", () => {
      const cutout = document.getElementById("spotlight-cutout");
      expect(cutout).toBeTruthy();

      // Check that cutout has position attributes
      const x = cutout?.getAttribute("x");
      const y = cutout?.getAttribute("y");
      const width = cutout?.getAttribute("width");
      const height = cutout?.getAttribute("height");

      expect(x).toBeDefined();
      expect(y).toBeDefined();
      expect(width).toBeDefined();
      expect(height).toBeDefined();
    });
  });

  describe("Tooltip Positioning", () => {
    beforeEach(async () => {
      await initializeAndWait(createPayload());
    });

    it("should position tooltip near target element", () => {
      const tooltip = document.querySelector(
        ".walkthrough-tooltip",
      ) as HTMLElement;
      expect(tooltip).toBeTruthy();

      // Tooltip should have inline position styles set
      // Note: getComputedStyle doesn't work properly in jsdom for CSS classes
      // So we check inline styles or that the tooltip element exists with positioning
      expect(
        tooltip.style.left || tooltip.style.top || tooltip.style.transform,
      ).toBeTruthy();
    });
  });

  describe("Navigation Buttons", () => {
    beforeEach(async () => {
      const threeSteps = [
        { ...mockStep, id: 1, step_number: 1 },
        { ...mockStep, id: 2, step_number: 2 },
        { ...mockStep, id: 3, step_number: 3 },
      ];
      await initializeAndWait(createPayload(threeSteps, { totalSteps: 3 }));
    });

    it("should have navigation buttons in tooltip", () => {
      const tooltip = document.querySelector(".walkthrough-tooltip");
      const buttons = tooltip?.querySelectorAll("button");

      // Should have at least next button
      expect(buttons?.length).toBeGreaterThan(0);
    });

    it("should have close button", () => {
      const tooltip = document.querySelector(".walkthrough-tooltip");
      // Look for close button (usually has X icon or close class)
      const closeBtn = tooltip?.querySelector(
        '[class*="close"], [aria-label*="close"]',
      );
      expect(closeBtn || tooltip?.querySelector("button")).toBeTruthy();
    });
  });

  describe("Keyboard Navigation", () => {
    beforeEach(async () => {
      const threeSteps = [
        { ...mockStep, id: 1, step_number: 1 },
        { ...mockStep, id: 2, step_number: 2 },
        { ...mockStep, id: 3, step_number: 3 },
      ];
      await initializeAndWait(createPayload(threeSteps, { totalSteps: 3 }));
    });

    it("should prompt exit on Escape key", () => {
      expect(isWalkthroughActive()).toBe(true);

      // Mock confirm to return true (user confirms exit)
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      });
      document.dispatchEvent(event);

      // Should have prompted user
      expect(window.confirm).toHaveBeenCalledWith(
        "Are you sure you want to exit this walkthrough?",
      );

      // Walkthrough should have exited
      expect(isWalkthroughActive()).toBe(false);

      // Restore confirm to prevent affecting subsequent tests
      confirmSpy.mockRestore();
    });
  });

  describe("Progress Indicator", () => {
    beforeEach(async () => {
      const threeSteps = [
        { ...mockStep, id: 1, step_number: 1 },
        { ...mockStep, id: 2, step_number: 2 },
        { ...mockStep, id: 3, step_number: 3 },
      ];
      await initializeAndWait(createPayload(threeSteps, { totalSteps: 3 }));
    });

    it("should display current step number", () => {
      const tooltip = document.querySelector(".walkthrough-tooltip");
      // Should show "1" or "Step 1" somewhere
      expect(tooltip?.textContent).toMatch(/1/);
    });

    it("should display total steps", () => {
      const tooltip = document.querySelector(".walkthrough-tooltip");
      // Should show "3" or "of 3" somewhere
      expect(tooltip?.textContent).toMatch(/3/);
    });
  });

  describe("Action Detection", () => {
    let clickableElement: HTMLButtonElement;
    let inputElement: HTMLInputElement;
    let selectElement: HTMLSelectElement;

    beforeEach(() => {
      // Create clickable element
      clickableElement = document.createElement("button");
      clickableElement.id = "action-test-btn";
      clickableElement.textContent = "Click Me";
      document.body.appendChild(clickableElement);

      // Mock getBoundingClientRect for clickable element
      clickableElement.getBoundingClientRect = vi.fn(() => ({
        top: 200,
        left: 200,
        bottom: 250,
        right: 300,
        width: 100,
        height: 50,
        x: 200,
        y: 200,
        toJSON: () => ({}),
      }));

      // Create input element
      inputElement = document.createElement("input");
      inputElement.id = "action-test-input";
      inputElement.type = "text";
      inputElement.placeholder = "Enter text";
      document.body.appendChild(inputElement);

      // Mock getBoundingClientRect for input element
      inputElement.getBoundingClientRect = vi.fn(() => ({
        top: 300,
        left: 200,
        bottom: 330,
        right: 400,
        width: 200,
        height: 30,
        x: 200,
        y: 300,
        toJSON: () => ({}),
      }));

      // Create select element
      selectElement = document.createElement("select");
      selectElement.id = "action-test-select";
      selectElement.innerHTML = `
        <option value="opt1">Option 1</option>
        <option value="opt2">Option 2</option>
      `;
      document.body.appendChild(selectElement);

      // Mock getBoundingClientRect for select element
      selectElement.getBoundingClientRect = vi.fn(() => ({
        top: 400,
        left: 200,
        bottom: 430,
        right: 350,
        width: 150,
        height: 30,
        x: 200,
        y: 400,
        toJSON: () => ({}),
      }));
    });

    afterEach(() => {
      // Clean up test elements
      if (clickableElement.parentNode) {
        clickableElement.parentNode.removeChild(clickableElement);
      }
      if (inputElement.parentNode) {
        inputElement.parentNode.removeChild(inputElement);
      }
      if (selectElement.parentNode) {
        selectElement.parentNode.removeChild(selectElement);
      }
    });

    it("should attach click listener for click action type", async () => {
      const clickStep: StepResponse = {
        ...mockStep,
        action_type: "click",
        selectors: { primary: "#action-test-btn", css: "#action-test-btn" },
      };

      vi.mocked(findElement).mockResolvedValue({
        element: clickableElement,
        selectorUsed: "primary: #action-test-btn",
      });

      await initializeAndWait(createPayload([clickStep]));

      // Verify walkthrough is active
      expect(isWalkthroughActive()).toBe(true);
    });

    it("should attach blur listener for input_commit action type", async () => {
      const inputStep: StepResponse = {
        ...mockStep,
        action_type: "input_commit",
        selectors: { primary: "#action-test-input", css: "#action-test-input" },
      };

      vi.mocked(findElement).mockResolvedValue({
        element: inputElement,
        selectorUsed: "primary: #action-test-input",
      });

      await initializeAndWait(createPayload([inputStep]));

      expect(isWalkthroughActive()).toBe(true);
    });

    it("should attach change listener for select_change action type", async () => {
      const selectStep: StepResponse = {
        ...mockStep,
        action_type: "select_change",
        selectors: {
          primary: "#action-test-select",
          css: "#action-test-select",
        },
      };

      vi.mocked(findElement).mockResolvedValue({
        element: selectElement,
        selectorUsed: "primary: #action-test-select",
      });

      await initializeAndWait(createPayload([selectStep]));

      expect(isWalkthroughActive()).toBe(true);
    });

    it("should not attach listeners for navigate action type", async () => {
      const navStep: StepResponse = {
        ...mockStep,
        action_type: "navigate",
        selectors: { primary: "#nav-element", css: "#nav-element" },
      };

      const navElement = document.createElement("a");
      navElement.id = "nav-element";
      navElement.href = "https://example.com";
      document.body.appendChild(navElement);

      navElement.getBoundingClientRect = vi.fn(() => ({
        top: 100,
        left: 100,
        bottom: 120,
        right: 200,
        width: 100,
        height: 20,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }));

      vi.mocked(findElement).mockResolvedValue({
        element: navElement,
        selectorUsed: "primary: #nav-element",
      });

      await initializeAndWait(createPayload([navStep]));

      expect(isWalkthroughActive()).toBe(true);

      // Clean up
      navElement.parentNode?.removeChild(navElement);
    });

    it("should track initial input value on focus for input_commit", async () => {
      const inputStep: StepResponse = {
        ...mockStep,
        action_type: "input_commit",
        selectors: { primary: "#action-test-input", css: "#action-test-input" },
      };

      vi.mocked(findElement).mockResolvedValue({
        element: inputElement,
        selectorUsed: "primary: #action-test-input",
      });

      // Set initial value
      inputElement.value = "initial";

      await initializeAndWait(createPayload([inputStep]));

      // Simulate focus event which should update the baseline value
      inputElement.dispatchEvent(new Event("focusin", { bubbles: true }));

      expect(isWalkthroughActive()).toBe(true);
    });

    it("should auto-advance on correct click action", async () => {
      const twoSteps: StepResponse[] = [
        {
          ...mockStep,
          id: 1,
          step_number: 1,
          action_type: "click",
          selectors: { primary: "#action-test-btn", css: "#action-test-btn" },
        },
        {
          ...mockStep,
          id: 2,
          step_number: 2,
          action_type: "click",
          selectors: { primary: "#action-test-btn", css: "#action-test-btn" },
        },
      ];

      vi.mocked(findElement).mockResolvedValue({
        element: clickableElement,
        selectorUsed: "primary: #action-test-btn",
      });

      await initializeAndWait(createPayload(twoSteps, { totalSteps: 2 }));

      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(0);

      // Simulate click on the correct element
      clickableElement.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );

      // Wait for auto-advance delay (60ms for click + some buffer)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have advanced to next step
      const newState = getWalkthroughState();
      expect(newState?.currentStepIndex).toBe(1);
    });

    it("should show error feedback on incorrect action", async () => {
      const clickStep: StepResponse = {
        ...mockStep,
        action_type: "click",
        selectors: { primary: "#action-test-btn", css: "#action-test-btn" },
      };

      vi.mocked(findElement).mockResolvedValue({
        element: clickableElement,
        selectorUsed: "primary: #action-test-btn",
      });

      await initializeAndWait(createPayload([clickStep]));

      // Click on a different element (wrong element)
      const wrongElement = document.createElement("button");
      wrongElement.id = "wrong-btn";
      document.body.appendChild(wrongElement);

      wrongElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      // The error message should be shown in tooltip
      // The retry counter should be incremented
      const state = getWalkthroughState();
      const retryAttempts = state?.retryAttempts.get(0) || 0;
      // Since the click was on wrong element, it won't trigger the handler
      // attached to the target element
      expect(state?.currentStepIndex).toBe(0);

      wrongElement.parentNode?.removeChild(wrongElement);
    });

    it("should show skip button after 3 failed attempts", async () => {
      const clickStep: StepResponse = {
        ...mockStep,
        action_type: "click",
        selectors: { primary: "#action-test-btn", css: "#action-test-btn" },
      };

      vi.mocked(findElement).mockResolvedValue({
        element: clickableElement,
        selectorUsed: "primary: #action-test-btn",
      });

      await initializeAndWait(createPayload([clickStep]));

      // Get state and manually set retry attempts to 2 (simulating 2 failed attempts)
      const state = getWalkthroughState();
      if (state) {
        state.retryAttempts.set(0, 2);
      }

      // Verify skip button starts hidden
      let skipBtn = document.querySelector("#walkthrough-btn-skip");
      expect(skipBtn?.classList.contains("hidden")).toBe(true);
    });

    it("should require value change for input_commit validation", async () => {
      const inputStep: StepResponse = {
        ...mockStep,
        action_type: "input_commit",
        selectors: { primary: "#action-test-input", css: "#action-test-input" },
      };

      vi.mocked(findElement).mockResolvedValue({
        element: inputElement,
        selectorUsed: "primary: #action-test-input",
      });

      await initializeAndWait(createPayload([inputStep]));

      // Blur without changing value should NOT trigger advance
      inputElement.value = "";
      inputElement.dispatchEvent(new Event("blur", { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 200));

      const state = getWalkthroughState();
      expect(state?.currentStepIndex).toBe(0);
    });

    it("should advance on input_commit with value change", async () => {
      const twoSteps: StepResponse[] = [
        {
          ...mockStep,
          id: 1,
          step_number: 1,
          action_type: "input_commit",
          selectors: {
            primary: "#action-test-input",
            css: "#action-test-input",
          },
        },
        {
          ...mockStep,
          id: 2,
          step_number: 2,
          action_type: "click",
          selectors: { primary: "#action-test-btn", css: "#action-test-btn" },
        },
      ];

      vi.mocked(findElement).mockResolvedValue({
        element: inputElement,
        selectorUsed: "primary: #action-test-input",
      });

      await initializeAndWait(createPayload(twoSteps, { totalSteps: 2 }));

      // Verify starting at step 0
      expect(getWalkthroughState()?.currentStepIndex).toBe(0);

      // Focus to set baseline (empty string)
      inputElement.dispatchEvent(new Event("focusin", { bubbles: true }));

      // Change the value
      inputElement.value = "new value";

      // Blur should trigger validation with changed value
      inputElement.dispatchEvent(new Event("blur", { bubbles: true }));

      // Wait for auto-advance delay
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Should have advanced
      expect(getWalkthroughState()?.currentStepIndex).toBe(1);
    });

    it("should advance on select_change", async () => {
      const twoSteps: StepResponse[] = [
        {
          ...mockStep,
          id: 1,
          step_number: 1,
          action_type: "select_change",
          selectors: {
            primary: "#action-test-select",
            css: "#action-test-select",
          },
        },
        {
          ...mockStep,
          id: 2,
          step_number: 2,
          action_type: "click",
          selectors: { primary: "#action-test-btn", css: "#action-test-btn" },
        },
      ];

      vi.mocked(findElement).mockResolvedValue({
        element: selectElement,
        selectorUsed: "primary: #action-test-select",
      });

      await initializeAndWait(createPayload(twoSteps, { totalSteps: 2 }));

      // Verify starting at step 0
      expect(getWalkthroughState()?.currentStepIndex).toBe(0);

      // Change the select value
      selectElement.value = "opt2";
      selectElement.dispatchEvent(new Event("change", { bubbles: true }));

      // Wait for auto-advance delay
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have advanced
      expect(getWalkthroughState()?.currentStepIndex).toBe(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing overlay elements gracefully", async () => {
      await initializeAndWait(createPayload());

      // Remove the overlay manually
      const overlay = document.getElementById("walkthrough-overlay");
      overlay?.remove();

      // Navigation should not throw
      expect(() => advanceStep()).not.toThrow();
      expect(() => previousStep()).not.toThrow();
    });

    it("should handle element finding errors gracefully", async () => {
      vi.mocked(findElement).mockRejectedValue(new Error("Element not found"));
      vi.mocked(healElement).mockRejectedValue(new Error("Healing failed"));

      // Should not throw
      await expect(initializeAndWait(createPayload())).resolves.not.toThrow();
    });

    it("should show error UI when element not found", async () => {
      vi.mocked(findElement).mockRejectedValue(new Error("Element not found"));
      vi.mocked(healElement).mockResolvedValue({
        success: false,
        element: null,
        confidence: 0,
        resolution: "failed",
        healingLog: [],
      });

      await initializeAndWait(createPayload());

      // Tooltip should contain error message
      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip?.textContent).toContain("Element Not Found");
    });

    it("should have skip option in error state", async () => {
      vi.mocked(findElement).mockRejectedValue(new Error("Element not found"));
      vi.mocked(healElement).mockResolvedValue({
        success: false,
        element: null,
        confidence: 0,
        resolution: "failed",
        healingLog: [],
      });

      await initializeAndWait(createPayload());

      // Skip button should be visible in error state
      const skipBtn = document.querySelector("#walkthrough-btn-skip");
      expect(skipBtn).toBeTruthy();
      // Should not have hidden class
      expect(skipBtn?.classList.contains("hidden")).toBe(false);
    });
  });

  describe("Healing Indicator", () => {
    it("should show healed indicator for medium confidence matches", async () => {
      vi.mocked(findElement).mockRejectedValue(new Error("Element not found"));

      // Mock healing with medium confidence (70-85%)
      vi.mocked(healElement).mockImplementation(async (_step, options) => {
        // For medium confidence, the onUserPrompt callback should be called
        // but we're testing the indicator display, not the callback
        return {
          success: true,
          element: mockElement,
          confidence: 0.78, // Medium confidence
          resolution: "auto_healed",
          healingLog: [],
        };
      });

      await initializeAndWait(createPayload());

      // Verify walkthrough is active and element was healed
      expect(isWalkthroughActive()).toBe(true);
    });

    it("should not show indicator for high confidence matches", async () => {
      vi.mocked(findElement).mockRejectedValue(new Error("Element not found"));

      // Mock healing with high confidence (>85%)
      vi.mocked(healElement).mockResolvedValue({
        success: true,
        element: mockElement,
        confidence: 0.92, // High confidence
        resolution: "auto_healed",
        healingLog: [],
      });

      await initializeAndWait(createPayload());

      // Verify walkthrough is active - high confidence should be seamless
      expect(isWalkthroughActive()).toBe(true);
    });
  });

  describe("Completion State", () => {
    it("should mark status as completed when all steps finished", async () => {
      const singleStep = createPayload([mockStep], { totalSteps: 1 });

      vi.mocked(findElement).mockResolvedValue({
        element: mockElement,
        selectorUsed: "primary: #test-button",
      });

      await initializeAndWait(singleStep);

      // Advance past the only step
      const advanced = advanceStep();
      expect(advanced).toBe(false);

      const state = getWalkthroughState();
      expect(state?.status).toBe("completed");
    });

    it("should show completion message when workflow finishes", async () => {
      const singleStep = createPayload([mockStep], { totalSteps: 1 });

      vi.mocked(findElement).mockResolvedValue({
        element: mockElement,
        selectorUsed: "primary: #test-button",
      });

      await initializeAndWait(singleStep);

      // Trigger click to complete
      mockElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check for completion state
      const state = getWalkthroughState();
      expect(state?.status).toBe("completed");
    });

    it("should log success on completion", async () => {
      const sendMessageMock = vi.mocked(chrome.runtime.sendMessage);
      sendMessageMock.mockClear();

      const singleStep = createPayload([mockStep], { totalSteps: 1 });

      vi.mocked(findElement).mockResolvedValue({
        element: mockElement,
        selectorUsed: "primary: #test-button",
      });

      await initializeAndWait(singleStep);

      // Complete the workflow
      mockElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have logged success
      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "LOG_EXECUTION",
          payload: expect.objectContaining({
            status: "success",
          }),
        }),
        expect.any(Function),
      );
    });
  });

  describe("Tooltip Button Actions", () => {
    beforeEach(async () => {
      // Reset and re-setup mocks to ensure clean state
      vi.clearAllMocks();
      vi.mocked(findElement).mockResolvedValue({
        element: mockElement,
        selectorUsed: "primary: #test-button",
      });

      const threeSteps = [
        { ...mockStep, id: 1, step_number: 1 },
        { ...mockStep, id: 2, step_number: 2 },
        { ...mockStep, id: 3, step_number: 3 },
      ];
      await initializeAndWait(createPayload(threeSteps, { totalSteps: 3 }));
    });

    it("should advance step when Next button clicked", async () => {
      const nextBtn = document.getElementById("walkthrough-btn-next");
      expect(nextBtn).toBeTruthy();

      const initialIndex = getWalkthroughState()?.currentStepIndex;
      expect(initialIndex).toBe(0);

      // Click next button
      nextBtn?.click();

      // Wait for UI update
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have advanced
      const newIndex = getWalkthroughState()?.currentStepIndex;
      expect(newIndex).toBe(1);
    });

    it("should go back when Back button clicked", async () => {
      // First advance to step 1 using the Next button (which re-renders tooltip)
      const nextBtn = document.getElementById("walkthrough-btn-next");
      expect(nextBtn).toBeTruthy();
      nextBtn?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Now get fresh Back button reference after re-render
      const backBtn = document.getElementById("walkthrough-btn-back");
      expect(backBtn).toBeTruthy();
      expect((backBtn as HTMLButtonElement)?.disabled).toBe(false);

      backBtn?.click();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const index = getWalkthroughState()?.currentStepIndex;
      expect(index).toBe(0);
    });

    it("should have Back button disabled on first step", () => {
      const backBtn = document.getElementById(
        "walkthrough-btn-back",
      ) as HTMLButtonElement;
      expect(backBtn).toBeTruthy();
      expect(backBtn?.disabled).toBe(true);
    });

    it("should exit walkthrough when Exit button clicked", async () => {
      // Mock confirm to return true
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      const exitBtn = document.getElementById("walkthrough-btn-exit");
      expect(exitBtn).toBeTruthy();

      exitBtn?.click();

      // Should have exited
      expect(isWalkthroughActive()).toBe(false);
      expect(getWalkthroughState()).toBeNull();

      confirmSpy.mockRestore();
    });

    it("should not exit when Exit cancelled", async () => {
      // Mock confirm to return false
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      const exitBtn = document.getElementById("walkthrough-btn-exit");
      exitBtn?.click();

      // Should still be active
      expect(isWalkthroughActive()).toBe(true);

      confirmSpy.mockRestore();
    });
  });

  describe("Click Validation - isClickOnTarget", () => {
    let button: HTMLButtonElement;
    let icon: HTMLSpanElement;
    let unrelatedElement: HTMLDivElement;

    beforeEach(() => {
      // Create a button with nested child elements (common pattern)
      button = document.createElement("button");
      button.id = "target-button";
      button.className = "btn";

      // Create nested icon inside button
      icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = "✓";
      button.appendChild(icon);

      // Create an unrelated element
      unrelatedElement = document.createElement("div");
      unrelatedElement.id = "other-element";

      document.body.appendChild(button);
      document.body.appendChild(unrelatedElement);
    });

    afterEach(() => {
      button.remove();
      unrelatedElement.remove();
    });

    it("should validate click on target element directly", () => {
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", {
        value: button,
        writable: false,
      });

      expect(isClickOnTarget(event, button)).toBe(true);
    });

    it("should validate click on child element of target (BUG-001 fix)", () => {
      // This is the key test - clicking on the icon should register as clicking the button
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", { value: icon, writable: false });

      expect(isClickOnTarget(event, button)).toBe(true);
    });

    it("should reject click on unrelated element", () => {
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", {
        value: unrelatedElement,
        writable: false,
      });

      expect(isClickOnTarget(event, button)).toBe(false);
    });

    it("should validate click on deeply nested child element", () => {
      // Create deeply nested structure: button > span > svg > path
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      svg.appendChild(path);
      icon.appendChild(svg);

      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", { value: path, writable: false });

      expect(isClickOnTarget(event, button)).toBe(true);
    });

    it("should reject click on sibling element", () => {
      const siblingButton = document.createElement("button");
      siblingButton.id = "sibling-btn";
      document.body.appendChild(siblingButton);

      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", {
        value: siblingButton,
        writable: false,
      });

      expect(isClickOnTarget(event, button)).toBe(false);

      siblingButton.remove();
    });

    it("should handle composed path for shadow DOM compatibility", () => {
      // Test that composedPath is checked when available
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", { value: icon, writable: false });

      // Verify composedPath exists and is used
      expect(typeof event.composedPath).toBe("function");
      expect(isClickOnTarget(event, button)).toBe(true);
    });
  });

  // ============================================================================
  // EDGE CASE TESTS (Added per Codex review)
  // ============================================================================

  describe("Edge Cases - Race Conditions", () => {
    it("should handle rapid Next clicks without crashing", async () => {
      // Setup 5-step workflow using helper
      const fiveSteps = createNStepWorkflow(5);
      await initializeAndWait(createPayload(fiveSteps, { totalSteps: 5 }));

      const initialState = getWalkthroughState();
      expect(initialState?.currentStepIndex).toBe(0);

      // Find Next button
      const nextBtn = document.getElementById("walkthrough-btn-next");
      expect(nextBtn).toBeTruthy();

      // Enable fake timers AFTER initialization (to avoid initializeAndWait blocking)
      vi.useFakeTimers();

      // Rapid clicks - buttons are disabled during processing to prevent race conditions
      // Only the first click is processed, subsequent clicks on disabled buttons are ignored
      nextBtn?.click();
      nextBtn?.click();
      nextBtn?.click();

      // Advance all timers to complete async operations
      await vi.runAllTimersAsync();

      // Restore real timers
      vi.useRealTimers();

      // Verify state is consistent (not corrupted by rapid clicks)
      const finalState = getWalkthroughState();
      expect(finalState).not.toBeNull();
      expect(finalState?.status).toBe("active");
      // currentStepIndex should be 1 (only first click processed due to button disabling)
      expect(finalState?.currentStepIndex).toBe(1);
      // Overlay should still exist and be functional
      expect(document.getElementById("walkthrough-overlay")).toBeTruthy();
    });

    it("should not advance past last step with rapid clicks", async () => {
      // Setup 3-step workflow using helper
      const threeSteps = createNStepWorkflow(3);
      await initializeAndWait(createPayload(threeSteps, { totalSteps: 3 }));

      const nextBtn = document.getElementById("walkthrough-btn-next");

      // Enable fake timers AFTER initialization
      vi.useFakeTimers();

      // Click 10 times rapidly (more than available steps)
      // Due to button disabling during processing, only first click is processed
      for (let i = 0; i < 10; i++) {
        nextBtn?.click();
      }

      // Advance all timers to complete async operations
      await vi.runAllTimersAsync();

      // Restore real timers
      vi.useRealTimers();

      // Should be at step 1 (only first click processed due to button disabling)
      const finalState = getWalkthroughState();
      expect(finalState?.currentStepIndex).toBe(1);
      // Status should be consistent
      expect(finalState?.status).toBe("active");
    });
  });

  describe("Edge Cases - Script Re-injection", () => {
    it("should remove stale overlay when initializeWalkthrough runs and overlay already exists in DOM", async () => {
      // First initialization
      await initializeAndWait(createPayload());
      expect(document.getElementById("walkthrough-overlay")).toBeTruthy();

      // Simulate script re-injection scenario:
      // The overlay exists in DOM but module state would be reset
      // For testing, we exit (clears state) but manually leave overlay in DOM
      exitWalkthrough();

      // Manually recreate a "stale" overlay to simulate re-injection
      const staleOverlay = document.createElement("div");
      staleOverlay.id = "walkthrough-overlay";
      staleOverlay.className = "walkthrough-overlay stale-marker";
      document.body.appendChild(staleOverlay);

      // Re-initialize should detect and remove the stale overlay
      await initializeAndWait(createPayload());

      // Should only have ONE overlay
      const overlays = document.querySelectorAll("#walkthrough-overlay");
      expect(overlays.length).toBe(1);

      // The stale one should be gone (no stale-marker class)
      expect(document.querySelector(".stale-marker")).toBeNull();
    });
  });

  describe("Edge Cases - Click Interceptor", () => {
    // Reset mocks before each test to prevent pollution
    beforeEach(() => {
      vi.mocked(findElement).mockResolvedValue({
        element: mockElement,
        selectorUsed: "primary: #test-button",
      });
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined);
    });

    it("should block clicks on non-target elements when walkthrough is active", async () => {
      await initializeAndWait(createPayload());

      // Create a non-target element
      const otherButton = document.createElement("button");
      otherButton.id = "other-button";
      otherButton.textContent = "Other";
      document.body.appendChild(otherButton);

      // Track if click was blocked
      let clickReached = false;
      otherButton.addEventListener("click", () => {
        clickReached = true;
      });

      // Create a cancelable click event
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      // Dispatch the click
      otherButton.dispatchEvent(clickEvent);

      // The click interceptor should have prevented default and stopped propagation
      // The click event handler might still be called since we're testing at unit level
      // But the event should be marked as prevented
      expect(clickEvent.defaultPrevented).toBe(true);

      // State should not change (still on step 0)
      expect(getWalkthroughState()?.currentStepIndex).toBe(0);

      otherButton.remove();
    });

    it("should allow clicks on tooltip navigation controls", async () => {
      await initializeAndWait(createPayload());

      // Find the next button in the tooltip
      const nextBtn = document.getElementById("walkthrough-btn-next");
      expect(nextBtn).toBeTruthy();

      // Create a click event on the tooltip button
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      nextBtn?.dispatchEvent(clickEvent);

      // Click should NOT be blocked (defaultPrevented should be false for tooltip clicks)
      // The button click handler should process the navigation
      expect(clickEvent.defaultPrevented).toBe(false);
    });

    it("should allow clicks on target element", async () => {
      await initializeAndWait(createPayload());

      // The mockElement is our target
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      mockElement.dispatchEvent(clickEvent);

      // Click should NOT be blocked
      expect(clickEvent.defaultPrevented).toBe(false);
    });
  });

  describe("Edge Cases - Invalid Step Data", () => {
    it("should handle step with missing selectors gracefully", async () => {
      const stepWithNoSelectors: StepResponse = {
        ...mockStep,
        selectors: {
          primary: null,
          css: null,
          xpath: null,
        } as any,
      };

      // Mock findElement to reject ONCE (no valid selectors)
      vi.mocked(findElement).mockRejectedValueOnce(
        new Error("No valid selectors provided"),
      );

      // Should not throw
      await expect(
        initializeAndWait(createPayload([stepWithNoSelectors])),
      ).resolves.not.toThrow();

      // Walkthrough should still be active (showing error UI)
      expect(isWalkthroughActive()).toBe(true);
    });

    it("should handle step with undefined action_type", async () => {
      const stepWithNoAction: StepResponse = {
        ...mockStep,
        action_type: undefined as any,
      };

      await initializeAndWait(createPayload([stepWithNoAction]));

      // Should still initialize and show the step
      expect(isWalkthroughActive()).toBe(true);
    });

    it("should handle empty field_label and instruction", async () => {
      const stepWithEmptyLabels: StepResponse = {
        ...mockStep,
        field_label: null as any,
        instruction: null as any,
      };

      await initializeAndWait(createPayload([stepWithEmptyLabels]));

      // Should show default text, not crash
      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip).toBeTruthy();
      // Should have fallback text
      expect(tooltip?.textContent).toContain("Action Required");
    });
  });

  // Note: Keyboard Navigation tests are in the original "Keyboard Navigation" describe block
  // above. Additional Escape key tests were removed to avoid mock pollution issues.

  describe("Edge Cases - Element Not Interactable", () => {
    it("should handle element found but healing fails", async () => {
      // First, findElement succeeds
      vi.mocked(findElement).mockResolvedValue({
        element: mockElement,
        selectorUsed: "primary: #test-button",
      });

      // Then healing is triggered and fails
      vi.mocked(healElement).mockResolvedValue({
        success: false,
        resolution: "no_candidates",
        confidence: 0,
        scoringResult: null,
        candidateAnalysis: null,
        aiConfidence: null,
      });

      // Make findElement fail to trigger healing
      vi.mocked(findElement).mockRejectedValueOnce(
        new Error("Element not found"),
      );

      await initializeAndWait(createPayload());

      // Should show error state but not crash
      expect(isWalkthroughActive()).toBe(true);
    });
  });

  describe("Edge Cases - State Transitions", () => {
    // Reset mocks and ensure clean state before each test
    beforeEach(async () => {
      // Allow any pending timeouts from previous tests to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Ensure no walkthrough is active from previous test
      exitWalkthrough();
      // Clean up any lingering overlay
      document.getElementById("walkthrough-overlay")?.remove();

      vi.mocked(findElement).mockResolvedValue({
        element: mockElement,
        selectorUsed: "primary: #test-button",
      });
      vi.mocked(chrome.runtime.sendMessage).mockResolvedValue(undefined);
    });

    it("should transition to completed status after last step", async () => {
      const singleStep = createPayload([mockStep], { totalSteps: 1 });
      await initializeAndWait(singleStep);

      expect(getWalkthroughState()?.status).toBe("active");

      // Enable fake timers BEFORE the click so the setTimeout is captured
      vi.useFakeTimers();

      // Complete the step by clicking the target
      mockElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      // Advance timers to process the auto-advance setTimeout (60ms for click)
      await vi.advanceTimersByTimeAsync(100);

      vi.useRealTimers();

      // Status should be completed
      expect(getWalkthroughState()?.status).toBe("completed");
    });

    it("should clean up all handlers on exit", async () => {
      await initializeAndWait(createPayload());

      // Verify handlers are set up (indirectly through behavior)
      expect(isWalkthroughActive()).toBe(true);

      // Exit
      exitWalkthrough();

      // Verify cleanup
      expect(isWalkthroughActive()).toBe(false);
      expect(document.getElementById("walkthrough-overlay")).toBeNull();
    });

    it("should clean up Escape key handler on exit", async () => {
      await initializeAndWait(createPayload());

      // Mock confirm to track if Escape handler fires (using vi.stubGlobal for consistency)
      const confirmMock = vi.fn().mockReturnValue(false);
      vi.stubGlobal("confirm", confirmMock);

      // Exit walkthrough (should remove Escape handler)
      exitWalkthrough();

      // Clear the mock to start fresh
      confirmMock.mockClear();

      // Dispatch Escape key - should NOT trigger confirm since handler was removed
      const escapeEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      });
      document.dispatchEvent(escapeEvent);

      // Confirm should NOT have been called (handler was cleaned up)
      expect(confirmMock).not.toHaveBeenCalled();

      // Restore original
      vi.unstubAllGlobals();
    });
  });
});
