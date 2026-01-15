/**
 * Tests for sanitization utilities
 *
 * SECURITY-001: Tests for escapeXPathString
 * SECURITY-002: Tests for escapeHtml
 */

import { describe, it, expect } from "vitest";
import { escapeHtml, escapeXPathString } from "../sanitize";

// ============================================================================
// ESCAPE HTML TESTS
// ============================================================================

describe("escapeHtml", () => {
  it("should escape HTML special characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
    );
  });

  it("should escape ampersands", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("should escape quotes", () => {
    expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
    expect(escapeHtml("It's working")).toBe("It&#39;s working");
  });

  it("should handle null and undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("should handle empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("should handle plain text without special characters", () => {
    expect(escapeHtml("Hello World")).toBe("Hello World");
  });
});

// ============================================================================
// ESCAPE XPATH STRING TESTS
// ============================================================================

describe("escapeXPathString", () => {
  describe("simple strings without quotes", () => {
    it("should wrap plain text in single quotes", () => {
      expect(escapeXPathString("hello")).toBe("'hello'");
    });

    it("should handle empty string", () => {
      expect(escapeXPathString("")).toBe("''");
    });

    it("should wrap text with spaces in single quotes", () => {
      expect(escapeXPathString("hello world")).toBe("'hello world'");
    });

    it("should wrap text with special characters (non-quotes) in single quotes", () => {
      expect(escapeXPathString("hello <world> & more")).toBe(
        "'hello <world> & more'",
      );
    });
  });

  describe("strings with single quotes only", () => {
    it("should wrap text with single quotes in double quotes", () => {
      expect(escapeXPathString("it's")).toBe('"it\'s"');
    });

    it("should handle multiple single quotes", () => {
      expect(escapeXPathString("it's Jane's")).toBe("\"it's Jane's\"");
    });
  });

  describe("strings with double quotes only", () => {
    it("should wrap text with double quotes in single quotes", () => {
      expect(escapeXPathString('say "hello"')).toBe("'say \"hello\"'");
    });

    it("should handle multiple double quotes", () => {
      expect(escapeXPathString('He said "yes" and "no"')).toBe(
        '\'He said "yes" and "no"\'',
      );
    });
  });

  describe("strings with mixed quotes (requires concat)", () => {
    it("should use concat() for mixed quotes", () => {
      const result = escapeXPathString('it\'s "quoted"');
      // Has both quote types - must use concat
      expect(result).toContain("concat(");
      expect(result).toContain("'it'");
      expect(result).toContain('"\'"'); // Double-quoted single quote
    });

    it("should handle complex mixed quotes", () => {
      const result = escapeXPathString('Say "it\'s" here');
      expect(result).toContain("concat(");
      // Should properly split around both quote types
    });

    it("should handle single quote only with double quotes", () => {
      // Only single quotes - use double quotes wrapper (no concat needed)
      const result = escapeXPathString("'quoted");
      expect(result).toBe('"\'quoted"');
    });

    it("should handle single quote at end with double quotes", () => {
      // Only single quotes - use double quotes wrapper (no concat needed)
      const result = escapeXPathString("quoted'");
      expect(result).toBe('"quoted\'"');
    });

    it("should handle consecutive quotes with concat", () => {
      // Has both quote types - must use concat
      const result = escapeXPathString("a'\"b");
      expect(result).toContain("concat(");
    });
  });

  describe("null and undefined handling", () => {
    it("should return empty string literal for null", () => {
      expect(escapeXPathString(null)).toBe("''");
    });

    it("should return empty string literal for undefined", () => {
      expect(escapeXPathString(undefined)).toBe("''");
    });
  });

  describe("XPath injection prevention", () => {
    it("should safely handle XPath operator injection attempt", () => {
      // Attempt to inject: '] | //*[@id='admin
      // Contains only single quotes, so wrapped in double quotes - still safe
      const malicious = "'] | //*[@id='admin";
      const result = escapeXPathString(malicious);
      // Result should be a safe string literal wrapped in double quotes
      expect(result).toBe("\"'] | //*[@id='admin\"");
      // The double quotes prevent XPath injection since the whole thing is a string literal
    });

    it("should safely handle quote escape attempt", () => {
      // Attempt to break out with: Button" or @class="secret
      // Contains only double quotes, so wrapped in single quotes - safe
      const malicious = 'Button" or @class="secret';
      const result = escapeXPathString(malicious);
      // Should be wrapped safely in single quotes
      expect(result).toBe("'Button\" or @class=\"secret'");
    });

    it("should safely handle function injection attempt with mixed quotes", () => {
      // Attempt to inject with BOTH quote types to force concat
      const malicious = "text() = '' or contains(., \"admin";
      const result = escapeXPathString(malicious);
      // Has both quote types - must use concat
      expect(result).toContain("concat(");
    });

    it("should safely handle single-quote only injection", () => {
      // Contains only single quotes, wrapped in double quotes
      const malicious = "text() = '' or contains(., 'admin";
      const result = escapeXPathString(malicious);
      expect(result).toBe("\"text() = '' or contains(., 'admin\"");
    });
  });

  describe("real-world button/label text", () => {
    it("should handle Submit button", () => {
      expect(escapeXPathString("Submit")).toBe("'Submit'");
    });

    it("should handle button with apostrophe", () => {
      expect(escapeXPathString("Submit's Order")).toBe('"Submit\'s Order"');
    });

    it("should handle button with quotes", () => {
      expect(escapeXPathString('Click "Here"')).toBe("'Click \"Here\"'");
    });

    it("should handle form field label", () => {
      expect(escapeXPathString("Email Address")).toBe("'Email Address'");
    });

    it("should handle placeholder with apostrophe", () => {
      expect(escapeXPathString("Enter your company's name")).toBe(
        '"Enter your company\'s name"',
      );
    });
  });
});
