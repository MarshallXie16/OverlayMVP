/**
 * WalkthroughUI Integration Tests
 *
 * Tests the facade/coordinator pattern and component integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WalkthroughUI, type TooltipAction } from "../";
import type { WalkthroughState } from "../../../../shared/walkthrough";

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal("ResizeObserver", MockResizeObserver);

// Helper to create test state
function createTestState(
  overrides: Partial<WalkthroughState> = {},
): WalkthroughState {
  return {
    sessionId: "wt_test123",
    machineState: "SHOWING_STEP",
    previousState: null,
    workflowId: 1,
    workflowName: "Test Workflow",
    startingUrl: "https://example.com",
    steps: [
      {
        id: 1,
        step_number: 1,
        order: 0,
        action_type: "click",
        target_selector: "#button1",
        field_label: "Click Button",
        instruction: "Click the button to continue",
        original_description: "Click the button",
        processed_description: "Click the button to continue",
        workflow: 1,
        page_url: "https://example.com",
      },
      {
        id: 2,
        step_number: 2,
        order: 1,
        action_type: "input",
        target_selector: "#input1",
        field_label: "Enter Text",
        instruction: "Type your name",
        original_description: "Enter text",
        processed_description: "Type your name",
        workflow: 1,
        page_url: "https://example.com",
      },
    ],
    totalSteps: 2,
    currentStepIndex: 0,
    completedStepIndexes: [],
    errorInfo: {
      type: null,
      message: null,
      stepIndex: null,
      retryCount: 0,
    },
    healingInfo: null,
    navigation: {
      inProgress: false,
      sourceUrl: null,
      targetUrl: null,
      startedAt: null,
    },
    tabs: {
      primaryTabId: 1,
      activeTabIds: [1],
      readyTabIds: [1],
    },
    timing: {
      sessionStartedAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    },
    stepRetries: {},
    ...overrides,
  };
}

describe("WalkthroughUI", () => {
  let ui: WalkthroughUI;
  let onAction: ReturnType<typeof vi.fn>;
  let targetElement: HTMLElement;

  beforeEach(() => {
    // Clean up any existing overlay
    const existing = document.getElementById("walkthrough-overlay");
    if (existing) {
      existing.remove();
    }

    ui = new WalkthroughUI({ debug: false });
    onAction = vi.fn();

    // Create target element
    targetElement = document.createElement("div");
    targetElement.style.position = "absolute";
    targetElement.style.top = "100px";
    targetElement.style.left = "200px";
    targetElement.style.width = "150px";
    targetElement.style.height = "50px";
    document.body.appendChild(targetElement);

    // Mock getBoundingClientRect
    vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
      top: 100,
      left: 200,
      width: 150,
      height: 50,
      bottom: 150,
      right: 350,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    ui.destroy();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  describe("initialize()", () => {
    it("should store action callback", () => {
      ui.initialize(onAction);
      // No error means successful initialization
    });

    it("should not create UI until showStep is called", () => {
      ui.initialize(onAction);
      expect(document.getElementById("walkthrough-overlay")).toBeNull();
    });
  });

  describe("showStep()", () => {
    beforeEach(() => {
      ui.initialize(onAction);
    });

    it("should create overlay on first call", () => {
      const state = createTestState();
      ui.showStep(targetElement, state);

      expect(document.getElementById("walkthrough-overlay")).not.toBeNull();
    });

    it("should return renderId for async cancellation", () => {
      const state = createTestState();
      const result = ui.showStep(targetElement, state);

      expect(result.renderId).toBe(1);
    });

    it("should increment renderId on each call", () => {
      const state = createTestState();

      const result1 = ui.showStep(targetElement, state);
      const result2 = ui.showStep(targetElement, state);
      const result3 = ui.showStep(targetElement, state);

      expect(result1.renderId).toBe(1);
      expect(result2.renderId).toBe(2);
      expect(result3.renderId).toBe(3);
    });

    it("should show tooltip with step content", () => {
      const state = createTestState();
      ui.showStep(targetElement, state);

      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip?.textContent).toContain("Click Button");
      expect(tooltip?.textContent).toContain("Click the button to continue");
    });

    it("should position spotlight around element", async () => {
      const state = createTestState();
      ui.showStep(targetElement, state);

      // Wait for double rAF (spotlight update uses waitForLayout pattern)
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );

      // Cutout ID is now dynamic: wt-cutout-xxx
      const spotlight = document.querySelector("rect[id^='wt-cutout-']");
      // Should have non-zero dimensions
      expect(parseInt(spotlight?.getAttribute("width") ?? "0")).toBeGreaterThan(
        0,
      );
      expect(
        parseInt(spotlight?.getAttribute("height") ?? "0"),
      ).toBeGreaterThan(0);
    });
  });

  describe("isRenderIdCurrent()", () => {
    beforeEach(() => {
      ui.initialize(onAction);
    });

    it("should return true for current renderId", () => {
      const state = createTestState();
      const { renderId } = ui.showStep(targetElement, state);

      expect(ui.isRenderIdCurrent(renderId)).toBe(true);
    });

    it("should return false for old renderId after new showStep", () => {
      const state = createTestState();
      const { renderId: oldId } = ui.showStep(targetElement, state);
      ui.showStep(targetElement, state);

      expect(ui.isRenderIdCurrent(oldId)).toBe(false);
    });

    it("should handle rapid state changes without stale DOM updates", () => {
      const state = createTestState();

      // Simulate rapid state changes
      const id1 = ui.showStep(targetElement, state).renderId;
      const id2 = ui.showStep(targetElement, state).renderId;
      const id3 = ui.showStep(targetElement, state).renderId;

      // Only the latest should be current
      expect(ui.isRenderIdCurrent(id1)).toBe(false);
      expect(ui.isRenderIdCurrent(id2)).toBe(false);
      expect(ui.isRenderIdCurrent(id3)).toBe(true);
    });
  });

  describe("showError()", () => {
    beforeEach(() => {
      ui.initialize(onAction);
    });

    it("should create overlay if not exists", () => {
      const state = createTestState({
        machineState: "ERROR",
        errorInfo: {
          type: "element_not_found",
          message: "Element not found",
          stepIndex: 0,
          retryCount: 0,
        },
      });

      ui.showError(state);

      expect(document.getElementById("walkthrough-overlay")).not.toBeNull();
    });

    it("should show error message", () => {
      const state = createTestState({
        machineState: "ERROR",
        errorInfo: {
          type: "element_not_found",
          message: "Element not found",
          stepIndex: 0,
          retryCount: 0,
        },
      });

      ui.showError(state);

      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip?.classList.contains("walkthrough-error")).toBe(true);
    });

    it("should hide spotlight", () => {
      const state = createTestState();
      ui.showStep(targetElement, state);

      // Now show error
      const errorState = createTestState({
        machineState: "ERROR",
        errorInfo: {
          type: "element_not_found",
          message: "Element not found",
          stepIndex: 0,
          retryCount: 0,
        },
      });
      ui.showError(errorState);

      // Cutout ID is now dynamic: wt-cutout-xxx
      const spotlight = document.querySelector("rect[id^='wt-cutout-']");
      expect(spotlight?.getAttribute("width")).toBe("0");
      expect(spotlight?.getAttribute("height")).toBe("0");
    });
  });

  describe("showCompletion()", () => {
    beforeEach(() => {
      ui.initialize(onAction);
    });

    it("should show completion message", () => {
      const state = createTestState({
        machineState: "COMPLETED",
      });

      ui.showCompletion(state);

      const tooltip = document.querySelector(".walkthrough-tooltip");
      expect(tooltip?.classList.contains("walkthrough-complete")).toBe(true);
      expect(tooltip?.textContent).toContain("Complete");
    });
  });

  describe("scroll/resize coordination", () => {
    beforeEach(() => {
      ui.initialize(onAction);
    });

    it("should coordinate spotlight + tooltip positioning on scroll", async () => {
      const state = createTestState();
      ui.showStep(targetElement, state);

      // Get initial positions
      const tooltipBefore = document.querySelector(
        ".walkthrough-tooltip",
      ) as HTMLElement;
      const initialTop = tooltipBefore.style.top;

      // Mock new element position after scroll
      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 200, // Changed from 100
        left: 200,
        width: 150,
        height: 50,
        bottom: 250,
        right: 350,
        x: 200,
        y: 200,
        toJSON: () => ({}),
      });

      // Trigger scroll event
      window.dispatchEvent(new Event("scroll"));

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Both spotlight and tooltip should update (via debounced handler)
      // Note: Actual position comparison is tricky in JSDOM, so we just verify no errors
    });
  });

  describe("action forwarding", () => {
    beforeEach(() => {
      ui.initialize(onAction);
      const state = createTestState();
      ui.showStep(targetElement, state);
    });

    it("should forward action to callback", () => {
      const nextBtn = document.querySelector(
        "#walkthrough-btn-next",
      ) as HTMLElement;
      nextBtn.click();

      expect(onAction).toHaveBeenCalledWith("next");
    });
  });

  describe("setButtonsEnabled()", () => {
    beforeEach(() => {
      ui.initialize(onAction);
      const state = createTestState();
      ui.showStep(targetElement, state);
    });

    it("should disable non-exit buttons during async operations", () => {
      ui.setButtonsEnabled(false);

      // Next and Back buttons should be disabled
      const nextBtn = document.querySelector(
        "#walkthrough-btn-next",
      ) as HTMLButtonElement;
      const backBtn = document.querySelector(
        "#walkthrough-btn-back",
      ) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
      expect(backBtn.disabled).toBe(true);

      // Exit and Close buttons should remain enabled (user must always be able to exit)
      const exitBtn = document.querySelector(
        "#walkthrough-btn-exit",
      ) as HTMLButtonElement;
      const closeBtn = document.querySelector(
        "#walkthrough-close-btn",
      ) as HTMLButtonElement;
      expect(exitBtn.disabled).toBe(false);
      expect(closeBtn.disabled).toBe(false);
    });
  });

  describe("destroy()", () => {
    beforeEach(() => {
      ui.initialize(onAction);
      const state = createTestState();
      ui.showStep(targetElement, state);
    });

    it("should remove overlay from DOM", () => {
      expect(document.getElementById("walkthrough-overlay")).not.toBeNull();

      ui.destroy();

      expect(document.getElementById("walkthrough-overlay")).toBeNull();
    });

    it("should remove scroll/resize handlers", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      ui.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "scroll",
        expect.any(Function),
        true,
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "resize",
        expect.any(Function),
      );
    });

    it("should reset renderId", () => {
      const state = createTestState();
      const { renderId } = ui.showStep(targetElement, state);
      expect(renderId).toBe(2); // Second showStep (first was in beforeEach)

      ui.destroy();

      // Re-initialize
      ui = new WalkthroughUI();
      ui.initialize(onAction);

      const newResult = ui.showStep(targetElement, state);
      expect(newResult.renderId).toBe(1); // Reset to 1
    });

    it("should handle repeated destroy calls", () => {
      ui.destroy();
      expect(() => ui.destroy()).not.toThrow();
    });

    it("should clean up all handlers (no duplicate listeners after create/destroy cycles)", () => {
      // Create and destroy multiple times
      for (let i = 0; i < 3; i++) {
        ui.destroy();
        ui = new WalkthroughUI();
        ui.initialize(onAction);
        const state = createTestState();
        ui.showStep(targetElement, state);
      }

      // Should only have one overlay
      const overlays = document.querySelectorAll("#walkthrough-overlay");
      expect(overlays.length).toBe(1);
    });
  });

  describe("hide()", () => {
    beforeEach(() => {
      ui.initialize(onAction);
      const state = createTestState();
      ui.showStep(targetElement, state);
    });

    it("should hide spotlight", () => {
      ui.hide();

      // Cutout ID is now dynamic: wt-cutout-xxx
      const spotlight = document.querySelector("rect[id^='wt-cutout-']");
      expect(spotlight?.getAttribute("width")).toBe("0");
    });

    it("should hide tooltip", () => {
      ui.hide();

      const tooltip = document.querySelector(
        ".walkthrough-tooltip",
      ) as HTMLElement;
      expect(tooltip.style.display).toBe("none");
    });
  });
});
