/**
 * Message Routing Module
 *
 * Routes messages between popup, content scripts, and background service worker.
 * Handles recording lifecycle, screenshot capture, and state queries.
 *
 * FE-003: Background Service Worker
 */

import type { ExtensionMessage } from "@/shared/types";
import { apiClient } from "@/shared/api";
import { captureScreenshot } from "./screenshot";
import {
  startRecording,
  stopRecording,
  getCurrentRecordingState,
  cleanupRecordingState,
} from "./state";
// GAP-001: Multi-page walkthrough session management
import {
  startSession,
  endSession,
  getSessionForTab,
  updateSession,
  handleNavigationComplete,
  forceNavigationComplete,
} from "./walkthroughSession";

// Sprint 6: Feature flag for new walkthrough system
import { useNewWalkthroughSystem } from "../shared/featureFlags";

// Sprint 6: New walkthrough session manager
import { sessionManager } from "./walkthrough/SessionManager";

// Multi-page recording session management
import {
  startRecordingSession,
  addStepToSession,
  updateSessionTimer,
  endRecordingSession,
  getSessionForTab as getRecordingSessionForTab,
  getRecordingSession,
  handleRecordingNavigationComplete,
} from "./recordingSession";

// IndexedDB screenshot storage (replaces chrome.storage.session for screenshots)
import {
  storeScreenshot,
  getScreenshotsForSession,
  clearScreenshotsForSession,
} from "./screenshotStore";

// Sprint 4: New walkthrough message handlers
import { handleWalkthroughMessage } from "./walkthrough/messageHandlers";

// Dynamic workflow message handlers
import { handleDynamicMessage } from "./dynamicWorkflow/DynamicMessageHandlers";

// ============================================================================
// FAILED UPLOAD STORAGE (FEAT-012)
// ============================================================================

interface FailedUpload {
  localId: string;
  name: string;
  stepCount: number;
  failedAt: string;
  errorMessage: string;
  data: {
    workflowName: string;
    startingUrl: string;
    steps: any[];
    screenshots: any[];
  };
}

/**
 * Store failed upload data for retry
 */
