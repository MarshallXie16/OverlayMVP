/**
 * TabManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TabManager } from "../TabManager";
import type { SessionManager } from "../SessionManager";
import type { WalkthroughState } from "../../../shared/walkthrough";

// Mock chrome API
const mockOnRemovedListeners: Array<
  (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => void
> = [];

const mockChrome = {
  tabs: {
    onRemoved: {
      addListener: vi.fn((listener) => mockOnRemovedListeners.push(listener)),
      removeListener: vi.fn((listener) => {
        const index = mockOnRemovedListeners.indexOf(listener);
        if (index > -1) mockOnRemovedListeners.splice(index, 1);
      }),
    },
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
    steps: [],
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
      activeTabIds: [1, 2],
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

describe("TabManager", () => {
  let tabManager: TabManager;
  let mockSessionManager: Partial<SessionManager>;
  let mockState: WalkthroughState;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnRemovedListeners.length = 0;
    mockState = createMockState();
    mockSessionManager = {
      getState: vi.fn().mockResolvedValue(mockState),
      addTab: vi.fn().mockResolvedValue(undefined),
      removeTab: vi.fn().mockResolvedValue(undefined),
    };
    tabManager = new TabManager(mockSessionManager as SessionManager);
  });

  afterEach(() => {
    tabManager.destroy();
    vi.clearAllMocks();
  });

  describe("initialize()", () => {
    it("should add tab removed listener", () => {
      tabManager.initialize();

      expect(mockChrome.tabs.onRemoved.addListener).toHaveBeenCalled();
      expect(mockOnRemovedListeners.length).toBe(1);
    });

    it("should not add duplicate listeners on double init", () => {
      tabManager.initialize();
      tabManager.initialize();

      expect(mockOnRemovedListeners.length).toBe(1);
    });
  });

  describe("destroy()", () => {
    it("should remove listener", () => {
      tabManager.initialize();
      tabManager.destroy();

      expect(mockChrome.tabs.onRemoved.removeListener).toHaveBeenCalled();
    });
  });

  describe("getPrimaryTab()", () => {
    it("should return primary tab ID", async () => {
      const tabId = await tabManager.getPrimaryTab();

      expect(tabId).toBe(1);
    });

    it("should return null when no session", async () => {
      (mockSessionManager.getState as any).mockResolvedValue(null);

      const tabId = await tabManager.getPrimaryTab();

      expect(tabId).toBeNull();
    });
  });

  describe("getAllTabs()", () => {
    it("should return all active tabs", async () => {
      const tabs = await tabManager.getAllTabs();

      expect(tabs).toEqual([1, 2]);
    });

    it("should return empty array when no session", async () => {
      (mockSessionManager.getState as any).mockResolvedValue(null);

      const tabs = await tabManager.getAllTabs();

      expect(tabs).toEqual([]);
    });
  });

  describe("isSessionTab()", () => {
    it("should return true for session tabs", async () => {
      expect(await tabManager.isSessionTab(1)).toBe(true);
      expect(await tabManager.isSessionTab(2)).toBe(true);
    });

    it("should return false for non-session tabs", async () => {
      expect(await tabManager.isSessionTab(999)).toBe(false);
    });
  });

  describe("addTab()", () => {
    it("should call sessionManager.addTab", async () => {
      await tabManager.addTab(3);

      expect(mockSessionManager.addTab).toHaveBeenCalledWith(3);
    });
  });

  describe("removeTab()", () => {
    it("should call sessionManager.removeTab", async () => {
      await tabManager.removeTab(2);

      expect(mockSessionManager.removeTab).toHaveBeenCalledWith(2);
    });
  });

  describe("tab removal handling", () => {
    it("should remove session tab when closed", async () => {
      tabManager.initialize();

      // Simulate tab close
      const listener = mockOnRemovedListeners[0];
      await listener?.(2, { windowId: 1, isWindowClosing: false });

      expect(mockSessionManager.removeTab).toHaveBeenCalledWith(2);
    });

    it("should not call removeTab for non-session tabs", async () => {
      tabManager.initialize();

      // Simulate closing a tab not in session
      const listener = mockOnRemovedListeners[0];
      await listener?.(999, { windowId: 1, isWindowClosing: false });

      expect(mockSessionManager.removeTab).not.toHaveBeenCalled();
    });
  });
});
