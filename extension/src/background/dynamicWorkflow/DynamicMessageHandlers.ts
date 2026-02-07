/**
 * Dynamic Workflow Message Handlers
 *
 * Routes messages between content script / popup and DynamicSessionManager.
 *
 * Message types handled:
 * - DYNAMIC_COMMAND: Route workflow commands (START, REPORT_ACTION, FEEDBACK, etc.)
 * - DYNAMIC_TAB_READY: Content script ready signal for session restoration
 * - DYNAMIC_REPORT_CONTEXT: Page context report triggering next step generation
 *
 * Returns true if the message was handled (async response pending),
 * false if the message is not a dynamic workflow message.
 */

import { dynamicSessionManager } from "./DynamicSessionManager";
import {
  isDynamicCommandMessage,
  isDynamicTabReadyMessage,
  isDynamicReportContextMessage,
} from "../../shared/dynamicWorkflow/types";
import type {
  DynamicCommandMessage,
  DynamicTabReadyMessage,
  DynamicReportContextMessage,
  DynamicCommandResponse,
  DynamicTabReadyResponse,
  CompletedStepSummary,
} from "../../shared/dynamicWorkflow/types";

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle incoming dynamic workflow messages.
 *
 * This function is designed to be called from the background service worker's
 * chrome.runtime.onMessage listener. It checks if the message is a dynamic
 * workflow message and handles it if so.
 *
 * @returns true if the message was handled (caller should return true for async response),
 *          false if the message is not a dynamic workflow message
 */
export async function handleDynamicMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): Promise<boolean> {
  // Ensure session manager is initialized before handling messages.
  // This prevents race conditions where messages arrive before background fully starts.
  // initialize() is idempotent - returns early if already initialized.
  await dynamicSessionManager.initialize();

  // Handle DYNAMIC_COMMAND messages
  if (isDynamicCommandMessage(message)) {
    await handleCommand(message, sender, sendResponse);
    return true;
  }

  // Handle DYNAMIC_TAB_READY messages
  if (isDynamicTabReadyMessage(message)) {
    await handleTabReady(message, sender, sendResponse);
    return true;
  }

  // Handle DYNAMIC_REPORT_CONTEXT messages
  if (isDynamicReportContextMessage(message)) {
    await handleReportContext(message, sender, sendResponse);
    return true;
  }

  return false; // not a dynamic workflow message
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================

/**
 * Handle DYNAMIC_COMMAND messages.
 *
 * Routes commands from content script or popup to the appropriate
 * DynamicSessionManager method.
 *
 * Supported commands:
 * - START: Begin a new dynamic workflow
 * - GET_STATE: Query current workflow state
 * - CONFIRM_ENTITIES: Confirm extracted entities from goal
 * - REPORT_ACTION: Report that user completed a step action
 * - FEEDBACK: Submit user correction/feedback for current step
 * - SKIP: Skip the current step
 * - EXIT: End the workflow session
 */
async function handleCommand(
  message: DynamicCommandMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: DynamicCommandResponse) => void,
): Promise<void> {
  const { command, payload } = message;
  console.log(`[DynamicHandler] Command: ${command}`, payload);

  try {
    switch (command) {
      case "START": {
        const startPayload = payload as
          | { goal: string; tabId?: number }
          | undefined;
        if (!startPayload?.goal) {
          sendResponse({
            success: false,
            error: "Missing goal in START payload",
          });
          return;
        }
        // Prefer sender.tab.id (content script), fall back to payload.tabId (popup)
        let tabId = sender.tab?.id;
        if (!tabId && startPayload.tabId) {
          // Validate the tab ID from the payload (popup-provided)
          try {
            await chrome.tabs.get(startPayload.tabId);
            tabId = startPayload.tabId;
          } catch {
            sendResponse({
              success: false,
              error: "Invalid tab ID provided in payload",
            });
            return;
          }
        }
        if (!tabId) {
          sendResponse({
            success: false,
            error:
              "No tab ID. Provide tabId in payload or send from a content script.",
          });
          return;
        }
        const state = await dynamicSessionManager.startSession(
          startPayload.goal,
          tabId,
        );
        sendResponse({ success: true, state });
        break;
      }

      case "GET_STATE": {
        const state = await dynamicSessionManager.getState();
        sendResponse({
          success: true,
          state: state ?? undefined,
        });
        break;
      }

      case "CONFIRM_ENTITIES": {
        const entitiesPayload = payload as
          | { entities: Record<string, string> }
          | undefined;
        if (!entitiesPayload?.entities) {
          sendResponse({
            success: false,
            error: "Missing entities in CONFIRM_ENTITIES payload",
          });
          return;
        }
        const state = await dynamicSessionManager.confirmEntities(
          entitiesPayload.entities,
        );
        sendResponse({ success: true, state });
        break;
      }

      case "REPORT_ACTION": {
        const actionPayload = payload as Record<string, unknown> | undefined;
        if (!actionPayload) {
          sendResponse({
            success: false,
            error: "Missing payload in REPORT_ACTION",
          });
          return;
        }

        // Handle different sub-types of action reports
        if (actionPayload.type === "ELEMENT_FOUND") {
          const state = await dynamicSessionManager.dispatch({
            type: "ELEMENT_FOUND",
          });
          sendResponse({ success: true, state });
        } else if (actionPayload.type === "ELEMENT_NOT_FOUND") {
          const state = await dynamicSessionManager.dispatch({
            type: "ELEMENT_NOT_FOUND",
            reason: (actionPayload.reason as string) || "Element not found",
          });
          sendResponse({ success: true, state });
        } else if (actionPayload.type === "RETRY") {
          const state = await dynamicSessionManager.dispatch({
            type: "RETRY",
          });
          sendResponse({ success: true, state });
        } else if (actionPayload.summary) {
          // User completed the action - report step summary
          const state = await dynamicSessionManager.reportAction(
            actionPayload.summary as CompletedStepSummary,
          );
          sendResponse({ success: true, state });
        } else {
          sendResponse({
            success: false,
            error: "Unknown REPORT_ACTION payload format",
          });
        }
        break;
      }

      case "FEEDBACK": {
        const feedbackPayload = payload as
          | { correctionText: string }
          | undefined;
        if (!feedbackPayload?.correctionText) {
          sendResponse({
            success: false,
            error: "Missing correctionText in FEEDBACK payload",
          });
          return;
        }
        const state = await dynamicSessionManager.reportFeedback(
          feedbackPayload.correctionText,
        );
        sendResponse({ success: true, state });
        break;
      }

      case "SKIP": {
        const state = await dynamicSessionManager.dispatch({
          type: "SKIP_STEP",
        });
        sendResponse({ success: true, state });
        break;
      }

      case "EXIT": {
        const exitPayload = payload as { reason?: string } | undefined;
        await dynamicSessionManager.endSession(
          exitPayload?.reason ?? "user_exit",
        );
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({
          success: false,
          error: `Unknown dynamic workflow command: ${command}`,
        });
    }
  } catch (error) {
    console.error(`[DynamicHandler] Command ${command} failed:`, error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Command failed",
    });
  }
}

