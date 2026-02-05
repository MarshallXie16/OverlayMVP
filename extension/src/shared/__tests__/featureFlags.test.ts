/**
 * Tests for Feature Flags
 *
 * Tests the runtime feature flag system used for gradual rollout.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getFeatureFlag,
  setFeatureFlag,
  getAllFeatureFlags,
  resetFeatureFlags,
  useNewWalkthroughSystem,
} from "../featureFlags";
import { resetChromeStorage } from "../../test/setup";

describe("Feature Flags", () => {
  beforeEach(() => {
    resetChromeStorage();
  });

  describe("getFeatureFlag", () => {
    it("should return default value when flag is not set", async () => {
      // Default for WALKTHROUGH_USE_NEW_SYSTEM is true (Sprint 6)
      const value = await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM");
      expect(value).toBe(true);
    });

    it("should return stored value when flag is set", async () => {
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);

      const value = await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM");
      expect(value).toBe(false);
    });

    it("should return default on storage error", async () => {
      // Mock storage to throw an error
      const originalGet = chrome.storage.local.get;
      (chrome.storage.local.get as any) = vi.fn(() =>
        Promise.reject(new Error("Storage error")),
      );

      const value = await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM");
      expect(value).toBe(true); // Falls back to default

      // Restore
      (chrome.storage.local.get as any) = originalGet;
    });
  });

  describe("setFeatureFlag", () => {
    it("should persist flag value to storage", async () => {
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);

      const value = await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM");
      expect(value).toBe(false);
    });

    it("should overwrite existing flag value", async () => {
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", true);

      const value = await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM");
      expect(value).toBe(true);
    });

    it("should throw on storage error", async () => {
      // Mock storage to throw an error on set
      const originalSet = chrome.storage.local.set;
      (chrome.storage.local.set as any) = vi.fn(() =>
        Promise.reject(new Error("Storage error")),
      );

      await expect(
        setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false),
      ).rejects.toThrow("Storage error");

      // Restore
      (chrome.storage.local.set as any) = originalSet;
    });
  });

  describe("getAllFeatureFlags", () => {
    it("should return all defaults when nothing is set", async () => {
      const flags = await getAllFeatureFlags();

      expect(flags).toEqual({
        WALKTHROUGH_USE_NEW_SYSTEM: true,
      });
    });

    it("should merge stored values with defaults", async () => {
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);

      const flags = await getAllFeatureFlags();

      expect(flags).toEqual({
        WALKTHROUGH_USE_NEW_SYSTEM: false,
      });
    });

    it("should return defaults on storage error", async () => {
      // Mock storage to throw an error
      const originalGet = chrome.storage.local.get;
      (chrome.storage.local.get as any) = vi.fn(() =>
        Promise.reject(new Error("Storage error")),
      );

      const flags = await getAllFeatureFlags();
      expect(flags).toEqual({
        WALKTHROUGH_USE_NEW_SYSTEM: true,
      });

      // Restore
      (chrome.storage.local.get as any) = originalGet;
    });
  });

  describe("resetFeatureFlags", () => {
    it("should clear all stored flags", async () => {
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);
      await resetFeatureFlags();

      // Should return default after reset
      const value = await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM");
      expect(value).toBe(true);
    });

    it("should throw on storage error", async () => {
      // Mock storage to throw an error on remove
      const originalRemove = chrome.storage.local.remove;
      (chrome.storage.local.remove as any) = vi.fn(() =>
        Promise.reject(new Error("Storage error")),
      );

      await expect(resetFeatureFlags()).rejects.toThrow("Storage error");

      // Restore
      (chrome.storage.local.remove as any) = originalRemove;
    });
  });

  describe("useNewWalkthroughSystem", () => {
    it("should be a convenience wrapper for WALKTHROUGH_USE_NEW_SYSTEM flag", async () => {
      // Default value
      let value = await useNewWalkthroughSystem();
      expect(value).toBe(true);

      // After setting to false
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);
      value = await useNewWalkthroughSystem();
      expect(value).toBe(false);

      // After setting to true
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", true);
      value = await useNewWalkthroughSystem();
      expect(value).toBe(true);
    });
  });
});

describe("Feature Flag Persistence", () => {
  beforeEach(() => {
    resetChromeStorage();
  });

  it("should persist flag across multiple get calls", async () => {
    await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);

    // Multiple reads should return same value
    expect(await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM")).toBe(false);
    expect(await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM")).toBe(false);
    expect(await getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM")).toBe(false);
  });

  it("should not affect other storage keys", async () => {
    // Set up some other storage data
    await chrome.storage.local.set({ other_key: "other_value" });

    // Set feature flag
    await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", false);

    // Other key should still exist
    const result = await chrome.storage.local.get("other_key");
    expect(result.other_key).toBe("other_value");
  });
});