async function storeFailedUpload(
  workflowName: string,
  startingUrl: string,
  steps: any[],
  screenshots: any[],
  errorMessage: string,
): Promise<string> {
  const localId = `failed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const failedUpload: FailedUpload = {
    localId,
    name: workflowName,
    stepCount: steps.length,
    failedAt: new Date().toISOString(),
    errorMessage,
    data: {
      workflowName,
      startingUrl,
      steps,
      screenshots,
    },
  };

  // Get existing failed uploads
  const result = await chrome.storage.local.get("failedWorkflows");
  const failedWorkflows: FailedUpload[] = result.failedWorkflows || [];

  // Add new failure
  failedWorkflows.push(failedUpload);

  // Store back (keep max 10 failed uploads)
  await chrome.storage.local.set({
    failedWorkflows: failedWorkflows.slice(-10),
  });

  console.log(`[Background] Stored failed upload: ${localId}`);

  return localId;
}

/**
 * Remove failed upload from storage
 */
async function removeFailedUpload(localId: string): Promise<void> {
  const result = await chrome.storage.local.get("failedWorkflows");
  const failedWorkflows: FailedUpload[] = result.failedWorkflows || [];

  await chrome.storage.local.set({
    failedWorkflows: failedWorkflows.filter((f) => f.localId !== localId),
  });

  console.log(`[Background] Removed failed upload: ${localId}`);
}

/**
 * Get failed upload by ID
 */
async function getFailedUpload(localId: string): Promise<FailedUpload | null> {
  const result = await chrome.storage.local.get("failedWorkflows");
  const failedWorkflows: FailedUpload[] = result.failedWorkflows || [];
  return failedWorkflows.find((f) => f.localId === localId) || null;
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

/**
 * Main message handler for Chrome extension communication
 * Routes messages to appropriate handlers based on message type
 *
 * @param message - Extension message with type and payload
 * @param sender - Message sender information
 * @param sendResponse - Callback to send response
 * @returns true to indicate async response
 */
export function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): boolean {
  console.log(
    "Message received:",
    message.type,
    "from",
    sender.tab ? `tab ${sender.tab.id}` : "extension",
  );

  // Sprint 4: Check if this is a walkthrough message (new protocol)
  // This handles WALKTHROUGH_COMMAND, WALKTHROUGH_TAB_READY, WALKTHROUGH_ELEMENT_STATUS,
  // GET_TAB_ID, SPA_NAVIGATION, etc.
  const walkthroughMessageTypes = [
    "WALKTHROUGH_COMMAND",
    "WALKTHROUGH_TAB_READY",
    "WALKTHROUGH_ELEMENT_STATUS",
    "WALKTHROUGH_HEALING_RESULT",
    "GET_TAB_ID",
    "SPA_NAVIGATION",
  ];
  if (walkthroughMessageTypes.includes(message.type)) {
    handleWalkthroughMessage(message, sender, sendResponse).catch((error) => {
      console.error("[Messaging] Walkthrough handler error:", error);
      sendResponse({ success: false, error: String(error) });
    });
    return true; // Async response
  }

  // Dynamic workflow messages
  const dynamicMessageTypes = [
    "DYNAMIC_COMMAND",
    "DYNAMIC_TAB_READY",
    "DYNAMIC_REPORT_CONTEXT",
  ];
  if (dynamicMessageTypes.includes(message.type)) {
    handleDynamicMessage(message, sender, sendResponse).catch((error) => {
      console.error("[Messaging] Dynamic workflow handler error:", error);
      sendResponse({ success: false, error: String(error) });
    });
    return true; // Async response
  }

  // Route to appropriate handler
  switch (message.type) {
    case "PING":
      handlePing(message, sendResponse);
      break;

    case "START_RECORDING":
      handleStartRecording(message, sendResponse);
      break;

    case "STOP_RECORDING":
      handleStopRecording(message, sendResponse);
      break;

    case "START_WALKTHROUGH":
      handleStartWalkthrough(message, sender, sendResponse);
      break;

    case "CAPTURE_SCREENSHOT":
      handleCaptureScreenshot(message, sender, sendResponse);
      break;

    case "GET_RECORDING_STATE":
      handleGetRecordingState(message, sendResponse);
      break;

    case "LOG_EXECUTION":
      handleLogExecution(message, sendResponse);
      break;

    case "VALIDATE_HEALING":
      handleValidateHealing(message, sendResponse);
      break;

    case "LOG_HEALING_ATTEMPT":
      handleLogHealingAttempt(message, sendResponse);
      break;

    case "GET_FAILED_UPLOADS":
      handleGetFailedUploads(message, sendResponse);
      break;

    case "RETRY_UPLOAD":
      handleRetryUpload(message, sendResponse);
      break;

    case "DISCARD_UPLOAD":
      handleDiscardUpload(message, sendResponse);
      break;

    // GAP-001: Multi-page walkthrough session handlers
    case "WALKTHROUGH_GET_STATE":
      handleGetWalkthroughState(sender, sendResponse);
      break;

    case "WALKTHROUGH_STATE_UPDATE":
      handleWalkthroughStateUpdate(message, sendResponse);
      break;

    case "WALKTHROUGH_NAVIGATION_DONE":
      handleWalkthroughNavigationDone(sender, sendResponse);
      break;

    // Multi-page recording session handlers
    case "RECORDING_GET_STATE":
      handleGetRecordingSessionState(sender, sendResponse);
      break;

    case "RECORDING_START_SESSION":
      handleStartRecordingSession(message, sender, sendResponse);
      break;

    case "RECORDING_ADD_STEP":
      handleRecordingAddStep(message, sendResponse);
      break;

    case "RECORDING_ADD_SCREENSHOT":
      handleRecordingAddScreenshot(message, sendResponse);
      break;

    case "RECORDING_UPDATE_TIMER":
      handleRecordingUpdateTimer(message, sendResponse);
      break;

    case "RECORDING_NAVIGATION_DONE":
      handleRecordingNavigationDone(sender, sendResponse);
      break;

    case "RECORDING_SESSION_END":
      handleRecordingSessionEnd(message, sendResponse);
      break;

    default:
      console.warn("Unknown message type:", message.type);
      sendResponse({
        type: "ERROR",
        payload: { error: "Unknown message type", messageType: message.type },
      });
  }

  /**
   * Handle LOG_EXECUTION message (EXT-006)
   * Proxies execution logging to backend so content scripts don't import API client
   */
  async function handleLogExecution(
    message: ExtensionMessage,
    sendResponse: (response?: any) => void,
  ): Promise<void> {
    try {
      const payload = (message.payload || {}) as {
        workflowId: number;
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
      };

      if (!payload.workflowId || typeof payload.workflowId !== "number") {
        throw new Error("workflowId is required");
      }

      const { workflowId, ...data } = payload;

      const result = await apiClient.logExecution(workflowId, data);

      sendResponse({
        type: "LOG_EXECUTION",
        payload: { success: true, result },
      });
    } catch (error) {
      console.error("[Background] LOG_EXECUTION failed:", error);
      sendResponse({
        type: "LOG_EXECUTION",
        payload: {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to log execution",
        },
      });
    }
  }

  // Return true to indicate we'll send response asynchronously
  return true;
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Handle PING message (connectivity test)
 */
function handlePing(
  _message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): void {
  sendResponse({
    type: "PONG",
    payload: { timestamp: Date.now() },
  });
}

/**
 * Handle START_RECORDING message
 * Initializes recording state and injects content scripts
 * Also creates a recording session for multi-page persistence
 */
async function handleStartRecording(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { workflowName, startingUrl } = message.payload || {};

    // Validate payload
    if (!workflowName || typeof workflowName !== "string") {
      throw new Error("workflowName is required and must be a string");
    }

    if (!startingUrl || typeof startingUrl !== "string") {
      throw new Error("startingUrl is required and must be a string");
    }

    // Get active tab ID for session tracking (multi-page recording)
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tabId = activeTab?.id;
    if (!tabId) {
      throw new Error("No active tab found for recording");
    }

    // Start recording (original flow - manages state in chrome.storage)
    const recordingState = await startRecording(workflowName, startingUrl);

    // Also create session for multi-page persistence (chrome.storage.session)
    // This enables widget restoration after page navigation
    await startRecordingSession(workflowName, startingUrl, tabId);
    console.log(
      `[Background] Recording session created for tab ${tabId}: ${workflowName}`,
    );

    sendResponse({
      type: "START_RECORDING",
      payload: {
        success: true,
        recordingState,
      },
    });
  } catch (error) {
    console.error("Failed to start recording:", error);
    sendResponse({
      type: "ERROR",
      payload: {
        error:
          error instanceof Error ? error.message : "Failed to start recording",
        context: "START_RECORDING",
      },
    });
  }
}

/**
 * Handle STOP_RECORDING message
 * Stops recording and uploads workflow to backend
 */
async function handleStopRecording(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  // Declare outside try so it's accessible in catch for storing failed upload
  let recordingState: Awaited<ReturnType<typeof stopRecording>> | null = null;

  try {
    // Get recording state from old system (state.ts)
    recordingState = await stopRecording();

    if (!recordingState) {
      throw new Error("No active recording to stop");
    }

    // Get steps and screenshots from message payload (sent from content script)
    const payload = message.payload || {};

    // Get session ID for IndexedDB screenshot retrieval BEFORE ending session
    const { session: currentSession } = await getRecordingSession();
    const sessionId = currentSession?.sessionId;

    // Get session data from new session system (chrome.storage.session)
    // This contains steps that were recorded across page navigations
    const sessionData = await endRecordingSession("user_stop");
    console.log(
      "[Background] Session data retrieved:",
      sessionData ? `${sessionData.steps.length} steps` : "no session",
    );

    // Use session steps as primary source (works across origins)
    // Fall back to payload.steps (IndexedDB - origin-scoped) or recordingState.steps
    const sessionSteps = sessionData?.steps || [];
    const payloadSteps = payload.steps || [];
    const legacySteps = recordingState.steps || [];

    // Use whichever source has more steps (session is preferred for multi-page)
    let steps = sessionSteps;
    if (payloadSteps.length > steps.length) {
      steps = payloadSteps;
      console.log("[Background] Using payload steps (IndexedDB)");
    } else if (legacySteps.length > steps.length) {
      steps = legacySteps;
      console.log("[Background] Using legacy state steps");
    } else if (steps.length > 0) {
      console.log("[Background] Using session steps (chrome.storage.session)");
    }

    // Get screenshots from IndexedDB (stored there to avoid chrome.storage.session 1MB limit)
    let screenshots: Array<{
      step_number: number;
      dataUrl: string;
      timestamp: string;
    }> = [];
    if (sessionId) {
      const indexedDbScreenshots = await getScreenshotsForSession(sessionId);
      screenshots = indexedDbScreenshots.map((s) => ({
        step_number: s.stepNumber,
        dataUrl: s.dataUrl,
        timestamp: s.timestamp, // Use stored timestamp (ISO string)
      }));
      console.log(
        `[Background] Retrieved ${screenshots.length} screenshots from IndexedDB`,
      );
    }
    // Fall back to payload screenshots if IndexedDB was empty
    if (screenshots.length === 0 && payload.screenshots?.length > 0) {
      screenshots = payload.screenshots;
      console.log(
        `[Background] Using ${screenshots.length} screenshots from payload`,
      );
    }

    console.log(
      `Uploading workflow "${recordingState.workflowName}" with ${steps.length} steps and ${screenshots.length} screenshots`,
    );

    // Validate that we have at least one step
    if (steps.length === 0) {
      console.error(
        "[BackgroundMessaging] Cannot create workflow with 0 steps",
      );
      throw new Error(
        "No steps were recorded. Please try recording again and interact with the page.",
      );
    }

    // Build workflow creation request
    const workflowRequest = {
      name: recordingState.workflowName || "Untitled Workflow",
      description: null,
      starting_url: payload.startingUrl || recordingState.startingUrl || "",
      tags: [],
      steps: steps, // Steps with screenshot_id=null
    };

    console.log("[BackgroundMessaging] Creating workflow with request:", {
      name: workflowRequest.name,
      starting_url: workflowRequest.starting_url,
      stepCount: workflowRequest.steps.length,
      firstStep: workflowRequest.steps[0],
    });

    // Step 1: Create workflow first (to get workflow_id)
    const workflowResponse = await apiClient.createWorkflow(workflowRequest);

    console.log(
      "[BackgroundMessaging] Workflow created successfully:",
      workflowResponse,
    );

    // Step 2: Upload screenshots with workflow_id
    // CRITICAL: We must await this to prevent MV3 service worker suspension mid-upload
    // and to ensure screenshots are only cleared from IndexedDB after successful upload
    if (screenshots.length > 0 && sessionId) {
      try {
        await uploadScreenshotsAsync(workflowResponse.workflow_id, screenshots);
        console.log(
          `✅ All ${screenshots.length} screenshots uploaded and linked successfully`,
        );

        // Only clear IndexedDB screenshots AFTER successful upload
        await clearScreenshotsForSession(sessionId);
        console.log(
          "[Background] IndexedDB screenshots cleared after successful upload",
        );
      } catch (error) {
        console.error("❌ Screenshot upload/linking failed:", error);
        // Keep screenshots in IndexedDB for potential retry
        // The workflow was still created successfully, so don't fail the response
        console.log(
          "[Background] Keeping screenshots in IndexedDB for retry. SessionId:",
          sessionId,
        );
      }
    } else if (sessionId) {
      // No screenshots to upload, just clean up
      await clearScreenshotsForSession(sessionId).catch((error) => {
        console.warn(
          "[Background] Failed to clear IndexedDB screenshots:",
          error,
        );
      });
    }

    // Clean up recording state (old state.ts system)
    // Note: endRecordingSession() was already called earlier to retrieve session data
    await cleanupRecordingState();
    console.log("[Background] Recording state cleaned up");

    sendResponse({
      type: "STOP_RECORDING",
      payload: {
        success: true,
        workflowId: workflowResponse.workflow_id,
        status: workflowResponse.status,
      },
    });
  } catch (error) {
    console.error("[BackgroundMessaging] Failed to stop recording:", error);

    // Log detailed error information
    let errorMessage = "Failed to stop recording";
    if (error && typeof error === "object") {
      const apiError = error as any;

      // Log all available error properties
      console.error("[BackgroundMessaging] Error type:", apiError.name);
      console.error("[BackgroundMessaging] Error message:", apiError.message);
      console.error("[BackgroundMessaging] Error status:", apiError.status);
      console.error("[BackgroundMessaging] Error details:", apiError.details);

      // Build user-friendly error message
      if (apiError.status === 400) {
        if (apiError.details && typeof apiError.details === "object") {
          // Pydantic validation error format
          if (
            apiError.details.detail &&
            Array.isArray(apiError.details.detail)
          ) {
            const validationErrors = apiError.details.detail
              .map((err: any) => `${err.loc?.join(".") || "field"}: ${err.msg}`)
              .join(", ");
            errorMessage = `Validation error: ${validationErrors}`;
          } else if (typeof apiError.details.detail === "string") {
            errorMessage = apiError.details.detail;
          } else if (apiError.details.message) {
            errorMessage = apiError.details.message;
          }
        } else if (typeof apiError.details === "string") {
          errorMessage = apiError.details;
        }
      } else {
        errorMessage = apiError.message || errorMessage;
      }
    }

    console.error("[BackgroundMessaging] Final error message:", errorMessage);

    // Store failed upload data for retry (FEAT-012)
    const payload = message.payload || {};
    const steps = payload.steps || recordingState?.steps || [];
    const screenshots = payload.screenshots || [];
    const workflowName = recordingState?.workflowName || "Untitled Workflow";
    const startingUrl =
      payload.startingUrl || recordingState?.startingUrl || "";

    if (steps.length > 0) {
      const localId = await storeFailedUpload(
        workflowName,
        startingUrl,
        steps,
        screenshots,
        errorMessage,
      );

      console.log(
        `[BackgroundMessaging] Failed upload stored with ID: ${localId}`,
      );
    }

    // Clean up recording state even on error to prevent stuck state
    await cleanupRecordingState();

    sendResponse({
      type: "STOP_RECORDING",
      payload: {
        success: false,
        error: errorMessage,
        context: "STOP_RECORDING",
      },
    });
  }
}

/**
 * Helper: Wait for a tab to complete loading at an expected URL
 *
 * IMPORTANT: When called after chrome.tabs.update, the tab status may briefly
 * still be "complete" before Chrome starts loading the new URL. This function
 * handles that race condition by:
 * 1. If expectedUrl is provided, first waiting for URL to change
 * 2. Then waiting for status to become "complete"
 */
async function waitForTabLoad(
  tabId: number,
  expectedUrl?: string,
  timeoutMs: number = 10000,
): Promise<void> {
  const startTime = Date.now();

  // Helper to check if URL matches expected (handles trailing slashes and hash)
  const urlMatches = (tabUrl: string | undefined): boolean => {
    if (!expectedUrl) return true; // No expected URL means any URL is fine
    if (!tabUrl) return false; // Have expected but no actual URL

    // Compare origins and pathnames (ignore query params and fragments for flexibility)
    try {
      const expected = new URL(expectedUrl);
      const actual = new URL(tabUrl);
      return (
        actual.origin === expected.origin &&
        actual.pathname.replace(/\/$/, "") ===
          expected.pathname.replace(/\/$/, "")
      );
    } catch {
      // Fallback: simple string startsWith comparison
      // We know expectedUrl and tabUrl are defined here due to early returns above
      const expectedBase = expectedUrl!.split("?")[0]!.split("#")[0]!;
      return tabUrl!.startsWith(expectedBase);
    }
  };

  // Phase 1: If expectedUrl is provided, wait for URL to change
  if (expectedUrl) {
    while (Date.now() - startTime < timeoutMs) {
      const tab = await chrome.tabs.get(tabId);
      if (urlMatches(tab.url) || urlMatches(tab.pendingUrl)) {
        break; // URL has changed to expected destination
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  // Phase 2: Wait for tab status to become "complete"
  while (Date.now() - startTime < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete" && (!expectedUrl || urlMatches(tab.url))) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error(
    `Tab ${tabId} did not complete loading within ${timeoutMs}ms`,
  );
}

/**
 * Handle START_WALKTHROUGH message
 * Fetches workflow from API and sends to content script
 * EXT-001: Walkthrough Messaging & Data Loading
 *
 * Sprint 6: Routes to new or legacy system based on feature flag.
 * - Flag = true: Uses new SessionManager state machine (Sprint 1-5)
 * - Flag = false: Uses legacy walkthroughSession.ts
 *
 * Fixed: Properly navigates to workflow starting_url before injecting walkthrough
 */
async function handleStartWalkthrough(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { workflowId } = message.payload || {};

    // Validate payload
    if (!workflowId || typeof workflowId !== "number") {
      throw new Error("workflowId is required and must be a number");
    }

    // Sprint 6: Check feature flag to determine which system to use
    const useNewSystem = await useNewWalkthroughSystem();
    console.log(
      `[Background] Starting walkthrough for workflow ${workflowId} (system: ${useNewSystem ? "new" : "legacy"})`,
    );

    if (useNewSystem) {
      // =====================================================================
      // NEW SYSTEM: Use SessionManager state machine (Sprint 1-5)
      // =====================================================================
      await handleStartWalkthroughNew(workflowId, sendResponse);
    } else {
      // =====================================================================
      // LEGACY SYSTEM: Existing behavior (WALKTHROUGH_DATA protocol)
      // =====================================================================
      await handleStartWalkthroughLegacy(workflowId, sendResponse);
    }
  } catch (error) {
    console.error("[Background] Failed to start walkthrough:", error);
    sendResponse({
      type: "START_WALKTHROUGH",
      payload: {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to start walkthrough",
      },
    });
  }
}

/**
 * NEW SYSTEM: Start walkthrough using SessionManager state machine
 * Uses WALKTHROUGH_STATE_CHANGED broadcasts (content script subscribes)
 */
async function handleStartWalkthroughNew(
  workflowId: number,
  sendResponse: (response?: any) => void,
): Promise<void> {
  // Fetch workflow from API
  const workflow = await apiClient.getWorkflow(workflowId);

  console.log(
    `[Background] [NEW] Fetched workflow "${workflow.name}" with ${workflow.steps.length} steps`,
  );

  // Validate workflow has steps
  if (!workflow.steps || workflow.steps.length === 0) {
    throw new Error("Workflow has no steps");
  }

  // Create new tab for the walkthrough
  const newTab = await chrome.tabs.create({ url: workflow.starting_url });
  if (!newTab.id) {
    throw new Error("Failed to create new tab");
  }
  const tabId = newTab.id;
  console.log(
    `[Background] [NEW] Created new tab ${tabId} for workflow starting URL: ${workflow.starting_url}`,
  );
  await waitForTabLoad(tabId, workflow.starting_url);

  // Ensure SessionManager is initialized (idempotent, handles cold-start race)
  // This matches the safety guard in handleWalkthroughMessage (messageHandlers.ts:44)
  await sessionManager.initialize();

  // Dispatch START event to state machine
  await sessionManager.dispatch({
    type: "START",
    workflowId: workflow.id,
    tabId,
  });

  // Dispatch DATA_LOADED event with workflow data
  // This transitions from INITIALIZING to FINDING_ELEMENT and broadcasts state
  await sessionManager.dispatch({
    type: "DATA_LOADED",
    workflow,
    tabId,
  });

  console.log("[Background] [NEW] Walkthrough started via SessionManager");

  // Success response
  sendResponse({
    type: "START_WALKTHROUGH",
    payload: {
      success: true,
      workflowId: workflow.id,
      workflowName: workflow.name,
      stepCount: workflow.steps.length,
      system: "new",
    },
  });
}

/**
 * LEGACY SYSTEM: Start walkthrough using walkthroughSession.ts
 * Uses WALKTHROUGH_DATA direct message to content script
 */
async function handleStartWalkthroughLegacy(
  workflowId: number,
  sendResponse: (response?: any) => void,
): Promise<void> {
  // Fetch workflow from API
  const workflow = await apiClient.getWorkflow(workflowId);

  console.log(
    `[Background] [LEGACY] Fetched workflow "${workflow.name}" with ${workflow.steps.length} steps`,
  );

  // Validate workflow has steps
  if (!workflow.steps || workflow.steps.length === 0) {
    throw new Error("Workflow has no steps");
  }

  // Always create a new tab for the walkthrough
  // This ensures the dashboard (sender tab) stays open for the user
  const newTab = await chrome.tabs.create({ url: workflow.starting_url });
  if (!newTab.id) {
    throw new Error("Failed to create new tab");
  }
  const tabId = newTab.id;
  console.log(
    `[Background] [LEGACY] Created new tab ${tabId} for workflow starting URL: ${workflow.starting_url}`,
  );
  await waitForTabLoad(tabId, workflow.starting_url);

  // GAP-001: Create walkthrough session for multi-page persistence
  const session = await startSession(workflow, tabId);
  console.log(
    `[Background] [LEGACY] Created walkthrough session: ${session.sessionId}`,
  );

  // Check if walkthrough content script is already loaded (manifest injects on <all_urls>)
  // Only inject if ping fails to avoid duplicate listeners
  let contentScriptReady = false;
  try {
    const pingResponse = await chrome.tabs.sendMessage(tabId, {
      type: "WALKTHROUGH_PING",
    });
    contentScriptReady = pingResponse?.ready === true;
    console.log(
      "[Background] [LEGACY] WALKTHROUGH_PING response:",
      pingResponse,
      "ready:",
      contentScriptReady,
    );
  } catch (err) {
    console.log(
      "[Background] [LEGACY] WALKTHROUGH_PING failed, content script not loaded yet:",
      err,
    );
  }

  if (!contentScriptReady) {
    console.log(
      "[Background] [LEGACY] Injecting walkthrough content script into tab",
      tabId,
    );
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/walkthrough.js"],
    });

    // Small delay to ensure content script message listener is ready
    await new Promise((r) => setTimeout(r, 100));
  }

  // Send workflow data with retries in case listener init lags
  // Now properly waits for content script initialization to complete
  let walkthroughStarted = false;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: "WALKTHROUGH_DATA",
        payload: {
          workflowId: workflow.id,
          workflowName: workflow.name,
          startingUrl: workflow.starting_url,
          steps: workflow.steps,
          totalSteps: workflow.steps.length,
        },
      });
      console.log(
        `[Background] [LEGACY] WALKTHROUGH_DATA ack (attempt ${attempt}):`,
        response,
      );

      // Check if content script successfully initialized
      if (response?.success) {
        walkthroughStarted = true;
        break;
      } else {
        lastError = response?.error || "Content script initialization failed";
        console.warn(
          `[Background] [LEGACY] WALKTHROUGH_DATA attempt ${attempt} - content script reported error:`,
          lastError,
        );
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Background] [LEGACY] WALKTHROUGH_DATA attempt ${attempt} failed:`,
        err,
      );
    }
    // Wait before retry (increasing delay)
    await new Promise((r) => setTimeout(r, 150 * attempt));
  }

  // Report result to dashboard
  if (walkthroughStarted) {
    sendResponse({
      type: "START_WALKTHROUGH",
      payload: {
        success: true,
        workflowId: workflow.id,
        workflowName: workflow.name,
        stepCount: workflow.steps.length,
        system: "legacy",
      },
    });
  } else {
    // End the session since walkthrough failed to start
    await endSession("error");
    sendResponse({
      type: "START_WALKTHROUGH",
      payload: {
        success: false,
        error:
          lastError || "Failed to initialize walkthrough in content script",
      },
    });
  }
}

