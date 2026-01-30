/**
 * Walkthrough Session Manager
 *
 * GAP-001: Multi-page workflow support
 * GAP-002: Multi-tab workflow support
 *
 * Manages walkthrough state persistence across page navigations and browser tabs
 * using chrome.storage.session (survives page loads, cleared on browser close)
 */

import type {
  WalkthroughSessionState,
  WorkflowResponse,
} from "../shared/types";
import {
  WALKTHROUGH_SESSION_STORAGE_KEY,
  WALKTHROUGH_SESSION_TIMEOUT_MS,
} from "../shared/types";

/**
 * In-memory cache for session state
 * Avoids repeated storage reads, updated in sync with storage
 */
let cachedSession: WalkthroughSessionState | null = null;

/**
 * Generate a UUID for session identification
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Check if session has expired
 */
function isSessionExpired(session: WalkthroughSessionState): boolean {
  return Date.now() > session.expiresAt;
}

/**
 * Load session state from storage into cache
 */
async function loadFromStorage(): Promise<WalkthroughSessionState | null> {
  try {
    const result = await chrome.storage.session.get(
      WALKTHROUGH_SESSION_STORAGE_KEY,
    );
    const session = result[WALKTHROUGH_SESSION_STORAGE_KEY] as
      | WalkthroughSessionState
      | undefined;

    if (session) {
      // Check expiration
      if (isSessionExpired(session)) {
        console.log("[WalkthroughSession] Session expired, clearing");
        await clearStorage();
        return null;
      }
      cachedSession = session;
    }
    return session || null;
  } catch (error) {
    console.error("[WalkthroughSession] Failed to load from storage:", error);
    return null;
  }
}

/**
 * Save session state to storage
 */
async function saveToStorage(
  session: WalkthroughSessionState,
): Promise<boolean> {
  try {
    await chrome.storage.session.set({
      [WALKTHROUGH_SESSION_STORAGE_KEY]: session,
    });
    cachedSession = session;
    return true;
  } catch (error) {
    console.error("[WalkthroughSession] Failed to save to storage:", error);
    return false;
  }
}

/**
 * Clear session from storage
 */
async function clearStorage(): Promise<void> {
  try {
    await chrome.storage.session.remove(WALKTHROUGH_SESSION_STORAGE_KEY);
    cachedSession = null;
  } catch (error) {
    console.error("[WalkthroughSession] Failed to clear storage:", error);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Start a new walkthrough session
 */
export async function startSession(
  workflow: WorkflowResponse,
  tabId: number,
): Promise<WalkthroughSessionState> {
  // End any existing session first
  const { session: existingSession } = await getSession();
  if (existingSession) {
    console.log(
      "[WalkthroughSession] Ending existing session before starting new one",
    );
    await endSession("user_exit");
  }

  const now = Date.now();
  const session: WalkthroughSessionState = {
    sessionId: generateSessionId(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    startingUrl: workflow.starting_url,
    steps: workflow.steps,
    totalSteps: workflow.steps.length,
    currentStepIndex: 0,
    status: "active",
    error: null,
    primaryTabId: tabId,
    tabIds: [tabId],
    startedAt: now,
    lastUpdatedAt: now,
    expiresAt: now + WALKTHROUGH_SESSION_TIMEOUT_MS,
    expectedUrl: null,
    navigationInProgress: false,
    retryAttempts: {},
  };

  await saveToStorage(session);
  console.log(
    "[WalkthroughSession] Started session:",
    session.sessionId,
    "for workflow:",
    workflow.id,
  );

  return session;
}

/**
 * Get current session state
 * @param tabId - Optional tab ID to check if it's part of the session
 */
export async function getSession(tabId?: number): Promise<{
  session: WalkthroughSessionState | null;
  isPartOfSession: boolean;
}> {
  // Use cache if available, otherwise load from storage
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    return { session: null, isPartOfSession: false };
  }

  // Check expiration
  if (isSessionExpired(session)) {
    console.log("[WalkthroughSession] Session expired");
    await clearStorage();
    return { session: null, isPartOfSession: false };
  }

  const isPartOfSession = tabId ? session.tabIds.includes(tabId) : false;

  return { session, isPartOfSession };
}

/**
 * Update session state
 * Only updates specified fields, preserves others
 */
export async function updateSession(
  update: Partial<
    Pick<
      WalkthroughSessionState,
      | "currentStepIndex"
      | "status"
      | "error"
      | "expectedUrl"
      | "navigationInProgress"
      | "retryAttempts"
    >
  >,
): Promise<boolean> {
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    console.warn("[WalkthroughSession] Cannot update - no active session");
    return false;
  }

  // Apply updates
  const updatedSession: WalkthroughSessionState = {
    ...session,
    ...update,
    lastUpdatedAt: Date.now(),
    // Extend expiration on activity
    expiresAt: Date.now() + WALKTHROUGH_SESSION_TIMEOUT_MS,
  };

  const saved = await saveToStorage(updatedSession);
  if (saved) {
    console.log("[WalkthroughSession] Updated session:", {
      ...update,
      sessionId: session.sessionId,
    });
  }

  return saved;
}

/**
 * Add a tab to the session (GAP-002: multi-tab support)
 */
export async function addTabToSession(tabId: number): Promise<boolean> {
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    console.warn("[WalkthroughSession] Cannot add tab - no active session");
    return false;
  }

  if (session.tabIds.includes(tabId)) {
    console.log("[WalkthroughSession] Tab already in session:", tabId);
    return true;
  }

  const updatedSession: WalkthroughSessionState = {
    ...session,
    tabIds: [...session.tabIds, tabId],
    lastUpdatedAt: Date.now(),
  };

  const saved = await saveToStorage(updatedSession);
  if (saved) {
    console.log("[WalkthroughSession] Added tab to session:", tabId);
  }

  return saved;
}

