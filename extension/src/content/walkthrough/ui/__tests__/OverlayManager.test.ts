/**
 * OverlayManager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OverlayManager } from "../OverlayManager";

describe("OverlayManager", () => {
  let manager: OverlayManager;

  beforeEach(() => {
    manager = new OverlayManager();
    // Clean up any existing overlay from previous tests
    const existing = document.getElementById("walkthrough-overlay");
    if (existing) {
      existing.remove();
    }
  });

  afterEach(() => {
    manager.destroy();
  });

  describe("create()", () => {
    it("should create overlay with correct DOM structure matching walkthrough.ts", () => {
      const { container, backdrop, svg, spotlightCutout } = manager.create();

      // Check container
      expect(container.id).toBe("walkthrough-overlay");
      expect(container.className).toBe("walkthrough-overlay");

      // Check backdrop
      expect(backdrop.className).toBe("walkthrough-backdrop");
      expect(container.contains(backdrop)).toBe(true);

      // Check SVG
      expect(svg.classList.contains("walkthrough-spotlight-mask")).toBe(true);
      expect(backdrop.contains(svg)).toBe(true);

      // Check spotlight cutout (ID is now dynamic: wt-cutout-xxx)
      expect(spotlightCutout.id).toMatch(/^wt-cutout-/);
      expect(spotlightCutout.getAttribute("rx")).toBe("8");
    });

    it("should set correct accessibility attributes", () => {
      const { container } = manager.create();

      expect(container.getAttribute("role")).toBe("dialog");
      expect(container.getAttribute("aria-modal")).toBe("true");
      expect(container.getAttribute("aria-label")).toBe("Walkthrough guide");
    });

    it("should append overlay to document.body", () => {
      manager.create();

      const overlay = document.getElementById("walkthrough-overlay");
      expect(overlay).not.toBeNull();
      expect(overlay?.parentElement).toBe(document.body);
    });

    it("should handle stale overlay cleanup (BUG-001)", () => {
      // Create a stale overlay directly in DOM
      const staleOverlay = document.createElement("div");
      staleOverlay.id = "walkthrough-overlay";
      staleOverlay.textContent = "stale";
      document.body.appendChild(staleOverlay);

      // Create new overlay - should remove stale one
      manager.create();

      // Verify only one overlay exists
      const overlays = document.querySelectorAll("#walkthrough-overlay");
      expect(overlays.length).toBe(1);

      // Verify it's the new one (not the stale one)
      const overlay = document.getElementById("walkthrough-overlay");
      expect(overlay?.textContent).not.toBe("stale");
    });

    it("should initialize spotlight cutout with zero dimensions", () => {
      const { spotlightCutout } = manager.create();

      expect(spotlightCutout.getAttribute("x")).toBe("0");
      expect(spotlightCutout.getAttribute("y")).toBe("0");
      expect(spotlightCutout.getAttribute("width")).toBe("0");
      expect(spotlightCutout.getAttribute("height")).toBe("0");
    });

    it("should create SVG mask with correct structure", () => {
      const { svg } = manager.create();

      const defs = svg.querySelector("defs");
      expect(defs).not.toBeNull();

      // Mask ID is now dynamic: wt-mask-xxx
      const mask = svg.querySelector("mask[id^='wt-mask-']");
      expect(mask).not.toBeNull();

      // Should have white rect (full coverage) and black rect (cutout)
      const rects = mask?.querySelectorAll("rect");
      expect(rects?.length).toBe(2);
      expect(rects?.[0].getAttribute("fill")).toBe("white");
      expect(rects?.[1].getAttribute("fill")).toBe("black");
    });
  });

  describe("destroy()", () => {
    it("should remove overlay from DOM", () => {
      manager.create();
      expect(document.getElementById("walkthrough-overlay")).not.toBeNull();

      manager.destroy();
      expect(document.getElementById("walkthrough-overlay")).toBeNull();
    });

    it("should reset internal state", () => {
      manager.create();
      expect(manager.isCreated()).toBe(true);

      manager.destroy();
      expect(manager.isCreated()).toBe(false);
      expect(manager.getContainer()).toBeNull();
      expect(manager.getBackdrop()).toBeNull();
      expect(manager.getSvg()).toBeNull();
      expect(manager.getSpotlightCutout()).toBeNull();
    });

    it("should handle destroy when not created", () => {
      // Should not throw
      expect(() => manager.destroy()).not.toThrow();
    });
  });

  describe("isCreated()", () => {
    it("should return false initially", () => {
      expect(manager.isCreated()).toBe(false);
    });

    it("should return true after create()", () => {
      manager.create();
      expect(manager.isCreated()).toBe(true);
    });

    it("should return false after destroy()", () => {
      manager.create();
      manager.destroy();
      expect(manager.isCreated()).toBe(false);
    });
  });

  describe("getters", () => {
    it("should return null when not created", () => {
      expect(manager.getContainer()).toBeNull();
      expect(manager.getBackdrop()).toBeNull();
      expect(manager.getSvg()).toBeNull();
      expect(manager.getSpotlightCutout()).toBeNull();
    });

    it("should return elements after create()", () => {
      const { container, backdrop, svg, spotlightCutout } = manager.create();

      expect(manager.getContainer()).toBe(container);
      expect(manager.getBackdrop()).toBe(backdrop);
      expect(manager.getSvg()).toBe(svg);
      expect(manager.getSpotlightCutout()).toBe(spotlightCutout);
    });
  });
});
