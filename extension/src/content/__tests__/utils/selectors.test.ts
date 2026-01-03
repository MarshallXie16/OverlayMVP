/**
 * Tests for content script selector extraction
 */

import { describe, it, expect } from "vitest";
import { extractSelectors } from "../../utils/selectors";

describe("Selector Extraction", () => {
  describe("extractSelectors", () => {
    it("should extract ID selector when stable", () => {
      const element = document.createElement("button");
      element.id = "submit-button";
      document.body.appendChild(element);

      const selectors = extractSelectors(element);

      expect(selectors.primary).toBe("#submit-button");
      expect(selectors.css).toContain("button");

      document.body.removeChild(element);
    });

    it("should reject React dynamic IDs", () => {
      const element = document.createElement("div");
      element.id = ":r1:";
      document.body.appendChild(element);

      const selectors = extractSelectors(element);

      expect(selectors.primary).toBeNull(); // Dynamic ID rejected
      expect(selectors.css).toBeTruthy(); // Falls back to CSS

      document.body.removeChild(element);
    });

    it("should reject MUI dynamic IDs", () => {
      const element = document.createElement("div");
      element.id = "mui-1234";
      document.body.appendChild(element);

      const selectors = extractSelectors(element);

      expect(selectors.primary).toBeNull();

      document.body.removeChild(element);
    });

    it("should extract data-testid when available", () => {
      const element = document.createElement("button");
      element.setAttribute("data-testid", "login-button");
      document.body.appendChild(element);

      const selectors = extractSelectors(element);

      expect(selectors.data_testid).toBe("login-button");

      document.body.removeChild(element);
    });

    it("should generate CSS path with nth-of-type", () => {
      const parent = document.createElement("div");
      parent.className = "container";
      const button1 = document.createElement("button");
      const button2 = document.createElement("button");
      parent.appendChild(button1);
      parent.appendChild(button2);
      document.body.appendChild(parent);

      const selectors = extractSelectors(button2);

      expect(selectors.css).toContain("button:nth-of-type(2)");

      document.body.removeChild(parent);
    });

    it("should generate XPath", () => {
      const div = document.createElement("div");
      div.id = "test-div";
      document.body.appendChild(div);

      const selectors = extractSelectors(div);

      // XPath should contain the element reference
      expect(selectors.xpath).toBeTruthy();
      expect(selectors.xpath.length).toBeGreaterThan(0);

      document.body.removeChild(div);
    });
  });

  describe("Dynamic ID Detection", () => {
    it("should reject React dynamic IDs", () => {
      const element = document.createElement("div");
      element.id = ":r0:";
      document.body.appendChild(element);

      const selectors = extractSelectors(element);
      expect(selectors.primary).toBeNull(); // React ID should be rejected

      document.body.removeChild(element);
    });

    it("should reject framework-generated IDs", () => {
      const testCases = ["mui-component", "react-12345", "ember-view"];

      testCases.forEach((id) => {
        const element = document.createElement("div");
        element.id = id;
        document.body.appendChild(element);

        const selectors = extractSelectors(element);
        expect(selectors.primary).toBeNull();

        document.body.removeChild(element);
      });
    });

    it("should accept stable descriptive IDs", () => {
      const testCases = ["submit-button", "user-profile", "login-form"];

      testCases.forEach((id) => {
        const element = document.createElement("div");
        element.id = id;
        document.body.appendChild(element);

        const selectors = extractSelectors(element);
        expect(selectors.primary).toBe(`#${id}`);

        document.body.removeChild(element);
      });
    });
  });
});