/**
 * Remove a tab from the session
 * If primary tab is removed, promotes another tab or ends session
 */
export async function removeTabFromSession(tabId: number): Promise<boolean> {
  let session = cachedSession;
  if (!session) {
    session = await loadFromStorage();
  }

  if (!session) {
    return false;
  }

  // Remove tab from list
  const newTabIds = session.tabIds.filter((id) => id !== tabId);

  // If no tabs left, end session
  if (newTabIds.length === 0) {
    console.log("[WalkthroughSession] All tabs closed, ending session");
    await endSession("user_exit");
    return true;
  }

  // If primary tab was closed, promote first remaining tab
  let newPrimaryTabId = session.primaryTabId;
  if (tabId === session.primaryTabId) {
    // Safe: we already checked newTabIds.length > 0 above
    newPrimaryTabId = newTabIds[0]!;
    console.log(
      "[WalkthroughSession] Primary tab closed, promoting tab:",
      newPrimaryTabId,
    );
  }

  const updatedSession: WalkthroughSessionState = {
    ...session,
    tabIds: newTabIds,
    primaryTabId: newPrimaryTabId,
    lastUpdatedAt: Date.now(),
  };

  return saveToStorage(updatedSession);
}

/**
 * Handle navigation start
 * Called when a session tab begins navigating
 */
export async function handleNavigationStart(
  tabId: number,
  url: string,
): Promise<void> {
  const { session, isPartOfSession } = await getSession(tabId);

  if (!session || !isPartOfSession || session.status !== "active") {
    return;
  }

  await updateSession({
    navigationInProgress: true,
    expectedUrl: url,
  });

  console.log("[WalkthroughSession] Navigation started:", url);
}

/**
 * Handle navigation complete
 * Called when a session tab finishes loading
 *
 * Note: We always clear navigationInProgress if a session exists,
 * even if the tab isn't recognized as part of the session. This prevents
 * the flag from getting stuck due to timing issues between navigation
 * events and content script initialization.
 */
export async function handleNavigationComplete(tabId: number): Promise<void> {
  const { session } = await getSession(tabId);

  if (!session) {
    return;
  }

  // Always clear navigation flag to prevent it from getting stuck
  // The content script will call WALKTHROUGH_GET_STATE after this
  if (session.navigationInProgress) {
    await updateSession({
      navigationInProgress: false,
    });
    console.log("[WalkthroughSession] Navigation completed for tab:", tabId);
  }
}

/**
 * End the walkthrough session
 */
export async function endSession(
  reason: "completed" | "user_exit" | "error" | "timeout",
): Promise<void> {
  const session = cachedSession || (await loadFromStorage());

  if (!session) {
    return;
  }

  console.log(
    "[WalkthroughSession] Ending session:",
    session.sessionId,
    "reason:",
    reason,
  );

  // Notify all tabs that session is ending
  for (const tabId of session.tabIds) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "WALKTHROUGH_SESSION_END",
        payload: {
          sessionId: session.sessionId,
          reason,
        },
      });
    } catch {
      // Tab may be closed or content script not loaded
    }
  }

  await clearStorage();
}

/**
 * Check if there's an active session
 */
export async function hasActiveSession(): Promise<boolean> {
  const { session } = await getSession();
  return session !== null && session.status === "active";
}

/**
 * Force clear the navigation flag
 * Used by content script after successful restoration to ensure flag is cleared
 */
export async function forceNavigationComplete(): Promise<boolean> {
  const session = cachedSession || (await loadFromStorage());
  if (!session) return false;

  if (session.navigationInProgress) {
    console.log(
      "[WalkthroughSession] Force clearing navigationInProgress flag",
    );
    return updateSession({ navigationInProgress: false });
  }
  return true;
}

/**
 * Get session for content script restoration
 * Returns full session data if tab is part of session
 */
export async function getSessionForTab(tabId: number): Promise<{
  session: WalkthroughSessionState | null;
  shouldRestore: boolean;
}> {
  const { session, isPartOfSession } = await getSession(tabId);

  if (!session || !isPartOfSession) {
    return { session: null, shouldRestore: false };
  }

  // Only restore if session is active and not in navigation
  const shouldRestore =
    session.status === "active" && !session.navigationInProgress;

  return { session, shouldRestore };
}
