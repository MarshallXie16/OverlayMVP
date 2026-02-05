/**
 * StepRouter Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StepRouter } from "../StepRouter";
import type { SessionManager } from "../SessionManager";
import type { WalkthroughState } from "../../../shared/walkthrough";

// Mock chrome API
const mockChrome = {
  tabs: {
    update: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ url: "https://example.com/page1" }),
  },
};

vi.stubGlobal("chrome", mockChrome);

// Helper to create a mock state
function createMockState(
  overrides: Partial<WalkthroughState> = {},
): WalkthroughState {
  return {
    sessionId: "test-session",
    machineState: "WAITING_ACTION",
    previousState: null,
    workflowId: 123,
    workflowName: "Test Workflow",
    startingUrl: "https://example.com/start",
    steps: [
      {
        id: 1,
        step_number: 1,
        action_type: "click",
        element_name: "Button 1",
        page_context: { url: "https://example.com/page1" },
      } as any,
      {
        id: 2,
        step_number: 2,
        action_type: "click",
        element_name: "Button 2",
        page_context: { url: "https://example.com/page1" },
      } as any,
      {
        id: 3,
        step_number: 3,
        action_type: "click",
        element_name: "Button 3",
        page_context: { url: "https://example.com/page2" },
      } as any,
    ],
    totalSteps: 3,
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

describe("StepRouter", () => {
  let router: StepRouter;
  let mockSessionManager: Partial<SessionManager>;
  let mockState: WalkthroughState;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockState();
    mockSessionManager = {
      getState: vi.fn().mockResolvedValue(mockState),
      dispatch: vi.fn().mockResolvedValue(mockState),
    };
    router = new StepRouter(mockSessionManager as SessionManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("next()", () => {
    it("should advance to next step on same page", async () => {
      const result = await router.next();

      expect(result.success).toBe(true);
      expect(result.navigating).toBe(false);
      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "JUMP_TO_STEP",
        stepIndex: 1,
      });
    });

    it("should trigger navigation when next step is on different page", async () => {
      mockState.currentStepIndex = 1; // On step 2, going to step 3 (different page)

      const result = await router.next();

      expect(result.success).toBe(true);
      expect(result.navigating).toBe(true);
      expect(mockChrome.tabs.update).toHaveBeenCalledWith(1, {
        url: "https://example.com/page2",
      });
    });

    it("should return invalid_index when at last step", async () => {
      mockState.currentStepIndex = 2; // At last step

      const result = await router.next();

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid_index");
    });

    it("should return no_session when no active session", async () => {
      (mockSessionManager.getState as any).mockResolvedValue(null);

      const result = await router.next();

      expect(result.success).toBe(false);
      expect(result.reason).toBe("no_session");
    });
  });

  describe("previous()", () => {
    it("should go back to previous step", async () => {
      mockState.currentStepIndex = 1;

      const result = await router.previous();

      expect(result.success).toBe(true);
      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "JUMP_TO_STEP",
        stepIndex: 0,
      });
    });

    it("should return invalid_index at first step", async () => {
      mockState.currentStepIndex = 0;

      const result = await router.previous();

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid_index");
    });
  });

  describe("jumpToStep()", () => {
    it("should jump to valid step index", async () => {
      const result = await router.jumpToStep(2);

      expect(result.success).toBe(true);
      expect(mockSessionManager.dispatch).toHaveBeenCalled();
    });

    it("should return invalid_index for negative index", async () => {
      const result = await router.jumpToStep(-1);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid_index");
    });

    it("should return invalid_index for out of bounds index", async () => {
      const result = await router.jumpToStep(10);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("invalid_index");
    });

    it("should return same_step when jumping to current step", async () => {
      const result = await router.jumpToStep(0);

      expect(result.success).toBe(false);
      expect(result.reason).toBe("same_step");
    });
  });

  describe("retry()", () => {
    it("should dispatch RETRY event", async () => {
      const result = await router.retry();

      expect(result.success).toBe(true);
      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "RETRY",
      });
    });
  });

  describe("restart()", () => {
    it("should jump to step 0", async () => {
      mockState.currentStepIndex = 2;

      const result = await router.restart();

      expect(result.success).toBe(true);
      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "JUMP_TO_STEP",
        stepIndex: 0,
      });
    });
  });

  describe("URL matching", () => {
    it("should match URLs ignoring query params", async () => {
      mockChrome.tabs.get.mockResolvedValue({
        url: "https://example.com/page1?session=123",
      });

      const result = await router.next();

      // Should treat it as same page since path matches
      expect(result.success).toBe(true);
      expect(result.navigating).toBe(false);
    });

    it("should treat target root URL as match within same origin", async () => {
      mockChrome.tabs.get.mockResolvedValue({
        url: "https://example.com/search?q=clawdbot",
      });
      mockState.steps[1] = {
        ...mockState.steps[1],
        page_context: { url: "https://example.com/" },
      } as any;

      const result = await router.next();

      expect(result.success).toBe(true);
      expect(result.navigating).toBe(false);
      expect(mockChrome.tabs.update).not.toHaveBeenCalled();
    });

    it("should match URLs with trailing slash variations", async () => {
      mockChrome.tabs.get.mockResolvedValue({
        url: "https://example.com/page1/",
      });
      mockState.steps[1] = {
        ...mockState.steps[1],
        page_context: { url: "https://example.com/page1" },
      } as any;

      const result = await router.next();

      expect(result.success).toBe(true);
      expect(result.navigating).toBe(false);
    });
  });
});