/**
 * Upload screenshots asynchronously in the background
 * Returns after all uploads complete or fail
 */
async function uploadScreenshotsAsync(
  workflowId: number,
  screenshots: Array<{
    step_number: number;
    dataUrl: string;
    timestamp: string;
  }>,
): Promise<void> {
  console.log(
    `Starting async upload of ${screenshots.length} screenshots for workflow ${workflowId}`,
  );

  try {
    // Step 1: Fetch workflow details to get step IDs
    const workflow = await apiClient.getWorkflow(workflowId);
    console.log(
      `Fetched workflow ${workflowId} with ${workflow.steps.length} steps`,
    );

    // Create mapping of step_number -> step_id
    const stepMap = new Map<number, number>();
    workflow.steps.forEach((step) => {
      stepMap.set(step.step_number, step.id);
    });

    // Step 2: Upload screenshots and link them to steps
    const uploadPromises = screenshots.map(async (screenshot) => {
      try {
        // Convert dataUrl back to Blob
        const response = await fetch(screenshot.dataUrl);
        const blob = await response.blob();

        // Upload to server
        const uploadResponse = await apiClient.uploadScreenshot(
          blob,
          workflowId,
          screenshot.step_number.toString(),
        );

        console.log(
          `Screenshot uploaded for step ${screenshot.step_number}: ${uploadResponse.screenshot_id}`,
        );

        // Link screenshot to step
        const stepId = stepMap.get(screenshot.step_number);
        if (stepId) {
          await apiClient.linkScreenshotToStep(
            stepId,
            uploadResponse.screenshot_id,
          );
          console.log(
            `✓ Linked screenshot ${uploadResponse.screenshot_id} to step ${stepId} (step_number ${screenshot.step_number})`,
          );
        } else {
          console.warn(
            `Could not find step ID for step_number ${screenshot.step_number}`,
          );
        }

        return uploadResponse;
      } catch (error) {
        console.error(
          `Failed to upload/link screenshot for step ${screenshot.step_number}:`,
          error,
        );
        throw error;
      }
    });

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    console.log(`✅ All ${screenshots.length} screenshots uploaded and linked`);

    // Step 3: Trigger AI processing now that all screenshots are ready
    console.log(`🧠 Starting AI processing for workflow ${workflowId}...`);
    const processingResponse =
      await apiClient.startWorkflowProcessing(workflowId);
    console.log(
      `✅ AI processing started: task_id=${processingResponse.task_id}`,
    );
  } catch (error) {
    console.error("Failed to upload/link screenshots:", error);
    throw error;
  }
}