// ============================================================================
// TAB READY HANDLER
// ============================================================================

/**
 * Handle DYNAMIC_TAB_READY messages.
 *
 * When a content script loads (or reloads after navigation), it sends this message
 * to check if there's an active dynamic workflow session to restore.
 */
async function handleTabReady(
  message: DynamicTabReadyMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: DynamicTabReadyResponse) => void,
): Promise<void> {
  // Use sender.tab.id instead of message.tabId for security
  const tabId = sender.tab?.id;
  const url = message.url;

  console.log(`[DynamicHandler] TAB_READY from tab ${tabId}: ${url}`);

  if (!tabId) {
    sendResponse({ hasActiveSession: false });
    return;
  }

  try {
    // Check if there's any active session at all
    const globalState = await dynamicSessionManager.getState();

    // Check if this tab is part of an active session
    const { state, shouldRestore } =
      await dynamicSessionManager.getStateForTab(tabId);

    // Primary tab should always restore, even if not in activeTabIds.
    // This handles same-tab navigation where the tab ID stays the same but
    // the content script is reloaded.
    const isPrimaryTab = globalState?.tabs.primaryTabId === tabId;
    const hasActiveSession = globalState !== null;

    if (shouldRestore && state) {
      // Normal case: tab is in activeTabIds
      // If the FSM is in NAVIGATING state, dispatch TAB_READY to transition to CAPTURING
      if (state.machineState === "NAVIGATING") {
        console.log(
          `[DynamicHandler] Tab ${tabId} ready while NAVIGATING, dispatching TAB_READY`,
        );
        const updatedState = await dynamicSessionManager.dispatch({
          type: "TAB_READY",
          tabId,
        });
        sendResponse({
          hasActiveSession: true,
          state: updatedState,
        });
      } else {
        sendResponse({
          hasActiveSession: true,
          state,
        });
      }
    } else if (isPrimaryTab && hasActiveSession) {
      // Primary tab not in activeTabIds - add it back and restore
      console.log(
        `[DynamicHandler] Primary tab ${tabId} not in activeTabIds, adding back`,
      );
      await dynamicSessionManager.addTab(tabId);
      const currentState = await dynamicSessionManager.getState();

      // Also handle NAVIGATING state for primary tab
      if (currentState?.machineState === "NAVIGATING") {
        console.log(
          `[DynamicHandler] Primary tab ${tabId} ready while NAVIGATING, dispatching TAB_READY`,
        );
        const updatedState = await dynamicSessionManager.dispatch({
          type: "TAB_READY",
          tabId,
        });
        sendResponse({
          hasActiveSession: true,
          state: updatedState,
        });
      } else {
        sendResponse({
          hasActiveSession: true,
          state: currentState ?? undefined,
        });
      }
    } else {
      sendResponse({ hasActiveSession: false });
    }
  } catch (error) {
    console.error("[DynamicHandler] TAB_READY failed:", error);
    sendResponse({ hasActiveSession: false });
  }
}

// ============================================================================
// REPORT CONTEXT HANDLER
// ============================================================================

/**
 * Handle DYNAMIC_REPORT_CONTEXT messages.
 *
 * When the content script has captured the page context (DOM snapshot),
 * it sends this message to trigger AI step generation via the backend.
 */
async function handleReportContext(
  message: DynamicReportContextMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: DynamicCommandResponse) => void,
): Promise<void> {
  console.log(
    `[DynamicHandler] REPORT_CONTEXT: ${message.url} (${message.elementCount} elements)`,
  );

  try {
    const state = await dynamicSessionManager.requestNextStep(
      message.pageContextText,
      message.url,
      message.title,
      message.elementCount,
    );
    sendResponse({ success: true, state });
  } catch (error) {
    console.error("[DynamicHandler] REPORT_CONTEXT failed:", error);
    sendResponse({
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to process context",
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { dynamicSessionManager };
