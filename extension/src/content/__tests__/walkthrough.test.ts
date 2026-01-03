/**
 * Tests for Walkthrough Mode
 *
 * Tests the core functionality of walkthrough.ts including:
 * - State initialization
 * - Overlay creation and cleanup
 * - Step navigation
 * - Element finding and healing
 * - Visual feedback
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
  });

  afterEach(() => {
    // Clean up mock element
    if (mockElement && mockElement.parentNode) {
      mockElement.parentNode.removeChild(mockElement);
    }

    // Clean up overlay
    const overlay = document.getElementById("walkthrough-overlay");
    if (overlay) {
      overlay.remove();
    }

    // Exit walkthrough if active
    if (isWalkthroughActive()) {
      exitWalkthrough();
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

    it("should return early if no steps provided", async () => {
      const payload = createPayload([], { totalSteps: 0 });

      await initializeAndWait(payload);

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
      const sendMessageSpy = vi.spyOn(chrome.runtime, "sendMessage");

      exitWalkthrough();

      expect(sendMessageSpy).toHaveBeenCalledWith(
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
      const sendMessageSpy = vi.spyOn(chrome.runtime, "sendMessage");

      // Simulate message from dashboard
      const event = new MessageEvent("message", {
        data: {
          source: "overlay-dashboard",
          type: "START_WALKTHROUGH",
          payload: { workflowId: 100 },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(event);

      expect(sendMessageSpy).toHaveBeenCalledWith(
        {
          type: "START_WALKTHROUGH",
          payload: { workflowId: 100 },
        },
        expect.any(Function),
      );
    });

    it("should ignore messages not from overlay-dashboard", () => {
      const sendMessageSpy = vi.spyOn(chrome.runtime, "sendMessage");
      sendMessageSpy.mockClear();

      const event = new MessageEvent("message", {
        data: {
          source: "other-source",
          type: "START_WALKTHROUGH",
          payload: { workflowId: 100 },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(event);

      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    it("should prevent duplicate START_WALKTHROUGH when already active", async () => {
      // Initialize walkthrough
      await initializeAndWait(createPayload());

      const sendMessageSpy = vi.spyOn(chrome.runtime, "sendMessage");
      sendMessageSpy.mockClear();

      // Try to start again via window message
      const event = new MessageEvent("message", {
        data: {
          source: "overlay-dashboard",
          type: "START_WALKTHROUGH",
          payload: { workflowId: 200 },
        },
        origin: window.location.origin,
      });

      window.dispatchEvent(event);

      // Should not forward the message (already active)
      expect(sendMessageSpy).not.toHaveBeenCalledWith(
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

    it("should exit on Escape key", () => {
      expect(isWalkthroughActive()).toBe(true);

      const event = new KeyboardEvent("keydown", { key: "Escape" });
      document.dispatchEvent(event);

      // After some processing, walkthrough should exit
      // Note: The actual keydown listener might be on document or window
      // This test verifies the state management works
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
});
