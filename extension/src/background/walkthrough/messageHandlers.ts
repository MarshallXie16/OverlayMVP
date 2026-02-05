/**
 * Sprint 4 Message Handlers
 *
 * Handles walkthrough messages from content scripts and routes them
 * to SessionManager and StepRouter.
 *
 * Message types handled:
 * - WALKTHROUGH_COMMAND: Route navigation commands (NEXT, PREV, JUMP_TO, etc.)
 * - WALKTHROUGH_TAB_READY: Content script ready signal
 * - WALKTHROUGH_ELEMENT_STATUS: Element found/not found report
 * - GET_TAB_ID: Simple tab ID query
 * - SPA_NAVIGATION: SPA URL change detection
 */

import { sessionManager } from "./SessionManager";
import { StepRouter } from "./StepRouter";
import {
  ADVANCE_DELAY_CLICK,
  ADVANCE_DELAY_DEFAULT,
  ADVANCE_DELAY_INPUT,
  ADVANCE_DELAY_SELECT,
  WALKTHROUGH_MESSAGE_TYPES,
  isWalkthroughMessage,
  type WalkthroughCommandMessage,
  type WalkthroughTabReadyMessage,
  type WalkthroughElementStatusMessage,
  type WalkthroughHealingResultMessage,
  type WalkthroughExecutionLogMessage,
  type WalkthroughTabReadyResponse,
  type WalkthroughCommandResponse,
} from "../../shared/walkthrough";

// ============================================================================
// ROUTER INSTANCE
// ============================================================================

const stepRouter = new StepRouter(sessionManager, { debug: true });

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

function getAdvanceDelay(
  actionType: "click" | "input_commit" | "select_change" | "submit" | "copy",
  causesNavigation: boolean,
): number {
  // Navigation-causing actions should advance immediately (content script may be torn down)
  if (causesNavigation || actionType === "submit") {
    return 0;
  }

  switch (actionType) {
    case "click":
      return ADVANCE_DELAY_CLICK;
    case "select_change":
      return ADVANCE_DELAY_SELECT;
    case "input_commit":
      return ADVANCE_DELAY_INPUT;
    case "copy":
      return ADVANCE_DELAY_DEFAULT;
    default:
      return ADVANCE_DELAY_DEFAULT;
  }
}

/**
 * Handle Sprint 4 walkthrough messages
 *
 * @returns true if message was handled, false to pass to other handlers
 */
export async function handleWalkthroughMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): Promise<boolean> {
  // W-026.3: Ensure SessionManager is initialized before handling messages
  // This prevents race conditions where messages arrive before background fully starts.
  // initialize() is idempotent - returns early if already initialized.
  await sessionManager.initialize();

  // Check if this is a walkthrough message
  if (!isWalkthroughMessage(message)) {
    // Also handle GET_TAB_ID which isn't in the walkthrough message protocol
    if (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: string }).type === "GET_TAB_ID"
    ) {
      handleGetTabId(sender, sendResponse);
      return true;
    }
    // Also handle SPA_NAVIGATION
    if (
      typeof message === "object" &&
      message !== null &&
      (message as { type?: string }).type === "SPA_NAVIGATION"
    ) {
      await handleSpaNavigation(
        message as { url: string },
        sender,
        sendResponse,
      );
      return true;
    }
    return false;
  }

  // Route to appropriate handler
  switch (message.type) {
    case WALKTHROUGH_MESSAGE_TYPES.COMMAND:
      await handleCommand(message, sender, sendResponse);
      return true;

    case WALKTHROUGH_MESSAGE_TYPES.TAB_READY:
      await handleTabReady(message, sender, sendResponse);
      return true;

    case WALKTHROUGH_MESSAGE_TYPES.ELEMENT_STATUS:
      await handleElementStatus(message, sender, sendResponse);
      return true;

    case WALKTHROUGH_MESSAGE_TYPES.HEALING_RESULT:
      await handleHealingResult(message, sendResponse);
      return true;

    case WALKTHROUGH_MESSAGE_TYPES.EXECUTION_LOG:
      await handleExecutionLog(message, sendResponse);
      return true;

    default:
      return false;
  }
}

// ============================================================================
// COMMAND HANDLER
// ============================================================================

