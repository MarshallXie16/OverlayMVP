/**
 * Recording Session Manager
 *
 * Manages recording state persistence across page navigations
 * using chrome.storage.session (survives page loads, cleared on browser close)
 *
 * Key features:
 * - Cross-origin recording support (IndexedDB is origin-scoped, storage.session is not)
 * - Single-tab recording (unlike walkthrough's multi-tab support)
 * - Auto-save on tab close
 * - 30-minute session timeout
 */

import type { RecordingSessionState, StepCreate } from "../shared/types";
import {
  RECORDING_SESSION_STORAGE_KEY,
  RECORDING_SESSION_TIMEOUT_MS,
} from "../shared/types";
import { captureScreenshot } from "./screenshot";
import { storeScreenshot } from "./screenshotStore";

/**
 * In-memory cache for session state
 * Avoids repeated storage reads, updated in sync with storage
 */
let cachedSession: RecordingSessionState | null = null;

/**
 * Generate a UUID for session identification
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Check if session has expired
 */
function isSessionExpired(session: RecordingSessionState): boolean {
  return Date.now() > session.expiresAt;
}

/**
 * Load session state from storage into cache
 */
async function loadFromStorage(): Promise<RecordingSessionState | null> {
  try {
    const result = await chrome.storage.session.get(
      RECORDING_SESSION_STORAGE_KEY,
    );
    const session = result[RECORDING_SESSION_STORAGE_KEY] as
      | RecordingSessionState
      | undefined;

    if (session) {
      // Check expiration
      if (isSessionExpired(session)) {
        console.log("[RecordingSession] Session expired, clearing");
        await clearStorage();
        return null;
      }
      cachedSession = session;
    }
    return session || null;
  } catch (error) {
    console.error("[RecordingSession] Failed to load from storage:", error);
    return null;
  }
}

/**
 * Save session state to storage
 */
async function saveToStorage(session: RecordingSessionState): Promise<boolean> {
  try {
    await chrome.storage.session.set({
      [RECORDING_SESSION_STORAGE_KEY]: session,
    });
    cachedSession = session;
    return true;
  } catch (error) {
    console.error("[RecordingSession] Failed to save to storage:", error);
    return false;
  }
}

/**
 * Clear session from storage
 */
