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
  getSessionForTab,
  updateSession,
  handleNavigationComplete,
} from "./walkthroughSession";

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
      handleCaptureScreenshot(message, sendResponse);
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

    // Start recording
    const recordingState = await startRecording(workflowName, startingUrl);

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
    // Get recording state
    recordingState = await stopRecording();

    if (!recordingState) {
      throw new Error("No active recording to stop");
    }

    // Get steps and screenshots from message payload (sent from content script)
    const payload = message.payload || {};
    const steps = payload.steps || recordingState.steps || [];
    const screenshots = payload.screenshots || [];

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

    // Step 2: Upload screenshots with workflow_id (in background, don't block response)
    if (screenshots.length > 0) {
      uploadScreenshotsAsync(workflowResponse.workflow_id, screenshots)
        .then(() => {
          console.log(
            `✅ All ${screenshots.length} screenshots uploaded and linked successfully`,
          );
        })
        .catch((error) => {
          console.error("❌ Screenshot upload/linking failed:", error);
          // Don't fail the whole workflow creation - screenshots can be retried later
        });
    }

    // Clean up recording state
    await cleanupRecordingState();

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
 * Handle START_WALKTHROUGH message
 * Fetches workflow from API and sends to content script
 * EXT-001: Walkthrough Messaging & Data Loading
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

    console.log(`[Background] Starting walkthrough for workflow ${workflowId}`);

    // Fetch workflow from API
    const workflow = await apiClient.getWorkflow(workflowId);

    console.log(
      `[Background] Fetched workflow "${workflow.name}" with ${workflow.steps.length} steps`,
    );

    // Validate workflow has steps
    if (!workflow.steps || workflow.steps.length === 0) {
      throw new Error("Workflow has no steps");
    }

    // Get the active tab (where dashboard opened the URL)
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]?.id) {
      throw new Error("No active tab found");
    }

    const tabId = tabs[0].id;

    // GAP-001: Create walkthrough session for multi-page persistence
    const session = await startSession(workflow, tabId);
    console.log(
      `[Background] Created walkthrough session: ${session.sessionId}`,
    );

    // Ensure walkthrough content script is injected before messaging
    console.log(
      "[Background] Injecting walkthrough content script into tab",
      tabId,
    );
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/walkthrough.js"],
    });

    // Send workflow data with retries in case listener init lags
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
          `[Background] WALKTHROUGH_DATA ack (attempt ${attempt}):`,
          response,
        );
        break;
      } catch (err) {
        console.warn(
          `[Background] WALKTHROUGH_DATA attempt ${attempt} failed:`,
          err,
        );
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    // Respond to dashboard immediately
    sendResponse({
      type: "START_WALKTHROUGH",
      payload: {
        success: true,
        workflowId: workflow.id,
        workflowName: workflow.name,
        stepCount: workflow.steps.length,
      },
    });
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
 * Captures screenshot of active tab
 */
async function handleCaptureScreenshot(
  _message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const result = await captureScreenshot();

    if ("error" in result) {
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
