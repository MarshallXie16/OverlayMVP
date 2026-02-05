/**
 * BackgroundBridge Tests
 *
 * Tests for content script communication with background service worker.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { BackgroundBridge } from "../BackgroundBridge";

// ============================================================================
// MOCKS
// ============================================================================

// Mock chrome.runtime API
const mockSendMessage = vi.fn();
const mockAddListener = vi.fn();
const mockRemoveListener = vi.fn();

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
    onMessage: {
      addListener: mockAddListener,
      removeListener: mockRemoveListener,
    },
  },
});

// ============================================================================
// HELPERS
// ============================================================================

function createStateChangedMessage(machineState: string) {
  return {
    type: "WALKTHROUGH_STATE_CHANGED",
    state: {
      machineState,
      currentStepIndex: 0,
      steps: [],
      workflow: { id: 1, name: "Test" },
      tabs: { primaryTabId: 1, activeTabIds: [1], readyTabIds: [1] },
      timing: {
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        expiresAt: Date.now() + 1000,
      },
    },
    trigger: "TEST",
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("BackgroundBridge", () => {
  let bridge: BackgroundBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    bridge = new BackgroundBridge({
      debug: false,
      maxRetries: 2,
      baseDelay: 10,
    });
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

      expect(mockAddListener).toHaveBeenCalledTimes(1);
      expect(mockAddListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it("should not initialize twice", () => {
      bridge.initialize();
      bridge.initialize();

      expect(mockAddListener).toHaveBeenCalledTimes(1);
    });

    it("should destroy and remove message listener", () => {
      bridge.initialize();
      bridge.destroy();

      expect(mockRemoveListener).toHaveBeenCalledTimes(1);
    });

    it("should throw if used after destroy", () => {
      bridge.initialize();
      bridge.destroy();

      expect(() => bridge.initialize()).toThrow("destroyed");
    });

    it("should throw if sendCommand called before initialize", async () => {
      await expect(bridge.sendCommand("NEXT", {})).rejects.toThrow(
        "not initialized",
      );
    });
  });

  // ============================================================================
  // STATE SUBSCRIPTION
  // ============================================================================

  describe("State Subscription", () => {
    it("should notify listeners on STATE_CHANGED message", () => {
      bridge.initialize();

      const listener = vi.fn();
      bridge.subscribe(listener);

      // Get the message handler that was registered
      const messageHandler = mockAddListener.mock.calls[0][0] as (
        msg: unknown,
      ) => void;

      // Simulate state change message
      const message = createStateChangedMessage("SHOWING_STEP");
      messageHandler(message);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          machineState: "SHOWING_STEP",
        }),
      );
    });

    it("should not notify on non-state-changed messages", () => {
      bridge.initialize();

      const listener = vi.fn();
      bridge.subscribe(listener);

      const messageHandler = mockAddListener.mock.calls[0][0] as (
        msg: unknown,
      ) => void;

      // Simulate different message type
      messageHandler({ type: "SOMETHING_ELSE" });

      expect(listener).not.toHaveBeenCalled();
    });

    it("should allow unsubscribing", () => {
      bridge.initialize();

      const listener = vi.fn();
      const unsubscribe = bridge.subscribe(listener);

      unsubscribe();

      const messageHandler = mockAddListener.mock.calls[0][0] as (
        msg: unknown,
      ) => void;
      messageHandler(createStateChangedMessage("SHOWING_STEP"));

      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle listener errors gracefully", () => {
      bridge.initialize();

      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const normalListener = vi.fn();

      bridge.subscribe(errorListener);
      bridge.subscribe(normalListener);

      const messageHandler = mockAddListener.mock.calls[0][0] as (
        msg: unknown,
      ) => void;

      // Should not throw
      expect(() =>
        messageHandler(createStateChangedMessage("SHOWING_STEP")),
      ).not.toThrow();

      // Normal listener should still be called
      expect(normalListener).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // COMMAND SENDING
  // ============================================================================

  describe("sendCommand", () => {
    beforeEach(() => {
      bridge.initialize();
    });

    it("should send command message and return response", async () => {
      const response = {
        success: true,
        state: { machineState: "SHOWING_STEP" },
      };
      mockSendMessage.mockResolvedValueOnce(response);

      const result = await bridge.sendCommand("NEXT", {});

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "NEXT",
        payload: {},
      });
      expect(result).toEqual(response);
    });

    it("should send command with payload", async () => {
      mockSendMessage.mockResolvedValueOnce({ success: true });

      await bridge.sendCommand("JUMP_TO", { stepIndex: 5 });

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "JUMP_TO",
        payload: { stepIndex: 5 },
      });
    });

    it("should retry on transport error", async () => {
      const transportError = new Error("Receiving end does not exist");
      mockSendMessage
        .mockRejectedValueOnce(transportError)
        .mockResolvedValueOnce({ success: true });

      const result = await bridge.sendCommand("NEXT", {});

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });

    it("should retry multiple times up to maxRetries", async () => {
      const transportError = new Error("Receiving end does not exist");
      mockSendMessage
        .mockRejectedValueOnce(transportError)
        .mockRejectedValueOnce(transportError)
        .mockResolvedValueOnce({ success: true });

      const result = await bridge.sendCommand("NEXT", {});

      expect(mockSendMessage).toHaveBeenCalledTimes(3); // Initial + 2 retries
      expect(result).toEqual({ success: true });
    });

    it("should fail after exhausting retries", async () => {
      const transportError = new Error("Receiving end does not exist");
      mockSendMessage.mockRejectedValue(transportError);

      await expect(bridge.sendCommand("NEXT", {})).rejects.toThrow(
        "Receiving end does not exist",
      );

      expect(mockSendMessage).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should not retry on non-transport errors", async () => {
      const businessError = new Error("Invalid state transition");
      mockSendMessage.mockRejectedValueOnce(businessError);

      await expect(bridge.sendCommand("NEXT", {})).rejects.toThrow(
        "Invalid state transition",
      );

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // SPECIALIZED METHODS
  // ============================================================================

  describe("Specialized Methods", () => {
    beforeEach(() => {
      bridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });
    });

    it("reportElementFound should send correct message", async () => {
      await bridge.reportElementFound(3, 123);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_ELEMENT_STATUS",
        stepIndex: 3,
        found: true,
        tabId: 123,
      });
    });

    it("reportElementNotFound should send correct message", async () => {
      await bridge.reportElementNotFound(2, 456);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_ELEMENT_STATUS",
        stepIndex: 2,
        found: false,
        tabId: 456,
      });
    });

    it("reportHealingResult should send correct message", async () => {
      const result = {
        success: true,
        confidence: 0.85,
        aiValidated: true,
        healedSelector: "#new-selector",
        candidatesEvaluated: 5,
      };

      await bridge.reportHealingResult(1, result);

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_HEALING_RESULT",
        stepIndex: 1,
        result,
      });
    });

    it("logExecution should send message without retry", async () => {
      const entry = {
        timestamp: Date.now(),
        sessionId: "test-session",
        stepIndex: 0,
        eventType: "step_shown" as const,
      };

      // Make it fail
      mockSendMessage.mockRejectedValueOnce(
        new Error("Receiving end does not exist"),
      );

      // Should not throw
      await expect(bridge.logExecution(entry)).resolves.not.toThrow();

      // Should only try once (no retry for logs)
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it("getTabId should return tab ID from response", async () => {
      mockSendMessage.mockResolvedValueOnce({ tabId: 789 });

      const tabId = await bridge.getTabId();

      expect(tabId).toBe(789);
      expect(mockSendMessage).toHaveBeenCalledWith({ type: "GET_TAB_ID" });
    });

    it("getTabId should return null on error", async () => {
      mockSendMessage.mockRejectedValueOnce(new Error("Error"));

      const tabId = await bridge.getTabId();

      expect(tabId).toBeNull();
    });
  });

  // ============================================================================
  // RETRY CANCELLATION
  // ============================================================================

  describe("Retry Cancellation", () => {
    it("should cancel pending retries on IDLE state", async () => {
      bridge.initialize();

      // Set up a slow retry that will be cancelled
      const transportError = new Error("Receiving end does not exist");
      let resolvePromise: (value: unknown) => void;
      mockSendMessage.mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            resolvePromise = resolve;
            setTimeout(() => reject(transportError), 5);
          }),
      );

      // Start a command (will fail and start retrying)
      const commandPromise = bridge.sendCommand("NEXT", {});

      // Wait a bit for retry to start
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Simulate IDLE state (session ended)
      const messageHandler = mockAddListener.mock.calls[0][0] as (
        msg: unknown,
      ) => void;
      messageHandler(createStateChangedMessage("IDLE"));

      // Command should be cancelled
      await expect(commandPromise).rejects.toThrow("cancelled");
    });

    it("should cancel pending retries on destroy", async () => {
      bridge.initialize();

      const transportError = new Error("Receiving end does not exist");
      mockSendMessage.mockRejectedValue(transportError);

      // Start a command
      const commandPromise = bridge.sendCommand("NEXT", {});

      // Destroy immediately
      bridge.destroy();

      // Command should be cancelled
      await expect(commandPromise).rejects.toThrow(/cancelled|aborted/i);
    });
  });
});
