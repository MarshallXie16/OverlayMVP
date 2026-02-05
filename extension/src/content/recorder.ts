/**
 * Content Script: Event Recorder
 * Captures user interactions (clicks, inputs, navigation) during workflow recording
 *
 * Coordinates:
 * - Event listeners for user interactions
 * - Selector and metadata extraction
 * - IndexedDB storage
 * - Screenshot capture via background worker
 * - Upload coordination
 */

import type {
  StepCreate,
  ExtensionMessage,
  RecordingSessionState,
} from "@/shared/types";
import { extractSelectors } from "./utils/selectors";
import { extractMetadata, extractActionData } from "./utils/metadata";
import {
  isInteractionMeaningful,
  getActionType,
  InputDebouncer,
} from "./utils/filters";
import { EventDeduplicator } from "./utils/event-deduplicator";
import { isEnterCommitKeydown } from "./utils/recordingEnterCommit";
import { shouldRecordNavigateStep } from "./utils/recordingNavigation";
// Note: IndexedDB imports kept for backward compatibility but we prefer session storage
import {
  addStep as addStepToIndexedDB,
  getSteps,
  clearSteps,
  getStepCount,
  getScreenshots,
  clearScreenshots,
} from "./storage/indexeddb";
import {
  showRecordingWidget,
  hideRecordingWidget,
  updateWidgetStepCount,
  onWidgetStop,
  onWidgetPause,
  restoreWidgetState,
} from "./widget";
/**
 * Adds a highlight outline to an element for screenshot capture.
 * Uses outline (not box-shadow) to avoid layout shift.
 * Returns a cleanup function to remove the highlight after screenshot.
 */
function addHighlightForScreenshot(element: HTMLElement): () => void {
  const prevOutline = element.style.outline;
  const prevOutlineOffset = element.style.outlineOffset;

  // Green outline - visible in screenshots, matches branding
  element.style.outline = "3px solid #22c55e";
  element.style.outlineOffset = "2px";

  // Return cleanup function
  return () => {
    element.style.outline = prevOutline;
    element.style.outlineOffset = prevOutlineOffset;
  };
}

/**
 * Waits for the next animation frame to ensure DOM changes are rendered.
 */
function waitForRender(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// CSS is loaded via manifest.json content_scripts.css

console.log("📝 Workflow Recorder: Content script (recorder) loaded");

// Test message passing to background worker
chrome.runtime.sendMessage({ type: "PING" }, (response) => {
  if (response) {
    console.log("Recorder received response from background:", response);
  }
});

// ============================================================================
// RECORDER STATE
// ============================================================================

interface RecorderState {
  isRecording: boolean;
  currentStepNumber: number;
  startingUrl: string | null;
  debouncer: InputDebouncer;
  deduplicator: EventDeduplicator;
  /** Timestamp when we recorded an input_commit immediately on Enter keydown */
  immediateInputCommitRecordedAtMs: number | null;
}

const state: RecorderState = {
  isRecording: false,
  currentStepNumber: 0,
  startingUrl: null,
  debouncer: new InputDebouncer(),
  deduplicator: new EventDeduplicator(),
  immediateInputCommitRecordedAtMs: null,
};

// ============================================================================
// SESSION-BASED STORAGE (Multi-page recording support)
// ============================================================================

/**
 * Add step to recording session (via background worker)
 * This replaces IndexedDB storage for cross-origin support
 *
 * IMPORTANT: The background assigns the step_number to avoid race conditions.
 * Returns the assigned step number, or -1 if the step couldn't be saved.
 */
async function addStep(step: StepCreate): Promise<number> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "RECORDING_ADD_STEP",
      payload: { step },
    });

    if (response?.payload?.success && response?.payload?.stepNumber > 0) {
      return response.payload.stepNumber;
    } else {
      console.warn("[ContentRecorder] Failed to add step to session");
      // Fallback to IndexedDB for backward compatibility
      // Use a local step number for IndexedDB (less reliable but better than nothing)
      const fallbackStepNumber = ++state.currentStepNumber;
      step.step_number = fallbackStepNumber;
      await addStepToIndexedDB(step);
      return fallbackStepNumber;
    }
  } catch (error) {
    console.error("[ContentRecorder] Error adding step to session:", error);
    // Fallback to IndexedDB
    const fallbackStepNumber = ++state.currentStepNumber;
    step.step_number = fallbackStepNumber;
    await addStepToIndexedDB(step);
    return fallbackStepNumber;
  }
}