/**
 * Handle CAPTURE_SCREENSHOT message
 * Captures screenshot of sender's tab (not just active tab)
 * This ensures we capture the correct tab during cross-origin navigation
 */
async function handleCaptureScreenshot(
  _message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    // DIAGNOSTIC: Log full sender object to debug cross-origin issues
    console.log(
      `[CAPTURE_SCREENSHOT] 📸 Full sender:`,
      JSON.stringify({
        tabId: sender.tab?.id,
        tabUrl: sender.tab?.url,
        tabStatus: sender.tab?.status,
        tabActive: sender.tab?.active,
        tabWindowId: sender.tab?.windowId,
        frameId: sender.frameId,
        url: sender.url,
        origin: sender.origin,
      }),
    );

    // Use sender's tab ID to ensure we capture the correct tab
    // This is critical for cross-origin recording where active tab may differ
    const senderTabId = sender.tab?.id;

    if (!senderTabId) {
      console.error(
        `[CAPTURE_SCREENSHOT] ⚠️ sender.tab.id is UNDEFINED! sender.url=${sender.url}`,
      );
    }

    console.log(`[CAPTURE_SCREENSHOT] Capturing sender tab ${senderTabId}`);

    const result = await captureScreenshot(senderTabId);

    if ("error" in result) {
      console.error(
        `[CAPTURE_SCREENSHOT] Failed for tab ${senderTabId}:`,
        result.error,
      );
      throw new Error(result.error);
    }

    sendResponse({
      type: "SCREENSHOT_CAPTURED",
      payload: {
        success: true,
        dataUrl: result.dataUrl,
        timestamp: result.timestamp,
        tabId: result.tabId,
        url: result.url,
      },
    });
  } catch (error) {
    console.error("Failed to capture screenshot:", error);
    sendResponse({
      type: "ERROR",
      payload: {
        error:
          error instanceof Error
            ? error.message
            : "Failed to capture screenshot",
        context: "CAPTURE_SCREENSHOT",
      },
    });
  }
}