async function handleCommand(
  message: WalkthroughCommandMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: WalkthroughCommandResponse) => void,
): Promise<void> {
  const { command, payload } = message;
  console.log(`[WalkthroughHandler] Command: ${command}`, payload);

  try {
    switch (command) {
      case "START": {
        // START is handled by existing handleStartWalkthrough in messaging.ts
        // This is for content script to query, not initiate
        sendResponse({
          success: false,
          error: "Use START_WALKTHROUGH message to initiate",
        });
        break;
      }

      case "NEXT": {
        const result = await stepRouter.next();
        const state = await sessionManager.getState();
        sendResponse({ success: result.success, state: state ?? undefined });
        break;
      }

      case "PREV": {
        const result = await stepRouter.previous();
        const state = await sessionManager.getState();
        sendResponse({ success: result.success, state: state ?? undefined });
        break;
      }

      case "JUMP_TO": {
        const jumpPayload = payload as { stepIndex: number };
        const result = await stepRouter.jumpToStep(jumpPayload.stepIndex);
        const state = await sessionManager.getState();
        sendResponse({ success: result.success, state: state ?? undefined });
        break;
      }

      case "RETRY": {
        const result = await stepRouter.retry();
        const state = await sessionManager.getState();
        sendResponse({ success: result.success, state: state ?? undefined });
        break;
      }

      case "SKIP": {
        await sessionManager.dispatch({ type: "SKIP_STEP" });
        const state = await sessionManager.getState();
        sendResponse({ success: true, state: state ?? undefined });
        break;
      }

      case "EXIT": {
        const exitPayload = payload as { reason?: string };
        const reason =
          exitPayload.reason === "timeout" ||
          exitPayload.reason === "error" ||
          exitPayload.reason === "user_exit"
            ? exitPayload.reason
            : "user_exit";
        await sessionManager.endSession(reason);
        sendResponse({ success: true });
        break;
      }

      case "GET_STATE": {
        const state = await sessionManager.getState();
        sendResponse({
          success: true,
          state: state ?? undefined,
        });
        break;
      }

      case "REPORT_ACTION": {
        const actionPayload = payload as {
          stepIndex: number;
          actionType: string;
          valid: boolean;
          reason?: string;
          causesNavigation?: boolean;
        };

        const stateBefore = await sessionManager.getState();
        if (!stateBefore) {
          sendResponse({ success: false, error: "No active session" });
          break;
        }

        // Guard against stale content script messages (e.g. navigation teardown / rapid step jumps).
        // Only accept action reports for the currently active step.
        if (stateBefore.currentStepIndex !== actionPayload.stepIndex) {
          console.log(
            `[WalkthroughHandler] Ignoring REPORT_ACTION for stale stepIndex=${actionPayload.stepIndex} (current=${stateBefore.currentStepIndex})`,
          );
          sendResponse({ success: true, state: stateBefore });
          break;
        }

        if (actionPayload.valid) {
          // Map action type to expected format
          const actionType = actionPayload.actionType as
            | "click"
            | "input_commit"
            | "select_change"
            | "submit"
            | "copy";

          const delay = getAdvanceDelay(
            actionType,
            actionPayload.causesNavigation ?? false,
          );

          await sessionManager.dispatch({
            type: "ACTION_DETECTED",
            stepIndex: actionPayload.stepIndex,
            actionType,
          });

          // Schedule NEXT_STEP in background so advancement isn't tied to the content script lifecycle.
          // Safety check prevents stray advances if user manually navigates/jumps meanwhile.
          const scheduledState = await sessionManager.getState();
          const scheduledSessionId = scheduledState?.sessionId ?? null;
          const scheduledStepIndex = scheduledState?.currentStepIndex ?? null;

          const maybeAdvance = async () => {
            try {
              const current = await sessionManager.getState();
              if (!current || !scheduledSessionId) return;

              if (current.sessionId !== scheduledSessionId) return;
              if (
                scheduledStepIndex === null ||
                current.currentStepIndex !== scheduledStepIndex
              ) {
                return;
              }

              // Navigation can begin immediately after action detection.
              // Allow advancing while TRANSITIONING (normal) or NAVIGATING (race ordering).
              if (
                current.machineState !== "TRANSITIONING" &&
                current.machineState !== "NAVIGATING"
              ) {
                return;
              }

              await sessionManager.dispatch({ type: "NEXT_STEP" });
            } catch (error) {
              console.warn(
                "[WalkthroughHandler] Failed to auto-advance NEXT_STEP:",
                error,
              );
            }
          };

          // For navigation-causing actions (delay=0), advance immediately so that a following
          // URL_CHANGED can be attributed to a potential "navigate" step (and auto-completed).
          if (delay === 0) {
            await maybeAdvance();
          } else {
            setTimeout(() => {
              void maybeAdvance();
            }, delay);
          }
        } else {
          // Map reason to expected format, default to "wrong_action"
          const reason =
            actionPayload.reason === "wrong_element" ||
            actionPayload.reason === "wrong_action" ||
            actionPayload.reason === "no_value_change" ||
            actionPayload.reason === "wrong_value" ||
            actionPayload.reason === "invalid_target"
              ? actionPayload.reason
              : "wrong_action";

          await sessionManager.dispatch({
            type: "ACTION_INVALID",
            stepIndex: actionPayload.stepIndex,
            reason,
          });
        }
        const state = await sessionManager.getState();
        sendResponse({ success: true, state: state ?? undefined });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown command: ${command}` });
    }
  } catch (error) {
    console.error(`[WalkthroughHandler] Command ${command} failed:`, error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Command failed",
    });
  }
}

// ============================================================================
// TAB READY HANDLER
// ============================================================================

async function handleTabReady(
  message: WalkthroughTabReadyMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: WalkthroughTabReadyResponse) => void,
): Promise<void> {
  // Use sender.tab.id instead of message.tabId for security
  const tabId = sender.tab?.id;
  const url = message.url;

  console.log(`[WalkthroughHandler] TAB_READY from tab ${tabId}: ${url}`);

  if (!tabId) {
    sendResponse({ hasActiveSession: false });
    return;
  }

  try {
    // First check if there's any active session at all
    const globalState = await sessionManager.getState();

    // Check if this tab is part of an active session
    const { state, shouldRestore } = await sessionManager.getStateForTab(tabId);

    // Bug fix: Primary tab should ALWAYS restore, even if not in activeTabIds
    // This handles same-tab navigation where the tab ID stays the same but
    // the content script is reloaded. Without this, the session appears lost.
    const isPrimaryTab = globalState?.tabs.primaryTabId === tabId;
    const hasActiveSession = globalState !== null;

    if (shouldRestore && state) {
      // Normal case: tab is in activeTabIds
      await sessionManager.dispatch({ type: "TAB_READY", tabId, url });

      const currentState = await sessionManager.getState();
      sendResponse({
        hasActiveSession: true,
        state: currentState ?? undefined,
      });
    } else if (isPrimaryTab && hasActiveSession) {
      // Bug fix: Primary tab not in activeTabIds - add it back and restore
      console.log(
        `[WalkthroughHandler] Primary tab ${tabId} not in activeTabIds, adding back`,
      );
      await sessionManager.addTab(tabId);
      await sessionManager.dispatch({ type: "TAB_READY", tabId, url });

      const currentState = await sessionManager.getState();
      sendResponse({
        hasActiveSession: true,
        state: currentState ?? undefined,
      });
    } else {
      sendResponse({ hasActiveSession: false });
    }
  } catch (error) {
    console.error("[WalkthroughHandler] TAB_READY failed:", error);
    sendResponse({ hasActiveSession: false });
  }
}

// ============================================================================
// ELEMENT STATUS HANDLER
// ============================================================================

async function handleElementStatus(
  message: WalkthroughElementStatusMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { success: boolean }) => void,
): Promise<void> {
  const tabId = sender.tab?.id;
  const { stepIndex, found } = message;

  console.log(
    `[WalkthroughHandler] ELEMENT_STATUS from tab ${tabId}: step ${stepIndex}, found=${found}`,
  );

  if (!tabId) {
    sendResponse({ success: false });
    return;
  }

  try {
    const state = await sessionManager.getState();
    if (!state) {
      sendResponse({ success: false });
      return;
    }

    // Guard against stale element status reports from old renders or torn-down content scripts.
    // Only accept element status for the currently showing step.
    if (
      state.machineState !== "SHOWING_STEP" ||
      state.currentStepIndex !== stepIndex
    ) {
      console.log(
        `[WalkthroughHandler] Ignoring ELEMENT_STATUS for step ${stepIndex} (current=${state.currentStepIndex}, machineState=${state.machineState})`,
      );
      sendResponse({ success: true });
      return;
    }

    if (found) {
      // ELEMENT_FOUND event only needs stepIndex (per events.ts spec)
      await sessionManager.dispatch({
        type: "ELEMENT_FOUND",
        stepIndex,
      });
    } else {
      // ELEMENT_NOT_FOUND event only needs stepIndex (per events.ts spec)
      await sessionManager.dispatch({
        type: "ELEMENT_NOT_FOUND",
        stepIndex,
      });
    }
    sendResponse({ success: true });
  } catch (error) {
    console.error("[WalkthroughHandler] ELEMENT_STATUS failed:", error);
    sendResponse({ success: false });
  }
}

// ============================================================================
// HEALING RESULT HANDLER
// ============================================================================

async function handleHealingResult(
  message: WalkthroughHealingResultMessage,
  sendResponse: (response: { success: boolean }) => void,
): Promise<void> {
  const { result, stepIndex } = message;

  console.log(
    `[WalkthroughHandler] HEALING_RESULT: success=${result.success}, confidence=${result.confidence}`,
  );

  try {
    const state = await sessionManager.getState();
    if (!state) {
      sendResponse({ success: false });
      return;
    }

    // Guard against duplicate or stale healing results.
    // Only accept healing result for the currently healing step.
    if (state.machineState !== "HEALING" || state.currentStepIndex !== stepIndex) {
      console.log(
        `[WalkthroughHandler] Ignoring HEALING_RESULT for step ${stepIndex} (current=${state.currentStepIndex}, machineState=${state.machineState})`,
      );
      sendResponse({ success: true });
      return;
    }

    if (result.success) {
      await sessionManager.dispatch({
        type: "HEAL_SUCCESS",
        stepIndex,
        confidence: result.confidence,
        aiValidated: result.aiValidated,
      });
    } else {
      await sessionManager.dispatch({
        type: "HEAL_FAILED",
        stepIndex,
        reason: result.failureReason ?? "No suitable element found",
      });
    }
    sendResponse({ success: true });
  } catch (error) {
    console.error("[WalkthroughHandler] HEALING_RESULT failed:", error);
    sendResponse({ success: false });
  }
}

// ============================================================================
// EXECUTION LOG HANDLER
// ============================================================================

/**
 * Handle execution log messages from content scripts
 *
 * These logs are used for analytics and debugging. Currently just logged to console.
 * Future: Forward to backend API for persistence and analytics.
 */
async function handleExecutionLog(
  message: WalkthroughExecutionLogMessage,
  sendResponse: (response: { success: boolean }) => void,
): Promise<void> {
  const { entry } = message;

  console.log(
    `[WalkthroughHandler] EXECUTION_LOG: ${entry.eventType} (step ${entry.stepIndex})`,
    entry.details,
  );

  // TODO: Forward to backend API for persistence
  // For now, just acknowledge receipt
  sendResponse({ success: true });
}

// ============================================================================
// GET_TAB_ID HANDLER
// ============================================================================

function handleGetTabId(
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { tabId: number | null }) => void,
): void {
  const tabId = sender.tab?.id ?? null;
  console.log(`[WalkthroughHandler] GET_TAB_ID: ${tabId}`);
  sendResponse({ tabId });
}

// ============================================================================
// SPA NAVIGATION HANDLER
// ============================================================================

async function handleSpaNavigation(
  message: { url: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: { success: boolean }) => void,
): Promise<void> {
  const tabId = sender.tab?.id;
  const { url } = message;

  console.log(`[WalkthroughHandler] SPA_NAVIGATION from tab ${tabId}: ${url}`);

  if (!tabId) {
    sendResponse({ success: false });
    return;
  }

  try {
    // Check if this tab is part of an active session
    const { state, shouldRestore } = await sessionManager.getStateForTab(tabId);

    if (shouldRestore && state) {
      // Dispatch URL_CHANGED event for SPA navigation
      await sessionManager.dispatch({
        type: "URL_CHANGED",
        tabId,
        url,
      });

      // SPA navigation: page is already loaded (no actual page reload occurred),
      // so dispatch PAGE_LOADED immediately to exit NAVIGATING state.
      // Without this, the state machine would strand in NAVIGATING forever
      // since webNavigation.onCompleted never fires for client-side routing.
      await sessionManager.dispatch({
        type: "PAGE_LOADED",
        tabId,
        url,
      });
    }
    sendResponse({ success: true });
  } catch (error) {
    console.error("[WalkthroughHandler] SPA_NAVIGATION failed:", error);
    sendResponse({ success: false });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { sessionManager, stepRouter };
