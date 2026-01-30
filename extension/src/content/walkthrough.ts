/**
 * Content Script: Walkthrough Mode
 * Guides users through recorded workflows with visual overlays
 *
 * EXT-001: Walkthrough Messaging & Data Loading
 * EXT-002: Overlay UI Foundation
 */

import type {
  WalkthroughState,
  WalkthroughSessionState,
  StepResponse,
} from "@/shared/types";
import { findElement, scrollToElement } from "./utils/elementFinder";
import { escapeHtml } from "./utils/sanitize";
import {
  healElement,
  type HealingResult,
  type ElementContext,
} from "./healing";

console.log("🎯 Walkthrough Mode: Content script loaded");

// ============================================================================
// GAP-001: Multi-page session management
// ============================================================================

/**
 * Initialize content script on page load
 * Checks for active walkthrough session and restores if present
 * GAP-001: Multi-page workflow support
 */
export async function initializeContentScript(): Promise<void> {
  console.log(
    "[Walkthrough] Content script initializing, checking for active session...",
  );

  try {
    // Query background for active session
    const response = await chrome.runtime.sendMessage({
      type: "WALKTHROUGH_GET_STATE",
      payload: {},
    });

    if (response?.payload?.session && response?.payload?.shouldRestore) {
      const session = response.payload.session as WalkthroughSessionState;
      console.log(
        "[Walkthrough] Found active session, restoring:",
        session.sessionId,
      );
      await restoreWalkthrough(session);
    } else {
      console.log("[Walkthrough] No active session to restore");
    }
  } catch (error) {
    // This is expected if background is not ready or no session exists
    console.log(
      "[Walkthrough] Session check completed (no active session):",
      error,
    );
  }
}

/**
 * Restore walkthrough from session state
 * Called after page navigation to resume walkthrough
 * GAP-001: Multi-page workflow support
 */
export async function restoreWalkthrough(
  session: WalkthroughSessionState,
): Promise<void> {
  console.log(
    `[Walkthrough] Restoring walkthrough for "${session.workflowName}"`,
    {
      sessionId: session.sessionId,
      currentStepIndex: session.currentStepIndex,
      totalSteps: session.totalSteps,
    },
  );

  // Validate session data
  if (!session.steps || session.steps.length === 0) {
    console.error("[Walkthrough] Cannot restore - no steps in session");
    return;
  }

  // Check if already active (prevent duplicate restoration)
  if (walkthroughState !== null) {
    console.log("[Walkthrough] Already active, skipping restoration");
    return;
  }

  // Convert session state to walkthrough state
  walkthroughState = {
    workflowId: session.workflowId,
    workflowName: session.workflowName,
    startingUrl: session.startingUrl,
    steps: session.steps,
    currentStepIndex: session.currentStepIndex,
    totalSteps: session.totalSteps,
    status: session.status === "active" ? "active" : "initializing",
    error: session.error,
    retryAttempts: new Map(
      Object.entries(session.retryAttempts).map(([k, v]) => [Number(k), v]),
    ),
    startTime: session.startedAt,
  };

  console.log("[Walkthrough] State restored:", walkthroughState);

  // Create overlay UI
  createOverlay();

  // GAP-003: Block non-target interactions during walkthrough
  setupClickInterceptor();

  // GAP-004: Warn user before leaving page during walkthrough
  setupBeforeUnloadHandler();

  // Allow Escape key to exit walkthrough
  setupEscapeKeyHandler();

  // Keep spotlight in sync with element position during resize/scroll
  setupSpotlightUpdateHandlers();

  // Show current step
  await showCurrentStep();

  walkthroughState.status = "active";

  // Notify background that navigation is complete
  chrome.runtime
    .sendMessage({
      type: "WALKTHROUGH_NAVIGATION_DONE",
      payload: { sessionId: session.sessionId },
    })
    .catch(() => {
      // Ignore errors - background may not be ready
    });

  console.log(
    `[Walkthrough] Restored! Current step: ${walkthroughState.currentStepIndex + 1}/${walkthroughState.totalSteps}`,
  );
}

/**
 * Sync current state to background session manager
 * Called when step changes to keep session in sync
 * GAP-001: Multi-page workflow support
 */
function syncStateToBackground(): void {
  if (!walkthroughState) return;

  chrome.runtime
    .sendMessage({
      type: "WALKTHROUGH_STATE_UPDATE",
      payload: {
        currentStepIndex: walkthroughState.currentStepIndex,
        status: walkthroughState.status,
        error: walkthroughState.error,
        retryAttempts: Object.fromEntries(walkthroughState.retryAttempts),
      },
    })
    .catch((error) => {
      console.debug("[Walkthrough] State sync ignored:", error);
    });
}

// Initialize on script load (GAP-001)
// Use retry with backoff to handle service worker cold starts
async function initializeWithRetry(
  maxRetries: number = 5, // Increased from 3 for better timing tolerance
  baseDelay: number = 150, // Increased from 100 for better timing alignment
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await initializeContentScript();
      return; // Success
    } catch (error) {
      const delay = baseDelay * Math.pow(1.5, attempt); // Gentler backoff (1.5x instead of 2x)
      console.debug(
        `[Walkthrough] Init attempt ${attempt + 1}/${maxRetries} failed, retrying in ${Math.round(delay)}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  console.log("[Walkthrough] Session check completed (no active session)");
}

// Start initialization after a delay to ensure DOM is ready
// and give background time to create session after tab load
// 200ms provides better timing alignment with background's session creation
// and allows chrome.webNavigation.onCompleted to fire first
setTimeout(() => {
  initializeWithRetry();
}, 200);

// SVG Icons (inline to avoid dependencies)
const ICONS = {
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
  chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`,
};

// Global walkthrough state
let walkthroughState: WalkthroughState | null = null;

// Overlay DOM elements
let overlayContainer: HTMLDivElement | null = null;
let tooltipElement: HTMLDivElement | null = null;
let backdropElement: HTMLDivElement | null = null;
let currentTargetElement: HTMLElement | null = null;

// Flag to track if tooltip event delegation is set up
let tooltipDelegationSetup = false;

// Race condition guard for showCurrentStep (BUG-002 fix)
let isShowingStep = false;

// GAP-003 Fix: Click interceptor to block non-target interactions
let clickInterceptor: ((e: MouseEvent) => void) | null = null;

// GAP-004 Fix: beforeunload handler to warn before leaving during walkthrough
let beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;

// Action detection state (EXT-004)
let activeListeners: Array<{
  element: EventTarget;
  event: string;
  handler: EventListener;
}> = [];
const inputValues = new WeakMap<HTMLElement, string>();

// Spotlight update handlers for resize/scroll
let spotlightUpdateHandler: (() => void) | null = null;

// Drag state for tooltip
let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let tooltipDragSetup = false;

/**
 * Debounce helper for spotlight updates
 */
function debounce(fn: () => void, delay: number): () => void {
  let timeoutId: number | null = null;
  return () => {
    if (timeoutId) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(fn, delay);
  };
}

/**
 * Setup drag handlers for tooltip card
 * Allows user to reposition the card by dragging the header
 */
function setupTooltipDrag(): void {
  if (!tooltipElement || tooltipDragSetup) return;

  const header = tooltipElement.querySelector(
    ".walkthrough-tooltip-header",
  ) as HTMLElement;
  if (!header) return;

  header.style.cursor = "grab";
  header.style.userSelect = "none";

  const handleMouseDown = (e: MouseEvent) => {
    // Don't drag if clicking on buttons
    if ((e.target as HTMLElement).closest("button")) return;

    isDragging = true;
    header.style.cursor = "grabbing";
    const rect = tooltipElement!.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !tooltipElement) return;
    tooltipElement.style.left = `${e.clientX - dragOffset.x}px`;
    tooltipElement.style.top = `${e.clientY - dragOffset.y}px`;
    tooltipElement.style.transform = "";
  };

  const handleMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = "grab";
    }
  };

  header.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  tooltipDragSetup = true;
}

