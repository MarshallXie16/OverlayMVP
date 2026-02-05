/**
 * TooltipRenderer Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TooltipRenderer, type TooltipAction } from "../TooltipRenderer";

describe("TooltipRenderer", () => {
  let renderer: TooltipRenderer;
  let container: HTMLDivElement;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    onAction = vi.fn();
    renderer = new TooltipRenderer();
    renderer.initialize(container, onAction);
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  describe("initialize()", () => {
    it("should create tooltip element in container", () => {
      const tooltip = container.querySelector(".walkthrough-tooltip");
      expect(tooltip).not.toBeNull();
    });
  });

  describe("render() - step mode", () => {
    it("should render step content with XSS prevention via escapeHtml", () => {
      renderer.render({
        stepNumber: 1,
        totalSteps: 5,
        fieldLabel: '<script>alert("xss")</script>',
        instruction: '<img onerror="alert(1)" src="x">',
        isFirstStep: true,
        isLastStep: false,
      });

      // Check that the raw text is displayed, not executed as HTML
      const fieldLabel = container.querySelector(".walkthrough-field-label");
      const instruction = container.querySelector(".walkthrough-instruction");

      // The text content should contain the literal string (escaped HTML shows as text)
      expect(fieldLabel?.textContent).toContain("<script>");
      expect(instruction?.textContent).toContain("<img");

      // Should NOT have actual script or img elements as children
      expect(fieldLabel?.querySelector("script")).toBeNull();
      expect(instruction?.querySelector("img")).toBeNull();
    });

    it("should show correct button states (disabled back on first)", () => {
      renderer.render({
        stepNumber: 1,
        totalSteps: 5,
        fieldLabel: "First Step",
        instruction: "Do something",
        isFirstStep: true,
        isLastStep: false,
      });

      const backBtn = container.querySelector(
        "#walkthrough-btn-back",
      ) as HTMLButtonElement;
      expect(backBtn?.disabled).toBe(true);

      const nextBtn = container.querySelector(
        "#walkthrough-btn-next",
      ) as HTMLButtonElement;
      expect(nextBtn?.disabled).toBe(false);
    });

    it("should show 'Complete' on last step instead of 'Next'", () => {
      renderer.render({
        stepNumber: 5,
        totalSteps: 5,
        fieldLabel: "Last Step",
        instruction: "Almost done",
        isFirstStep: false,
        isLastStep: true,
      });

      const nextBtn = container.querySelector("#walkthrough-btn-next");
      expect(nextBtn?.textContent).toContain("Complete");
    });

    it("should enable back button when not first step", () => {
      renderer.render({
        stepNumber: 3,
        totalSteps: 5,
        fieldLabel: "Middle Step",
        instruction: "Continue",
        isFirstStep: false,
        isLastStep: false,
      });

      const backBtn = container.querySelector(
        "#walkthrough-btn-back",
      ) as HTMLButtonElement;
      expect(backBtn?.disabled).toBe(false);
    });

    it("should show progress bar with correct width", () => {
      renderer.render({
        stepNumber: 2,
        totalSteps: 4,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: false,
        isLastStep: false,
      });

      const progressFill = container.querySelector(
        ".walkthrough-progress-bar-fill",
      ) as HTMLElement;
      // 2/4 = 50%
      expect(progressFill?.style.width).toBe("50%");
    });
  });

  describe("renderError() - error mode", () => {
    it("should render error mode with Skip/Exit buttons", () => {
      renderer.renderError({
        stepLabel: "Button Click",
        errorMessage: "This workflow may be outdated",
        canRetry: true,
        canSkip: true,
      });

      const tooltip = container.querySelector(".walkthrough-tooltip");
      expect(tooltip?.classList.contains("walkthrough-error")).toBe(true);

      const skipBtn = container.querySelector("#walkthrough-btn-skip");
      expect(skipBtn).not.toBeNull();

      const retryBtn = container.querySelector("#walkthrough-btn-retry");
      expect(retryBtn).not.toBeNull();

      const exitBtn = container.querySelector("#walkthrough-btn-exit");
      expect(exitBtn).not.toBeNull();
    });

    it("should hide retry button when canRetry is false", () => {
      renderer.renderError({
        stepLabel: "Button Click",
        errorMessage: "Error",
        canRetry: false,
        canSkip: true,
      });

      const retryBtn = container.querySelector("#walkthrough-btn-retry");
      expect(retryBtn).toBeNull();
    });

    it("should hide skip button when canSkip is false", () => {
      renderer.renderError({
        stepLabel: "Button Click",
        errorMessage: "Error",
        canRetry: true,
        canSkip: false,
      });

      const skipBtn = container.querySelector("#walkthrough-btn-skip");
      expect(skipBtn).toBeNull();
    });
  });

  describe("renderCompletion() - completion mode", () => {
    it("should render completion mode with Done button", () => {
      renderer.renderCompletion({
        workflowName: "Test Workflow",
        totalSteps: 5,
      });

      const tooltip = container.querySelector(".walkthrough-tooltip");
      expect(tooltip?.classList.contains("walkthrough-complete")).toBe(true);

      const doneBtn = container.querySelector("#walkthrough-btn-done");
      expect(doneBtn).not.toBeNull();
      expect(doneBtn?.textContent).toContain("Done");
    });

    it("should show completion message with workflow name", () => {
      renderer.renderCompletion({
        workflowName: "My Awesome Workflow",
        totalSteps: 5,
      });

      const instruction = container.querySelector(".walkthrough-instruction");
      expect(instruction?.textContent).toContain("My Awesome Workflow");
    });
  });

  describe("button click event delegation", () => {
    beforeEach(() => {
      renderer.render({
        stepNumber: 2,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: false,
        isLastStep: false,
      });
    });

    it("should dispatch 'next' action on next button click", () => {
      const nextBtn = container.querySelector(
        "#walkthrough-btn-next",
      ) as HTMLElement;
      nextBtn.click();
      expect(onAction).toHaveBeenCalledWith("next");
    });

    it("should dispatch 'back' action on back button click", () => {
      const backBtn = container.querySelector(
        "#walkthrough-btn-back",
      ) as HTMLElement;
      backBtn.click();
      expect(onAction).toHaveBeenCalledWith("back");
    });

    it("should dispatch 'exit' action on exit button click", () => {
      const exitBtn = container.querySelector(
        "#walkthrough-btn-exit",
      ) as HTMLElement;
      exitBtn.click();
      expect(onAction).toHaveBeenCalledWith("exit");
    });

    it("should dispatch 'exit' action on close button click", () => {
      const closeBtn = container.querySelector(
        "#walkthrough-close-btn",
      ) as HTMLElement;
      closeBtn.click();
      expect(onAction).toHaveBeenCalledWith("exit");
    });
  });

  describe("error mode button clicks", () => {
    it("should dispatch 'skip' action on skip button click", () => {
      renderer.renderError({
        stepLabel: "Step",
        errorMessage: "Error",
        canRetry: true,
        canSkip: true,
      });

      const skipBtn = container.querySelector(
        "#walkthrough-btn-skip",
      ) as HTMLElement;
      skipBtn.click();
      expect(onAction).toHaveBeenCalledWith("skip");
    });

    it("should dispatch 'retry' action on retry button click", () => {
      renderer.renderError({
        stepLabel: "Step",
        errorMessage: "Error",
        canRetry: true,
        canSkip: true,
      });

      const retryBtn = container.querySelector(
        "#walkthrough-btn-retry",
      ) as HTMLElement;
      retryBtn.click();
      expect(onAction).toHaveBeenCalledWith("retry");
    });
  });

  describe("completion mode button clicks", () => {
    it("should dispatch 'done' action on done button click", () => {
      renderer.renderCompletion({
        workflowName: "Test",
        totalSteps: 5,
      });

      const doneBtn = container.querySelector(
        "#walkthrough-btn-done",
      ) as HTMLElement;
      doneBtn.click();
      expect(onAction).toHaveBeenCalledWith("done");
    });
  });

  describe("setButtonsEnabled()", () => {
    it("should disable non-exit buttons when set to false (Exit/Close stay enabled)", () => {
      renderer.render({
        stepNumber: 2,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: false,
        isLastStep: false,
      });

      renderer.setButtonsEnabled(false);

      // Next and Back buttons should be disabled
      const nextBtn = container.querySelector(
        "#walkthrough-btn-next",
      ) as HTMLButtonElement;
      const backBtn = container.querySelector(
        "#walkthrough-btn-back",
      ) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
      expect(backBtn.disabled).toBe(true);

      // Exit and Close buttons should remain enabled (user must always be able to exit)
      const exitBtn = container.querySelector(
        "#walkthrough-btn-exit",
      ) as HTMLButtonElement;
      const closeBtn = container.querySelector(
        "#walkthrough-close-btn",
      ) as HTMLButtonElement;
      expect(exitBtn.disabled).toBe(false);
      expect(closeBtn.disabled).toBe(false);
    });

    it("should enable all buttons when set to true", () => {
      renderer.render({
        stepNumber: 2,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: false,
        isLastStep: false,
      });

      renderer.setButtonsEnabled(false);
      renderer.setButtonsEnabled(true);

      const nextBtn = container.querySelector(
        "#walkthrough-btn-next",
      ) as HTMLButtonElement;
      const exitBtn = container.querySelector(
        "#walkthrough-btn-exit",
      ) as HTMLButtonElement;

      expect(nextBtn.disabled).toBe(false);
      expect(exitBtn.disabled).toBe(false);
    });
  });

  describe("positioning", () => {
    let targetElement: HTMLElement;

    beforeEach(() => {
      targetElement = document.createElement("div");
      document.body.appendChild(targetElement);

      renderer.render({
        stepNumber: 1,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: true,
        isLastStep: false,
      });
    });

    it("should position tooltip below target when space available", () => {
      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 100,
        left: 200,
        width: 100,
        height: 50,
        bottom: 150,
        right: 300,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      });

      renderer.position(targetElement);

      const tooltip = container.querySelector(
        ".walkthrough-tooltip",
      ) as HTMLElement;
      const topValue = parseInt(tooltip.style.top);
      // Should be below the target (150 + 16 padding = 166)
      expect(topValue).toBe(166);
    });

    it("should clear transform when positioning", () => {
      const tooltip = container.querySelector(
        ".walkthrough-tooltip",
      ) as HTMLElement;
      tooltip.style.transform = "translate(-50%, -50%)";

      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 100,
        left: 200,
        width: 100,
        height: 50,
        bottom: 150,
        right: 300,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      });

      renderer.position(targetElement);

      expect(tooltip.style.transform).toBe("");
    });
  });

  describe("reposition()", () => {
    let targetElement: HTMLElement;

    beforeEach(() => {
      targetElement = document.createElement("div");
      document.body.appendChild(targetElement);
    });

    it("should reposition in step mode", () => {
      renderer.render({
        stepNumber: 1,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: true,
        isLastStep: false,
      });

      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 200,
        left: 300,
        width: 100,
        height: 50,
        bottom: 250,
        right: 400,
        x: 300,
        y: 200,
        toJSON: () => ({}),
      });

      renderer.reposition(targetElement);

      const tooltip = container.querySelector(
        ".walkthrough-tooltip",
      ) as HTMLElement;
      expect(tooltip.style.top).not.toBe("");
    });

    it("should NOT reposition in error mode (stays centered)", () => {
      renderer.renderError({
        stepLabel: "Step",
        errorMessage: "Error",
        canRetry: true,
        canSkip: true,
      });

      const tooltip = container.querySelector(
        ".walkthrough-tooltip",
      ) as HTMLElement;
      const initialTransform = tooltip.style.transform;

      renderer.reposition(targetElement);

      // Should still be centered
      expect(tooltip.style.transform).toBe(initialTransform);
    });
  });

  describe("destroy()", () => {
    it("should remove tooltip from DOM", () => {
      expect(container.querySelector(".walkthrough-tooltip")).not.toBeNull();

      renderer.destroy();

      expect(container.querySelector(".walkthrough-tooltip")).toBeNull();
    });

    it("should clean up drag handlers (no leaked mousemove/mouseup)", () => {
      renderer.render({
        stepNumber: 1,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: true,
        isLastStep: false,
      });

      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

      renderer.destroy();

      // Should have removed document-level handlers
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mousemove",
        expect.any(Function),
      );
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "mouseup",
        expect.any(Function),
      );
    });
  });

  describe("inline error message", () => {
    beforeEach(() => {
      renderer.render({
        stepNumber: 1,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: true,
        isLastStep: false,
      });
    });

    it("should show inline error message", () => {
      renderer.showInlineError("Something went wrong");

      const errorMsg = container.querySelector(
        "#walkthrough-error-msg",
      ) as HTMLElement;
      expect(errorMsg.textContent).toBe("Something went wrong");
      expect(errorMsg.classList.contains("hidden")).toBe(false);
    });

    it("should hide inline error message", () => {
      renderer.showInlineError("Error");
      renderer.hideInlineError();

      const errorMsg = container.querySelector(
        "#walkthrough-error-msg",
      ) as HTMLElement;
      expect(errorMsg.classList.contains("hidden")).toBe(true);
    });
  });

  describe("skip button visibility", () => {
    beforeEach(() => {
      renderer.render({
        stepNumber: 1,
        totalSteps: 5,
        fieldLabel: "Step",
        instruction: "Do it",
        isFirstStep: true,
        isLastStep: false,
      });
    });

    it("should show skip button when set visible", () => {
      const skipBtn = container.querySelector(
        "#walkthrough-btn-skip",
      ) as HTMLElement;
      expect(skipBtn.classList.contains("hidden")).toBe(true);

      renderer.setSkipVisible(true);

      expect(skipBtn.classList.contains("hidden")).toBe(false);
    });

    it("should hide skip button when set invisible", () => {
      renderer.setSkipVisible(true);
      renderer.setSkipVisible(false);

      const skipBtn = container.querySelector(
        "#walkthrough-btn-skip",
      ) as HTMLElement;
      expect(skipBtn.classList.contains("hidden")).toBe(true);
    });
  });
});
