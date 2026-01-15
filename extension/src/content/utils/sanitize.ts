/**
 * Sanitization Utilities
 * Prevents XSS and injection vulnerabilities
 *
 * SECURITY-001: Sanitize user-controlled data before XPath queries
 * SECURITY-002: Sanitize user-controlled data before innerHTML
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape HTML special characters to prevent XSS
 * @param str - String to escape (handles null/undefined)
 * @returns Escaped string safe for innerHTML
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str == null) return "";
  return String(str).replace(
    /[&<>"']/g,
    (char) => HTML_ESCAPE_MAP[char] || char,
  );
}

/**
 * SECURITY-001: Escape text for use in XPath string literals
 *
 * XPath 1.0 doesn't support escape sequences, so we use the concat() function
 * to safely handle strings containing quotes.
 *
 * Examples:
 * - "hello" → 'hello'
 * - "it's" → "it's"
 * - 'say "hi"' → 'say "hi"'
 * - "it's \"quoted\"" → concat('it', "'", 's "quoted"')
 *
 * @param str - String to escape (handles null/undefined)
 * @returns XPath-safe string literal (includes surrounding quotes)
 */
export function escapeXPathString(str: string | null | undefined): string {
  if (str == null) return "''";
  const s = String(str);

  // No quotes at all - use single quotes
  if (!s.includes("'")) {
    return `'${s}'`;
  }

  // No double quotes - use double quotes
  if (!s.includes('"')) {
    return `"${s}"`;
  }

  // Mixed quotes - use concat() to split the string
  // Each segment uses the opposite quote type from what it contains
  const parts: string[] = [];
  let current = "";

  for (const char of s) {
    if (char === "'") {
      // Single quote found - wrap current segment in single quotes, add double-quoted single quote
      if (current) {
        parts.push(`'${current}'`);
      }
      parts.push(`"'"`); // Double-quoted single quote
      current = "";
    } else if (char === '"') {
      // Double quote found - wrap current segment in single quotes, add single-quoted double quote
      if (current) {
        parts.push(`'${current}'`);
      }
      parts.push("'\"'"); // Single-quoted double quote
      current = "";
    } else {
      current += char;
    }
  }

  // Don't forget the last segment
  if (current) {
    parts.push(`'${current}'`);
  }

  // If only one part, return it directly; otherwise wrap in concat()
  // Safe: parts is never empty here because we only reach this code when s contains
  // both quote types, and the loop always adds at least the quote character parts
  return parts.length === 1 ? parts[0]! : `concat(${parts.join(", ")})`;
}
