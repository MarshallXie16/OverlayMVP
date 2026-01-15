/**
 * HTML Sanitization Utilities
 * Prevents XSS in innerHTML assignments
 *
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