/**
 * Add screenshot to recording session (via background worker)
 * Screenshots stored as dataUrls for cross-origin support
 */
async function addScreenshot(
  stepNumber: number,
  dataUrl: string,
): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "RECORDING_ADD_SCREENSHOT",
      payload: { stepNumber, dataUrl },
    });

    if (!response?.payload?.success) {
      console.warn("[ContentRecorder] Failed to add screenshot to session");
    }
  } catch (error) {
    console.error(
      "[ContentRecorder] Error adding screenshot to session:",
      error,
    );
  }
}

// ============================================================================
// SESSION INITIALIZATION & RESTORATION (Multi-page recording)
// ============================================================================

/**
 * Initialize recorder on page load
 * Checks for active recording session and restores if present
 */
async function initializeRecorder(): Promise<void> {
  console.log("[ContentRecorder] Checking for active recording session...");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RECORDING_GET_STATE",
      payload: {},
    });

    if (response?.payload?.session && response?.payload?.shouldRestore) {
      const session = response.payload.session as RecordingSessionState;
      console.log(
        "[ContentRecorder] Found active session, restoring:",
        session.sessionId,
      );
      await restoreRecording(session);
    } else {
      console.log("[ContentRecorder] No active session to restore");
    }
  } catch (error) {
    console.log(
      "[ContentRecorder] Session check completed (no active session)",
    );
  }
}

/**
 * Restore recording from session state
 * Called after page navigation to resume recording
 */
async function restoreRecording(session: RecordingSessionState): Promise<void> {
  console.log(
    "[ContentRecorder] Restoring recording from session:",
    session.sessionId,
  );

  // Restore state
  state.isRecording = true;
  state.currentStepNumber = session.currentStepNumber;
  state.startingUrl = session.startingUrl;

  // Re-attach event listeners
  document.addEventListener("focus", handleFocus, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("blur", handleBlur, true);
  document.addEventListener("change", handleChange, true);
  document.addEventListener("submit", handleSubmit, true);
  window.addEventListener("beforeunload", handleNavigation, true);
  // Clipboard events
  document.addEventListener(
    "copy",
    handleClipboard as unknown as EventListener,
    true,
  );
  document.addEventListener(
    "cut",
    handleClipboard as unknown as EventListener,
    true,
  );
  document.addEventListener(
    "paste",
    handleClipboard as unknown as EventListener,
    true,
  );

  // Show recording widget and restore state
  showRecordingWidget();
  updateWidgetStepCount(session.currentStepNumber);

  // Restore widget timer state if available
  if (typeof restoreWidgetState === "function") {
    restoreWidgetState(session.elapsedSeconds, session.isPaused);
  }

  // Wire up widget callbacks
  onWidgetStop(() => {
    console.log("[ContentRecorder] Stop button clicked in widget");
    stopRecording();
  });

  onWidgetPause(() => {
    console.log("[ContentRecorder] Pause button clicked in widget");
    alert("Pause functionality coming soon!");
  });

  // Notify background that restoration is complete
  chrome.runtime
    .sendMessage({
      type: "RECORDING_NAVIGATION_DONE",
      payload: { sessionId: session.sessionId },
    })
    .catch(() => {});

  console.log(
    `[ContentRecorder] ✅ Restored recording! Current step: ${session.currentStepNumber}`,
  );
}

// Initialize on script load (with delay for DOM readiness)
setTimeout(() => {
  initializeRecorder().catch((error) => {
    console.error("[ContentRecorder] Initialization error:", error);
  });
}, 50);

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handles focus events on inputs (to track value changes)
 */
function handleFocus(event: FocusEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    if (element instanceof HTMLInputElement) {
      state.deduplicator.onInputFocus(element);
    }
  } catch (error) {
    console.error("Error handling focus:", error);
  }
}

/**
 * Handles click events
 */
function handleClick(event: MouseEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Filter out clicks on the recording widget itself
    if (element.closest("#workflow-recording-widget")) {
      console.log("[ContentRecorder] Ignoring click on recording widget");
      return;
    }

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log("Recording click on:", element);

    // Add to deduplicator instead of recording immediately
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
  } catch (error) {
    console.error("Error handling click:", error);
  }
}

