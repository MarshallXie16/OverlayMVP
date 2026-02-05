/**
 * ActionDetector Tests
 *
 * Tests for event listener attachment, baseline tracking, and action emission.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ActionDetector, type DetectedAction } from "../ActionDetector";

describe("ActionDetector", () => {
  let detector: ActionDetector;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onAction = vi.fn();
    detector = new ActionDetector(onAction);
  });

  afterEach(() => {
    detector.detach();
    vi.clearAllMocks();
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  describe("initialization", () => {
    it("should start with no listeners attached", () => {
      expect(detector.isAttached()).toBe(false);
    });

    it("should not call callback on initialization", () => {
      expect(onAction).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CLICK DETECTION
  // ============================================================================

  describe("click detection", () => {
    it("should detect click on target element", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      detector.attach(button, "click");
      expect(detector.isAttached()).toBe(true);

      button.click();

      expect(onAction).toHaveBeenCalledTimes(1);
      const action = onAction.mock.calls[0][0] as DetectedAction;
      expect(action.type).toBe("click");
      expect(action.target).toBe(button);
      expect(action.timestamp).toBeGreaterThan(0);

      document.body.removeChild(button);
    });

    it("should not emit click after detach", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      detector.attach(button, "click");
      detector.detach();
      expect(detector.isAttached()).toBe(false);

      button.click();
      expect(onAction).not.toHaveBeenCalled();

      document.body.removeChild(button);
    });
  });

  // ============================================================================
  // INPUT DETECTION
  // ============================================================================

  describe("input_commit detection", () => {
    it("should set baseline immediately on attach (legacy parity)", () => {
      const input = document.createElement("input");
      input.value = "initial";
      document.body.appendChild(input);

      detector.attach(input, "input_commit");

      // Change value and blur
      input.value = "changed";
      input.dispatchEvent(new FocusEvent("blur"));

      // Should emit because value differs from initial baseline
      expect(onAction).toHaveBeenCalledTimes(1);
      const action = onAction.mock.calls[0][0] as DetectedAction;
      expect(action.type).toBe("input_commit");
      expect(action.value).toBe("changed");

      document.body.removeChild(input);
    });

    it("should refresh baseline on focusin", () => {
      const input = document.createElement("input");
      input.value = "initial";
      document.body.appendChild(input);

      detector.attach(input, "input_commit");

      // Focus, change value, blur
      input.value = "after-focus";
      input.dispatchEvent(new FocusEvent("focusin"));
      // Now baseline is "after-focus"

      // Blur without change - should NOT emit
      input.dispatchEvent(new FocusEvent("blur"));
      expect(onAction).not.toHaveBeenCalled();

      // Now change and blur
      input.value = "final";
      input.dispatchEvent(new FocusEvent("blur"));
      expect(onAction).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });

    it("should not emit on blur if value unchanged", () => {
      const input = document.createElement("input");
      input.value = "same";
      document.body.appendChild(input);

      detector.attach(input, "input_commit");

      // Blur without changing value
      input.dispatchEvent(new FocusEvent("blur"));

      expect(onAction).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });

    it("should work with textarea elements", () => {
      const textarea = document.createElement("textarea");
      textarea.value = "initial";
      document.body.appendChild(textarea);

      detector.attach(textarea, "input_commit");

      textarea.value = "changed textarea";
      textarea.dispatchEvent(new FocusEvent("blur"));

      expect(onAction).toHaveBeenCalledTimes(1);
      const action = onAction.mock.calls[0][0] as DetectedAction;
      expect(action.type).toBe("input_commit");
      expect(action.value).toBe("changed textarea");

      document.body.removeChild(textarea);
    });
  });

  // ============================================================================
  // SELECT DETECTION
  // ============================================================================

  describe("select_change detection", () => {
    it("should detect change on select element", () => {
      const select = document.createElement("select");
      const option1 = document.createElement("option");
      option1.value = "opt1";
      const option2 = document.createElement("option");
      option2.value = "opt2";
      select.appendChild(option1);
      select.appendChild(option2);
      document.body.appendChild(select);

      detector.attach(select, "select_change");

      // Simulate change
      select.value = "opt2";
      select.dispatchEvent(new Event("change"));

      expect(onAction).toHaveBeenCalledTimes(1);
      const action = onAction.mock.calls[0][0] as DetectedAction;
      expect(action.type).toBe("select_change");
      expect(action.value).toBe("opt2");

      document.body.removeChild(select);
    });
  });

  // ============================================================================
  // SUBMIT DETECTION
  // ============================================================================

  describe("submit detection", () => {
    it("should attach listener to parent form", () => {
      const form = document.createElement("form");
      const button = document.createElement("button");
      button.type = "submit";
      form.appendChild(button);
      document.body.appendChild(form);

      // Prevent actual form submission
      form.addEventListener("submit", (e) => e.preventDefault());

      detector.attach(button, "submit");

      // Dispatch submit on form
      form.dispatchEvent(new Event("submit"));

      expect(onAction).toHaveBeenCalledTimes(1);
      const action = onAction.mock.calls[0][0] as DetectedAction;
      expect(action.type).toBe("submit");

      document.body.removeChild(form);
    });

    it("should not attach if element has no parent form", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      // This should not throw, just skip listener setup
      detector.attach(button, "submit");

      expect(detector.isAttached()).toBe(false);

      document.body.removeChild(button);
    });
  });

  // ============================================================================
  // CLEANUP
  // ============================================================================

  describe("cleanup", () => {
    it("should clean up on detach", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      detector.attach(button, "click");
      expect(detector.isAttached()).toBe(true);

      detector.detach();
      expect(detector.isAttached()).toBe(false);

      document.body.removeChild(button);
    });

    it("should clean up previous listeners when attaching new ones", () => {
      const button1 = document.createElement("button");
      const button2 = document.createElement("button");
      document.body.appendChild(button1);
      document.body.appendChild(button2);

      detector.attach(button1, "click");
      detector.attach(button2, "click");

      // Click first button should NOT emit (detached)
      button1.click();
      expect(onAction).not.toHaveBeenCalled();

      // Click second button should emit
      button2.click();
      expect(onAction).toHaveBeenCalledTimes(1);

      document.body.removeChild(button1);
      document.body.removeChild(button2);
    });

    it("should handle multiple detach calls safely", () => {
      detector.detach();
      detector.detach();
      // Should not throw
      expect(detector.isAttached()).toBe(false);
    });
  });
});
