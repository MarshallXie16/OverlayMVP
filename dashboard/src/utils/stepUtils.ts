/**
 * Step Utilities
 * Shared functions for displaying and formatting workflow step data
 */

import { API_URL } from "@/config";

export type ActionType =
  | "click"
  | "input_commit"
  | "navigate"
  | "select_change"
  | string;

/**
 * Returns Tailwind CSS classes for styling action type badges
 */
export function getActionTypeColor(actionType: string): string {
  switch (actionType) {
    case "click":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "input_commit":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "navigate":
      return "bg-teal-100 text-teal-700 border-teal-200";
    case "select_change":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

/**
 * Formats action type for display (replaces underscores, uppercase)
 */
export function formatActionType(actionType: string): string {
  return actionType.replace("_", " ").toUpperCase();
}

/**
 * Constructs the full URL for a screenshot from its ID
 */
export function getScreenshotUrl(screenshotId: number | null): string | null {
  if (!screenshotId) return null;
  return `${API_URL}/api/screenshots/${screenshotId}/image`;
}
