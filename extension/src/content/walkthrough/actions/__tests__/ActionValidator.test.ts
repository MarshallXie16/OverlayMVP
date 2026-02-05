/**
 * ActionValidator Tests
 *
 * Tests for action validation logic, including isClickOnTarget and
 * per-action-type validation rules.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ActionValidator,
  isClickOnTarget,
  type ValidationResult,
} from "../ActionValidator";
import type { DetectedAction } from "../ActionDetector";

// Helper to create mock detected action
function createMockAction(
  type: DetectedAction["type"],
  target: HTMLElement,
  eventTarget: HTMLElement = target,
): DetectedAction {
  const event = new Event(type === "input_commit" ? "focusout" : type);
  Object.defineProperty(event, "target", { value: eventTarget });
  return {
    type,
    target,
    event,
    timestamp: Date.now(),
  };
}

describe("isClickOnTarget", () => {
  // ============================================================================
  // DIRECT MATCH
  // ============================================================================

  describe("direct match", () => {
    it("should return true for direct element match", () => {
      const button = document.createElement("button");
      const event = new MouseEvent("click");
      Object.defineProperty(event, "target", { value: button });

      expect(isClickOnTarget(event, button)).toBe(true);
    });

    it("should return false for different elements", () => {
      const button1 = document.createElement("button");
      const button2 = document.createElement("button");
      const event = new MouseEvent("click");
      Object.defineProperty(event, "target", { value: button1 });

      expect(isClickOnTarget(event, button2)).toBe(false);
    });
  });

  // ============================================================================
  // CONTAINS CHECK
  // ============================================================================

  describe("contains check", () => {
    it("should return true for click on child element", () => {
      const parent = document.createElement("div");
      const child = document.createElement("span");
      parent.appendChild(child);
      document.body.appendChild(parent);

      const event = new MouseEvent("click");
      Object.defineProperty(event, "target", { value: child });

      expect(isClickOnTarget(event, parent)).toBe(true);

      document.body.removeChild(parent);
    });

    it("should return true for deeply nested child", () => {
      const root = document.createElement("div");
      const level1 = document.createElement("div");
      const level2 = document.createElement("div");
      const deepChild = document.createElement("span");

      root.appendChild(level1);
      level1.appendChild(level2);
      level2.appendChild(deepChild);
      document.body.appendChild(root);

      const event = new MouseEvent("click");
      Object.defineProperty(event, "target", { value: deepChild });

      expect(isClickOnTarget(event, root)).toBe(true);

      document.body.removeChild(root);
    });

    it("should return false for sibling element", () => {
      const parent = document.createElement("div");
      const sibling1 = document.createElement("span");
      const sibling2 = document.createElement("span");
      parent.appendChild(sibling1);
      parent.appendChild(sibling2);
      document.body.appendChild(parent);

      const event = new MouseEvent("click");
      Object.defineProperty(event, "target", { value: sibling1 });

      expect(isClickOnTarget(event, sibling2)).toBe(false);

      document.body.removeChild(parent);
    });
  });

  // ============================================================================
  // NULL TARGET
  // ============================================================================

  describe("edge cases", () => {
    it("should return false for null event target", () => {
      const button = document.createElement("button");
      const event = new MouseEvent("click");
      Object.defineProperty(event, "target", { value: null });

      expect(isClickOnTarget(event, button)).toBe(false);
    });
  });
});

describe("ActionValidator", () => {
  let validator: ActionValidator;

  beforeEach(() => {
    validator = new ActionValidator();
  });

  afterEach(() => {
    validator.resetAllRetryCounts();
  });

  // ============================================================================
  // CLICK VALIDATION
  // ============================================================================

  describe("click validation", () => {
    it("should validate click on correct element", () => {
      const button = document.createElement("button");
      const action = createMockAction("click", button);

      const result = validator.validate(action, button, "click", 0);

      expect(result.valid).toBe(true);
      expect(result.retryCount).toBe(0);
    });

    it("should reject click on wrong element", () => {
      const target = document.createElement("button");
      const other = document.createElement("button");
      const action = createMockAction("click", other);

      const result = validator.validate(action, target, "click", 0);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("wrong_element");
      expect(result.retryCount).toBe(1);
    });

    it("should reject wrong action type", () => {
      const button = document.createElement("button");
      const action = createMockAction("input_commit", button);

      const result = validator.validate(action, button, "click", 0);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("wrong_action");
    });
  });

  // ============================================================================
  // INPUT_COMMIT VALIDATION
  // ============================================================================

  describe("input_commit validation", () => {
    it("should validate input_commit on correct element", () => {
      const input = document.createElement("input");
      const action = createMockAction("input_commit", input);
      action.value = "new value";

      const result = validator.validate(action, input, "input_commit", 0);

      expect(result.valid).toBe(true);
    });

    it("should reject input_commit on wrong element", () => {
      const target = document.createElement("input");
      const other = document.createElement("input");
      const action = createMockAction("input_commit", other);

      const result = validator.validate(action, target, "input_commit", 0);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("wrong_element");
    });
  });

  // ============================================================================
  // SELECT_CHANGE VALIDATION (LEGACY QUIRK)
  // ============================================================================

  describe("select_change validation", () => {
    it("should validate when event target is select", () => {
      const select = document.createElement("select");
      const action = createMockAction("select_change", select);
      action.value = "option1";

      const result = validator.validate(action, select, "select_change", 0);

      expect(result.valid).toBe(true);
    });

    it("should reject when neither target nor expected is select", () => {
      const div = document.createElement("div");
      const action = createMockAction("select_change", div);

      const result = validator.validate(action, div, "select_change", 0);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("wrong_element");
    });

    it("should validate when expected element is select (legacy quirk)", () => {
      const select = document.createElement("select");
      const div = document.createElement("div");
      select.appendChild(div);

      const action = createMockAction("select_change", select, div);

      const result = validator.validate(action, select, "select_change", 0);

      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // SUBMIT VALIDATION
  // ============================================================================

  describe("submit validation", () => {
    it("should validate submit action (only checks event type)", () => {
      const form = document.createElement("form");
      const button = document.createElement("button");
      form.appendChild(button);

      const action = createMockAction("submit", button);

      // Submit validation only checks event type, not element
      const result = validator.validate(action, button, "submit", 0);

      expect(result.valid).toBe(true);
    });

    it("should reject non-submit action", () => {
      const button = document.createElement("button");
      const action = createMockAction("click", button);

      const result = validator.validate(action, button, "submit", 0);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("wrong_action");
    });
  });

  // ============================================================================
  // COPY VALIDATION
  // ============================================================================

  describe("copy validation", () => {
    it("should validate copy when clipboard preview matches", () => {
      const container = document.createElement("div");
      const action = createMockAction("copy", container);
      action.value = "BUILD WITH CLAUDE CODE";

      const result = validator.validate(action, container, "copy", 0, {
        expectedClipboardPreview: "BUILD WITH CLAUDE CODE",
      });

      expect(result.valid).toBe(true);
    });

    it("should reject copy when clipboard preview does not match", () => {
      const container = document.createElement("div");
      const action = createMockAction("copy", container);
      action.value = "WRONG TEXT";

      const result = validator.validate(action, container, "copy", 0, {
        expectedClipboardPreview: "BUILD WITH CLAUDE CODE",
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe("wrong_value");
      expect(result.retryCount).toBe(1);
    });

    it("should accept prefix match when preview is truncated", () => {
      const container = document.createElement("div");
      const action = createMockAction("copy", container);
      action.value =
        "This is a long copied text that starts with the preview and continues";

      const result = validator.validate(action, container, "copy", 0, {
        expectedClipboardPreview: "This is a long copied text...",
      });

      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // RETRY COUNTING
  // ============================================================================

  describe("retry counting", () => {
    it("should increment retry count on invalid action", () => {
      const target = document.createElement("button");
      const other = document.createElement("button");
      const action = createMockAction("click", other);

      validator.validate(action, target, "click", 0);
      expect(validator.getRetryCount(0)).toBe(1);

      validator.validate(action, target, "click", 0);
      expect(validator.getRetryCount(0)).toBe(2);

      validator.validate(action, target, "click", 0);
      expect(validator.getRetryCount(0)).toBe(3);
    });

    it("should reset retry count on valid action", () => {
      const button = document.createElement("button");
      const other = document.createElement("button");

      // First invalid
      validator.validate(createMockAction("click", other), button, "click", 0);
      expect(validator.getRetryCount(0)).toBe(1);

      // Then valid
      validator.validate(createMockAction("click", button), button, "click", 0);
      expect(validator.getRetryCount(0)).toBe(0);
    });

    it("should track retries per step independently", () => {
      const target = document.createElement("button");
      const other = document.createElement("button");
      const invalidAction = createMockAction("click", other);

      validator.validate(invalidAction, target, "click", 0);
      validator.validate(invalidAction, target, "click", 0);
      validator.validate(invalidAction, target, "click", 1);

      expect(validator.getRetryCount(0)).toBe(2);
      expect(validator.getRetryCount(1)).toBe(1);
      expect(validator.getRetryCount(2)).toBe(0);
    });

    it("should reset specific step retry count", () => {
      const target = document.createElement("button");
      const other = document.createElement("button");
      const invalidAction = createMockAction("click", other);

      validator.validate(invalidAction, target, "click", 0);
      validator.validate(invalidAction, target, "click", 1);

      validator.resetRetryCount(0);

      expect(validator.getRetryCount(0)).toBe(0);
      expect(validator.getRetryCount(1)).toBe(1);
    });

    it("should reset all retry counts", () => {
      const target = document.createElement("button");
      const other = document.createElement("button");
      const invalidAction = createMockAction("click", other);

      validator.validate(invalidAction, target, "click", 0);
      validator.validate(invalidAction, target, "click", 1);
      validator.validate(invalidAction, target, "click", 2);

      validator.resetAllRetryCounts();

      expect(validator.getRetryCount(0)).toBe(0);
      expect(validator.getRetryCount(1)).toBe(0);
      expect(validator.getRetryCount(2)).toBe(0);
    });
  });
});
