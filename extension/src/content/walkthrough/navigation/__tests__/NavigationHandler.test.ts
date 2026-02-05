/**
 * NavigationHandler Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NavigationHandler } from "../NavigationHandler";
import type { WalkthroughState } from "../../../../shared/walkthrough";

// Mock chrome API
const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
  },
};

vi.stubGlobal("chrome", mockChrome);

// Mock window
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

vi.stubGlobal("window", {
  location: { href: "https://example.com/page1" },
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener,
});

describe("NavigationHandler", () => {
  let handler: NavigationHandler;
  let onStateRestored: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onStateRestored = vi.fn();
    handler = new NavigationHandler(onStateRestored);
  });

  afterEach(() => {
    handler.destroy();
  });

  describe("initialize()", () => {
    it("should add popstate and hashchange listeners", async () => {
      mockChrome.runtime.sendMessage.mockResolvedValue({ tabId: 1 });

      await handler.initialize();

      expect(mockAddEventListener).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );
      expect(mockAddEventListener).toHaveBeenCalledWith(
        "hashchange",
        expect.any(Function),
      );
    });

    it("should send TAB_READY message on init", async () => {
      mockChrome.runtime.sendMessage
        .mockResolvedValueOnce({ tabId: 1 }) // GET_TAB_ID response
        .mockResolvedValueOnce({ hasActiveSession: false }); // TAB_READY response

      await handler.initialize();

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "WALKTHROUGH_TAB_READY",
        tabId: 1,
        url: "https://example.com/page1",
      });
    });

    it("should restore state when active session exists", async () => {
      const mockState = { machineState: "WAITING_ACTION" } as WalkthroughState;
      mockChrome.runtime.sendMessage
        .mockResolvedValueOnce({ tabId: 1 })
        .mockResolvedValueOnce({ hasActiveSession: true, state: mockState });

      await handler.initialize();

      expect(onStateRestored).toHaveBeenCalledWith(mockState);
    });

    it("should not restore state when no active session", async () => {
      mockChrome.runtime.sendMessage
        .mockResolvedValueOnce({ tabId: 1 })
        .mockResolvedValueOnce({ hasActiveSession: false });

      await handler.initialize();

      expect(onStateRestored).not.toHaveBeenCalled();
    });

    it("should not add duplicate listeners on double init", async () => {
      mockChrome.runtime.sendMessage.mockResolvedValue({ tabId: 1 });

      await handler.initialize();
      await handler.initialize();

      // Should only have 2 listeners (popstate + hashchange), not 4
      expect(mockAddEventListener).toHaveBeenCalledTimes(2);
    });
  });

  describe("destroy()", () => {
    it("should remove event listeners", async () => {
      mockChrome.runtime.sendMessage.mockResolvedValue({ tabId: 1 });

      await handler.initialize();
      handler.destroy();

      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        "popstate",
        expect.any(Function),
      );
      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        "hashchange",
        expect.any(Function),
      );
    });
  });

  describe("error handling", () => {
    it("should handle sendMessage errors gracefully", async () => {
      mockChrome.runtime.sendMessage.mockRejectedValue(new Error("Test error"));

      // Should not throw
      await expect(handler.initialize()).resolves.not.toThrow();
    });
  });
});
