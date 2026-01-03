/**
 * Tests for Recording Widget
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getRecordingWidget,
  showRecordingWidget,
  hideRecordingWidget,
  updateWidgetStepCount,
} from "../widget";

describe("Recording Widget", () => {
  beforeEach(() => {
    // Clean up any existing widget
    const existingWidget = document.getElementById("workflow-recording-widget");
    if (existingWidget) {
      existingWidget.remove();
    }
  });

  afterEach(() => {
    // Clean up after tests
    const widget = document.getElementById("workflow-recording-widget");
    if (widget) {
      widget.remove();
    }
  });

  describe("Widget Creation", () => {
    it("should create widget with correct structure", () => {
      showRecordingWidget();

      const widget = document.getElementById("workflow-recording-widget");
      expect(widget).toBeTruthy();

      const container = widget?.querySelector(".widget-container");
      expect(container).toBeTruthy();

      const indicator = widget?.querySelector(".recording-indicator");
      expect(indicator).toBeTruthy();

      const pulseDot = widget?.querySelector(".pulse-dot");
      expect(pulseDot).toBeTruthy();

      const stepCounter = widget?.querySelector(".step-counter");
      expect(stepCounter).toBeTruthy();

      const stopBtn = widget?.querySelector(".stop-btn");
      expect(stopBtn).toBeTruthy();

      const pauseBtn = widget?.querySelector(".pause-btn");
      expect(pauseBtn).toBeTruthy();
    });

    it("should show widget when showRecordingWidget is called", () => {
      showRecordingWidget();

      const widget = document.getElementById("workflow-recording-widget");
      expect(widget).toBeTruthy();
      expect(document.body.contains(widget)).toBe(true);
    });

    it("should hide widget when hideRecordingWidget is called", () => {
      showRecordingWidget();

      const widget = document.getElementById("workflow-recording-widget");
      expect(document.body.contains(widget)).toBe(true);

      hideRecordingWidget();
      expect(document.body.contains(widget)).toBe(false);
    });

    it("should not duplicate widget if shown multiple times", () => {
      showRecordingWidget();
      showRecordingWidget();
      showRecordingWidget();

      const widgets = document.querySelectorAll("#workflow-recording-widget");
      expect(widgets.length).toBe(1);
    });
  });

  describe("Step Counter", () => {
    beforeEach(() => {
      showRecordingWidget();
    });

    it("should display initial step count as 0", () => {
      const stepCount = document.querySelector(".step-count");
      const stepLabel = document.querySelector(".step-label");
      expect(stepCount?.textContent).toBe("0");
      expect(stepLabel?.textContent).toBe("Steps");
    });

    it("should update step count correctly", () => {
      updateWidgetStepCount(1);
      let stepCount = document.querySelector(".step-count");
      expect(stepCount?.textContent).toBe("1");

      updateWidgetStepCount(5);
      stepCount = document.querySelector(".step-count");
      expect(stepCount?.textContent).toBe("5");

      updateWidgetStepCount(100);
      stepCount = document.querySelector(".step-count");
      expect(stepCount?.textContent).toBe("100");
    });

    it("should update count to zero", () => {
      updateWidgetStepCount(0);
      const stepCount = document.querySelector(".step-count");
      expect(stepCount?.textContent).toBe("0");
    });

    it("should handle large step counts", () => {
      updateWidgetStepCount(999);
      const stepCount = document.querySelector(".step-count");
      expect(stepCount?.textContent).toBe("999");
    });
  });

  describe("Button Callbacks", () => {
    beforeEach(() => {
      showRecordingWidget();
    });

    it("should call stop callback when stop button is clicked", () => {
      const stopCallback = vi.fn();
      const widget = getRecordingWidget();
      widget.onStop(stopCallback);

      const stopBtn = document.querySelector(".stop-btn") as HTMLButtonElement;
      stopBtn.click();

      expect(stopCallback).toHaveBeenCalledTimes(1);
    });

    it("should call pause callback when pause button is clicked", () => {
      const pauseCallback = vi.fn();
      const widget = getRecordingWidget();
      widget.onPause(pauseCallback);

      const pauseBtn = document.querySelector(
        ".pause-btn",
      ) as HTMLButtonElement;
      pauseBtn.click();

      expect(pauseCallback).toHaveBeenCalledTimes(1);
    });

    it("should allow multiple clicks on stop button", () => {
      const stopCallback = vi.fn();
      const widget = getRecordingWidget();
      widget.onStop(stopCallback);

      const stopBtn = document.querySelector(".stop-btn") as HTMLButtonElement;
      stopBtn.click();
      stopBtn.click();
      stopBtn.click();

      expect(stopCallback).toHaveBeenCalledTimes(3);
    });
  });

  describe("Widget Persistence", () => {
    it("should maintain state across multiple operations", () => {
      showRecordingWidget();
      updateWidgetStepCount(5);

      const stepCount = document.querySelector(".step-count");
      expect(stepCount?.textContent).toBe("5");

      hideRecordingWidget();
      showRecordingWidget();

      // Step count should persist (same widget instance)
      const stepCount2 = document.querySelector(".step-count");
      expect(stepCount2?.textContent).toBe("5");
    });
  });
});
