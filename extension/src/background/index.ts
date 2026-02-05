/**
 * Background Service Worker (Manifest V3)
 * Handles:
 * - Message passing between popup and content scripts
 * - Screenshot capture
 * - State management (recording status, workflow data)
 * - Extension lifecycle events
 *
 * FE-003: Background Service Worker Implementation
 */

import { handleMessage } from "./messaging";
import { getCurrentRecordingState } from "./state";
import type { ExtensionMessage } from "@/shared/types";
// GAP-001/GAP-002: Multi-page and multi-tab walkthrough session management
import {
  getSession,
  handleNavigationStart,
  handleNavigationComplete,
  removeTabFromSession,
  addTabToSession,
} from "./walkthroughSession";
// Multi-page recording session management
import {
  getRecordingSession,
  handleRecordingNavigationStart,
  handleRecordingNavigationComplete,
  endRecordingSession,
  checkSessionTimeout,
} from "./recordingSession";

// Sprint 4: Walkthrough session management
import { sessionManager } from "./walkthrough/SessionManager";
import { NavigationWatcher } from "./walkthrough/NavigationWatcher";
import { TabManager } from "./walkthrough/TabManager";
import { useNewWalkthroughSystem } from "../shared/featureFlags";

// Sprint 4: Walkthrough components (instantiated but only initialized if feature flag is on)
// These are created at module level to allow initialization in any lifecycle event
let navigationWatcher: NavigationWatcher | null = null;
let tabManager: TabManager | null = null;

/**
 * Initialize Sprint 4 walkthrough components if feature flag is enabled.
 * Safe to call multiple times - idempotent.
 */
async function initializeNewWalkthroughSystem(): Promise<void> {
  const useNewSystem = await useNewWalkthroughSystem();

  if (!useNewSystem) {
    console.log("[Background] New walkthrough system disabled by feature flag");
    return;
  }

  // Initialize SessionManager (always needed for state machine)
  await sessionManager.initialize();

  // Create and initialize navigation components only if feature flag is on
  if (!navigationWatcher) {
    navigationWatcher = new NavigationWatcher(sessionManager, { debug: true });
  }
  navigationWatcher.initialize();

  if (!tabManager) {
    tabManager = new TabManager(sessionManager, { debug: true });
  }
  tabManager.initialize();

  console.log("[Background] Sprint 4 walkthrough components initialized");
}

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log("🚀 Workflow Recorder: Background service worker loaded");

// Sprint 4: Immediate initialization for MV3 service worker
// This handles cases where worker wakes up from events (not just install/startup)
(async () => {
  try {
    await initializeNewWalkthroughSystem();
    console.log("Walkthrough initialization complete (immediate)");
  } catch (error) {
    console.error("Failed to initialize walkthrough components:", error);
  }
})();

// ============================================================================
// LIFECYCLE EVENTS
// ============================================================================