/**
 * Handles blur events on inputs (captures final values)
 */
function handleBlur(event: FocusEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log("Recording input blur on:", element);

    // Add to deduplicator - it will check if value changed
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
  } catch (error) {
    console.error("Error handling blur:", error);
  }
}

/**
 * Handles keydown events to capture Enter key on inputs before navigation
 * This ensures input values are recorded even when Enter triggers immediate navigation
 * (e.g., Google search, URL bar submissions)
 */
function handleKeydown(event: KeyboardEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Filter out events on the recording widget
    if (element.closest("#workflow-recording-widget")) {
      return;
    }

    // Only handle input/textarea elements
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement)
    ) {
      return;
    }

    if (
      !isEnterCommitKeydown({
        key: event.key,
        shiftKey: event.shiftKey,
        isTextArea: element instanceof HTMLTextAreaElement,
      })
    ) {
      return;
    }

    // Check if value has changed
    if (element instanceof HTMLInputElement) {
      if (!state.deduplicator.hasInputValueChanged(element)) {
        console.log("[ContentRecorder] Skipping Enter key - no value change");
        return;
      }
    }

    console.log(
      "[ContentRecorder] Enter key pressed on input - recording immediately",
    );

    // Record immediately (bypass deduplicator since navigation may happen)
    // Use the keydown event itself - recordInteraction will detect input_commit
    // based on the element type, not the event type
    recordInteraction(event, element);

    // Mark immediate input commit so beforeunload doesn't create a separate NAVIGATE step.
    // (Enter search submits often navigate without any deduplicator-flushed events.)
    state.immediateInputCommitRecordedAtMs = Date.now();

    // IMPORTANT: Mark the input as recorded to prevent blur from re-recording
    // This prevents the duplicate action bug (keydown + blur recording same input)
    if (element instanceof HTMLInputElement) {
      state.deduplicator.markInputRecorded(element);
    }
  } catch (error) {
    console.error("Error handling keydown:", error);
  }
}

/**
 * Handles change events on selects and checkboxes
 */
function handleChange(event: Event): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log("Recording change on:", element);

    // Add to deduplicator
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
  } catch (error) {
    console.error("Error handling change:", error);
  }
}

/**
 * Handles form submit events
 */
function handleSubmit(event: Event): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log("Recording form submit on:", element);

    // Add to deduplicator (high priority - will suppress button clicks)
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
  } catch (error) {
    console.error("Error handling submit:", error);
  }
}

/**
 * Handles navigation events (beforeunload)
 *
 * IMPORTANT: Must await forceFlush to ensure click events are fully recorded
 * before the page unloads. The deduplicator's flush is now async to support this.
 *
 * Only records a NAVIGATE step if no other events were flushed (i.e., address bar
 * navigation). If a click or input triggered the navigation, we don't need a
 * separate NAVIGATE step - the click/input IS the navigation intent.
 */
async function handleNavigation(_event: Event): Promise<void> {
  if (!state.isRecording) return;

  try {
    // Flush any pending events before recording navigation
    // This ensures click events that triggered the navigation are recorded first
    // CRITICAL: Must await this to ensure events are recorded before page unloads
    const eventsFlushed =
      await state.deduplicator.forceFlush(recordInteraction);

    const immediateInputCommitRecorded =
      state.immediateInputCommitRecordedAtMs !== null &&
      Date.now() - state.immediateInputCommitRecordedAtMs < 1000;

    const shouldRecord = shouldRecordNavigateStep({
      eventsFlushed,
      immediateInputCommitRecorded,
    });

    if (shouldRecord) {
      console.log("Recording navigation (no prior events flushed)");
      await recordNavigation();
    } else {
      const reason = immediateInputCommitRecorded
        ? "immediate Enter input_commit recorded"
        : `${eventsFlushed} event(s) already recorded`;
      console.log(`Skipping separate NAVIGATE step - ${reason}`);
    }
  } catch (error) {
    console.error("Error handling navigation:", error);
  } finally {
    // Clear suppression flag after navigation handling
    state.immediateInputCommitRecordedAtMs = null;
  }
}

/**
 * Handles clipboard events (copy, cut, paste)
 *
 * IMPORTANT: Routes through deduplicator to prevent multiple events from
 * being recorded when complex editors (like Google Docs) fire multiple
 * clipboard-related events.
 */