/**
 * Handle GET_RECORDING_STATE message
 * Returns current recording state
 */
async function handleGetRecordingState(
  _message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const recordingState = await getCurrentRecordingState();

    sendResponse({
      type: "GET_RECORDING_STATE",
      payload: {
        success: true,
        recordingState,
      },
    });
  } catch (error) {
    console.error("Failed to get recording state:", error);
    sendResponse({
      type: "ERROR",
      payload: {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get recording state",
        context: "GET_RECORDING_STATE",
      },
    });
  }
}

/**
 * Handle VALIDATE_HEALING message (Phase 4)
 * Proxies healing validation to backend AI service
 */
async function handleValidateHealing(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const payload = message.payload;

    if (!payload) {
      throw new Error("Validation request payload is required");
    }

    console.log(
      "[Background] VALIDATE_HEALING request for step",
      payload.step_id,
    );

    const result = await apiClient.validateHealingMatch(payload);

    console.log("[Background] VALIDATE_HEALING result:", {
      is_match: result.is_match,
      ai_confidence: result.ai_confidence,
      recommendation: result.recommendation,
    });

    sendResponse({
      type: "VALIDATE_HEALING",
      payload: { success: true, result },
    });
  } catch (error) {
    console.error("[Background] VALIDATE_HEALING failed:", error);
    sendResponse({
      type: "VALIDATE_HEALING",
      payload: {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to validate healing",
      },
    });
  }
}

