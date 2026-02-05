/**
 * DashboardBridge Tests
 *
 * Tests for dashboard window.postMessage communication.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DashboardBridge } from "../DashboardBridge";

// ============================================================================
// MOCKS
// ============================================================================

// Mock chrome.runtime API
const mockSendMessage = vi.fn();

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
  },
});

// Mock window.addEventListener/removeEventListener
const addEventListenerSpy = vi.spyOn(window, "addEventListener");
const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

// ============================================================================
// HELPERS
// ============================================================================

function createDashboardMessage(workflowId: number) {
  return {
    source: "overlay-dashboard" as const,
    type: "START_WALKTHROUGH" as const,
    payload: { workflowId },
  };
}

function dispatchMessageEvent(
  data: unknown,
  origin: string = "http://localhost:3000",
) {
  const event = new MessageEvent("message", {
    data,
    origin,
  });
  window.dispatchEvent(event);
}

// ============================================================================
// TESTS
// ============================================================================

describe("DashboardBridge", () => {
  let bridge: DashboardBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new DashboardBridge({ debug: false });
  });

  afterEach(() => {
    if (bridge) {
      try {
        bridge.destroy();
      } catch {
        // May already be destroyed
      }
    }
  });

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  describe("Lifecycle", () => {
    it("should initialize and set up message listener", () => {
      bridge.initialize();

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "message",
        expect.any(Function),
      );
    });

    it("should not initialize twice", () => {
      bridge.initialize();
      const callCount = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "message",
      ).length;

      bridge.initialize();

      const newCallCount = addEventListenerSpy.mock.calls.filter(
        (call) => call[0] === "message",
      ).length;
      expect(newCallCount).toBe(callCount);
    });

    it("should destroy and remove message listener", () => {
      bridge.initialize();
      bridge.destroy();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "message",
        expect.any(Function),
      );
    });

    it("should throw if used after destroy", () => {
      bridge.initialize();
      bridge.destroy();

      expect(() => bridge.initialize()).toThrow("destroyed");
    });
  });

  // ============================================================================
  // ORIGIN VALIDATION
  // ============================================================================

  describe("Origin Validation", () => {
    beforeEach(() => {
      bridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true, tabId: 1 });
    });

    it("should accept messages from localhost:3000", () => {
      dispatchMessageEvent(
        createDashboardMessage(123),
        "http://localhost:3000",
      );

      expect(mockSendMessage).toHaveBeenCalled();
    });

    it("should accept messages from 127.0.0.1:3000", () => {
      dispatchMessageEvent(
        createDashboardMessage(123),
        "http://127.0.0.1:3000",
      );

      expect(mockSendMessage).toHaveBeenCalled();
    });

    it("should accept messages from https localhost", () => {
      dispatchMessageEvent(
        createDashboardMessage(123),
        "https://localhost:3000",
      );

      expect(mockSendMessage).toHaveBeenCalled();
    });

    it("should reject messages from unknown origins", () => {
      dispatchMessageEvent(
        createDashboardMessage(123),
        "https://malicious.com",
      );

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should reject messages from wrong port", () => {
      dispatchMessageEvent(
        createDashboardMessage(123),
        "http://localhost:4000",
      );

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should accept additional origins from config", () => {
      bridge.destroy();
      bridge = new DashboardBridge({
        additionalOrigins: ["https://app.overlay.com"],
        debug: false,
      });
      bridge.initialize();

      dispatchMessageEvent(
        createDashboardMessage(123),
        "https://app.overlay.com",
      );

      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // MESSAGE VALIDATION
  // ============================================================================

  describe("Message Validation", () => {
    beforeEach(() => {
      bridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true, tabId: 1 });
    });

    it("should reject messages without source identifier", () => {
      dispatchMessageEvent({
        type: "START_WALKTHROUGH",
        payload: { workflowId: 123 },
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should reject messages with wrong source", () => {
      dispatchMessageEvent({
        source: "malicious-source",
        type: "START_WALKTHROUGH",
        payload: { workflowId: 123 },
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should reject messages with wrong type", () => {
      dispatchMessageEvent({
        source: "overlay-dashboard",
        type: "UNKNOWN_TYPE",
        payload: { workflowId: 123 },
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should reject messages without payload", () => {
      dispatchMessageEvent({
        source: "overlay-dashboard",
        type: "START_WALKTHROUGH",
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should reject messages with invalid workflowId", () => {
      dispatchMessageEvent({
        source: "overlay-dashboard",
        type: "START_WALKTHROUGH",
        payload: { workflowId: "not-a-number" },
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should reject null messages", () => {
      dispatchMessageEvent(null);

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should reject non-object messages", () => {
      dispatchMessageEvent("string message");

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // MESSAGE FORWARDING
  // ============================================================================

  describe("Message Forwarding", () => {
    beforeEach(() => {
      bridge.initialize();
    });

    it("should forward valid START_WALKTHROUGH to background", () => {
      mockSendMessage.mockResolvedValue({ success: true, tabId: 1 });

      dispatchMessageEvent(createDashboardMessage(456));

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "START_WALKTHROUGH",
        workflowId: 456,
      });
    });

    it("should handle background success response", async () => {
      mockSendMessage.mockResolvedValue({ success: true, tabId: 42 });

      dispatchMessageEvent(createDashboardMessage(789));

      // Wait for async handling
      await vi.waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalled();
      });

      // No throw = success
    });

    it("should handle background error response gracefully", async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: "Workflow not found",
      });

      // Should not throw
      expect(() =>
        dispatchMessageEvent(createDashboardMessage(999)),
      ).not.toThrow();
    });

    it("should handle background rejection gracefully", async () => {
      mockSendMessage.mockRejectedValue(new Error("Connection lost"));

      // Should not throw
      expect(() =>
        dispatchMessageEvent(createDashboardMessage(111)),
      ).not.toThrow();
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle messages before initialization", () => {
      // Don't initialize - messages should be ignored
      dispatchMessageEvent(createDashboardMessage(123));

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should handle messages after destruction", () => {
      bridge.initialize();
      bridge.destroy();

      dispatchMessageEvent(createDashboardMessage(123));

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });
});
