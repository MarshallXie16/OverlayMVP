import { describe, it, expect, beforeEach, vi } from "vitest";
import { WalkthroughController } from "../WalkthroughController";
import type { WalkthroughState } from "../../../shared/walkthrough";
import type { StepResponse } from "../../../shared/types";

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

const mockHealElement = vi.fn();

vi.mock("../../healing", () => ({
  healElement: (...args: unknown[]) => mockHealElement(...args),
}));

function createStep(overrides: Partial<StepResponse> = {}): StepResponse {
  return {
    id: 1,
    workflow_id: 1,
    step_number: 1,
    timestamp: null,
    action_type: "click",
    selectors: { primary: null, css: null, xpath: null, data_testid: null },
    element_meta: { tag_name: "a", text: "Link" },
    page_context: {},
    action_data: null,
    dom_context: null,
    screenshot_id: null,
    field_label: "Test link",
    instruction: "Click it",
    ai_confidence: null,
    ai_model: null,
    ai_generated_at: null,
    label_edited: false,
    instruction_edited: false,
    edited_by: null,
    edited_at: null,
    healed_selectors: null,
    healed_at: null,
    healing_confidence: null,
    healing_method: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createState(overrides: Partial<WalkthroughState> = {}): WalkthroughState {
  const step = createStep();
  return {
    sessionId: "s1",
    machineState: "HEALING",
    previousState: null,
    workflowId: 1,
    workflowName: "W",
    startingUrl: "https://example.com",
    steps: [step],
    totalSteps: 1,
    currentStepIndex: 0,
    completedStepIndexes: [],
    errorInfo: { type: null, message: null, stepIndex: null, retryCount: 0 },
    healingInfo: null,
    navigation: {
      inProgress: false,
      tabId: 1,
      sourceUrl: null,
      targetUrl: null,
      startedAt: null,
    },
    tabs: { primaryTabId: 1, activeTabIds: [1], readyTabIds: [1] },
    timing: {
      sessionStartedAt: Date.now(),
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 1000,
    },
    stepRetries: {},
    ...overrides,
  };
}

describe("WalkthroughController healing flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("reports healing result only once and stores healed element for WAITING_ACTION", async () => {
    const controller = new WalkthroughController({ debug: false });
    (controller as any).currentState = createState();

    const ui = {
      showHealing: vi.fn(),
      showHealedElement: vi.fn(),
      showStep: vi.fn(),
    };
    (controller as any).ui = ui;

    const healedEl = document.createElement("a");
    healedEl.href = "https://example.com/healed";

    mockHealElement.mockImplementationOnce(
      async (_step: StepResponse, options: any) => {
        const promptPromise = options.onUserPrompt(healedEl, 0.82);
        await vi.waitFor(() =>
          expect((controller as any).healingConfirmResolver).not.toBeNull(),
        );
        (controller as any).handleHealingConfirmation(true);
        await promptPromise;
        return {
          success: true,
          element: healedEl,
          confidence: 0.82,
          resolution: "healed_user",
          scoringResult: null,
          candidatesEvaluated: 1,
          aiConfidence: null,
          healingLog: {
            timestamp: Date.now(),
            stepId: 1,
            workflowId: 1,
            status: "user_confirmed",
            deterministicScore: 0.82,
            aiConfidence: null,
            finalConfidence: 0.82,
            candidatesEvaluated: 1,
            topCandidateScore: 0.82,
            runnerUpScore: null,
            vetoesApplied: [],
            factorScores: {},
            originalContext: {},
            selectedContext: null,
          },
        };
      },
    );

    mockSendMessage.mockResolvedValue({ success: true });

    await (controller as any).showHealingIndicator();

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "WALKTHROUGH_HEALING_RESULT",
      stepIndex: 0,
      result: expect.objectContaining({ success: true, confidence: 0.82 }),
    });

    expect((controller as any).currentTargetElement).toBe(healedEl);
    expect((controller as any).currentTargetStepIndex).toBe(0);
    expect(ui.showStep).toHaveBeenCalledWith(healedEl, expect.any(Object));
  });

  it("reports HEAL_FAILED when user closes healing before confirmation", async () => {
    const controller = new WalkthroughController({ debug: false });
    (controller as any).currentState = createState();
    (controller as any).healingInProgress = true;

    mockSendMessage.mockResolvedValue({ success: true });

    await (controller as any).handleHealingRejectFromUI();

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "WALKTHROUGH_HEALING_RESULT",
      stepIndex: 0,
      result: expect.objectContaining({
        success: false,
        failureReason: "User canceled auto-healing",
      }),
    });
    expect((controller as any).healingInProgress).toBe(false);
  });
});