/**
 * Setup handlers to update spotlight position on resize/scroll
 */
function setupSpotlightUpdateHandlers(): void {
  if (spotlightUpdateHandler) return; // Already setup

  const updateSpotlightDebounced = debounce(() => {
    if (currentTargetElement && walkthroughState?.status === "active") {
      updateSpotlight(currentTargetElement);
      // Also reposition tooltip
      if (tooltipElement && walkthroughState) {
        const currentStep =
          walkthroughState.steps[walkthroughState.currentStepIndex];
        if (currentStep) {
          updateTooltipPosition(currentTargetElement);
        }
      }
    }
  }, 100);

  spotlightUpdateHandler = updateSpotlightDebounced;
  window.addEventListener("resize", spotlightUpdateHandler);
  window.addEventListener("scroll", spotlightUpdateHandler, true);
  console.log("[Walkthrough] Spotlight update handlers set up");
}

/**
 * Remove spotlight update handlers
 */
function removeSpotlightUpdateHandlers(): void {
  if (spotlightUpdateHandler) {
    window.removeEventListener("resize", spotlightUpdateHandler);
    window.removeEventListener("scroll", spotlightUpdateHandler, true);
    spotlightUpdateHandler = null;
    console.log("[Walkthrough] Spotlight update handlers removed");
  }
}

/**
 * Update tooltip position (extracted for reuse)
 */
function updateTooltipPosition(targetElement: HTMLElement): void {
  if (!tooltipElement) return;

  const targetRect = targetElement.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const pos = calculateTooltipPosition(
    targetRect,
    tooltipRect.width,
    tooltipRect.height,
  );

  tooltipElement.style.top = `${pos.top}px`;
  tooltipElement.style.left = `${pos.left}px`;
}

// Flash success effect with cleanup tracking
const flashPrevStyles = new Map<
  HTMLElement,
  { transition: string; boxShadow: string }
>();
const flashTimers = new Map<HTMLElement, number>();
function flashElement(element: HTMLElement): void {
  // Save previous inline styles if not saved yet
  if (!flashPrevStyles.has(element)) {
    flashPrevStyles.set(element, {
      transition: element.style.transition,
      boxShadow: element.style.boxShadow,
    });
  }

  // Clear existing timer if any
  const existing = flashTimers.get(element);
  if (existing) window.clearTimeout(existing);

  // Apply flash
  element.style.transition = "box-shadow 0.15s ease";
  element.style.boxShadow = "0 0 0 3px rgba(34,197,94,0.6)";

  const timerId = window.setTimeout(() => {
    const prev = flashPrevStyles.get(element);
    if (prev) {
      element.style.boxShadow = prev.boxShadow;
      element.style.transition = prev.transition;
      flashPrevStyles.delete(element);
    } else {
      // Fallback restore
      element.style.boxShadow = "";
      element.style.transition = "";
    }
    flashTimers.delete(element);
  }, 250);
  flashTimers.set(element, timerId);
}

function cleanupFlashEffects(): void {
  // Restore any elements that still have flashed styles
  for (const timer of flashTimers.values()) {
    if (timer) window.clearTimeout(timer);
  }
  flashTimers.clear();
  for (const [el, prev] of flashPrevStyles.entries()) {
    el.style.boxShadow = prev.boxShadow;
    el.style.transition = prev.transition;
  }
  flashPrevStyles.clear();
}

/**
 * Initialize walkthrough mode with workflow data
 * Called when background sends WALKTHROUGH_DATA message
 */
export async function initializeWalkthrough(payload: {
  workflowId: number;
  workflowName: string;
  startingUrl: string;
  steps: StepResponse[];
  totalSteps: number;
}): Promise<void> {
  console.log(
    `[Walkthrough] Initializing walkthrough for "${payload.workflowName}"`,
    {
      workflowId: payload.workflowId,
      totalSteps: payload.totalSteps,
    },
  );

  // Guard against concurrent initialization (race condition with restoreWalkthrough)
  if (walkthroughState !== null) {
    console.log(
      "[Walkthrough] Already initialized, skipping duplicate initialization",
    );
    return;
  }

  // Validate payload
  if (!payload.steps || payload.steps.length === 0) {
    console.error("[Walkthrough] No steps provided");
    throw new Error("Walkthrough has no steps");
  }

  // Create walkthrough state
  walkthroughState = {
    workflowId: payload.workflowId,
    workflowName: payload.workflowName,
    startingUrl: payload.startingUrl,
    steps: payload.steps,
    currentStepIndex: 0,
    totalSteps: payload.totalSteps,
    status: "active",
    error: null,
    retryAttempts: new Map(), // EXT-005: Track retry attempts per step
    startTime: Date.now(), // EXT-006: Track execution time
  };

  console.log("[Walkthrough] State initialized:", walkthroughState);

  // Create overlay UI
  createOverlay();

  // GAP-003: Block non-target interactions during walkthrough
  setupClickInterceptor();

  // GAP-004: Warn user before leaving page during walkthrough
  setupBeforeUnloadHandler();

  // Allow Escape key to exit walkthrough
  setupEscapeKeyHandler();

  // Keep spotlight in sync with element position during resize/scroll
  setupSpotlightUpdateHandlers();

  // Show first step
  await showCurrentStep();

  walkthroughState.status = "active";
  console.log(
    `[Walkthrough] Ready! First step: ${walkthroughState.steps[0]?.instruction || "No instruction"}`,
  );
}

/**
 * Get current walkthrough state
 */
export function getWalkthroughState(): WalkthroughState | null {
  return walkthroughState;
}

/**
 * Check if walkthrough is active
 */
export function isWalkthroughActive(): boolean {
  return walkthroughState !== null && walkthroughState.status === "active";
}

/**
 * GAP-003 Fix: Set up click interceptor to block non-target interactions
 * Uses capture phase to intercept clicks before they reach elements
 */
/**
 * GAP-003 Enhancement: Show visible warning toast when user clicks wrong element
 */
