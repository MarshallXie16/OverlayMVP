/**
 * Content Script Walkthrough Types
 *
 * Types specific to the content script side of the walkthrough system.
 */

import type { WalkthroughState } from "../../shared/walkthrough";

// ============================================================================
// CONTROLLER TYPES
// ============================================================================

/** Configuration for WalkthroughController */
export interface WalkthroughControllerConfig {
  /** Enable debug logging */
  debug?: boolean;
}

/** Callback for when controller state changes */
export type StateChangeCallback = (state: WalkthroughState | null) => void;

// ============================================================================
// UI TYPES
// ============================================================================

/** Target element information for highlighting */
export interface TargetElementInfo {
  /** The target element */
  element: HTMLElement;
  /** Bounding rect for positioning */
  rect: DOMRect;
  /** Is the element interactable? */
  isInteractable: boolean;
}

/** Tooltip position relative to target */
export type TooltipPosition = "top" | "bottom" | "left" | "right" | "auto";

/** UI layer configuration */
export interface UILayerConfig {
  /** Z-index for overlay */
  zIndex: number;
  /** Container element (defaults to document.body) */
  container?: HTMLElement;
}

// ============================================================================
// ACTION TYPES
// ============================================================================

/** User action detected on target element */
export interface DetectedAction {
  type: "click" | "input_commit" | "select_change" | "submit";
  element: HTMLElement;
  timestamp: number;
  value?: string;
}

/** Reason an action was invalid */
export type ActionInvalidReason =
  | "wrong_element"
  | "wrong_action"
  | "no_value_change";

// ============================================================================
// HEALING TYPES
// ============================================================================

/** Healing candidate element */
export interface HealingCandidate {
  element: HTMLElement;
  score: number;
  matchReasons: string[];
}