async function clearStorage(): Promise<void> {
  try {
    await chrome.storage.session.remove(RECORDING_SESSION_STORAGE_KEY);
    cachedSession = null;
  } catch (error) {
    console.error("[RecordingSession] Failed to clear storage:", error);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start a new recording session
 */
export async function startRecordingSession(
  workflowName: string,
  startingUrl: string,
  tabId: number,
): Promise<RecordingSessionState> {
  // End any existing session first
  const { session: existingSession } = await getRecordingSession();
  if (existingSession) {
    console.log(
      "[RecordingSession] Ending existing session before starting new one",
    );
    await endRecordingSession("user_stop");
  }

  const now = Date.now();
  const session: RecordingSessionState = {
    sessionId: generateSessionId(),
    workflowName,
    startingUrl,
    primaryTabId: tabId,
    currentStepNumber: 0,
    status: "active",
    steps: [],
    // Note: Screenshots stored in IndexedDB (screenshotStore.ts) to avoid 1MB limit
    startedAt: now,
    lastActivityAt: now,
    expiresAt: now + RECORDING_SESSION_TIMEOUT_MS,
    elapsedSeconds: 0,
    isPaused: false,
    navigationInProgress: false,
    pendingNavigateScreenshotStepNumber: null,
  };

  await saveToStorage(session);
  console.log(
    "[RecordingSession] Started session:",
    session.sessionId,
    "on tab:",
    tabId,
  );

  return session;
}

/**
 * Get current recording session state
 * @param tabId - Optional tab ID to check if it's the recording tab
 */
export async function getRecordingSession(tabId?: number): Promise<{
  session: RecordingSessionState | null;
  isRecordingTab: boolean;
}> {
  // Use cache if available, otherwise load from storage
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    return { session: null, isRecordingTab: false };
  }

  // Check expiration
  if (isSessionExpired(session)) {
    console.log("[RecordingSession] Session expired");
    await clearStorage();
    return { session: null, isRecordingTab: false };
  }

  const isRecordingTab = tabId ? session.primaryTabId === tabId : false;

  return { session, isRecordingTab };
}

/**
 * Add a step to the recording session
 * IMPORTANT: This function assigns the step_number to avoid race conditions.
 * The content script should NOT assign step_number - it will be overwritten.
 *
 * @returns Object with success flag and assigned stepNumber, or null on failure
 */
export async function addStepToSession(
  step: StepCreate,
): Promise<{ success: boolean; stepNumber: number } | null> {
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    console.warn("[RecordingSession] Cannot add step - no active session");
    return null;
  }

  if (session.status !== "active") {
    console.warn("[RecordingSession] Cannot add step - session not active");
    return null;
  }

  // CRITICAL: Assign step number here in the background to avoid race conditions
  // Content script step_number is ignored - we use sequential assignment
  const assignedStepNumber = session.currentStepNumber + 1;

  // Create step with background-assigned step number
  const stepWithNumber: StepCreate = {
    ...step,
    step_number: assignedStepNumber,
  };

  const now = Date.now();

  // For NAVIGATE steps, mark for destination screenshot capture
  // The screenshot will be captured after navigation completes on the new page
  const isNavigateStep = step.action_type === "navigate";

  const updatedSession: RecordingSessionState = {
    ...session,
    steps: [...session.steps, stepWithNumber],
    currentStepNumber: assignedStepNumber,
    lastActivityAt: now,
    // Extend expiration on activity
    expiresAt: now + RECORDING_SESSION_TIMEOUT_MS,
    // Track NAVIGATE steps that need destination screenshots
    pendingNavigateScreenshotStepNumber: isNavigateStep
      ? assignedStepNumber
      : session.pendingNavigateScreenshotStepNumber,
  };

  const saved = await saveToStorage(updatedSession);
  if (saved) {
    console.log(
      "[RecordingSession] Added step:",
      assignedStepNumber,
      "type:",
      step.action_type,
      isNavigateStep ? "(pending destination screenshot)" : "",
    );
  }

  return saved ? { success: true, stepNumber: assignedStepNumber } : null;
}

// Note: addScreenshotToSession was removed - screenshots now stored in IndexedDB
// See screenshotStore.ts for screenshot storage (avoids chrome.storage.session 1MB limit)

/**
 * Update session timer state (synced from widget)
 */
export async function updateSessionTimer(
  elapsedSeconds: number,
): Promise<boolean> {
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    return false;
  }

  const updatedSession: RecordingSessionState = {
    ...session,
    elapsedSeconds,
    lastActivityAt: Date.now(),
  };

  return saveToStorage(updatedSession);
}

/**
 * Update session pause state
 */
export async function updateSessionPauseState(
  isPaused: boolean,
): Promise<boolean> {
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    return false;
  }

  const updatedSession: RecordingSessionState = {
    ...session,
    isPaused,
    status: isPaused ? "paused" : "active",
    lastActivityAt: Date.now(),
  };

  return saveToStorage(updatedSession);
}

/**
 * Handle navigation start
 * Called when the recording tab begins navigating
 */
export async function handleRecordingNavigationStart(
  tabId: number,
  _url: string,
): Promise<void> {
  const { session, isRecordingTab } = await getRecordingSession(tabId);

  if (!session || !isRecordingTab) {
    return;
  }

  const updatedSession: RecordingSessionState = {
    ...session,
    navigationInProgress: true,
    lastActivityAt: Date.now(),
  };

  await saveToStorage(updatedSession);
  console.log("[RecordingSession] Navigation started");
}

/**
 * Handle navigation complete
 * Called when the recording tab finishes loading
 *
 * IMPORTANT: Invalidates cachedSession to ensure fresh reads after navigation.
 * This fixes screenshot storage failures where stale cache caused session lookup
 * to fail during cross-origin navigation transitions.
 *
 * Also captures destination screenshots for NAVIGATE steps.
 * When a NAVIGATE step is recorded (address bar navigation), the screenshot
 * is captured here on the destination page rather than the departing page.
 */