/**
 * Handle LOG_HEALING_ATTEMPT message (Phase 5)
 * Persists healing attempt results to backend for health tracking
 */
async function handleLogHealingAttempt(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const payload = (message.payload || {}) as {
      stepId: number;
      workflowId: number;
      success: boolean;
      confidence: number;
      resolution: string;
      pageUrl?: string;
      healingLog?: {
        status: string;
        deterministicScore: number;
        aiConfidence: number | null;
        finalConfidence: number;
        candidatesEvaluated: number;
        factorScores: Record<string, number>;
        vetoesApplied: string[];
      };
    };

    if (!payload.workflowId || typeof payload.workflowId !== "number") {
      throw new Error("workflowId is required");
    }

    // Map healing resolution to execution status
    let status: "success" | "healed_deterministic" | "healed_ai" | "failed";
    switch (payload.resolution) {
      case "healed_auto":
        status = "healed_deterministic";
        break;
      case "healed_ai":
        status = "healed_ai";
        break;
      case "healed_user":
        // User-confirmed heals are treated as deterministic success
        status = "healed_deterministic";
        break;
      case "failed":
      default:
        status = "failed";
    }

    // Build the execution log data (only API-supported fields)
    const logData = {
      step_id: payload.stepId || null,
      status,
      error_type: payload.success ? null : ("element_not_found" as const),
      error_message: payload.success
        ? null
        : `Healing failed: ${payload.resolution}`,
      healing_confidence: payload.confidence || null,
      deterministic_score: payload.healingLog?.deterministicScore || null,
      page_url: payload.pageUrl || null,
    };

    console.log(
      `[Background] LOG_HEALING_ATTEMPT for workflow ${payload.workflowId}:`,
      {
        status,
        confidence: payload.confidence,
        resolution: payload.resolution,
      },
    );

    const result = await apiClient.logExecution(payload.workflowId, logData);

    sendResponse({
      type: "LOG_HEALING_ATTEMPT",
      payload: { success: true, result },
    });
  } catch (error) {
    console.error("[Background] LOG_HEALING_ATTEMPT failed:", error);
    // Don't fail silently - but also don't block the walkthrough
    sendResponse({
      type: "LOG_HEALING_ATTEMPT",
      payload: {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to log healing attempt",
      },
    });
  }
}

// ============================================================================
// FAILED UPLOAD HANDLERS (FEAT-012)
// ============================================================================

/**
 * Handle GET_FAILED_UPLOADS message
 * Returns list of failed uploads for the popup
 */
async function handleGetFailedUploads(
  _message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const result = await chrome.storage.local.get("failedWorkflows");
    const failedWorkflows: FailedUpload[] = result.failedWorkflows || [];

    // Return summary info (not the full data)
    const uploads = failedWorkflows.map((f) => ({
      localId: f.localId,
      name: f.name,
      stepCount: f.stepCount,
      failedAt: f.failedAt,
      errorMessage: f.errorMessage,
    }));

    sendResponse({
      type: "GET_FAILED_UPLOADS",
      payload: { success: true, uploads },
    });
  } catch (error) {
    console.error("[Background] GET_FAILED_UPLOADS failed:", error);
    sendResponse({
      type: "GET_FAILED_UPLOADS",
      payload: {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get failed uploads",
        uploads: [],
      },
    });
  }
}

/**
 * Handle RETRY_UPLOAD message
 * Retries uploading a previously failed workflow
 */