/**
 * Handle extension installation and updates
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("Extension installed:", details);

  // Sprint 4: Initialize walkthrough components (if feature flag enabled)
  try {
    await initializeNewWalkthroughSystem();
    console.log("Walkthrough initialization complete (onInstalled)");
  } catch (error) {
    console.error("Failed to initialize walkthrough components:", error);
  }

  if (details.reason === "install") {
    // First install - could open onboarding page
    console.log("First time installation!");
  } else if (details.reason === "update") {
    // Extension updated
    const version = chrome.runtime.getManifest().version;
    console.log(`Extension updated to version: ${version}`);
  }
});

/**
 * Handle service worker startup
 * Restores any interrupted recording state
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log("Service worker started");

  // Sprint 4: Initialize walkthrough components on restart (if feature flag enabled)
  try {
    await initializeNewWalkthroughSystem();
    console.log("Walkthrough initialization complete (onStartup)");
  } catch (error) {
    console.error("Failed to initialize walkthrough components:", error);
  }

  try {
    // Check if there was an active recording before shutdown
    const recordingState = await getCurrentRecordingState();
    if (recordingState.isRecording) {
      console.warn("Detected interrupted recording. State preserved:", {
        workflowName: recordingState.workflowName,
        steps: recordingState.steps.length,
      });
    }
  } catch (error) {
    console.error("Failed to restore recording state:", error);
  }
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Route messages to appropriate handlers
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => {
    // Wrap in try-catch for top-level error handling
    try {
      return handleMessage(message, sender, sendResponse);
    } catch (error) {
      console.error("Unhandled error in message handler:", error);
      sendResponse({
        type: "ERROR",
        payload: {
          error:
            error instanceof Error ? error.message : "Unknown error occurred",
          context: "MESSAGE_HANDLER",
        },
      });
      return true;
    }
  },
);

// ============================================================================
// TAB EVENTS
// ============================================================================

/**
 * Track tab navigation during recording
 * This helps capture page transitions in workflows
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    console.log(`Tab ${tabId} loaded: ${tab.url}`);

    // Check if recording is active
    try {
      const recordingState = await getCurrentRecordingState();
      if (recordingState.isRecording) {
        console.log("Navigation detected during recording:", tab.url);
        // Future enhancement: Auto-capture navigation events
      }
    } catch (error) {
      console.error("Failed to check recording state on tab update:", error);
    }
  }
});

// ============================================================================
// GAP-001/GAP-002: WALKTHROUGH SESSION TAB EVENTS
// ============================================================================

/**
 * Handle tab removal (close)
 * Removes tab from session; ends session if all tabs closed
 * GAP-002: Multi-tab workflow support
 * Also handles recording tab close (auto-save)
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    // Check walkthrough session
    const { session, isPartOfSession } = await getSession(tabId);
    if (session && isPartOfSession) {
      console.log(
        `[Background] Tab ${tabId} closed during walkthrough session`,
      );
      await removeTabFromSession(tabId);
    }

    // Check recording session - auto-save on tab close
    const { session: recordingSession, isRecordingTab } =
      await getRecordingSession(tabId);
    if (recordingSession && isRecordingTab) {
      console.log(
        `[Background] Recording tab ${tabId} closed - auto-saving recording`,
      );
      await handleRecordingTabClose(recordingSession);
    }
  } catch (error) {
    console.error("[Background] Error handling tab removal:", error);
  }
});

/**
 * Handle navigation start in session tabs
 * Marks session as navigating to prevent premature restoration
 * GAP-001: Multi-page workflow support (walkthrough and recording)
 */
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only track main frame navigations (not iframes)
  if (details.frameId !== 0) return;

  try {
    // Check walkthrough session
    const { session, isPartOfSession } = await getSession(details.tabId);
    if (session && isPartOfSession) {
      console.log(
        `[Background] Navigation starting in walkthrough tab ${details.tabId}: ${details.url}`,
      );
      await handleNavigationStart(details.tabId, details.url);
    }

    // Check recording session
    const { session: recordingSession, isRecordingTab } =
      await getRecordingSession(details.tabId);
    if (recordingSession && isRecordingTab) {
      console.log(
        `[Background] Navigation starting in recording tab ${details.tabId}: ${details.url}`,
      );
      await handleRecordingNavigationStart(details.tabId, details.url);
    }
  } catch (error) {
    console.error("[Background] Error handling navigation start:", error);
  }
});

/**
 * Handle navigation complete in session tabs
 * Clears navigation flag so content script can restore
 * GAP-001: Multi-page workflow support (walkthrough and recording)
 */
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Only track main frame navigations (not iframes)
  if (details.frameId !== 0) return;

  try {
    // Check walkthrough session
    const { session, isPartOfSession } = await getSession(details.tabId);
    if (session && isPartOfSession) {
      console.log(
        `[Background] Navigation completed in walkthrough tab ${details.tabId}: ${details.url}`,
      );
      await handleNavigationComplete(details.tabId);
    }

    // Check recording session
    const { session: recordingSession, isRecordingTab } =
      await getRecordingSession(details.tabId);
    if (recordingSession && isRecordingTab) {
      console.log(
        `[Background] Navigation completed in recording tab ${details.tabId}: ${details.url}`,
      );
      await handleRecordingNavigationComplete(details.tabId, details.url);

      // Re-inject recorder content script for the new page
      // (Content scripts are destroyed on navigation, need to re-inject for multi-page recording)
      try {
        // Skip chrome:// and extension pages where injection is not allowed
        if (
          !details.url.startsWith("chrome://") &&
          !details.url.startsWith("chrome-extension://")
        ) {
          await chrome.scripting.executeScript({
            target: { tabId: details.tabId },
            files: ["content/recorder.js"],
          });
          console.log(
            `[Background] Re-injected recorder.js into tab ${details.tabId}`,
          );
        } else {
          console.log(
            `[Background] Skipping recorder injection for restricted page: ${details.url}`,
          );
        }
      } catch (injectionError) {
        // Log but don't crash - page might be restricted
        console.warn(
          `[Background] Failed to re-inject recorder.js into tab ${details.tabId}:`,
          injectionError,
        );
      }
    }
  } catch (error) {
    console.error("[Background] Error handling navigation complete:", error);
  }
});