function handleClipboard(event: ClipboardEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Filter out events on the recording widget
    if (element?.closest?.("#workflow-recording-widget")) {
      return;
    }

    const actionType = event.type as "copy" | "cut" | "paste";
    console.log(`Recording clipboard ${actionType} event via deduplicator`);

    // Store clipboard data for later extraction (ClipboardEvent-specific)
    // We need to capture this synchronously before the event data becomes stale
    let clipboardPreview: string | null = null;
    if (event.clipboardData) {
      const text = event.clipboardData.getData("text/plain");
      if (text) {
        clipboardPreview = text.substring(0, 100);
        if (text.length > 100) {
          clipboardPreview += "...";
        }
      }
    }

    // Route through deduplicator with a wrapper callback that includes clipboard data
    state.deduplicator.addEvent(
      event,
      element,
      actionType,
      async (_evt: Event, el: Element) => {
        // Use stored clipboard preview since ClipboardEvent data may be stale
        await recordClipboardActionWithPreview(
          el,
          actionType,
          clipboardPreview,
        );
      },
    );
  } catch (error) {
    console.error("Error handling clipboard event:", error);
  }
}

/**
 * Records a clipboard action with pre-extracted preview
 * Called by deduplicator callback with cached clipboard data
 *
 * IMPORTANT: Step numbers are assigned by the background service.
 */
async function recordClipboardActionWithPreview(
  element: Element,
  actionType: "copy" | "cut" | "paste",
  clipboardPreview: string | null,
): Promise<void> {
  try {
    // Extract selectors if we have a focused element
    const selectors = element ? extractSelectors(element) : {};
    const metadata = element ? extractMetadata(element) : {};

    // Build page context
    const pageContext = buildPageContext();

    // Build step object with placeholder step_number
    const step: StepCreate = {
      step_number: -1, // Placeholder - will be assigned by background
      timestamp: new Date().toISOString(),
      action_type: actionType,
      selectors,
      element_meta: metadata,
      page_context: pageContext,
      action_data: clipboardPreview
        ? { clipboard_preview: clipboardPreview }
        : null,
      dom_context: null,
      screenshot_id: null,
    };

    // Send step to background and get assigned step number
    const assignedStepNumber = await addStep(step);

    if (assignedStepNumber > 0) {
      // Update local state
      state.currentStepNumber = assignedStepNumber;

      // Add highlight BEFORE screenshot so it's visible in the captured image
      let cleanupHighlight: (() => void) | null = null;
      if (element instanceof HTMLElement) {
        cleanupHighlight = addHighlightForScreenshot(element);
        // Wait for render to ensure highlight is visible in screenshot
        await waitForRender();
      }

      // Request screenshot with assigned step number (will include highlight)
      await captureScreenshot(assignedStepNumber);

      // Keep highlight visible for user feedback (~1s total)
      // Delay before cleanup so user sees the green outline
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Remove highlight after delay
      if (cleanupHighlight) {
        cleanupHighlight();
      }

      // Update widget
      updateWidgetStepCount(assignedStepNumber);

      console.log(
        `✅ Clipboard ${actionType} step ${assignedStepNumber} recorded`,
      );
    }
  } catch (error) {
    console.error("Error recording clipboard action:", error);
  }
}

// ============================================================================
// RECORDING LOGIC
// ============================================================================

/**
 * Records a user interaction (called by deduplicator after event grouping)
 *
 * IMPORTANT: Step numbers are assigned by the background service to avoid
 * race conditions during page navigation. Content script no longer assigns
 * step numbers - it sends steps with step_number: -1 as a placeholder.
 */
