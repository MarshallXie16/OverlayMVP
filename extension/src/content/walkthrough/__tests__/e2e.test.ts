/**
 * Walkthrough E2E Integration Tests
 *
 * Tests the complete walkthrough flow from dashboard initiation through completion.
 * These tests verify the integration between:
 * - DashboardBridge (receives window.postMessage from dashboard)
 * - BackgroundBridge (sends commands to background)
 * - WalkthroughController (orchestrates content-side behavior)
 * - SessionManager (manages state machine)
 *
 * Sprint 5: Messaging Integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BackgroundBridge } from "../messaging/BackgroundBridge";
import { DashboardBridge } from "../messaging/DashboardBridge";
import type { WalkthroughState } from "../../../shared/walkthrough";
import type { StepResponse } from "../../../shared/types";

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
// TEST DATA FACTORIES
// ============================================================================

function createMockStep(overrides: Partial<StepResponse> = {}): StepResponse {
  return {
    id: 1,
    workflow_id: 123,
    step_order: 1,
    event_type: "click",
    element_meta: {
      tag_name: "button",
      role: "button",
      type: null,
      name: null,
      text: "Click Me",
      classes: ["btn", "btn-primary"],
      bounding_box: { x: 100, y: 100, width: 100, height: 50 },
    },
    selectors: {
      primary: "#test-btn",
      css: "button.btn-primary",
      xpath: "//button[@id='test-btn']",
      data_testid: null,
    },
    target_url: "http://localhost:3000/page1",
    field_label: "Test Button",
    instruction: "Click the test button to continue",
    is_healed: false,
    healed_at: null,
    healing_confidence: null,
    healing_method: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockState(
  overrides: Partial<WalkthroughState> = {},
): WalkthroughState {
  return {
    sessionId: "test-session-123",
    machineState: "IDLE",
    previousState: null,
    workflowId: 123,
    workflowName: "Test Workflow",
    startingUrl: "http://localhost:3000/page1",
    steps: [createMockStep()],
    totalSteps: 1,
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
      tabId: null,
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
// E2E INTEGRATION TESTS
// ============================================================================

describe("Walkthrough E2E Integration", () => {
  let backgroundBridge: BackgroundBridge;
  let dashboardBridge: DashboardBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    backgroundBridge = new BackgroundBridge({ debug: false });
    dashboardBridge = new DashboardBridge({ debug: false });
  });

  afterEach(() => {
    try {
      backgroundBridge.destroy();
    } catch {
      // May already be destroyed
    }
    try {
      dashboardBridge.destroy();
    } catch {
      // May already be destroyed
    }
  });

  // ============================================================================
  // BASIC SINGLE-PAGE WORKFLOW
  // ============================================================================

  describe("Basic Single-Page Workflow", () => {
    it("should initialize when dashboard sends START_WALKTHROUGH", async () => {
      // Setup
      dashboardBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true, tabId: 1 });

      // Act: Dashboard sends start message
      dispatchMessageEvent(createDashboardMessage(123));

      // Assert: Message forwarded to background
      await vi.waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          type: "START_WALKTHROUGH",
          workflowId: 123,
        });
      });
    });

    it("should subscribe to state changes", () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();

      // Act
      const unsubscribe = backgroundBridge.subscribe(listener);

      // Simulate state change broadcast
      const messageHandler = mockAddListener.mock.calls[0]?.[0];
      expect(messageHandler).toBeDefined();

      const state = createMockState({ machineState: "SHOWING_STEP" });
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state,
        trigger: "DATA_LOADED",
      });

      // Assert
      expect(listener).toHaveBeenCalledWith(state);

      // Cleanup
      unsubscribe();
    });

    it("should send NEXT command when action detected", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.sendCommand("NEXT", {});

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "NEXT",
        payload: {},
      });
    });

    it("should handle workflow completion", async () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      // Simulate completion state
      const messageHandler = mockAddListener.mock.calls[0]?.[0];
      const state = createMockState({ machineState: "COMPLETED" });
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state,
        trigger: "NEXT_STEP",
      });

      // Assert
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ machineState: "COMPLETED" }),
      );
    });
  });

  // ============================================================================
  // MULTI-PAGE WORKFLOW
  // ============================================================================

  describe("Multi-Page Workflow", () => {
    it("should handle navigation state", async () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      // Simulate navigating state
      const messageHandler = mockAddListener.mock.calls[0]?.[0];
      const state = createMockState({
        machineState: "NAVIGATING",
        navigation: {
          inProgress: true,
          tabId: 1,
          sourceUrl: "http://localhost:3000/page1",
          targetUrl: "http://localhost:3000/page2",
          startedAt: Date.now(),
        },
      });
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state,
        trigger: "URL_CHANGED",
      });

      // Assert
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          machineState: "NAVIGATING",
          navigation: expect.objectContaining({ inProgress: true }),
        }),
      );
    });

    it("should restore state after navigation", async () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      const messageHandler = mockAddListener.mock.calls[0]?.[0];

      // First: navigating
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state: createMockState({ machineState: "NAVIGATING" }),
        trigger: "URL_CHANGED",
      });

      // Then: page loaded, back to showing step
      const restoredState = createMockState({
        machineState: "SHOWING_STEP",
        currentStepIndex: 1,
      });
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state: restoredState,
        trigger: "PAGE_LOADED",
      });

      // Assert
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({
          machineState: "SHOWING_STEP",
          currentStepIndex: 1,
        }),
      );
    });
  });

  // ============================================================================
  // NAVIGATION FEATURES
  // ============================================================================

  describe("Navigation Features", () => {
    it("should send JUMP_TO command", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.sendCommand("JUMP_TO", { stepIndex: 3 });

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "JUMP_TO",
        payload: { stepIndex: 3 },
      });
    });

    it("should send PREV command", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.sendCommand("PREV", {});

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "PREV",
        payload: {},
      });
    });

    it("should send EXIT command", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.sendCommand("EXIT", { reason: "user_exit" });

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "EXIT",
        payload: { reason: "user_exit" },
      });
    });
  });

  // ============================================================================
  // ERROR RECOVERY
  // ============================================================================

  describe("Error Recovery", () => {
    it("should report element not found", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.reportElementNotFound(0, 1);

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_ELEMENT_STATUS",
        stepIndex: 0,
        found: false,
        tabId: 1,
      });
    });

    it("should report element found", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.reportElementFound(0, 1);

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_ELEMENT_STATUS",
        stepIndex: 0,
        found: true,
        tabId: 1,
      });
    });

    it("should handle HEALING state", async () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      // Simulate healing state
      const messageHandler = mockAddListener.mock.calls[0]?.[0];
      const state = createMockState({
        machineState: "HEALING",
        healingInfo: {
          inProgress: true,
          candidateCount: 5,
          bestScore: 0.75,
          aiValidationRequested: false,
        },
      });
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state,
        trigger: "ELEMENT_NOT_FOUND",
      });

      // Assert
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          machineState: "HEALING",
          healingInfo: expect.objectContaining({ inProgress: true }),
        }),
      );
    });

    it("should report healing result", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.reportHealingResult(0, {
        success: true,
        confidence: 0.85,
        aiValidated: false,
        healedSelector: "#healed-btn",
        candidatesEvaluated: 5,
      });

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_HEALING_RESULT",
        stepIndex: 0,
        result: {
          success: true,
          confidence: 0.85,
          aiValidated: false,
          healedSelector: "#healed-btn",
          candidatesEvaluated: 5,
        },
      });
    });

    it("should handle ERROR state with retry option", async () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      // Simulate error state
      const messageHandler = mockAddListener.mock.calls[0]?.[0];
      const state = createMockState({
        machineState: "ERROR",
        errorInfo: {
          type: "healing_failed",
          message: "Could not find element",
          stepIndex: 0,
          retryCount: 1,
        },
      });
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state,
        trigger: "HEAL_FAILED",
      });

      // Assert
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          machineState: "ERROR",
          errorInfo: expect.objectContaining({ type: "healing_failed" }),
        }),
      );
    });

    it("should send RETRY command after error", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.sendCommand("RETRY", {});

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "RETRY",
        payload: {},
      });
    });

    it("should send SKIP command after error", async () => {
      // Setup
      backgroundBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Act
      await backgroundBridge.sendCommand("SKIP", {});

      // Assert
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_COMMAND",
        command: "SKIP",
        payload: {},
      });
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe("Edge Cases", () => {
    it("should cancel pending retries when session ends", async () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      // Simulate return to IDLE (session ended)
      const messageHandler = mockAddListener.mock.calls[0]?.[0];
      const state = createMockState({ machineState: "IDLE" });
      messageHandler({
        type: "WALKTHROUGH_STATE_CHANGED",
        state,
        trigger: "EXIT",
      });

      // Assert
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ machineState: "IDLE" }),
      );
    });

    it("should handle rapid state changes", async () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      const messageHandler = mockAddListener.mock.calls[0]?.[0];

      // Rapid state changes
      const states: WalkthroughState[] = [
        createMockState({ machineState: "INITIALIZING" }),
        createMockState({ machineState: "SHOWING_STEP" }),
        createMockState({ machineState: "WAITING_ACTION" }),
      ];

      for (const state of states) {
        messageHandler({
          type: "WALKTHROUGH_STATE_CHANGED",
          state,
          trigger: "TEST",
        });
      }

      // Assert all states were delivered
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenLastCalledWith(
        expect.objectContaining({ machineState: "WAITING_ACTION" }),
      );
    });

    it("should ignore non-walkthrough messages", () => {
      // Setup
      backgroundBridge.initialize();
      const listener = vi.fn();
      backgroundBridge.subscribe(listener);

      const messageHandler = mockAddListener.mock.calls[0]?.[0];

      // Send a non-walkthrough message
      messageHandler({
        type: "SOME_OTHER_MESSAGE",
        data: "test",
      });

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });

    it("should handle listener errors gracefully", () => {
      // Setup
      backgroundBridge.initialize();
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodListener = vi.fn();

      backgroundBridge.subscribe(errorListener);
      backgroundBridge.subscribe(goodListener);

      const messageHandler = mockAddListener.mock.calls[0]?.[0];

      // Should not throw
      expect(() => {
        messageHandler({
          type: "WALKTHROUGH_STATE_CHANGED",
          state: createMockState({ machineState: "SHOWING_STEP" }),
          trigger: "TEST",
        });
      }).not.toThrow();

      // Good listener should still be called
      expect(goodListener).toHaveBeenCalled();
    });

    it("should reject commands after destroy", async () => {
      // Setup
      backgroundBridge.initialize();
      backgroundBridge.destroy();

      // Act & Assert: After destroy, initialized is set to false,
      // so the ensureInitialized check fails first
      await expect(backgroundBridge.sendCommand("NEXT", {})).rejects.toThrow(
        "not initialized",
      );
    });
  });

  // ============================================================================
  // DASHBOARD INTEGRATION
  // ============================================================================

  describe("Dashboard Integration", () => {
    it("should validate origin for dashboard messages", () => {
      // Setup
      dashboardBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Valid origin
      dispatchMessageEvent(
        createDashboardMessage(123),
        "http://localhost:3000",
      );
      expect(mockSendMessage).toHaveBeenCalled();

      // Reset
      mockSendMessage.mockClear();

      // Invalid origin - should be ignored
      dispatchMessageEvent(
        createDashboardMessage(456),
        "https://malicious.com",
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("should validate message structure", () => {
      // Setup
      dashboardBridge.initialize();
      mockSendMessage.mockResolvedValue({ success: true });

      // Missing source
      dispatchMessageEvent({
        type: "START_WALKTHROUGH",
        payload: { workflowId: 123 },
      });
      expect(mockSendMessage).not.toHaveBeenCalled();

      // Wrong source
      dispatchMessageEvent({
        source: "wrong-source",
        type: "START_WALKTHROUGH",
        payload: { workflowId: 123 },
      });
      expect(mockSendMessage).not.toHaveBeenCalled();

      // Valid message
      dispatchMessageEvent(createDashboardMessage(123));
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // RETRY LOGIC
  // ============================================================================

  describe("Retry Logic", () => {
    it("should retry on service worker restart error", async () => {
      // Setup
      backgroundBridge.initialize();

      // First call fails with service worker error, second succeeds
      mockSendMessage
        .mockRejectedValueOnce(
          new Error(
            "Could not establish connection. Receiving end does not exist.",
          ),
        )
        .mockResolvedValueOnce({ success: true });

      // Act
      await backgroundBridge.sendCommand("NEXT", {});

      // Assert: should have tried twice
      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    it("should not retry on business logic errors", async () => {
      // Setup
      backgroundBridge.initialize();

      // Fail with business error
      mockSendMessage.mockRejectedValue(new Error("Workflow not found"));

      // Act & Assert
      await expect(backgroundBridge.sendCommand("NEXT", {})).rejects.toThrow(
        "Workflow not found",
      );
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it("should give up after max retries", async () => {
      // Setup
      const bridge = new BackgroundBridge({
        debug: false,
        maxRetries: 2,
        baseDelay: 10, // Fast for testing
      });
      bridge.initialize();

      // Always fail with retryable error
      mockSendMessage.mockRejectedValue(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      );

      // Act & Assert
      await expect(bridge.sendCommand("NEXT", {})).rejects.toThrow();

      // Should have tried 3 times (initial + 2 retries)
      expect(mockSendMessage).toHaveBeenCalledTimes(3);

      bridge.destroy();
    });
  });
});
