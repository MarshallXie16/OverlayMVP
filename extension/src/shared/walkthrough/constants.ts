/**
 * Walkthrough System Constants
 *
 * Centralized constants for timeouts, thresholds, and configuration.
 * Used by both background and content scripts.
 */

// ============================================================================
// STORAGE
// ============================================================================

/** Key for storing walkthrough session in chrome.storage.session */
export const WALKTHROUGH_SESSION_STORAGE_KEY = "walkthrough_session_v2";

// ============================================================================
// TIMEOUTS
// ============================================================================

/** Session timeout: 30 minutes of inactivity */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Navigation timeout: max wait for page load after navigation */
export const NAVIGATION_TIMEOUT_MS = 30 * 1000;

/** Element find timeout: max wait for element to appear in DOM */
export const ELEMENT_FIND_TIMEOUT_MS = 5 * 1000;

/** Tab ready timeout: max wait for content script to signal ready */
export const TAB_READY_TIMEOUT_MS = 10 * 1000;

// ============================================================================
// RETRY LIMITS
// ============================================================================

/** Max retries for user action validation before showing Skip button */
export const MAX_ACTION_RETRIES = 3;

/** Max retries for element finding before showing error */
export const MAX_ELEMENT_FIND_RETRIES = 2;

/** Max retries for healing before giving up */
export const MAX_HEALING_RETRIES = 1;

// ============================================================================
// HEALING CONFIDENCE THRESHOLDS
// ============================================================================

/** High confidence: proceed seamlessly without user indication */
export const HEALING_CONFIDENCE_HIGH = 0.85;

/** Medium-high confidence: show subtle indicator but proceed */
export const HEALING_CONFIDENCE_MEDIUM_HIGH = 0.7;

/** Medium confidence: require user confirmation */
export const HEALING_CONFIDENCE_MEDIUM = 0.6;

// ============================================================================
// AUTO-ADVANCE DELAYS (ms after action detected)
// ============================================================================

/** Delay after click/submit before advancing */
export const ADVANCE_DELAY_CLICK = 60;

/** Delay after select change before advancing */
export const ADVANCE_DELAY_SELECT = 120;

/** Delay after input blur before advancing */
export const ADVANCE_DELAY_INPUT = 150;

/** Default delay for other action types */
export const ADVANCE_DELAY_DEFAULT = 100;

// ============================================================================
// UI
// ============================================================================

/** Spotlight padding around target element (px) */
export const SPOTLIGHT_PADDING = 8;

/** Debounce delay for spotlight position updates on scroll/resize */
export const SPOTLIGHT_UPDATE_DEBOUNCE_MS = 100;

/** Duration of success flash effect (ms) */
export const FLASH_SUCCESS_DURATION_MS = 250;

/** Duration of error flash effect (ms) */
export const FLASH_ERROR_DURATION_MS = 400;
