/**
 * ClickInterceptor Tests
 *
 * Tests for click blocking, allowlisting, and visual feedback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClickInterceptor } from "../ClickInterceptor";

describe("ClickInterceptor", () => {
  let interceptor: ClickInterceptor;
  let onClickBlocked: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClickBlocked = vi.fn();
    interceptor = new ClickInterceptor({ onClickBlocked });
  });

  afterEach(() => {
    interceptor.disable();
    vi.clearAllMocks();
  });

  // ============================================================================
  // ENABLE/DISABLE
  // ============================================================================

  describe("enable/disable", () => {
    it("should start disabled", () => {
      expect(interceptor.isActive()).toBe(false);
    });

    it("should enable click interception", () => {
      interceptor.enable();
      expect(interceptor.isActive()).toBe(true);
    });

    it("should disable click interception", () => {
      interceptor.enable();
      interceptor.disable();
      expect(interceptor.isActive()).toBe(false);
    });

    it("should be idempotent for enable", () => {
      interceptor.enable();
      interceptor.enable();
      expect(interceptor.isActive()).toBe(true);
    });

    it("should be idempotent for disable", () => {
      interceptor.disable();
      interceptor.disable();
      expect(interceptor.isActive()).toBe(false);
    });
  });

  // ============================================================================
  // TARGET MANAGEMENT
  // ============================================================================

  describe("target management", () => {
    it("should start with no target", () => {
      expect(interceptor.hasTarget()).toBe(false);
    });

    it("should set target element", () => {
      const button = document.createElement("button");
      interceptor.setTarget(button);
      expect(interceptor.hasTarget()).toBe(true);
    });

    it("should clear target", () => {
      const button = document.createElement("button");
      interceptor.setTarget(button);
      interceptor.clearTarget();
      expect(interceptor.hasTarget()).toBe(false);
    });

    it("should clear target on disable", () => {
      const button = document.createElement("button");
      interceptor.enable(); // Must enable first
      interceptor.setTarget(button);
      interceptor.disable();
      expect(interceptor.hasTarget()).toBe(false);
    });
  });

  // ============================================================================
  // CLICK BLOCKING
  // ============================================================================

  describe("click blocking", () => {
    it("should allow clicks when no target is set", () => {
      interceptor.enable();

      const button = document.createElement("button");
      document.body.appendChild(button);

      const event = new MouseEvent("click", { bubbles: true });
      button.dispatchEvent(event);

      expect(onClickBlocked).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);

      document.body.removeChild(button);
    });

    it("should allow clicks on target element", () => {
      const target = document.createElement("button");
      document.body.appendChild(target);

      interceptor.enable();
      interceptor.setTarget(target);

      // Create event with target set correctly
      const event = new MouseEvent("click", { bubbles: true });
      Object.defineProperty(event, "target", { value: target });

      // We can't really test the capture phase blocking in JSDOM
      // but we can verify the callback wasn't called when clicking target
      target.dispatchEvent(event);

      // Since we're clicking the target, onClickBlocked should not be called
      // Note: JSDOM doesn't fully support capture phase, so this test is limited
      document.body.removeChild(target);
    });

    it("should block clicks on non-target elements and call callback", () => {
      const target = document.createElement("button");
      const other = document.createElement("button");
      document.body.appendChild(target);
      document.body.appendChild(other);

      interceptor.enable();
      interceptor.setTarget(target);

      // Manually call the interceptor's click handler to test blocking logic
      // Since JSDOM doesn't fully support capture phase event prevention
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: other });

      // Simulate what the interceptor does internally
      // In real browser, this would be called during capture phase
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      const stopPropagationSpy = vi.spyOn(event, "stopPropagation");
      const stopImmediatePropagationSpy = vi.spyOn(
        event,
        "stopImmediatePropagation",
      );

      // Dispatch to trigger the capture handler
      // Note: We need to dispatch on document for capture phase
      document.dispatchEvent(event);

      // Verify blocking behavior occurred
      expect(onClickBlocked).toHaveBeenCalledWith(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
      expect(stopImmediatePropagationSpy).toHaveBeenCalled();

      document.body.removeChild(target);
      document.body.removeChild(other);
    });

    it("should allow clicks on allowed elements", () => {
      const target = document.createElement("button");
      const allowed = document.createElement("div");
      allowed.className = "walkthrough-tooltip";
      document.body.appendChild(target);
      document.body.appendChild(allowed);

      interceptor.enable();
      interceptor.setTarget(target, [allowed]);

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: allowed });

      // Dispatch on document (capture phase)
      document.dispatchEvent(event);

      // Should NOT be blocked
      expect(onClickBlocked).not.toHaveBeenCalled();

      document.body.removeChild(target);
      document.body.removeChild(allowed);
    });

    it("should allow clicks on elements with data-walkthrough-allow", () => {
      const target = document.createElement("button");
      const allowed = document.createElement("div");
      allowed.setAttribute("data-walkthrough-allow", "");
      document.body.appendChild(target);
      document.body.appendChild(allowed);

      interceptor.enable();
      interceptor.setTarget(target);

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: allowed });

      document.dispatchEvent(event);

      expect(onClickBlocked).not.toHaveBeenCalled();

      document.body.removeChild(target);
      document.body.removeChild(allowed);
    });

    it("should allow clicks on child of target", () => {
      const target = document.createElement("button");
      const child = document.createElement("span");
      target.appendChild(child);
      document.body.appendChild(target);

      interceptor.enable();
      interceptor.setTarget(target);

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: child });

      document.dispatchEvent(event);

      expect(onClickBlocked).not.toHaveBeenCalled();

      document.body.removeChild(target);
    });
  });

  // ============================================================================
  // VISUAL FEEDBACK
  // ============================================================================

  describe("visual feedback", () => {
    it("should add pulse class to target on blocked click", () => {
      vi.useFakeTimers();

      const target = document.createElement("button");
      const other = document.createElement("button");
      document.body.appendChild(target);
      document.body.appendChild(other);

      interceptor.enable();
      interceptor.setTarget(target);

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: other });

      document.dispatchEvent(event);

      // Check that pulse class was added
      expect(target.classList.contains("walkthrough-pulse")).toBe(true);

      // Advance timers to remove pulse
      vi.advanceTimersByTime(700);

      expect(target.classList.contains("walkthrough-pulse")).toBe(false);

      document.body.removeChild(target);
      document.body.removeChild(other);

      vi.useRealTimers();
    });
  });

  // ============================================================================
  // SESSION LIFECYCLE
  // ============================================================================

  describe("session lifecycle", () => {
    it("should maintain state across target changes", () => {
      const target1 = document.createElement("button");
      const target2 = document.createElement("button");

      interceptor.enable();
      expect(interceptor.isActive()).toBe(true);

      interceptor.setTarget(target1);
      expect(interceptor.hasTarget()).toBe(true);

      interceptor.setTarget(target2);
      expect(interceptor.hasTarget()).toBe(true);
      expect(interceptor.isActive()).toBe(true);

      interceptor.clearTarget();
      expect(interceptor.hasTarget()).toBe(false);
      expect(interceptor.isActive()).toBe(true); // Still active!
    });

    it("should update allowed elements with new target", () => {
      const target = document.createElement("button");
      const tooltip1 = document.createElement("div");
      const tooltip2 = document.createElement("div");

      interceptor.enable();
      interceptor.setTarget(target, [tooltip1]);

      // Update with new allowed elements
      interceptor.setTarget(target, [tooltip2]);

      // Only tooltip2 should be allowed now
      const event1 = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event1, "target", { value: tooltip1 });
      document.dispatchEvent(event1);
      expect(onClickBlocked).toHaveBeenCalledTimes(1);

      onClickBlocked.mockClear();

      const event2 = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event2, "target", { value: tooltip2 });
      document.dispatchEvent(event2);
      expect(onClickBlocked).not.toHaveBeenCalled();
    });
  });
});