async function recordInteraction(
  event: Event,
  element: Element,
): Promise<void> {
  try {
    // Extract selectors
    const selectors = extractSelectors(element);

    // Extract metadata
    const metadata = extractMetadata(element);

    // Get action type
    const actionType = getActionType(event, element);

    // Extract action-specific data
    const actionData = extractActionData(element, actionType);

    // Build page context
    const pageContext = buildPageContext();

    // Build step object with placeholder step_number
    // Background will assign the actual step_number
    const step: StepCreate = {
      step_number: -1, // Placeholder - will be assigned by background
      timestamp: new Date().toISOString(),
      action_type: actionType,
      selectors,
      element_meta: metadata,
      page_context: pageContext,
      action_data: Object.keys(actionData).length > 0 ? actionData : null,
      dom_context: null, // Not implemented in MVP
      screenshot_id: null, // Will capture screenshot after we get step number
    };

    // Send step to background and get assigned step number
    const assignedStepNumber = await addStep(step);

    if (assignedStepNumber > 0) {
      // Update local state for widget display and screenshot capture
      state.currentStepNumber = assignedStepNumber;

      // Add highlight BEFORE screenshot so it's visible in the captured image
      let cleanupHighlight: (() => void) | null = null;
      if (element instanceof HTMLElement) {
        cleanupHighlight = addHighlightForScreenshot(element);
        // Wait for render to ensure highlight is visible in screenshot
        await waitForRender();
      }

      // Request screenshot with the assigned step number (will include highlight)
      await captureScreenshot(assignedStepNumber);

      // Keep highlight visible for user feedback (~1s total)
      // Delay before cleanup so user sees the green outline
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Remove highlight after delay
      if (cleanupHighlight) {
        cleanupHighlight();
      }

      // Update widget step counter
      updateWidgetStepCount(assignedStepNumber);

      console.log(`✅ Step ${assignedStepNumber} recorded:`, step);
    } else {
      console.warn(
        "[ContentRecorder] Step was not assigned a number - may have failed",
      );
    }
  } catch (error) {
    console.error("Error recording interaction:", error);
    // Don't throw - continue recording even if one step fails
  }
}

/**
 * Records navigation event
 *
 * IMPORTANT: Step numbers are assigned by the background service.
 *
 * NOTE: Screenshot is NOT captured here for NAVIGATE steps.
 * The background captures the destination screenshot after navigation completes.
 * This ensures the screenshot shows the destination page, not the departing page.
 */
async function recordNavigation(): Promise<void> {
  try {
    // Build page context (this captures the DEPARTING page info)
    const pageContext = buildPageContext();

    // Build step object with placeholder step_number
    const step: StepCreate = {
      step_number: -1, // Placeholder - will be assigned by background
      timestamp: new Date().toISOString(),
      action_type: "navigate",
      selectors: {},
      element_meta: {},
      page_context: pageContext,
      action_data: null,
      dom_context: null,
      screenshot_id: null,
    };

    // Send step to background and get assigned step number
    const assignedStepNumber = await addStep(step);

    if (assignedStepNumber > 0) {
      // Update local state
      state.currentStepNumber = assignedStepNumber;

      // NOTE: We do NOT capture screenshot here for NAVIGATE steps.
      // The background will capture the destination screenshot after
      // webNavigation.onCompleted fires (see handleRecordingNavigationComplete).
      // This ensures we capture the destination page, not the departing page.

      // Update widget step counter
      updateWidgetStepCount(assignedStepNumber);

      console.log(
        `✅ Navigation step ${assignedStepNumber} recorded (destination screenshot pending)`,
      );
    }
  } catch (error) {
    console.error("Error recording navigation:", error);
  }
}

/**
 * Builds page context object
 */
function buildPageContext(): Record<string, any> {
  return {
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scroll: {
      x: window.scrollX,
      y: window.scrollY,
    },
    user_agent: navigator.userAgent,
  };
}

/**
 * Requests screenshot from background worker and stores it in session storage
 * Returns null for screenshot_id (will be assigned after upload)
 */
async function captureScreenshot(stepNumber: number): Promise<number | null> {
  console.log(
    `[ContentRecorder] 📸 Requesting screenshot for step ${stepNumber} from ${window.location.href}`,
  );

  try {
    // Send message to background to capture screenshot
    const response = await chrome.runtime.sendMessage({
      type: "CAPTURE_SCREENSHOT",
    });

    console.log(
      `[ContentRecorder] 📸 Screenshot response for step ${stepNumber}:`,
      response?.type || "NO_RESPONSE",
      response?.payload?.error || "",
    );

    if (
      response &&
      response.type === "SCREENSHOT_CAPTURED" &&
      response.payload
    ) {
      const dataUrl = response.payload.dataUrl;

      console.log(
        `[ContentRecorder] ✅ Screenshot captured, dataUrl length: ${dataUrl.length}, storing for step ${stepNumber}`,
      );

      // Store screenshot via session storage (cross-origin support)
      await addScreenshot(stepNumber, dataUrl);

      console.log(
        `[ContentRecorder] ✅ Screenshot stored for step ${stepNumber}`,
      );
    } else {
      // Log when screenshot capture fails - helps debug cross-origin issues
      console.error(
        `[ContentRecorder] ❌ Screenshot FAILED for step ${stepNumber}:`,
        response?.type || "no response",
        response?.payload?.error || "",
      );
    }

    // Return null for screenshot_id (will be filled after upload to server)
    return null;
  } catch (error) {
    console.error(
      `[ContentRecorder] ❌ Exception capturing screenshot for step ${stepNumber}:`,
      error,
    );
    return null;
  }
}