async function handleRetryUpload(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { localId } = message.payload || {};

    if (!localId) {
      throw new Error("localId is required");
    }

    console.log(`[Background] RETRY_UPLOAD for: ${localId}`);

    // Get the failed upload data
    const failedUpload = await getFailedUpload(localId);
    if (!failedUpload) {
      throw new Error("Failed upload not found");
    }

    const { workflowName, startingUrl, steps, screenshots } = failedUpload.data;

    // Build workflow creation request
    const workflowRequest = {
      name: workflowName,
      description: null,
      starting_url: startingUrl,
      tags: [],
      steps,
    };

    console.log(
      `[Background] Retrying workflow "${workflowName}" with ${steps.length} steps`,
    );

    // Attempt to create workflow
    const workflowResponse = await apiClient.createWorkflow(workflowRequest);

    console.log(
      `[Background] Workflow created successfully: ${workflowResponse.workflow_id}`,
    );

    // Upload screenshots in background (if any)
    if (screenshots.length > 0) {
      uploadScreenshotsAsync(workflowResponse.workflow_id, screenshots)
        .then(() => {
          console.log(
            `✅ Retry: All ${screenshots.length} screenshots uploaded`,
          );
        })
        .catch((error) => {
          console.error("❌ Retry: Screenshot upload failed:", error);
        });
    }

    // Remove from failed uploads on success
    await removeFailedUpload(localId);

    sendResponse({
      type: "RETRY_UPLOAD",
      payload: {
        success: true,
        workflowId: workflowResponse.workflow_id,
        status: workflowResponse.status,
      },
    });
  } catch (error) {
    console.error("[Background] RETRY_UPLOAD failed:", error);

    // Update error message in stored data
    const { localId } = message.payload || {};
    if (localId) {
      const failedUpload = await getFailedUpload(localId);
      if (failedUpload) {
        failedUpload.errorMessage =
          error instanceof Error ? error.message : "Retry failed";
        failedUpload.failedAt = new Date().toISOString();

        const result = await chrome.storage.local.get("failedWorkflows");
        const failedWorkflows: FailedUpload[] = result.failedWorkflows || [];
        const index = failedWorkflows.findIndex((f) => f.localId === localId);
        if (index !== -1) {
          failedWorkflows[index] = failedUpload;
          await chrome.storage.local.set({ failedWorkflows });
        }
      }
    }

    sendResponse({
      type: "RETRY_UPLOAD",
      payload: {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to retry upload",
      },
    });
  }
}

/**
 * Handle DISCARD_UPLOAD message
 * Permanently removes a failed upload
 */
async function handleDiscardUpload(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { localId } = message.payload || {};

    if (!localId) {
      throw new Error("localId is required");
    }

    console.log(`[Background] DISCARD_UPLOAD: ${localId}`);

    await removeFailedUpload(localId);

    sendResponse({
      type: "DISCARD_UPLOAD",
      payload: { success: true },
    });
  } catch (error) {
    console.error("[Background] DISCARD_UPLOAD failed:", error);
    sendResponse({
      type: "DISCARD_UPLOAD",
      payload: {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to discard upload",
      },
    });
  }
}

// ============================================================================
// GAP-001: MULTI-PAGE WALKTHROUGH SESSION HANDLERS
// ============================================================================

/**
 * Handle WALKTHROUGH_GET_STATE message
 * Returns session state for content script restoration after page navigation
 * GAP-001: Multi-page workflow support
 */
async function handleGetWalkthroughState(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({
        type: "WALKTHROUGH_GET_STATE",
        payload: { session: null, shouldRestore: false },
      });
      return;
    }

    console.log(`[Background] WALKTHROUGH_GET_STATE from tab ${tabId}`);

    const { session, shouldRestore } = await getSessionForTab(tabId);

    console.log(
      `[Background] Session for tab ${tabId}:`,
      session ? `found (step ${session.currentStepIndex + 1})` : "none",
      `shouldRestore: ${shouldRestore}`,
    );

    sendResponse({
      type: "WALKTHROUGH_GET_STATE",
      payload: { session, shouldRestore },
    });
  } catch (error) {
    console.error("[Background] WALKTHROUGH_GET_STATE failed:", error);
    sendResponse({
      type: "WALKTHROUGH_GET_STATE",
      payload: { session: null, shouldRestore: false },
    });
  }
}

/**
 * Handle WALKTHROUGH_STATE_UPDATE message
 * Updates session state from content script sync
 * GAP-001: Multi-page workflow support
 */
async function handleWalkthroughStateUpdate(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const payload = message.payload || {};

    console.log("[Background] WALKTHROUGH_STATE_UPDATE:", {
      currentStepIndex: payload.currentStepIndex,
      status: payload.status,
    });

    const updated = await updateSession({
      currentStepIndex: payload.currentStepIndex,
      status: payload.status,
      error: payload.error,
      retryAttempts: payload.retryAttempts,
    });

    sendResponse({
      type: "WALKTHROUGH_STATE_UPDATE",
      payload: { success: updated },
    });
  } catch (error) {
    console.error("[Background] WALKTHROUGH_STATE_UPDATE failed:", error);
    sendResponse({
      type: "WALKTHROUGH_STATE_UPDATE",
      payload: { success: false },
    });
  }
}

/**
 * Handle WALKTHROUGH_NAVIGATION_DONE message
 * Marks navigation as complete in session
 * GAP-001: Multi-page workflow support
 */
async function handleWalkthroughNavigationDone(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({
        type: "WALKTHROUGH_NAVIGATION_DONE",
        payload: { success: false },
      });
      return;
    }

    console.log(`[Background] WALKTHROUGH_NAVIGATION_DONE from tab ${tabId}`);

    // Force clear navigation flag first to ensure it's not stuck
    await forceNavigationComplete();
    // Then call normal handler
    await handleNavigationComplete(tabId);

    sendResponse({
      type: "WALKTHROUGH_NAVIGATION_DONE",
      payload: { success: true },
    });
  } catch (error) {
    console.error("[Background] WALKTHROUGH_NAVIGATION_DONE failed:", error);
    sendResponse({
      type: "WALKTHROUGH_NAVIGATION_DONE",
      payload: { success: false },
    });
  }
}

// ============================================================================
// MULTI-PAGE RECORDING SESSION HANDLERS
// ============================================================================

/**
 * Handle RECORDING_GET_STATE message
 * Returns recording session state for content script restoration after page navigation
 */
async function handleGetRecordingSessionState(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({
        type: "RECORDING_GET_STATE",
        payload: { session: null, shouldRestore: false },
      });
      return;
    }

    console.log(`[Background] RECORDING_GET_STATE from tab ${tabId}`);

    const { session, shouldRestore } = await getRecordingSessionForTab(tabId);

    console.log(
      `[Background] Recording session for tab ${tabId}:`,
      session ? `found (step ${session.currentStepNumber})` : "none",
      `shouldRestore: ${shouldRestore}`,
    );

    sendResponse({
      type: "RECORDING_GET_STATE",
      payload: { session, shouldRestore },
    });
  } catch (error) {
    console.error("[Background] RECORDING_GET_STATE failed:", error);
    sendResponse({
      type: "RECORDING_GET_STATE",
      payload: { session: null, shouldRestore: false },
    });
  }
}

/**
 * Handle RECORDING_START_SESSION message
 * Creates a new recording session in storage
 */
