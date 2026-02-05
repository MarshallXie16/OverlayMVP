import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../SessionManager", () => ({
  sessionManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getState: vi.fn(),
    getStateForTab: vi.fn(),
    addTab: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
  },
}));

import { handleWalkthroughMessage } from "../messageHandlers";
import { sessionManager } from "../SessionManager";

describe("handleWalkthroughMessage guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should ignore ELEMENT_STATUS when stepIndex does not match current step", async () => {
    (sessionManager.getState as any).mockResolvedValue({
      machineState: "SHOWING_STEP",
      currentStepIndex: 0,
    });

    const sendResponse = vi.fn();
    const handled = await handleWalkthroughMessage(
      {
        type: "WALKTHROUGH_ELEMENT_STATUS",
        stepIndex: 1,
        found: true,
        tabId: 1,
      },
      { tab: { id: 1 } } as any,
      sendResponse,
    );

    expect(handled).toBe(true);
    expect(sessionManager.dispatch).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it("should dispatch ELEMENT_FOUND when ELEMENT_STATUS matches current step", async () => {
    (sessionManager.getState as any).mockResolvedValue({
      machineState: "SHOWING_STEP",
      currentStepIndex: 1,
    });

    const sendResponse = vi.fn();
    await handleWalkthroughMessage(
      {
        type: "WALKTHROUGH_ELEMENT_STATUS",
        stepIndex: 1,
        found: true,
        tabId: 1,
      },
      { tab: { id: 1 } } as any,
      sendResponse,
    );

    expect(sessionManager.dispatch).toHaveBeenCalledWith({
      type: "ELEMENT_FOUND",
      stepIndex: 1,
    });
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it("should ignore REPORT_ACTION when payload.stepIndex does not match current step", async () => {
    (sessionManager.getState as any).mockResolvedValue({
      sessionId: "s",
      machineState: "WAITING_ACTION",
      currentStepIndex: 0,
    });

    const sendResponse = vi.fn();
    await handleWalkthroughMessage(
      {
        type: "WALKTHROUGH_COMMAND",
        command: "REPORT_ACTION",
        payload: {
          stepIndex: 1,
          actionType: "click",
          valid: true,
        },
      },
      {} as any,
      sendResponse,
    );

    expect(sessionManager.dispatch).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      state: expect.objectContaining({ currentStepIndex: 0 }),
    });
  });

  it("should schedule NEXT_STEP after valid REPORT_ACTION when stepIndex matches current step", async () => {
    vi.useFakeTimers();

    (sessionManager.getState as any)
      // stateBefore
      .mockResolvedValueOnce({
        sessionId: "s",
        machineState: "WAITING_ACTION",
        currentStepIndex: 0,
      })
      // scheduledState
      .mockResolvedValueOnce({
        sessionId: "s",
        machineState: "TRANSITIONING",
        currentStepIndex: 0,
      })
      // state for response
      .mockResolvedValueOnce({
        sessionId: "s",
        machineState: "TRANSITIONING",
        currentStepIndex: 0,
      })
      // state inside timer
      .mockResolvedValueOnce({
        sessionId: "s",
        machineState: "TRANSITIONING",
        currentStepIndex: 0,
      });

    const sendResponse = vi.fn();
    await handleWalkthroughMessage(
      {
        type: "WALKTHROUGH_COMMAND",
        command: "REPORT_ACTION",
        payload: {
          stepIndex: 0,
          actionType: "click",
          valid: true,
          causesNavigation: false,
        },
      },
      {} as any,
      sendResponse,
    );

    await vi.runAllTimersAsync();

    expect(sessionManager.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ACTION_DETECTED",
        stepIndex: 0,
      }),
    );
    expect(sessionManager.dispatch).toHaveBeenCalledWith({ type: "NEXT_STEP" });
  });

  it("should ignore HEALING_RESULT when not currently in HEALING for that step", async () => {
    (sessionManager.getState as any).mockResolvedValue({
      machineState: "WAITING_ACTION",
      currentStepIndex: 0,
    });

    const sendResponse = vi.fn();
    const handled = await handleWalkthroughMessage(
      {
        type: "WALKTHROUGH_HEALING_RESULT",
        stepIndex: 0,
        result: { success: true, confidence: 0.82, aiValidated: false } as any,
      },
      {} as any,
      sendResponse,
    );

    expect(handled).toBe(true);
    expect(sessionManager.dispatch).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it("should dispatch HEAL_SUCCESS when HEALING_RESULT matches current healing step", async () => {
    (sessionManager.getState as any).mockResolvedValue({
      machineState: "HEALING",
      currentStepIndex: 1,
    });

    const sendResponse = vi.fn();
    await handleWalkthroughMessage(
      {
        type: "WALKTHROUGH_HEALING_RESULT",
        stepIndex: 1,
        result: { success: true, confidence: 0.82, aiValidated: false } as any,
      },
      {} as any,
      sendResponse,
    );

    expect(sessionManager.dispatch).toHaveBeenCalledWith({
      type: "HEAL_SUCCESS",
      stepIndex: 1,
      confidence: 0.82,
      aiValidated: false,
    });
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});