/**
 * Convert Blob to data URL
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// RECORDER CONTROL
// ============================================================================

/**
 * Starts recording workflow
 */
async function startRecording(): Promise<void> {
  try {
    console.log("[ContentRecorder] startRecording called");

    if (state.isRecording) {
      console.warn("[ContentRecorder] Already recording");
      return;
    }

    console.log("[ContentRecorder] 🎬 Starting workflow recording");

    // Clear any existing steps and screenshots
    console.log("[ContentRecorder] Clearing existing steps and screenshots");
    await clearSteps();
    await clearScreenshots();

    // Initialize state
    state.isRecording = true;
    state.currentStepNumber = 0;
    state.startingUrl = window.location.href;
    console.log("[ContentRecorder] State initialized:", {
      startingUrl: state.startingUrl,
    });

    // Add event listeners in capture phase (to catch events before page handlers)
    console.log("[ContentRecorder] Adding event listeners");
    document.addEventListener("focus", handleFocus, true); // Track input focus for value changes
    document.addEventListener("click", handleClick, true);
    document.addEventListener("blur", handleBlur, true);
    document.addEventListener("keydown", handleKeydown, true); // Capture Enter key before navigation
    document.addEventListener("change", handleChange, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("beforeunload", handleNavigation, true);
    // Clipboard events
    document.addEventListener(
      "copy",
      handleClipboard as unknown as EventListener,
      true,
    );
    document.addEventListener(
      "cut",
      handleClipboard as unknown as EventListener,
      true,
    );
    document.addEventListener(
      "paste",
      handleClipboard as unknown as EventListener,
      true,
    );

    // Show recording widget
    console.log("[ContentRecorder] Showing recording widget");
    showRecordingWidget();
    updateWidgetStepCount(0);
    console.log("[ContentRecorder] Widget should now be visible");

    // Wire up widget callbacks
    onWidgetStop(() => {
      console.log("[ContentRecorder] Stop button clicked in widget");
      stopRecording();
    });

    onWidgetPause(() => {
      console.log("[ContentRecorder] Pause button clicked in widget");
      // TODO: Implement pause functionality in future sprint
      alert("Pause functionality coming soon!");
    });

    console.log(
      "[ContentRecorder] ✅ Recording started successfully on:",
      state.startingUrl,
    );
  } catch (error) {
    console.error("[ContentRecorder] Error starting recording:", error);
    state.isRecording = false;
  }
}

/**
 * Stops recording and uploads workflow
 */
async function stopRecording(): Promise<void> {
  try {
    if (!state.isRecording) {
      console.warn("[ContentRecorder] Not currently recording");
      return;
    }

    console.log("[ContentRecorder] ⏹️ Stopping workflow recording");

    // IMPORTANT: Remove event listeners FIRST to prevent recording the stop button click
    document.removeEventListener("focus", handleFocus, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("blur", handleBlur, true);
    document.removeEventListener("keydown", handleKeydown, true);
    document.removeEventListener("change", handleChange, true);
    document.removeEventListener("submit", handleSubmit, true);
    window.removeEventListener("beforeunload", handleNavigation, true);
    // Remove clipboard listeners
    document.removeEventListener(
      "copy",
      handleClipboard as unknown as EventListener,
      true,
    );
    document.removeEventListener(
      "cut",
      handleClipboard as unknown as EventListener,
      true,
    );
    document.removeEventListener(
      "paste",
      handleClipboard as unknown as EventListener,
      true,
    );

    // Force flush any pending events before stopping
    // CRITICAL: Await to ensure all pending events are recorded
    await state.deduplicator.forceFlush(recordInteraction);

    // Stop recording state
    state.isRecording = false;

    // Hide recording widget
    hideRecordingWidget();

    // Clear debouncer and deduplicator
    state.debouncer.clear();
    state.deduplicator.clear();

    // Get all steps and screenshots from IndexedDB
    const steps = await getSteps();
    const screenshots = await getScreenshots();
    const stepCount = await getStepCount();

    console.log(
      `📤 Uploading ${stepCount} steps and ${screenshots.length} screenshots to background worker`,
    );

    // Convert screenshot blobs to dataUrls for message passing
    const screenshotsWithDataUrls = await Promise.all(
      screenshots.map(async (screenshot) => ({
        step_number: screenshot.step_number,
        dataUrl: await blobToDataUrl(screenshot.blob),
        timestamp: screenshot.timestamp,
      })),
    );

    // Send steps and screenshots to background for upload
    console.log("[ContentRecorder] Sending message to background:", {
      stepCount: steps.length,
      screenshotCount: screenshotsWithDataUrls.length,
    });

    const response = await chrome.runtime.sendMessage({
      type: "STOP_RECORDING",
      payload: {
        startingUrl: state.startingUrl,
        steps,
        screenshots: screenshotsWithDataUrls,
      },
    });

    console.log("[ContentRecorder] Response from background:", response);

    // Check response correctly - background returns {type: 'STOP_RECORDING', payload: {success: true, ...}}
    if (response?.payload?.success) {
      console.log(
        "[ContentRecorder] ✅ Workflow uploaded successfully. ID:",
        response.payload.workflowId,
      );

      // Clear IndexedDB after successful upload
      await clearSteps();
      await clearScreenshots();
      console.log("[ContentRecorder] 🗑️ Local steps and screenshots cleared");
    } else {
      const errorMsg = response?.payload?.error || "Unknown error";
      console.error(
        "[ContentRecorder] ❌ Failed to upload workflow:",
        errorMsg,
      );
      // Keep steps in IndexedDB for retry
      alert(
        `Failed to save workflow: ${errorMsg}\n\nYour recording has been saved locally. Please try again.`,
      );
    }

    // Reset state
    state.currentStepNumber = 0;
    state.startingUrl = null;
  } catch (error) {
    console.error("Error stopping recording:", error);
  }
}

// ============================================================================
// MESSAGE LISTENERS
// ============================================================================

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    console.log("[ContentRecorder] Received message:", message.type);
    console.log("[ContentRecorder] Full message:", message);

    if (message.type === "START_RECORDING") {
      console.log("[ContentRecorder] Processing START_RECORDING message");
      // Respond immediately to avoid message port timeouts; start async work after
      try {
        sendResponse({ success: true, ack: true });
      } catch (_e) {
        // ignore sendResponse errors
      }
      setTimeout(() => {
        startRecording().catch((error) => {
          console.error(
            "[ContentRecorder] Error in START_RECORDING async:",
            error,
          );
        });
      }, 0);
      return false;
    }

    if (message.type === "STOP_RECORDING") {
      console.log("[ContentRecorder] Processing STOP_RECORDING message");
      // Respond immediately to avoid message port timeouts; stop async after
      try {
        sendResponse({ success: true, ack: true });
      } catch (_e) {}
      setTimeout(() => {
        stopRecording()
          .then(() => {
            console.log(
              "[ContentRecorder] STOP_RECORDING completed successfully",
            );
          })
          .catch((error) => {
            console.error(
              "[ContentRecorder] Error in STOP_RECORDING async:",
              error,
            );
          });
      }, 0);
      return false;
    }

    console.log("[ContentRecorder] Unknown message type:", message.type);
    return true;
  },
);

// Expose direct start/stop hooks for background to call without messaging
declare global {
  interface Window {
    __overlayRecorderStart?: () => void;
    __overlayRecorderStop?: () => void;
  }
}

window.__overlayRecorderStart = () => {
  console.log("[ContentRecorder] __overlayRecorderStart invoked");
  startRecording().catch((e) =>
    console.error("[ContentRecorder] Auto-start error:", e),
  );
};

window.__overlayRecorderStop = () => {
  console.log("[ContentRecorder] __overlayRecorderStop invoked");
  stopRecording().catch((e) =>
    console.error("[ContentRecorder] Auto-stop error:", e),
  );
};