async function handleStartRecordingSession(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { workflowName, startingUrl } = message.payload || {};
    const tabId = sender.tab?.id;

    if (!workflowName || typeof workflowName !== "string") {
      throw new Error("workflowName is required");
    }

    if (!startingUrl || typeof startingUrl !== "string") {
      throw new Error("startingUrl is required");
    }

    if (!tabId) {
      throw new Error("Tab ID not available");
    }

    console.log(`[Background] RECORDING_START_SESSION: ${workflowName}`);

    const session = await startRecordingSession(
      workflowName,
      startingUrl,
      tabId,
    );

    sendResponse({
      type: "RECORDING_START_SESSION",
      payload: { success: true, session },
    });
  } catch (error) {
    console.error("[Background] RECORDING_START_SESSION failed:", error);
    sendResponse({
      type: "RECORDING_START_SESSION",
      payload: {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to start recording session",
      },
    });
  }
}

/**
 * Handle RECORDING_ADD_STEP message
 * Adds a step to the recording session
 */
async function handleRecordingAddStep(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { step } = message.payload || {};

    if (!step) {
      throw new Error("Step data is required");
    }

    // addStepToSession now assigns the step_number and returns it
    const result = await addStepToSession(step);

    if (result) {
      sendResponse({
        type: "RECORDING_ADD_STEP",
        payload: { success: true, stepNumber: result.stepNumber },
      });
    } else {
      sendResponse({
        type: "RECORDING_ADD_STEP",
        payload: { success: false },
      });
    }
  } catch (error) {
    console.error("[Background] RECORDING_ADD_STEP failed:", error);
    sendResponse({
      type: "RECORDING_ADD_STEP",
      payload: { success: false },
    });
  }
}

/**
 * Handle RECORDING_ADD_SCREENSHOT message
 * Stores screenshot in IndexedDB (not chrome.storage.session) to avoid 1MB limit
 *
 * IMPORTANT: Includes retry logic for navigation transitions. During cross-origin
 * navigation, the session lookup may temporarily fail due to cache staleness.
 * We retry after a short delay to handle this race condition.
 */
async function handleRecordingAddScreenshot(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { stepNumber, dataUrl } = message.payload || {};

    if (typeof stepNumber !== "number") {
      throw new Error("stepNumber is required");
    }

    if (!dataUrl || typeof dataUrl !== "string") {
      throw new Error("dataUrl is required");
    }

    // Get current session ID for IndexedDB storage
    // Retry logic: session may be temporarily unavailable during navigation transition
    let session = (await getRecordingSession()).session;

    if (!session) {
      console.log(
        `[Background] Screenshot step ${stepNumber}: Session not found, retrying after delay...`,
      );
      // Wait for navigation to settle and cache to refresh
      await new Promise((r) => setTimeout(r, 100));
      session = (await getRecordingSession()).session;

      if (!session) {
        // Second retry with longer delay
        console.log(
          `[Background] Screenshot step ${stepNumber}: Retry 1 failed, trying again...`,
        );
        await new Promise((r) => setTimeout(r, 200));
        session = (await getRecordingSession()).session;
      }
    }

    if (!session) {
      console.error(
        `[Background] Screenshot step ${stepNumber}: No session after retries`,
      );
      throw new Error("No active recording session after retries");
    }

    console.log(
      `[Background] Storing screenshot for step ${stepNumber}, session: ${session.sessionId.substring(0, 8)}...`,
    );

    // Store in IndexedDB (no size limit, unlike chrome.storage.session's 1MB limit)
    const success = await storeScreenshot(
      session.sessionId,
      stepNumber,
      dataUrl,
    );

    if (success) {
      console.log(
        `[Background] Screenshot step ${stepNumber} stored successfully`,
      );
    }

    sendResponse({
      type: "RECORDING_ADD_SCREENSHOT",
      payload: { success },
    });
  } catch (error) {
    console.error("[Background] RECORDING_ADD_SCREENSHOT failed:", error);
    sendResponse({
      type: "RECORDING_ADD_SCREENSHOT",
      payload: { success: false },
    });
  }
}

/**
 * Handle RECORDING_UPDATE_TIMER message
 * Syncs widget timer state to session
 */
async function handleRecordingUpdateTimer(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { elapsedSeconds } = message.payload || {};

    if (typeof elapsedSeconds !== "number") {
      throw new Error("elapsedSeconds is required");
    }

    const success = await updateSessionTimer(elapsedSeconds);

    sendResponse({
      type: "RECORDING_UPDATE_TIMER",
      payload: { success },
    });
  } catch (error) {
    console.error("[Background] RECORDING_UPDATE_TIMER failed:", error);
    sendResponse({
      type: "RECORDING_UPDATE_TIMER",
      payload: { success: false },
    });
  }
}

/**
 * Handle RECORDING_NAVIGATION_DONE message
 * Marks navigation as complete in recording session
 */
async function handleRecordingNavigationDone(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({
        type: "RECORDING_NAVIGATION_DONE",
        payload: { success: false },
      });
      return;
    }

    console.log(`[Background] RECORDING_NAVIGATION_DONE from tab ${tabId}`);

    await handleRecordingNavigationComplete(tabId);

    sendResponse({
      type: "RECORDING_NAVIGATION_DONE",
      payload: { success: true },
    });
  } catch (error) {
    console.error("[Background] RECORDING_NAVIGATION_DONE failed:", error);
    sendResponse({
      type: "RECORDING_NAVIGATION_DONE",
      payload: { success: false },
    });
  }
}

/**
 * Handle RECORDING_SESSION_END message
 * Ends the recording session and returns final data for upload
 */
async function handleRecordingSessionEnd(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { reason } = message.payload || {};
    const validReasons = ["completed", "user_stop", "tab_closed", "timeout"];
    const endReason = validReasons.includes(reason) ? reason : "user_stop";

    console.log(`[Background] RECORDING_SESSION_END: ${endReason}`);

    const session = await endRecordingSession(endReason);

    if (session) {
      sendResponse({
        type: "RECORDING_SESSION_END",
        payload: {
          success: true,
          session,
        },
      });
    } else {
      sendResponse({
        type: "RECORDING_SESSION_END",
        payload: {
          success: false,
          error: "No active recording session",
        },
      });
    }
  } catch (error) {
    console.error("[Background] RECORDING_SESSION_END failed:", error);
    sendResponse({
      type: "RECORDING_SESSION_END",
      payload: {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to end recording session",
      },
    });
  }
}
