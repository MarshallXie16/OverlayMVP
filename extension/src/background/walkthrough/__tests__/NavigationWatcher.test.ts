/**
 * NavigationWatcher Tests
 *
 * Tests for the background NavigationWatcher which handles chrome.webNavigation
 * events and dispatches state machine events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NavigationWatcher } from "../NavigationWatcher";
import type { SessionManager } from "../SessionManager";
import type { WalkthroughState } from "../../../shared/walkthrough";
import { NAVIGATION_TIMEOUT_MS } from "../../../shared/walkthrough";

// ============================================================================
// MOCKS
// ============================================================================

// Mock chrome APIs
const mockWebNavigation = {
  onBeforeNavigate: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  onCompleted: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  onErrorOccurred: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  onCommitted: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

const mockAlarms = {
  create: vi.fn(),
  clear: vi.fn(),
  onAlarm: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
};

// Install global chrome mock
vi.stubGlobal("chrome", {
  webNavigation: mockWebNavigation,
  alarms: mockAlarms,
});

// Mock SessionManager
function createMockSessionManager(
  state: Partial<WalkthroughState> | null = null,
): SessionManager {
  return {
    getState: vi.fn().mockResolvedValue(
      state
        ? {
            machineState: "SHOWING_STEP",
            tabs: {
              primaryTabId: 1,
              activeTabIds: [1],
              readyTabIds: [1],
            },
            navigation: {
              inProgress: false,
              tabId: null,
              sourceUrl: null,
              targetUrl: null,
              startedAt: null,
            },
            ...state,
          }
        : null,
    ),
    dispatch: vi.fn().mockResolvedValue({}),
    initialize: vi.fn(),
    hasActiveSession: vi.fn().mockReturnValue(state !== null),
  } as unknown as SessionManager;
}

// Helper to get the registered listener for an event
function getListener(
  eventMock: { addListener: ReturnType<typeof vi.fn> },
  index = 0,
): (...args: unknown[]) => void {
  return eventMock.addListener.mock.calls[index]?.[0];
}

// ============================================================================
// TESTS
// ============================================================================

describe("NavigationWatcher", () => {
  let watcher: NavigationWatcher;
  let mockSessionManager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = createMockSessionManager();
    watcher = new NavigationWatcher(mockSessionManager, { debug: false });
  });

  afterEach(() => {
    if (watcher) {
      watcher.destroy();
    }
  });

  // ============================================================================
  // INITIALIZATION / DESTRUCTION
  // ============================================================================

  describe("initialize", () => {
    it("should add webNavigation listeners", async () => {
      await watcher.initialize();

      expect(mockWebNavigation.onBeforeNavigate.addListener).toHaveBeenCalled();
      expect(mockWebNavigation.onCompleted.addListener).toHaveBeenCalled();
      expect(mockWebNavigation.onErrorOccurred.addListener).toHaveBeenCalled();
      expect(mockWebNavigation.onCommitted.addListener).toHaveBeenCalled();
    });

    it("should add alarm listener", async () => {
      await watcher.initialize();

      expect(mockAlarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it("should only initialize once", async () => {
      await watcher.initialize();
      await watcher.initialize();

      expect(
        mockWebNavigation.onBeforeNavigate.addListener,
      ).toHaveBeenCalledTimes(1);
    });

    it("should check for stuck navigation on init", async () => {
      // Set up state with navigation in progress that started a long time ago
      const mockSM = createMockSessionManager({
        machineState: "NAVIGATING",
        navigation: {
          inProgress: true,
          tabId: 1,
          sourceUrl: "https://old.com",
          targetUrl: "https://new.com",
          startedAt: Date.now() - NAVIGATION_TIMEOUT_MS - 1000, // Already expired
        },
      });
      const testWatcher = new NavigationWatcher(mockSM, { debug: false });

      await testWatcher.initialize();

      // Should dispatch NAVIGATION_TIMEOUT
      expect(mockSM.dispatch).toHaveBeenCalledWith({
        type: "NAVIGATION_TIMEOUT",
        tabId: 1,
      });

      testWatcher.destroy();
    });

    it("should set alarm for remaining time if navigation not yet timed out", async () => {
      const startedAt = Date.now() - 5000; // Started 5 seconds ago
      const mockSM = createMockSessionManager({
        machineState: "NAVIGATING",
        navigation: {
          inProgress: true,
          tabId: 1,
          sourceUrl: "https://old.com",
          targetUrl: "https://new.com",
          startedAt,
        },
      });
      const testWatcher = new NavigationWatcher(mockSM, { debug: false });

      await testWatcher.initialize();

      // Should create alarm for remaining time
      expect(mockAlarms.create).toHaveBeenCalledWith(
        "walkthrough-navigation-timeout",
        expect.objectContaining({
          delayInMinutes: expect.any(Number),
        }),
      );

      testWatcher.destroy();
    });
  });

  describe("destroy", () => {
    it("should remove all listeners", async () => {
      await watcher.initialize();
      watcher.destroy();

      expect(
        mockWebNavigation.onBeforeNavigate.removeListener,
      ).toHaveBeenCalled();
      expect(mockWebNavigation.onCompleted.removeListener).toHaveBeenCalled();
      expect(
        mockWebNavigation.onErrorOccurred.removeListener,
      ).toHaveBeenCalled();
      expect(mockWebNavigation.onCommitted.removeListener).toHaveBeenCalled();
      expect(mockAlarms.onAlarm.removeListener).toHaveBeenCalled();
    });

    it("should clear navigation timeout alarm", async () => {
      await watcher.initialize();
      watcher.destroy();

      expect(mockAlarms.clear).toHaveBeenCalledWith(
        "walkthrough-navigation-timeout",
      );
    });

    it("should do nothing if not initialized", () => {
      watcher.destroy();

      expect(
        mockWebNavigation.onBeforeNavigate.removeListener,
      ).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // BEFORE NAVIGATE (URL_CHANGED)
  // ============================================================================

  describe("handleBeforeNavigate", () => {
    beforeEach(async () => {
      mockSessionManager = createMockSessionManager({
        tabs: {
          primaryTabId: 1,
          activeTabIds: [1],
          readyTabIds: [1],
        },
      });
      watcher = new NavigationWatcher(mockSessionManager, { debug: false });
      await watcher.initialize();
    });

    it("should dispatch URL_CHANGED for main frame navigation on primary tab", async () => {
      const listener = getListener(mockWebNavigation.onBeforeNavigate);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
        parentFrameId: -1,
      });

      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "URL_CHANGED",
        tabId: 1,
        url: "https://example.com/page",
      });
    });

    it("should ignore iframe navigations (frameId !== 0)", async () => {
      const listener = getListener(mockWebNavigation.onBeforeNavigate);

      await listener({
        tabId: 1,
        frameId: 123, // iframe
        url: "https://example.com/iframe",
        timeStamp: Date.now(),
        parentFrameId: 0,
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });

    it("should ignore non-primary tab navigation", async () => {
      const listener = getListener(mockWebNavigation.onBeforeNavigate);

      await listener({
        tabId: 999, // Not primary tab
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
        parentFrameId: -1,
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });

    it("should ignore chrome:// URLs", async () => {
      const listener = getListener(mockWebNavigation.onBeforeNavigate);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "chrome://settings",
        timeStamp: Date.now(),
        parentFrameId: -1,
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });

    it("should ignore chrome-extension:// URLs", async () => {
      const listener = getListener(mockWebNavigation.onBeforeNavigate);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "chrome-extension://abc123/popup.html",
        timeStamp: Date.now(),
        parentFrameId: -1,
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });

    it("should ignore PDF URLs", async () => {
      const listener = getListener(mockWebNavigation.onBeforeNavigate);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/document.pdf",
        timeStamp: Date.now(),
        parentFrameId: -1,
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });

    it("should set navigation timeout alarm after URL_CHANGED", async () => {
      const listener = getListener(mockWebNavigation.onBeforeNavigate);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
        parentFrameId: -1,
      });

      expect(mockAlarms.create).toHaveBeenCalledWith(
        "walkthrough-navigation-timeout",
        expect.objectContaining({
          delayInMinutes: NAVIGATION_TIMEOUT_MS / 60000,
        }),
      );
    });
  });

  // ============================================================================
  // COMPLETED (PAGE_LOADED)
  // ============================================================================

  describe("handleCompleted", () => {
    beforeEach(async () => {
      mockSessionManager = createMockSessionManager({
        tabs: {
          primaryTabId: 1,
          activeTabIds: [1],
          readyTabIds: [1],
        },
      });
      watcher = new NavigationWatcher(mockSessionManager, { debug: false });
      await watcher.initialize();
    });

    it("should dispatch PAGE_LOADED for main frame completion on primary tab", async () => {
      const listener = getListener(mockWebNavigation.onCompleted);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
      });

      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "PAGE_LOADED",
        tabId: 1,
        url: "https://example.com/page",
      });
    });

    it("should clear navigation timeout on completion", async () => {
      const listener = getListener(mockWebNavigation.onCompleted);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
      });

      expect(mockAlarms.clear).toHaveBeenCalledWith(
        "walkthrough-navigation-timeout",
      );
    });

    it("should ignore iframe completions", async () => {
      const listener = getListener(mockWebNavigation.onCompleted);

      await listener({
        tabId: 1,
        frameId: 123,
        url: "https://example.com/iframe",
        timeStamp: Date.now(),
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });

    it("should ignore non-primary tab completions", async () => {
      const listener = getListener(mockWebNavigation.onCompleted);

      await listener({
        tabId: 999,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // ERROR OCCURRED (NAVIGATION_TIMEOUT)
  // ============================================================================

  describe("handleErrorOccurred", () => {
    beforeEach(async () => {
      mockSessionManager = createMockSessionManager({
        tabs: {
          primaryTabId: 1,
          activeTabIds: [1],
          readyTabIds: [1],
        },
      });
      watcher = new NavigationWatcher(mockSessionManager, { debug: false });
      await watcher.initialize();
    });

    it("should dispatch NAVIGATION_TIMEOUT for main frame errors on primary tab", async () => {
      const listener = getListener(mockWebNavigation.onErrorOccurred);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
        error: "net::ERR_CONNECTION_REFUSED",
      });

      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "NAVIGATION_TIMEOUT",
        tabId: 1,
      });
    });

    it("should clear navigation timeout on error", async () => {
      const listener = getListener(mockWebNavigation.onErrorOccurred);

      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
        error: "net::ERR_CONNECTION_REFUSED",
      });

      expect(mockAlarms.clear).toHaveBeenCalledWith(
        "walkthrough-navigation-timeout",
      );
    });

    it("should ignore iframe errors", async () => {
      const listener = getListener(mockWebNavigation.onErrorOccurred);

      await listener({
        tabId: 1,
        frameId: 123,
        url: "https://example.com/iframe",
        timeStamp: Date.now(),
        error: "net::ERR_CONNECTION_REFUSED",
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // ALARM (TIMEOUT)
  // ============================================================================

  describe("handleAlarm", () => {
    it("should dispatch NAVIGATION_TIMEOUT when alarm fires and in NAVIGATING state", async () => {
      mockSessionManager = createMockSessionManager({
        machineState: "NAVIGATING",
        tabs: {
          primaryTabId: 1,
          activeTabIds: [1],
          readyTabIds: [1],
        },
        navigation: {
          inProgress: true,
          tabId: 1,
          sourceUrl: "https://old.com",
          targetUrl: "https://new.com",
          startedAt: Date.now() - 30000,
        },
      });
      watcher = new NavigationWatcher(mockSessionManager, { debug: false });
      await watcher.initialize();

      const listener = getListener(mockAlarms.onAlarm);
      await listener({ name: "walkthrough-navigation-timeout" });

      expect(mockSessionManager.dispatch).toHaveBeenCalledWith({
        type: "NAVIGATION_TIMEOUT",
        tabId: 1,
      });
    });

    it("should ignore alarm if not in NAVIGATING state", async () => {
      mockSessionManager = createMockSessionManager({
        machineState: "SHOWING_STEP",
        tabs: {
          primaryTabId: 1,
          activeTabIds: [1],
          readyTabIds: [1],
        },
      });
      watcher = new NavigationWatcher(mockSessionManager, { debug: false });
      await watcher.initialize();

      const listener = getListener(mockAlarms.onAlarm);
      await listener({ name: "walkthrough-navigation-timeout" });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });

    it("should ignore other alarms", async () => {
      mockSessionManager = createMockSessionManager({
        machineState: "NAVIGATING",
        tabs: {
          primaryTabId: 1,
          activeTabIds: [1],
          readyTabIds: [1],
        },
        navigation: {
          inProgress: true,
          tabId: 1,
          sourceUrl: null,
          targetUrl: null,
          startedAt: Date.now(),
        },
      });
      watcher = new NavigationWatcher(mockSessionManager, { debug: false });
      await watcher.initialize();

      const listener = getListener(mockAlarms.onAlarm);
      await listener({ name: "some-other-alarm" });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // NO SESSION
  // ============================================================================

  describe("no active session", () => {
    it("should ignore navigation events when no session exists", async () => {
      mockSessionManager = createMockSessionManager(null);
      watcher = new NavigationWatcher(mockSessionManager, { debug: false });
      await watcher.initialize();

      const listener = getListener(mockWebNavigation.onBeforeNavigate);
      await listener({
        tabId: 1,
        frameId: 0,
        url: "https://example.com/page",
        timeStamp: Date.now(),
        parentFrameId: -1,
      });

      expect(mockSessionManager.dispatch).not.toHaveBeenCalled();
    });
  });
});