function showClickWarning(): void {
  const TOAST_ID = "walkthrough-click-warning";

  // Remove existing warning if present (prevents stacking)
  const existing = document.getElementById(TOAST_ID);
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.textContent = "Please interact with the highlighted element";
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(239, 68, 68, 0.95);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 2147483647;
    animation: walkthroughToastSlideUp 0.3s ease-out;
    pointer-events: none;
  `;
  document.body.appendChild(toast);

  // Auto-remove after 2.5 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease-out";
      setTimeout(() => toast.remove(), 300);
    }
  }, 2500);
}

function setupClickInterceptor(): void {
  if (clickInterceptor) return; // Already set up

  clickInterceptor = (e: MouseEvent) => {
    // Only intercept when walkthrough is active
    if (!isWalkthroughActive()) return;

    const target = e.target as HTMLElement;
    if (!target) return;

    // Allow clicks on tooltip (navigation controls)
    if (tooltipElement?.contains(target)) return;

    // Allow clicks on target element
    if (currentTargetElement?.contains(target)) return;

    // Allow clicks on the overlay container itself (in case needed)
    if (overlayContainer?.contains(target)) return;

    // Block all other clicks
    e.preventDefault();
    e.stopPropagation();

    // Show visual feedback on the target element
    if (currentTargetElement) {
      const prevBoxShadow = currentTargetElement.style.boxShadow;
      currentTargetElement.style.boxShadow =
        "0 0 0 4px rgba(14, 165, 233, 0.8)"; // teal pulse
      setTimeout(() => {
        if (currentTargetElement) {
          currentTargetElement.style.boxShadow = prevBoxShadow;
        }
      }, 300);
    }

    // GAP-003 Enhancement: Show visible warning toast
    showClickWarning();

    console.log(
      "[Walkthrough] Blocked click on non-target element:",
      target.tagName,
    );
  };

  document.addEventListener("click", clickInterceptor, true); // Capture phase
  console.log("[Walkthrough] Click interceptor enabled");
}

/**
 * GAP-003 Fix: Remove click interceptor
 */
function removeClickInterceptor(): void {
  if (clickInterceptor) {
    document.removeEventListener("click", clickInterceptor, true);
    clickInterceptor = null;
    console.log("[Walkthrough] Click interceptor removed");
  }
}

/**
 * GAP-004 Fix: Set up beforeunload handler to warn user before leaving
 */
function setupBeforeUnloadHandler(): void {
  if (beforeUnloadHandler) return;

  beforeUnloadHandler = (e: BeforeUnloadEvent) => {
    if (isWalkthroughActive()) {
      e.preventDefault();
      // Modern browsers ignore custom messages but still require returnValue
      e.returnValue =
        "Walkthrough is in progress. Are you sure you want to leave?";
    }
  };

  window.addEventListener("beforeunload", beforeUnloadHandler);
  console.log("[Walkthrough] beforeunload handler enabled");
}

/**
 * GAP-004 Fix: Remove beforeunload handler
 */
function removeBeforeUnloadHandler(): void {
  if (beforeUnloadHandler) {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    beforeUnloadHandler = null;
    console.log("[Walkthrough] beforeunload handler removed");
  }
}

// Escape key handler reference
let escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null;

/**
 * Set up Escape key handler to exit walkthrough
 */
function setupEscapeKeyHandler(): void {
  if (escapeKeyHandler) return;

  escapeKeyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape" && isWalkthroughActive()) {
      e.preventDefault();
      console.log("[Walkthrough] Escape key pressed, prompting exit");
      // Use confirm to match Exit button behavior
      if (confirm("Are you sure you want to exit this walkthrough?")) {
        exitWalkthrough();
      }
    }
  };

  document.addEventListener("keydown", escapeKeyHandler);
  console.log("[Walkthrough] Escape key handler enabled");
}

/**
 * Remove Escape key handler
 */
function removeEscapeKeyHandler(): void {
  if (escapeKeyHandler) {
    document.removeEventListener("keydown", escapeKeyHandler);
    escapeKeyHandler = null;
    console.log("[Walkthrough] Escape key handler removed");
  }
}

/**
 * Advance to next step
 */
export function advanceStep(): boolean {
  if (!walkthroughState) return false;

  if (walkthroughState.currentStepIndex < walkthroughState.totalSteps - 1) {
    walkthroughState.currentStepIndex++;
    console.log(
      `[Walkthrough] Advanced to step ${walkthroughState.currentStepIndex + 1}/${walkthroughState.totalSteps}`,
    );
    // GAP-001: Sync state to background for multi-page persistence
    syncStateToBackground();
    return true;
  }

  // Reached end of workflow
  console.log("[Walkthrough] Workflow completed!");
  walkthroughState.status = "completed";
  // GAP-001: Sync completed status to background
  syncStateToBackground();
  return false;
}

/**
 * Go back to previous step
 */
export function previousStep(): boolean {
  if (!walkthroughState) return false;

  if (walkthroughState.currentStepIndex > 0) {
    walkthroughState.currentStepIndex--;
    console.log(
      `[Walkthrough] Went back to step ${walkthroughState.currentStepIndex + 1}/${walkthroughState.totalSteps}`,
    );
    // GAP-001: Sync state to background for multi-page persistence
    syncStateToBackground();
    return true;
  }

  return false;
}

/**
 * Create overlay DOM structure
 * EXT-002: Overlay UI Foundation
 */
function createOverlay(): void {
  // BUG-001 Fix: Check DOM for existing overlay (handles script re-injection)
  // When background re-injects content script, module state is reset but DOM persists
  const existingOverlay = document.getElementById("walkthrough-overlay");
  if (existingOverlay) {
    console.log(
      "[Walkthrough] Removing stale overlay from DOM after re-injection",
    );
    existingOverlay.remove();
    // Reset module state to ensure clean slate
    overlayContainer = null;
    tooltipElement = null;
    backdropElement = null;
    currentTargetElement = null;
    tooltipDelegationSetup = false;
  }

  // Check if overlay already exists in module state
  if (overlayContainer) {
    console.warn("[Walkthrough] Overlay already exists in module state");
    return;
  }

  // Create main overlay container
  overlayContainer = document.createElement("div");
  overlayContainer.id = "walkthrough-overlay";
  overlayContainer.className = "walkthrough-overlay";
  overlayContainer.setAttribute("role", "dialog");
  overlayContainer.setAttribute("aria-label", "Walkthrough guide");

  // Create backdrop with SVG spotlight mask
  backdropElement = document.createElement("div");
  backdropElement.className = "walkthrough-backdrop";

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("walkthrough-spotlight-mask");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");

  // Create mask definition
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
  mask.id = "spotlight-mask";

  // White rectangle (shows backdrop)
  const whiteRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  whiteRect.setAttribute("fill", "white");
  whiteRect.setAttribute("width", "100%");
  whiteRect.setAttribute("height", "100%");

  // Black rectangle (cutout for spotlight - will be positioned dynamically)
  const spotlightRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  spotlightRect.id = "spotlight-cutout";
  spotlightRect.setAttribute("fill", "black");
  spotlightRect.setAttribute("x", "0");
  spotlightRect.setAttribute("y", "0");
  spotlightRect.setAttribute("width", "0");
  spotlightRect.setAttribute("height", "0");
  spotlightRect.setAttribute("rx", "8");

  mask.appendChild(whiteRect);
  mask.appendChild(spotlightRect);
  defs.appendChild(mask);
  svg.appendChild(defs);

  // Create backdrop rectangle with mask applied
  const backdropRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  backdropRect.setAttribute("fill", "rgba(0, 0, 0, 0.7)");
  backdropRect.setAttribute("width", "100%");
  backdropRect.setAttribute("height", "100%");
  backdropRect.setAttribute("mask", "url(#spotlight-mask)");

  svg.appendChild(backdropRect);
  backdropElement.appendChild(svg);

  // Create tooltip
  tooltipElement = document.createElement("div");
  tooltipElement.className = "walkthrough-tooltip";

  // Tooltip will be populated in showCurrentStep()

  // Append to overlay
  overlayContainer.appendChild(backdropElement);
  overlayContainer.appendChild(tooltipElement);

  // Append overlay to body
  document.body.appendChild(overlayContainer);

  // Set up event delegation for tooltip buttons (only once)
  setupTooltipEventDelegation();

  console.log("[Walkthrough] Overlay created");
}

/**
 * Set up event delegation for tooltip button clicks
 * This prevents listener accumulation when tooltip content is updated
 */
function setupTooltipEventDelegation(): void {
  if (!tooltipElement || tooltipDelegationSetup) return;

  tooltipElement.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    // Find the closest button element (handles clicks on SVG icons inside buttons)
    const button = target.closest("button");
    if (!button) return;

    const buttonId = button.id;

    switch (buttonId) {
      case "walkthrough-btn-next":
        handleNext();
        break;
      case "walkthrough-btn-back":
        handleBack();
        break;
      case "walkthrough-btn-skip":
        handleSkipStep();
        break;
      case "walkthrough-btn-exit":
      case "walkthrough-close-btn":
        handleExit();
        break;
      case "walkthrough-btn-done":
        // Clean up and dismiss the overlay
        removeActionListeners();
        cleanupFlashEffects();
        destroyOverlay();
        walkthroughState = null;
        break;
    }
  });

  tooltipDelegationSetup = true;
  console.log("[Walkthrough] Event delegation set up for tooltip buttons");
}

/**
 * Destroy overlay and clean up
 */
function destroyOverlay(): void {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
    tooltipElement = null;
    backdropElement = null;
    currentTargetElement = null;
    tooltipDelegationSetup = false; // Reset for next walkthrough
    tooltipDragSetup = false; // Reset drag setup for next walkthrough
    console.log("[Walkthrough] Overlay destroyed");
  }
}

// Wait for layout to settle after scroll using two rAFs
function waitForLayout(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

/**
 * Show current step in overlay
 * Find element, position spotlight, update tooltip
 */
async function showCurrentStep(): Promise<void> {
  // BUG-002 Fix: Guard against concurrent calls from rapid Next clicks
  if (isShowingStep) {
    console.log("[Walkthrough] Already showing step, ignoring concurrent call");
    return;
  }
  isShowingStep = true;

  try {
    if (!walkthroughState || !overlayContainer || !tooltipElement) {
      console.error("[Walkthrough] Cannot show step: missing state or overlay");
      return;
    }

    const currentStep =
      walkthroughState.steps[walkthroughState.currentStepIndex];

    if (!currentStep) {
      console.error("[Walkthrough] Current step is undefined");
      return;
    }

    try {
      // Find target element using original selectors
      console.log(
        `[Walkthrough] Finding element for step ${walkthroughState.currentStepIndex + 1}`,
      );
      const result = await findElement(currentStep);
      currentTargetElement = result.element;

      // Original selector worked - continue normally
      await proceedWithElement(currentStep, currentTargetElement);
    } catch (_findError) {
      // Original selectors failed - attempt auto-healing
      console.log(
        "[Walkthrough] Original selectors failed, attempting auto-healing...",
      );

      try {
        const healingResult = await healElement(currentStep, {
          aiEnabled: true, // Phase 4: Enable AI validation
          onAIValidate: async (original, candidate, score) => {
            return await validateHealingWithAI(
              original,
              candidate,
              score,
              currentStep,
            );
          },
          onUserPrompt: async (element, score) => {
            return await showHealingConfirmation(element, currentStep, score);
          },
        });

        if (healingResult.success && healingResult.element) {
          // Healing succeeded
          currentTargetElement = healingResult.element;

          // Show appropriate indicator based on confidence
          if (healingResult.confidence >= 0.85) {
            // High confidence - seamless, no indication to user
            console.log(
              `[Walkthrough] Auto-healed with ${(healingResult.confidence * 100).toFixed(1)}% confidence`,
            );
          } else if (healingResult.confidence >= 0.7) {
            // Medium-high confidence - show subtle badge
            showHealedIndicator(healingResult.element);
            console.log(
              `[Walkthrough] Healed with badge at ${(healingResult.confidence * 100).toFixed(1)}% confidence`,
            );
          }
          // For 60-70% range, user already confirmed via onUserPrompt

          await proceedWithElement(currentStep, currentTargetElement);

          // Log healing for backend (Phase 5)
          logHealingAttempt(healingResult, currentStep);
        } else {
          // Healing failed
          console.error(
            "[Walkthrough] Auto-healing failed:",
            healingResult.resolution,
          );
          showElementNotFoundError(currentStep);

          // Log failure for admin alerts (Phase 5)
          logHealingAttempt(healingResult, currentStep);
        }
      } catch (healError) {
        console.error("[Walkthrough] Healing system error:", healError);
        showElementNotFoundError(currentStep);
      }
    }
  } finally {
    isShowingStep = false;
  }
}

/**
 * Proceed with element display after finding or healing
 */
async function proceedWithElement(
  step: StepResponse,
  element: HTMLElement,
): Promise<void> {
  // Scroll into view if needed
  scrollToElement(element);

  // Wait for layout to settle
  await waitForLayout();

  // Position spotlight around element
  updateSpotlight(element);

  // Update tooltip content and position
  updateTooltip(step, element);

  // Attach action detection listeners (EXT-004)
  attachActionListeners(step, element);
}

/**
 * Show a subtle indicator that the element was auto-healed
 */
function showHealedIndicator(element: HTMLElement): void {
  // Add a subtle pulsing border to indicate healing
  const originalOutline = element.style.outline;
  const originalTransition = element.style.transition;

  element.style.transition = "outline 0.3s ease-in-out";
  element.style.outline = "2px dashed #14b8a6"; // Accent color - teal

  // Remove indicator after 3 seconds
  setTimeout(() => {
    element.style.outline = originalOutline;
    element.style.transition = originalTransition;
  }, 3000);
}

/**
 * Show healing confirmation dialog for medium confidence matches
 */
async function showHealingConfirmation(
  element: HTMLElement,
  step: StepResponse,
  confidence: number,
): Promise<{ confirmed: boolean }> {
  return new Promise((resolve) => {
    // Highlight the candidate element
    const originalOutline = element.style.outline;
    const originalBoxShadow = element.style.boxShadow;
    element.style.outline = "3px solid #f59e0b"; // Warning amber
    element.style.boxShadow = "0 0 20px rgba(245, 158, 11, 0.5)";

    // Create confirmation overlay
    const confirmOverlay = document.createElement("div");
    confirmOverlay.id = "healing-confirm-overlay";
    confirmOverlay.innerHTML = `
      <div class="healing-confirm-dialog">
        <div class="healing-confirm-header">
          <span class="healing-confirm-icon">🔄</span>
          <span class="healing-confirm-title">Element Changed</span>
        </div>
        <div class="healing-confirm-content">
          <p>The page has changed. Is this the correct element for:</p>
          <p class="healing-confirm-label">"${escapeHtml(step.field_label) || "this step"}"</p>
          <p class="healing-confirm-confidence">Confidence: ${(confidence * 100).toFixed(0)}%</p>
        </div>
        <div class="healing-confirm-actions">
          <button class="healing-confirm-btn healing-confirm-yes">Yes, continue</button>
          <button class="healing-confirm-btn healing-confirm-no">No, skip step</button>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement("style");
    style.textContent = `
      #healing-confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
      }
      .healing-confirm-dialog {
        background: white;
        border-radius: 16px;
        padding: 24px;
        max-width: 400px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.3);
        animation: slideUp 0.3s ease-out;
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .healing-confirm-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .healing-confirm-icon {
        font-size: 24px;
      }
      .healing-confirm-title {
        font-size: 18px;
        font-weight: 600;
        color: #171717;
      }
      .healing-confirm-content {
        color: #525252;
        margin-bottom: 20px;
      }
      .healing-confirm-content p {
        margin: 8px 0;
      }
      .healing-confirm-label {
        font-weight: 600;
        color: #171717;
        background: #f5f5f5;
        padding: 8px 12px;
        border-radius: 8px;
      }
      .healing-confirm-confidence {
        font-size: 14px;
        color: #737373;
      }
      .healing-confirm-actions {
        display: flex;
        gap: 12px;
      }
      .healing-confirm-btn {
        flex: 1;
        padding: 12px 16px;
        border-radius: 10px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.2s;
      }
      .healing-confirm-yes {
        background: #14b8a6;
        color: white;
      }
      .healing-confirm-yes:hover {
        background: #0d9488;
      }
      .healing-confirm-no {
        background: #f5f5f5;
        color: #525252;
      }
      .healing-confirm-no:hover {
        background: #e5e5e5;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(confirmOverlay);

    // Handle button clicks
    const yesBtn = confirmOverlay.querySelector(".healing-confirm-yes");
    const noBtn = confirmOverlay.querySelector(".healing-confirm-no");

    const cleanup = () => {
      element.style.outline = originalOutline;
      element.style.boxShadow = originalBoxShadow;
      confirmOverlay.remove();
      style.remove();
    };

    yesBtn?.addEventListener("click", () => {
      cleanup();
      resolve({ confirmed: true });
    });

    noBtn?.addEventListener("click", () => {
      cleanup();
      resolve({ confirmed: false });
    });

    // Auto-timeout after 30 seconds
    setTimeout(() => {
      cleanup();
      resolve({ confirmed: false });
    }, 30000);
  });
}

/**
 * Log healing attempt for backend tracking (Phase 5: Health logging)
 */
function logHealingAttempt(result: HealingResult, step: StepResponse): void {
  // Send to background script for backend logging
  chrome.runtime
    .sendMessage({
      type: "LOG_HEALING_ATTEMPT",
      payload: {
        stepId: step.id,
        workflowId: step.workflow_id,
        success: result.success,
        confidence: result.confidence,
        resolution: result.resolution,
        pageUrl: window.location.href,
        healingLog: result.healingLog,
      },
    })
    .catch((error) => {
      console.warn("[Walkthrough] Failed to log healing attempt:", error);
    });
}

/**
 * Call AI validation via background script
 * Returns match result from backend AI service
 */
async function validateHealingWithAI(
  original: ElementContext,
  candidate: ElementContext,
  score: number,
  step: StepResponse,
): Promise<{ isMatch: boolean; confidence: number }> {
  return new Promise((resolve, reject) => {
    // Build the validation request
    const request = {
      workflow_id: step.workflow_id,
      step_id: step.id,
      original_context: {
        tag_name: original.tagName,
        text: original.text || null,
        role: original.role || null,
        type: original.type || null,
        id: original.selectors?.primary?.match(/#([^.[\s]+)/)?.[1] || null,
        name: original.name || null,
        classes: original.classes || [],
        data_testid: original.selectors?.dataTestId || null,
        label_text: original.fieldLabel || null,
        placeholder: null,
        aria_label: null,
        x: original.boundingBox?.x || 0,
        y: original.boundingBox?.y || 0,
        width: original.boundingBox?.width || 0,
        height: original.boundingBox?.height || 0,
        visual_region: original.visualRegion || "unknown",
        form_context: original.formContext
          ? {
              form_id: original.formContext.formId || null,
              form_action: original.formContext.formAction || null,
              form_name: original.formContext.formName || null,
              form_classes: original.formContext.formClasses || [],
              field_index: original.formContext.fieldIndex || 0,
              total_fields: original.formContext.totalFields || 0,
            }
          : null,
        nearby_landmarks: original.nearbyLandmarks
          ? {
              closest_heading: original.nearbyLandmarks.closestHeading,
              closest_label: original.nearbyLandmarks.closestLabel,
              sibling_texts: original.nearbyLandmarks.siblingTexts || [],
              container_text: original.nearbyLandmarks.containerText || null,
            }
          : null,
      },
      candidate_context: {
        tag_name: candidate.tagName,
        text: candidate.text || null,
        role: candidate.role || null,
        type: candidate.type || null,
        id: candidate.selectors?.primary?.match(/#([^.[\s]+)/)?.[1] || null,
        name: candidate.name || null,
        classes: candidate.classes || [],
        data_testid: candidate.selectors?.dataTestId || null,
        label_text: candidate.fieldLabel || null,
        placeholder: null,
        aria_label: null,
        x: candidate.boundingBox?.x || 0,
        y: candidate.boundingBox?.y || 0,
        width: candidate.boundingBox?.width || 0,
        height: candidate.boundingBox?.height || 0,
        visual_region: candidate.visualRegion || "unknown",
        form_context: candidate.formContext
          ? {
              form_id: candidate.formContext.formId || null,
              form_action: candidate.formContext.formAction || null,
              form_name: candidate.formContext.formName || null,
              form_classes: candidate.formContext.formClasses || [],
              field_index: candidate.formContext.fieldIndex || 0,
              total_fields: candidate.formContext.totalFields || 0,
            }
          : null,
        nearby_landmarks: candidate.nearbyLandmarks
          ? {
              closest_heading: candidate.nearbyLandmarks.closestHeading,
              closest_label: candidate.nearbyLandmarks.closestLabel,
              sibling_texts: candidate.nearbyLandmarks.siblingTexts || [],
              container_text: candidate.nearbyLandmarks.containerText || null,
            }
          : null,
      },
      deterministic_score: score,
      factor_scores: {},
      original_screenshot: null, // Could add screenshot URL if available
      current_screenshot: null,
      page_url: window.location.href,
      original_url: step.page_context?.url || window.location.href,
      field_label: step.field_label || null,
    };

    chrome.runtime.sendMessage(
      { type: "VALIDATE_HEALING", payload: request },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[Walkthrough] AI validation failed:",
            chrome.runtime.lastError.message,
          );
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response?.payload?.success && response?.payload?.result) {
          const result = response.payload.result;
          console.log("[Walkthrough] AI validation result:", {
            isMatch: result.is_match,
            confidence: result.ai_confidence,
            recommendation: result.recommendation,
          });
          resolve({
            isMatch: result.is_match,
            confidence: result.ai_confidence,
          });
        } else {
          console.warn(
            "[Walkthrough] AI validation returned error:",
            response?.payload?.error,
          );
          reject(new Error(response?.payload?.error || "AI validation failed"));
        }
      },
    );
  });
}

/**
 * Update spotlight SVG mask to highlight target element
 */
function updateSpotlight(targetElement: HTMLElement): void {
  const spotlightRect = document.getElementById("spotlight-cutout");
  if (!spotlightRect) {
    console.error(
      "[Walkthrough] Spotlight cutout element not found - SVG may not be initialized",
    );
    return;
  }

  const rect = targetElement.getBoundingClientRect();
  const padding = 8; // Breathing room around element

  // Validate rect values - element may be hidden or have zero size
  if (rect.width === 0 || rect.height === 0) {
    console.warn(
      "[Walkthrough] Target element has zero dimensions, spotlight may not be visible",
    );
  }

  spotlightRect.setAttribute("x", String(rect.left - padding));
  spotlightRect.setAttribute("y", String(rect.top - padding));
  spotlightRect.setAttribute("width", String(rect.width + padding * 2));
  spotlightRect.setAttribute("height", String(rect.height + padding * 2));

  console.log("[Walkthrough] Spotlight positioned at:", {
    x: rect.left - padding,
    y: rect.top - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  });
}

/**
 * Update tooltip content and position
 */
function updateTooltip(step: StepResponse, targetElement: HTMLElement): void {
  if (!tooltipElement || !walkthroughState) return;

  const currentStepNum = walkthroughState.currentStepIndex + 1;
  const totalSteps = walkthroughState.totalSteps;
  const isLastStep = currentStepNum === totalSteps;
  const isFirstStep = currentStepNum === 1;
  const progressPercent = (currentStepNum / totalSteps) * 100;

  // Update content with new design
  tooltipElement.innerHTML = `
    <!-- Header -->
    <div class="walkthrough-tooltip-header">
      <div class="walkthrough-step-info">
        <span class="walkthrough-step-number">${currentStepNum}</span>
        <span class="walkthrough-progress">Step ${currentStepNum} of ${totalSteps}</span>
      </div>
      <button class="walkthrough-close-btn" id="walkthrough-close-btn" title="Close">
        ${ICONS.x}
      </button>
    </div>

    <!-- Content -->
    <div class="walkthrough-tooltip-content">
      <h3 class="walkthrough-field-label">${escapeHtml(step.field_label) || "Action Required"}</h3>
      <p class="walkthrough-instruction">${escapeHtml(step.instruction) || "Complete this action to continue."}</p>
      <p class="walkthrough-error-msg hidden" id="walkthrough-error-msg"></p>
    </div>

    <!-- Footer -->
    <div class="walkthrough-tooltip-footer">
      <div class="walkthrough-footer-left">
        <button class="walkthrough-btn walkthrough-btn-back" id="walkthrough-btn-back" ${isFirstStep ? "disabled" : ""}>
          ${ICONS.chevronLeft}
          Back
        </button>
      </div>
      <div class="walkthrough-footer-right">
        <button class="walkthrough-btn walkthrough-btn-skip hidden" id="walkthrough-btn-skip">
          Skip
        </button>
        <button class="walkthrough-btn walkthrough-btn-exit" id="walkthrough-btn-exit">
          Exit
        </button>
        <button class="walkthrough-btn walkthrough-btn-next" id="walkthrough-btn-next">
          ${isLastStep ? "Complete" : "Next"}
          ${ICONS.chevronRight}
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="walkthrough-progress-bar">
      <div class="walkthrough-progress-bar-fill" style="width: ${progressPercent}%"></div>
    </div>
  `;

  // Position tooltip
  const targetRect = targetElement.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const position = calculateTooltipPosition(
    targetRect,
    tooltipRect.width,
    tooltipRect.height,
  );

  tooltipElement.style.top = `${position.top}px`;
  tooltipElement.style.left = `${position.left}px`;
  // Clear any transform from centered error/completion state
  tooltipElement.style.transform = "";

  // Note: Button click handlers are managed via event delegation in setupTooltipEventDelegation()
  // No need to attach individual listeners here - this prevents listener accumulation on re-renders

  // Setup drag handlers for repositioning (only once)
  setupTooltipDrag();
}

/**
 * Calculate optimal tooltip position
 * Try below first, then above, then sides, fallback to corner
 */
function calculateTooltipPosition(
  targetRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number,
): { top: number; left: number } {
  const padding = 16;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Try below target
  if (targetRect.bottom + padding + tooltipHeight < viewportHeight) {
    return {
      top: targetRect.bottom + padding,
      left: Math.max(
        padding,
        Math.min(
          targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
          viewportWidth - tooltipWidth - padding,
        ),
      ),
    };
  }

  // Try above target
  if (targetRect.top - padding - tooltipHeight > 0) {
    return {
      top: targetRect.top - padding - tooltipHeight,
      left: Math.max(
        padding,
        Math.min(
          targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
          viewportWidth - tooltipWidth - padding,
        ),
      ),
    };
  }

  // Try right side
  if (targetRect.right + padding + tooltipWidth < viewportWidth) {
    return {
      top: Math.max(
        padding,
        Math.min(
          targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          viewportHeight - tooltipHeight - padding,
        ),
      ),
      left: targetRect.right + padding,
    };
  }

  // Try left side
  if (targetRect.left - padding - tooltipWidth > 0) {
    return {
      top: Math.max(
        padding,
        Math.min(
          targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
          viewportHeight - tooltipHeight - padding,
        ),
      ),
      left: targetRect.left - padding - tooltipWidth,
    };
  }

  // Fallback: bottom-right corner
  return {
    top: viewportHeight - tooltipHeight - padding,
    left: viewportWidth - tooltipWidth - padding,
  };
}

/**
 * Show error message when element not found
 */
async function showElementNotFoundError(step: StepResponse): Promise<void> {
  if (!tooltipElement || !walkthroughState) return;

  tooltipElement.className = "walkthrough-tooltip walkthrough-error";
  tooltipElement.innerHTML = `
    <!-- Header -->
    <div class="walkthrough-tooltip-header">
      <div class="walkthrough-step-info">
        <span class="walkthrough-step-number">!</span>
        <span class="walkthrough-progress">Error</span>
      </div>
      <button class="walkthrough-close-btn" id="walkthrough-close-btn" title="Close">
        ${ICONS.x}
      </button>
    </div>

    <!-- Content -->
    <div class="walkthrough-tooltip-content">
      <h3 class="walkthrough-field-label">
        <span class="walkthrough-error-icon">⚠️</span>
        Element Not Found
      </h3>
      <p class="walkthrough-instruction">
        Cannot find "${escapeHtml(step.field_label) || "target element"}". This workflow may be outdated or the page structure has changed.
      </p>
    </div>

    <!-- Footer -->
    <div class="walkthrough-tooltip-footer">
      <div class="walkthrough-footer-left"></div>
      <div class="walkthrough-footer-right">
        <button class="walkthrough-btn walkthrough-btn-skip" id="walkthrough-btn-skip">
          Skip Step
        </button>
        <button class="walkthrough-btn walkthrough-btn-exit" id="walkthrough-btn-exit">
          Exit
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="walkthrough-progress-bar">
      <div class="walkthrough-progress-bar-fill" style="width: ${((walkthroughState.currentStepIndex + 1) / walkthroughState.totalSteps) * 100}%"></div>
    </div>
  `;

  // Position in center of viewport
  tooltipElement.style.top = "50%";
  tooltipElement.style.left = "50%";
  tooltipElement.style.transform = "translate(-50%, -50%)";

  // EXT-006: Log element not found via background
  logExecutionViaBackground({
    step_id: step.id,
    status: "failed",
    error_type: "element_not_found",
    error_message: `Could not find element for step ${step.step_number}: ${step.field_label || "Unknown"}`,
    page_url: window.location.href,
  });

  // Note: Button click handlers are managed via event delegation in setupTooltipEventDelegation()
}

/**
 * Handle Next button click
 */
async function handleNext(): Promise<void> {
  // Disable buttons to prevent double-clicks during async processing
  const nextBtn = document.getElementById(
    "walkthrough-btn-next",
  ) as HTMLButtonElement | null;
  const backBtn = document.getElementById(
    "walkthrough-btn-back",
  ) as HTMLButtonElement | null;
  if (nextBtn) nextBtn.disabled = true;
  if (backBtn) backBtn.disabled = true;

  // Remove action listeners before advancing (EXT-004)
  removeActionListeners();

  if (advanceStep()) {
    await showCurrentStep(); // Now properly awaited
  } else {
    // Completed all steps
    showCompletionMessage();
  }
  // Note: buttons get re-enabled when tooltip is re-rendered in showCurrentStep
}

/**
 * Handle Back button click
 */
async function handleBack(): Promise<void> {
  // Disable buttons to prevent double-clicks during async processing
  const nextBtn = document.getElementById(
    "walkthrough-btn-next",
  ) as HTMLButtonElement | null;
  const backBtn = document.getElementById(
    "walkthrough-btn-back",
  ) as HTMLButtonElement | null;
  if (nextBtn) nextBtn.disabled = true;
  if (backBtn) backBtn.disabled = true;

  // Remove action listeners before going back (EXT-004)
  removeActionListeners();

  if (previousStep()) {
    await showCurrentStep(); // Now properly awaited
  }
  // Note: buttons get re-enabled when tooltip is re-rendered in showCurrentStep
}

/**
 * Handle Exit button click
 */
function handleExit(): void {
  if (confirm("Are you sure you want to exit this walkthrough?")) {
    exitWalkthrough();
  }
}

/**
 * Show completion message
 */
async function showCompletionMessage(): Promise<void> {
  if (!tooltipElement || !walkthroughState) return;

  tooltipElement.className = "walkthrough-tooltip walkthrough-complete";
  tooltipElement.innerHTML = `
    <!-- Header -->
    <div class="walkthrough-tooltip-header">
      <div class="walkthrough-step-info">
        <span class="walkthrough-step-number">✓</span>
        <span class="walkthrough-progress">Complete</span>
      </div>
    </div>

    <!-- Content -->
    <div class="walkthrough-tooltip-content">
      <h3 class="walkthrough-field-label">Workflow Complete!</h3>
      <p class="walkthrough-instruction">
        You've successfully completed "${walkthroughState.workflowName}". Great job!
      </p>
    </div>

    <!-- Footer -->
    <div class="walkthrough-tooltip-footer">
      <div class="walkthrough-footer-left"></div>
      <div class="walkthrough-footer-right">
        <button class="walkthrough-btn walkthrough-btn-next" id="walkthrough-btn-done">
          Done
          ${ICONS.chevronRight}
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="walkthrough-progress-bar">
      <div class="walkthrough-progress-bar-fill" style="width: 100%"></div>
    </div>
  `;

  // Position in center of viewport
  tooltipElement.style.top = "50%";
  tooltipElement.style.left = "50%";
  tooltipElement.style.transform = "translate(-50%, -50%)";

  // Remove spotlight
  const spotlightRect = document.getElementById("spotlight-cutout");
  if (spotlightRect) {
    spotlightRect.setAttribute("width", "0");
    spotlightRect.setAttribute("height", "0");
  }

  // EXT-006: Log successful completion via background
  const executionTimeMs = walkthroughState.startTime
    ? Date.now() - walkthroughState.startTime
    : null;
  logExecutionViaBackground({
    status: "success",
    page_url: window.location.href,
    execution_time_ms: executionTimeMs,
  });

  // Note: Done button click is handled via event delegation in setupTooltipEventDelegation()
}

/**
 * Get events to listen for based on action type
 * EXT-004: Action Detection
 */
function getEventsForActionType(actionType: string): string[] {
  switch (actionType) {
    case "click":
      return ["click"];
    case "input_commit":
      // Mirror recorder heuristics: commit on blur only (not every change)
      return ["blur"];
    case "select_change":
      return ["change"];
    case "submit":
      return ["submit"];
    case "navigate":
      return []; // No auto-advance for navigation
    default:
      return [];
  }
}

/**
 * Check if input value has changed since focus
 */
function hasValueChanged(element: HTMLElement): boolean {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    )
  ) {
    return false;
  }

  const initialValue = inputValues.get(element) || "";
  const changed = element.value !== initialValue;
  console.log(
    `[Walkthrough] Value changed: ${changed} (initial: "${initialValue}", current: "${element.value}")`,
  );
  return changed;
}

/**
 * Check if the click event target is on or within the target element.
 * Handles clicks on nested child elements (e.g., SVG icons inside buttons).
 * @exported for testing
 */
export function isClickOnTarget(
  event: Event,
  targetElement: HTMLElement,
): boolean {
  const eventTarget = event.target as HTMLElement;

  // Direct match
  if (eventTarget === targetElement) {
    return true;
  }

  // Check if target contains the clicked element (for child elements)
  if (targetElement.contains(eventTarget)) {
    return true;
  }

  // For shadow DOM support, check composed path
  if (event.composedPath) {
    const path = event.composedPath();
    return path.includes(targetElement);
  }

  return false;
}

/**
 * Validate that action matches expected step
 */
function validateAction(
  event: Event,
  step: StepResponse,
  targetElement: HTMLElement,
): boolean {
  const eventTarget = event.target as HTMLElement;

  // 1. Check if event target is on or within the expected target element
  // Uses contains() to handle clicks on child elements (e.g., icon inside button)
  if (!isClickOnTarget(event, targetElement)) {
    console.log("[Walkthrough] Action validation failed: wrong element");
    return false;
  }

  // 2. Check if action type matches
  switch (step.action_type) {
    case "click":
      return event.type === "click";

    case "input_commit":
      // Commit on blur only (mirror recorder); ensure value actually changed
      // Use the actual event target for input validation, not the parent
      return event.type === "blur" && hasValueChanged(eventTarget);

    case "select_change":
      // For select, check if the event target or the targetElement is a select
      return (
        event.type === "change" &&
        (eventTarget instanceof HTMLSelectElement ||
          targetElement instanceof HTMLSelectElement)
      );

    case "submit":
      return event.type === "submit";

    default:
      return false;
  }
}

/**
 * Handle detected action - validate and auto-advance if correct
 */
function handleActionDetected(
  event: Event,
  step: StepResponse,
  targetElement: HTMLElement,
): void {
  console.log(`[Walkthrough] Action detected: ${event.type} on`, event.target);

  // Validate action
  if (!validateAction(event, step, targetElement)) {
    console.log("[Walkthrough] Action did not match expected step");
    // EXT-005: Handle incorrect action
    handleIncorrectAction(
      step,
      targetElement,
      "That's not quite right. Please try the highlighted step.",
    );
    return;
  }

  console.log("[Walkthrough] Correct action detected! Auto-advancing...");

  // Reset retry counter for this step (EXT-005)
  if (walkthroughState) {
    walkthroughState.retryAttempts.set(walkthroughState.currentStepIndex, 0);
  }

  // Show success feedback
  flashElement(targetElement);

  // Auto-advance after a small delay tuned per action
  const delay = ((): number => {
    switch (step.action_type) {
      case "click":
      case "submit":
        return 60;
      case "select_change":
        return 120;
      case "input_commit":
        return 150;
      default:
        return 120;
    }
  })();

  setTimeout(() => {
    handleNext();
  }, delay);
}

/**
 * Attach action detection listeners to target element
 * EXT-004: Auto-advance on correct action
 */
function attachActionListeners(
  step: StepResponse,
  targetElement: HTMLElement,
): void {
  // Clear previous listeners
  removeActionListeners();

  // Track initial value for inputs
  if (
    targetElement instanceof HTMLInputElement ||
    targetElement instanceof HTMLTextAreaElement
  ) {
    inputValues.set(targetElement, targetElement.value);
    console.log(
      `[Walkthrough] Tracking initial value: "${targetElement.value}"`,
    );
  }

  // Determine which events to listen for
  const events = getEventsForActionType(step.action_type);

  if (events.length === 0) {
    console.log(
      `[Walkthrough] No auto-advance for action type: ${step.action_type}`,
    );
    return;
  }

  console.log(
    `[Walkthrough] Attaching listeners for ${step.action_type}:`,
    events,
  );

  // For input commits, also listen to focus to reset baseline value
  if (step.action_type === "input_commit") {
    const focusHandler = () => {
      if (
        targetElement instanceof HTMLInputElement ||
        targetElement instanceof HTMLTextAreaElement
      ) {
        inputValues.set(targetElement, targetElement.value);
      }
    };
    targetElement.addEventListener("focusin", focusHandler);
    activeListeners.push({
      element: targetElement,
      event: "focusin",
      handler: focusHandler,
    });
  }

  // Attach listeners
  events.forEach((eventType) => {
    const handler = (event: Event) => {
      handleActionDetected(event, step, targetElement);
    };

    // For submit events, listen on form (not button)
    // Skip submit listener entirely if no form is found to avoid false positives
    if (eventType === "submit") {
      const form = targetElement.closest("form");
      if (!form) {
        console.log(
          "[Walkthrough] No form found for submit action, skipping submit listener",
        );
        return; // Skip this event type
      }
      form.addEventListener(eventType, handler);
      activeListeners.push({ element: form, event: eventType, handler });
    } else {
      targetElement.addEventListener(eventType, handler);
      activeListeners.push({
        element: targetElement,
        event: eventType,
        handler,
      });
    }
  });
}

/**
 * Remove all active action listeners
 */
function removeActionListeners(): void {
  activeListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
  });
  activeListeners = [];
  console.log("[Walkthrough] Removed action listeners");
}

/**
 * Log execution via background to avoid importing API client in content script (EXT-006)
 */
function logExecutionViaBackground(data: {
  step_id?: number | null;
  status: "success" | "healed_deterministic" | "healed_ai" | "failed";
  error_type?:
    | "element_not_found"
    | "timeout"
    | "navigation_error"
    | "user_exit"
    | null;
  error_message?: string | null;
  healing_confidence?: number | null;
  deterministic_score?: number | null;
  page_url?: string | null;
  execution_time_ms?: number | null;
}): void {
  if (!walkthroughState) return;
  chrome.runtime.sendMessage(
    {
      type: "LOG_EXECUTION",
      payload: { workflowId: walkthroughState.workflowId, ...data },
    },
    () => {
      // Swallow lastError to avoid noisy console warnings
      const e = chrome.runtime.lastError;
      if (e) {
        console.debug("[Walkthrough] LOG_EXECUTION ignored:", e.message);
      }
    },
  );
}

/**
 * Handle incorrect action (EXT-005)
 */
function handleIncorrectAction(
  _step: StepResponse,
  targetElement: HTMLElement,
  message: string,
): void {
  if (!walkthroughState || !tooltipElement) return;

  // Increment retry counter
  const attempts =
    walkthroughState.retryAttempts.get(walkthroughState.currentStepIndex) || 0;
  walkthroughState.retryAttempts.set(
    walkthroughState.currentStepIndex,
    attempts + 1,
  );

  console.log(`[Walkthrough] Incorrect action. Attempt ${attempts + 1}/3`);

  // Show error message in tooltip
  const errorEl = tooltipElement.querySelector("#walkthrough-error-msg");
  if (errorEl) {
    errorEl.textContent =
      attempts >= 2 ? "Having trouble? You can skip this step." : message;
    errorEl.classList.remove("hidden");
  }

  // After 3 failed attempts, show Skip button and hide Next
  if (attempts >= 2) {
    const skipBtn = tooltipElement.querySelector("#walkthrough-btn-skip");
    const nextBtn = tooltipElement.querySelector("#walkthrough-btn-next");
    if (skipBtn) {
      skipBtn.classList.remove("hidden");
    }
    // Hide Next button to avoid two forward options
    if (nextBtn) {
      nextBtn.classList.add("hidden");
    }
  }

  // Flash target element red to indicate error
  if (targetElement) {
    const prevBoxShadow = targetElement.style.boxShadow;
    targetElement.style.boxShadow = "0 0 0 3px rgba(239, 68, 68, 0.6)"; // red
    setTimeout(() => {
      targetElement.style.boxShadow = prevBoxShadow;
    }, 400);
  }
}

/**
 * Handle skip step (EXT-005)
 */
function handleSkipStep(): void {
  if (!walkthroughState) return;

  console.log(
    "[Walkthrough] Skipping step",
    walkthroughState.currentStepIndex + 1,
  );

  // Log skipped step as failed (EXT-006)
  const currentStep = walkthroughState.steps[walkthroughState.currentStepIndex];
  if (currentStep) {
    logExecutionViaBackground({
      step_id: currentStep.id,
      status: "failed",
      error_type: "user_exit",
      error_message: "User skipped step after 3 failed attempts",
      page_url: window.location.href,
    });
  }

  // Advance to next step
  handleNext();
}

/**
 * Exit walkthrough mode
 */
export function exitWalkthrough(): void {
  if (!walkthroughState) return;

  console.log("[Walkthrough] Exiting walkthrough");

  // EXT-006: Log early exit as failed via background
  const executionTimeMs = walkthroughState.startTime
    ? Date.now() - walkthroughState.startTime
    : null;
  logExecutionViaBackground({
    status: "failed",
    error_type: "user_exit",
    error_message: "User exited walkthrough early",
    page_url: window.location.href,
    execution_time_ms: executionTimeMs,
  });

  // Clean up action listeners (EXT-004)
  removeActionListeners();
  // GAP-003: Remove click interceptor
  removeClickInterceptor();
  // GAP-004: Remove beforeunload handler
  removeBeforeUnloadHandler();
  // Remove Escape key handler
  removeEscapeKeyHandler();
  // Remove spotlight update handlers
  removeSpotlightUpdateHandlers();
  // Clean up any lingering visual effects on page elements
  cleanupFlashEffects();

  // Clean up overlay UI
  destroyOverlay();

  // Reset state
  walkthroughState = null;
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[Walkthrough] Received message:", message.type);

  // WALKTHROUGH_PING: Verify content script is ready
  if (message.type === "WALKTHROUGH_PING") {
    sendResponse({ success: true, ready: true });
    return false;
  }

  if (message.type === "WALKTHROUGH_DATA") {
    // Prevent duplicate initialization
    if (walkthroughState !== null) {
      console.log(
        "[Walkthrough] Ignoring duplicate WALKTHROUGH_DATA - already initialized",
      );
      sendResponse({ success: true, status: "already_initialized" });
      return false;
    }

    // Handle async initialization properly
    // Must return true to indicate we'll call sendResponse asynchronously
    console.log("[Walkthrough] Starting async initialization...");
    initializeWalkthrough(message.payload)
      .then(() => {
        console.log("[Walkthrough] Initialization completed successfully");
        sendResponse({ success: true, status: "initialized" });
      })
      .catch((error) => {
        console.error("[Walkthrough] Initialization failed:", error);
        sendResponse({
          success: false,
          status: "error",
          error: String(error),
        });
      });
    return true; // Indicates async response
  }

  if (message.type === "WALKTHROUGH_ERROR") {
    console.error(
      "[Walkthrough] Error from background:",
      message.payload.error,
    );
    if (walkthroughState) {
      walkthroughState.status = "error";
      walkthroughState.error = message.payload.error;
    }
    sendResponse({ success: false });
    return false;
  }

  // GAP-001: Handle session end notification from background
  if (message.type === "WALKTHROUGH_SESSION_END") {
    console.log(
      "[Walkthrough] Session ended by background:",
      message.payload?.reason,
    );
    // Clean up without logging (background already handled it)
    removeActionListeners();
    removeClickInterceptor();
    removeBeforeUnloadHandler();
    removeEscapeKeyHandler();
    cleanupFlashEffects();
    destroyOverlay();
    walkthroughState = null;
    sendResponse({ success: true });
    return false;
  }

  // Do not claim async handling for unrelated messages
  return false;
});

// SECURITY: Allowed origins for postMessage communication
// Update for production domains as needed
const ALLOWED_DASHBOARD_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost", // For test environments (JSDOM)
  // Add production domains here:
  // "https://dashboard.yourdomain.com",
];

// Listen for messages from page (dashboard) via window.postMessage
// Forwards START_WALKTHROUGH to background script
window.addEventListener("message", (event: MessageEvent) => {
  try {
    // SECURITY: Validate origin to prevent spoofing from malicious pages
    if (!ALLOWED_DASHBOARD_ORIGINS.includes(event.origin)) {
      // Silently ignore - don't log to avoid leaking info to attackers
      return;
    }

    // SECURITY: Ensure message is from same window (not iframe)
    if (event.source !== window) {
      return;
    }

    const data = (event.data || {}) as {
      source?: string;
      type?: string;
      payload?: any;
    };
    if (data.source !== "overlay-dashboard") return;

    if (data.type === "START_WALKTHROUGH") {
      // Prevent duplicate initialization - only forward if not already active
      if (walkthroughState !== null) {
        console.log(
          "[Walkthrough] Ignoring duplicate START_WALKTHROUGH - already active",
        );
        return;
      }
      console.log(
        "[Walkthrough] Forwarding START_WALKTHROUGH from page to background",
      );
      chrome.runtime.sendMessage(
        { type: "START_WALKTHROUGH", payload: data.payload },
        () => {
          // Swallow lastError to prevent console warnings
          const e = chrome.runtime.lastError;
          if (e) {
            console.debug(
              "[Walkthrough] START_WALKTHROUGH send ignored:",
              e.message,
            );
          }
        },
      );
    }
  } catch (err) {
    console.error("[Walkthrough] Error handling window message", err);
  }
});
