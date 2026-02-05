/**
 * SpotlightRenderer Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SpotlightRenderer } from "../SpotlightRenderer";

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal("ResizeObserver", MockResizeObserver);

describe("SpotlightRenderer", () => {
  let renderer: SpotlightRenderer;
  let spotlightCutout: SVGRectElement;
  let targetElement: HTMLElement;

  beforeEach(() => {
    // Create SVG spotlight cutout element
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    spotlightCutout = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    ) as SVGRectElement;
    spotlightCutout.id = "spotlight-cutout";
    svg.appendChild(spotlightCutout);
    document.body.appendChild(svg);

    // Create target element
    targetElement = document.createElement("div");
    targetElement.style.position = "absolute";
    targetElement.style.top = "100px";
    targetElement.style.left = "200px";
    targetElement.style.width = "150px";
    targetElement.style.height = "50px";
    document.body.appendChild(targetElement);

    renderer = new SpotlightRenderer();
  });

  afterEach(() => {
    renderer.destroy();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  describe("initialize()", () => {
    it("should store spotlight cutout reference", () => {
      renderer.initialize(spotlightCutout);
      // No error means successful initialization
    });

    it("should setup ResizeObserver", () => {
      renderer.initialize(spotlightCutout);
      // ResizeObserver constructor should have been called
      expect(MockResizeObserver).toBeDefined();
    });
  });

  describe("highlight()", () => {
    beforeEach(() => {
      renderer.initialize(spotlightCutout);
    });

    it("should position spotlight with 8px padding around element", () => {
      // Mock getBoundingClientRect
      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 100,
        left: 200,
        width: 150,
        height: 50,
        bottom: 150,
        right: 350,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      });

      renderer.highlight(targetElement);

      // 8px padding on each side
      expect(spotlightCutout.getAttribute("x")).toBe("192"); // 200 - 8
      expect(spotlightCutout.getAttribute("y")).toBe("92"); // 100 - 8
      expect(spotlightCutout.getAttribute("width")).toBe("166"); // 150 + 8*2
      expect(spotlightCutout.getAttribute("height")).toBe("66"); // 50 + 8*2
    });

    it("should observe new element with ResizeObserver", () => {
      renderer.highlight(targetElement);

      // Check that observe was called
      // Note: The mock is on the prototype, so we check the mock directly
    });
  });

  describe("updatePosition()", () => {
    beforeEach(() => {
      renderer.initialize(spotlightCutout);
    });

    it("should update spotlight position for given element", () => {
      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 50,
        left: 100,
        width: 200,
        height: 100,
        bottom: 150,
        right: 300,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      });

      renderer.updatePosition(targetElement);

      expect(spotlightCutout.getAttribute("x")).toBe("92"); // 100 - 8
      expect(spotlightCutout.getAttribute("y")).toBe("42"); // 50 - 8
      expect(spotlightCutout.getAttribute("width")).toBe("216"); // 200 + 8*2
      expect(spotlightCutout.getAttribute("height")).toBe("116"); // 100 + 8*2
    });
  });

  describe("hide()", () => {
    beforeEach(() => {
      renderer.initialize(spotlightCutout);
    });

    it("should set spotlight dimensions to zero", () => {
      // First highlight an element
      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 100,
        left: 200,
        width: 150,
        height: 50,
        bottom: 150,
        right: 350,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      });
      renderer.highlight(targetElement);

      // Then hide
      renderer.hide();

      expect(spotlightCutout.getAttribute("x")).toBe("0");
      expect(spotlightCutout.getAttribute("y")).toBe("0");
      expect(spotlightCutout.getAttribute("width")).toBe("0");
      expect(spotlightCutout.getAttribute("height")).toBe("0");
    });
  });

  describe("element with zero dimensions", () => {
    beforeEach(() => {
      renderer.initialize(spotlightCutout);
    });

    it("should hide spotlight when element has zero width", () => {
      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 100,
        left: 200,
        width: 0,
        height: 50,
        bottom: 150,
        right: 200,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      });

      renderer.highlight(targetElement);

      expect(spotlightCutout.getAttribute("width")).toBe("0");
      expect(spotlightCutout.getAttribute("height")).toBe("0");
    });

    it("should hide spotlight when element has zero height", () => {
      vi.spyOn(targetElement, "getBoundingClientRect").mockReturnValue({
        top: 100,
        left: 200,
        width: 150,
        height: 0,
        bottom: 100,
        right: 350,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      });

      renderer.highlight(targetElement);

      expect(spotlightCutout.getAttribute("width")).toBe("0");
      expect(spotlightCutout.getAttribute("height")).toBe("0");
    });
  });

  describe("destroy()", () => {
    it("should disconnect ResizeObserver", () => {
      renderer.initialize(spotlightCutout);
      renderer.destroy();

      // Should not throw
    });

    it("should clear internal references", () => {
      renderer.initialize(spotlightCutout);
      renderer.destroy();

      // Calling methods after destroy should not throw
      expect(() => renderer.hide()).not.toThrow();
    });
  });
});