/**
 * Handle new tab creation during walkthrough (e.g., OAuth popups, target="_blank")
 * Adds new tab to session for multi-tab support
 * GAP-002: Multi-tab workflow support
 */
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  try {
    // Check if source tab is part of a walkthrough session
    const { session, isPartOfSession } = await getSession(details.sourceTabId);
    if (session && isPartOfSession) {
      console.log(
        `[Background] New tab ${details.tabId} opened from session tab ${details.sourceTabId}`,
      );
      await addTabToSession(details.tabId);
    }
  } catch (error) {
    console.error("[Background] Error handling new tab creation:", error);
  }
});

// ============================================================================
// DEVELOPMENT UTILITIES
// ============================================================================

/**
 * Keep service worker alive in development mode
 * Prevents service worker from being terminated during debugging
 */
if (process.env.NODE_ENV === "development") {
  setInterval(() => {
    console.log("Service worker heartbeat");
  }, 20000);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Global error handler for unhandled promise rejections
 */
self.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection in service worker:", event.reason);
  event.preventDefault();
});

/**
 * Global error handler for uncaught errors
 */
self.addEventListener("error", (event) => {
  console.error("Uncaught error in service worker:", event.error);
  event.preventDefault();
});

// ============================================================================
// MULTI-PAGE RECORDING: AUTO-SAVE AND TIMEOUT
// ============================================================================

import type {
  RecordingSessionState,
  CreateWorkflowRequest,
} from "@/shared/types";
import { apiClient } from "@/shared/api";

/**
 * Handle recording tab close - auto-save the recording
 */
async function handleRecordingTabClose(
  session: RecordingSessionState,
): Promise<void> {
  console.log(
    `[Background] Auto-saving recording session ${session.sessionId} (${session.steps.length} steps)`,
  );

  // Only upload if there are steps
  if (session.steps.length > 0) {
    try {
      // Build workflow creation request
      const workflowRequest: CreateWorkflowRequest = {
        name: session.workflowName || "Auto-saved Recording",
        description: "Auto-saved on tab close or timeout",
        starting_url: session.startingUrl,
        tags: ["auto-saved"],
        steps: session.steps,
      };

      // Create workflow via API
      const workflowResponse = await apiClient.createWorkflow(workflowRequest);

      console.log(
        `[Background] ✅ Auto-saved recording. Workflow ID: ${workflowResponse.workflow_id}`,
      );

      // Note: Screenshots are stored in IndexedDB (screenshotStore.ts) and won't be
      // uploaded on auto-save. Full upload happens on normal stop only.
      // We don't check screenshot count here to avoid async complexity in tab close.
    } catch (error) {
      console.error("[Background] Error auto-saving recording:", error);
      // Store as failed upload for later retry would be ideal here
      // For now, just log the error
    }
  } else {
    console.log("[Background] No steps to save, skipping auto-save");
  }

  // End the session
  await endRecordingSession("tab_closed");
}

/**
 * Recording session timeout checker
 * Runs every 60 seconds to check for expired sessions
 */
setInterval(async () => {
  try {
    const expiredSession = await checkSessionTimeout();
    if (expiredSession) {
      console.log("[Background] Recording session timed out, auto-saving");
      await handleRecordingTabClose(expiredSession);
    }
  } catch (error) {
    console.error("[Background] Error checking session timeout:", error);
  }
}, 60000); // Check every 60 seconds