export async function handleRecordingNavigationComplete(
  tabId: number,
): Promise<void> {
  // CRITICAL: Invalidate cache FIRST to ensure fresh session read
  // This prevents stale session data from causing screenshot storage failures
  cachedSession = null;

  const { session, isRecordingTab } = await getRecordingSession(tabId);

  if (!session || !isRecordingTab) {
    return;
  }

  // Check if there's a pending NAVIGATE screenshot to capture
  const pendingStepNumber = session.pendingNavigateScreenshotStepNumber;

  const updatedSession: RecordingSessionState = {
    ...session,
    navigationInProgress: false,
    lastActivityAt: Date.now(),
    // Clear the pending screenshot flag
    pendingNavigateScreenshotStepNumber: null,
  };

  await saveToStorage(updatedSession);
  console.log("[RecordingSession] Navigation completed, cache refreshed");

  // Capture destination screenshot for NAVIGATE step
  if (pendingStepNumber !== null) {
    console.log(
      `[RecordingSession] Capturing destination screenshot for NAVIGATE step ${pendingStepNumber}`,
    );

    // Small delay to ensure page is fully rendered
    await new Promise((resolve) => setTimeout(resolve, 200));

    try {
      const screenshotResult = await captureScreenshot(tabId);

      if ("dataUrl" in screenshotResult && screenshotResult.dataUrl) {
        // Store the screenshot
        await storeScreenshot(
          session.sessionId,
          pendingStepNumber,
          screenshotResult.dataUrl,
        );
        console.log(
          `[RecordingSession] ✅ Destination screenshot stored for step ${pendingStepNumber}`,
        );
      } else {
        console.warn(
          `[RecordingSession] ⚠️ Failed to capture destination screenshot:`,
          "error" in screenshotResult
            ? screenshotResult.error
            : "Unknown error",
        );
      }
    } catch (error) {
      console.error(
        `[RecordingSession] ❌ Error capturing destination screenshot:`,
        error,
      );
    }
  }
}

/**
 * End the recording session
 * Returns the final session data for upload
 */
export async function endRecordingSession(
  reason: "completed" | "user_stop" | "tab_closed" | "timeout",
): Promise<RecordingSessionState | null> {
  const session = cachedSession || (await loadFromStorage());

  if (!session) {
    return null;
  }

  console.log(
    "[RecordingSession] Ending session:",
    session.sessionId,
    "reason:",
    reason,
    "steps:",
    session.steps.length,
  );

  // Return session data before clearing (for upload)
  const finalSession = { ...session };

  await clearStorage();

  return finalSession;
}

/**
 * Get session for content script restoration
 * Returns full session data if tab matches recording tab
 */
export async function getSessionForTab(tabId: number): Promise<{
  session: RecordingSessionState | null;
  shouldRestore: boolean;
}> {
  const { session, isRecordingTab } = await getRecordingSession(tabId);

  if (!session || !isRecordingTab) {
    return { session: null, shouldRestore: false };
  }

  // Only restore if session is active and not in navigation
  const shouldRestore =
    (session.status === "active" || session.status === "paused") &&
    !session.navigationInProgress;

  return { session, shouldRestore };
}

/**
 * Check if there's an active recording session
 */
export async function hasActiveRecordingSession(): Promise<boolean> {
  const { session } = await getRecordingSession();
  return session !== null && session.status === "active";
}

/**
 * Check if session has expired (for timeout monitoring)
 */
export async function checkSessionTimeout(): Promise<RecordingSessionState | null> {
  const session = cachedSession || (await loadFromStorage());

  if (session && isSessionExpired(session)) {
    console.log("[RecordingSession] Session timed out");
    return endRecordingSession("timeout");
  }

  return null;
}

/**
 * Export isSessionExpired for external use
 */
export { isSessionExpired };
