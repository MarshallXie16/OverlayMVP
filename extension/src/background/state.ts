/**
 * State Management Module
 *
 * Coordinates recording state across the extension using chrome.storage.
 * Handles content script injection, state initialization, and cleanup.
 *
 * FE-003: Background Service Worker
 */

import {
  getRecordingState,
  saveRecordingState,
  clearRecordingState,
  createEmptyRecordingState,
} from "@/shared/storage";
import type { RecordingState, StepCreate } from "@/shared/types";

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Start a new recording session
 *
 * @param workflowName - Name of the workflow being recorded
 * @param startingUrl - URL where recording begins
 * @returns Promise resolving to initial recording state
 */
export async function startRecording(
  workflowName: string,
  startingUrl: string,
): Promise<RecordingState> {
  console.log(`Starting recording: "${workflowName}" at ${startingUrl}`);

  // Create initial recording state
  const recordingState: RecordingState = {
    isRecording: true,
    workflowId: null, // Will be set after workflow is created on backend
    workflowName,
    startingUrl,
    steps: [],
    currentStepNumber: 0,
  };

  // Save to storage
  await saveRecordingState(recordingState);

  // Inject content scripts into active tab
  await injectContentScripts();

  console.log("Recording started successfully");
  return recordingState;
}

/**
 * Stop the current recording session
 *
 * @returns Promise resolving to final recording state or null if not recording
 */
export async function stopRecording(): Promise<RecordingState | null> {
  console.log("Stopping recording...");

  const recordingState = await getRecordingState();

  if (!recordingState || !recordingState.isRecording) {
    console.warn("No active recording to stop");
    return null;
  }

  // Mark as stopped (but keep data for upload)
  recordingState.isRecording = false;
  await saveRecordingState(recordingState);

  console.log(
    `Recording stopped. Captured ${recordingState.steps.length} steps`,
  );
  return recordingState;
}

/**
 * Add a step to the current recording
 *
 * @param step - Step data to add
 * @returns Promise resolving to updated recording state
 */
export async function addStep(
  step: StepCreate,
): Promise<RecordingState | null> {
  const recordingState = await getRecordingState();

  if (!recordingState || !recordingState.isRecording) {
    console.error("Cannot add step: No active recording");
    return null;
  }

  // Add step to state
  recordingState.steps.push(step);
  recordingState.currentStepNumber = step.step_number;

  // Save updated state
  await saveRecordingState(recordingState);

  console.log(`Added step ${step.step_number} (${step.action_type})`);
  return recordingState;
}

/**
 * Set workflow ID after workflow is created on backend
 *
 * @param workflowId - ID of the created workflow
 * @returns Promise resolving to updated recording state
 */
export async function setWorkflowId(
  workflowId: number,
): Promise<RecordingState | null> {
  const recordingState = await getRecordingState();

  if (!recordingState) {
    console.error("Cannot set workflow ID: No recording state found");
    return null;
  }

  recordingState.workflowId = workflowId;
  await saveRecordingState(recordingState);

  console.log(`Workflow ID set to ${workflowId}`);
  return recordingState;
}

/**
 * Get current recording state
 *
 * @returns Promise resolving to current recording state or empty state if none exists
 */
export async function getCurrentRecordingState(): Promise<RecordingState> {
  const recordingState = await getRecordingState();
  return recordingState || createEmptyRecordingState();
}

/**
 * Clear all recording state (cleanup after upload)
 *
 * @returns Promise resolving when cleanup is complete
 */
export async function cleanupRecordingState(): Promise<void> {
  console.log("Cleaning up recording state...");
  await clearRecordingState();
  console.log("Recording state cleared");
}

// ============================================================================
// CONTENT SCRIPT INJECTION
// ============================================================================

/**
 * Inject content scripts into the active tab
 * Note: Content scripts are automatically injected via manifest.json.
 * This function ensures they are ready and sends activation message.
 *
 * @returns Promise resolving when scripts are activated
 */
async function injectContentScripts(): Promise<void> {
  try {
    console.log("[BackgroundState] Injecting content scripts...");

    // Get active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab || !activeTab.id) {
      console.error("[BackgroundState] No active tab found");
      throw new Error("No active tab found for content script activation");
    }

    console.log(
      `[BackgroundState] Active tab: ${activeTab.id}, URL: ${activeTab.url}`,
    );

    // Check if tab is recordable (can't record chrome:// pages)
    if (
      activeTab.url?.startsWith("chrome://") ||
      activeTab.url?.startsWith("chrome-extension://")
    ) {
      console.error(
        "[BackgroundState] Cannot record Chrome internal page:",
        activeTab.url,
      );
      throw new Error(
        "Cannot record Chrome internal pages. Please navigate to a regular webpage.",
      );
    }

    // Dynamically inject recorder content script (we no longer auto-inject via manifest)
    console.log(
      "[BackgroundState] Executing content/recorder.js in active tab",
    );
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ["content/recorder.js"],
    });

    // After injection, ask the recorder to start (ack immediate; work async in content)
    console.log(
      `[BackgroundState] Sending START_RECORDING message to tab ${activeTab.id}`,
    );
    let response: any | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        response = await chrome.tabs.sendMessage(activeTab.id, {
          type: "START_RECORDING",
        });
        console.log(
          `[BackgroundState] START_RECORDING response (attempt ${attempt}):`,
          response,
        );
        if (response && response.success) break;
      } catch (err) {
        console.warn(
          `[BackgroundState] START_RECORDING attempt ${attempt} failed:`,
          err,
        );
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!response || !response.success) {
      console.warn(
        "[BackgroundState] No ACK from recorder; invoking __overlayRecorderStart directly",
      );
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            try {
              // @ts-ignore
              if (window.__overlayRecorderStart) {
                // @ts-ignore
                window.__overlayRecorderStart();
                return { invoked: true };
              }
              return { invoked: false, reason: "no_global" };
            } catch (e) {
              return { invoked: false, error: String(e) };
            }
          },
        });
        const result = results?.[0]?.result;
        console.log(
          "[BackgroundState] __overlayRecorderStart invocation result:",
          result,
        );
        if (!result?.invoked) {
          throw new Error(
            `Recorder global start not available (${(result as any)?.reason || (result as any)?.error || "unknown"})`,
          );
        }
      } catch (e) {
        throw new Error(
          "Recorder did not acknowledge START_RECORDING and direct invocation failed",
        );
      }
    } else {
      console.log("[BackgroundState] Recorder acknowledged start");
    }
  } catch (error) {
    console.error(
      "[BackgroundState] Failed to activate content scripts:",
      error,
    );

    // Provide helpful error message
    if (error instanceof Error) {
      // Content script not ready yet (page just loaded or needs refresh)
      if (error.message.includes("Receiving end does not exist")) {
        throw new Error(
          "Content script not ready. Please refresh the page and try again.",
        );
      }

      // Chrome internal or restricted pages
      if (
        error.message.includes("Cannot access") ||
        error.message.includes("Cannot record")
      ) {
        throw new Error(
          "Cannot record this page. Please start recording from a regular webpage " +
            "(not chrome://, chrome-extension://, or other restricted URLs).",
        );
      }
    }

    throw error;
  }
}
