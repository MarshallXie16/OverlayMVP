/**
 * Message Routing Module
 *
 * Routes messages between popup, content scripts, and background service worker.
 * Handles recording lifecycle, screenshot capture, and state queries.
 *
 * FE-003: Background Service Worker
 */

import type { ExtensionMessage } from '@/shared/types';
import { apiClient } from '@/shared/api';
import { captureScreenshot } from './screenshot';
import {
  startRecording,
  stopRecording,
  getCurrentRecordingState,
  cleanupRecordingState,
} from './state';

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
  sendResponse: (response?: any) => void
): boolean {
  console.log('Message received:', message.type, 'from', sender.tab ? `tab ${sender.tab.id}` : 'extension');

  // Route to appropriate handler
  switch (message.type) {
    case 'PING':
      handlePing(message, sendResponse);
      break;

    case 'START_RECORDING':
      handleStartRecording(message, sendResponse);
      break;

    case 'STOP_RECORDING':
      handleStopRecording(message, sendResponse);
      break;

    case 'CAPTURE_SCREENSHOT':
      handleCaptureScreenshot(message, sendResponse);
      break;

    case 'GET_RECORDING_STATE':
      handleGetRecordingState(message, sendResponse);
      break;

    default:
      console.warn('Unknown message type:', message.type);
      sendResponse({
        type: 'ERROR',
        payload: { error: 'Unknown message type', messageType: message.type },
      });
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
  sendResponse: (response?: any) => void
): void {
  sendResponse({
    type: 'PONG',
    payload: { timestamp: Date.now() },
  });
}

/**
 * Handle START_RECORDING message
 * Initializes recording state and injects content scripts
 */
async function handleStartRecording(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    const { workflowName, startingUrl } = message.payload || {};

    // Validate payload
    if (!workflowName || typeof workflowName !== 'string') {
      throw new Error('workflowName is required and must be a string');
    }

    if (!startingUrl || typeof startingUrl !== 'string') {
      throw new Error('startingUrl is required and must be a string');
    }

    // Start recording
    const recordingState = await startRecording(workflowName, startingUrl);

    sendResponse({
      type: 'START_RECORDING',
      payload: {
        success: true,
        recordingState,
      },
    });
  } catch (error) {
    console.error('Failed to start recording:', error);
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Failed to start recording',
        context: 'START_RECORDING',
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
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    // Get recording state
    const recordingState = await stopRecording();

    if (!recordingState) {
      throw new Error('No active recording to stop');
    }

    // Get steps and screenshots from message payload (sent from content script)
    const payload = message.payload || {};
    const steps = payload.steps || recordingState.steps || [];
    const screenshots = payload.screenshots || [];

    console.log(`Uploading workflow "${recordingState.workflowName}" with ${steps.length} steps and ${screenshots.length} screenshots`);

    // Validate that we have at least one step
    if (steps.length === 0) {
      console.error('[BackgroundMessaging] Cannot create workflow with 0 steps');
      throw new Error('No steps were recorded. Please try recording again and interact with the page.');
    }

    // Build workflow creation request
    const workflowRequest = {
      name: recordingState.workflowName || 'Untitled Workflow',
      description: null,
      starting_url: payload.startingUrl || recordingState.startingUrl || '',
      tags: [],
      steps: steps, // Steps with screenshot_id=null
    };

    console.log('[BackgroundMessaging] Creating workflow with request:', {
      name: workflowRequest.name,
      starting_url: workflowRequest.starting_url,
      stepCount: workflowRequest.steps.length,
      firstStep: workflowRequest.steps[0],
    });

    // Step 1: Create workflow first (to get workflow_id)
    const workflowResponse = await apiClient.createWorkflow(workflowRequest);

    console.log('[BackgroundMessaging] Workflow created successfully:', workflowResponse);

    // Step 2: Upload screenshots with workflow_id (in background, don't block response)
    if (screenshots.length > 0) {
      uploadScreenshotsAsync(workflowResponse.workflow_id, screenshots)
        .then(() => {
          console.log(`✅ All ${screenshots.length} screenshots uploaded and linked successfully`);
        })
        .catch((error) => {
          console.error('❌ Screenshot upload/linking failed:', error);
          // Don't fail the whole workflow creation - screenshots can be retried later
        });
    }

    // Clean up recording state
    await cleanupRecordingState();

    sendResponse({
      type: 'STOP_RECORDING',
      payload: {
        success: true,
        workflowId: workflowResponse.workflow_id,
        status: workflowResponse.status,
      },
    });
  } catch (error) {
    console.error('[BackgroundMessaging] Failed to stop recording:', error);
    
    // Log detailed error information
    let errorMessage = 'Failed to stop recording';
    if (error && typeof error === 'object') {
      const apiError = error as any;
      
      // Log all available error properties
      console.error('[BackgroundMessaging] Error type:', apiError.name);
      console.error('[BackgroundMessaging] Error message:', apiError.message);
      console.error('[BackgroundMessaging] Error status:', apiError.status);
      console.error('[BackgroundMessaging] Error details:', apiError.details);
      
      // Build user-friendly error message
      if (apiError.status === 400) {
        if (apiError.details && typeof apiError.details === 'object') {
          // Pydantic validation error format
          if (apiError.details.detail && Array.isArray(apiError.details.detail)) {
            const validationErrors = apiError.details.detail.map((err: any) => 
              `${err.loc?.join('.') || 'field'}: ${err.msg}`
            ).join(', ');
            errorMessage = `Validation error: ${validationErrors}`;
          } else if (typeof apiError.details.detail === 'string') {
            errorMessage = apiError.details.detail;
          } else if (apiError.details.message) {
            errorMessage = apiError.details.message;
          }
        } else if (typeof apiError.details === 'string') {
          errorMessage = apiError.details;
        }
      } else {
        errorMessage = apiError.message || errorMessage;
      }
    }
    
    console.error('[BackgroundMessaging] Final error message:', errorMessage);
    
    // Clean up recording state even on error to prevent stuck state
    await cleanupRecordingState();
    
    sendResponse({
      type: 'STOP_RECORDING',
      payload: {
        success: false,
        error: errorMessage,
        context: 'STOP_RECORDING',
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
  screenshots: Array<{ step_number: number; dataUrl: string; timestamp: string }>
): Promise<void> {
  console.log(`Starting async upload of ${screenshots.length} screenshots for workflow ${workflowId}`);

  try {
    // Step 1: Fetch workflow details to get step IDs
    const workflow = await apiClient.getWorkflow(workflowId);
    console.log(`Fetched workflow ${workflowId} with ${workflow.steps.length} steps`);

    // Create mapping of step_number -> step_id
    const stepMap = new Map<number, number>();
    workflow.steps.forEach(step => {
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
          screenshot.step_number.toString()
        );

        console.log(`Screenshot uploaded for step ${screenshot.step_number}: ${uploadResponse.screenshot_id}`);

        // Link screenshot to step
        const stepId = stepMap.get(screenshot.step_number);
        if (stepId) {
          await apiClient.linkScreenshotToStep(stepId, uploadResponse.screenshot_id);
          console.log(`✓ Linked screenshot ${uploadResponse.screenshot_id} to step ${stepId} (step_number ${screenshot.step_number})`);
        } else {
          console.warn(`Could not find step ID for step_number ${screenshot.step_number}`);
        }

        return uploadResponse;
      } catch (error) {
        console.error(`Failed to upload/link screenshot for step ${screenshot.step_number}:`, error);
        throw error;
      }
    });

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);
    
    console.log(`✅ All ${screenshots.length} screenshots uploaded and linked`);
    
    // Step 3: Trigger AI processing now that all screenshots are ready
    console.log(`🧠 Starting AI processing for workflow ${workflowId}...`);
    const processingResponse = await apiClient.startWorkflowProcessing(workflowId);
    console.log(`✅ AI processing started: task_id=${processingResponse.task_id}`);
    
  } catch (error) {
    console.error('Failed to upload/link screenshots:', error);
    throw error;
  }
}

/**
 * Handle CAPTURE_SCREENSHOT message
 * Captures screenshot of active tab
 */
async function handleCaptureScreenshot(
  _message: ExtensionMessage,
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    const result = await captureScreenshot();

    if ('error' in result) {
      throw new Error(result.error);
    }

    sendResponse({
      type: 'SCREENSHOT_CAPTURED',
      payload: {
        success: true,
        dataUrl: result.dataUrl,
        timestamp: result.timestamp,
        tabId: result.tabId,
        url: result.url,
      },
    });
  } catch (error) {
    console.error('Failed to capture screenshot:', error);
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Failed to capture screenshot',
        context: 'CAPTURE_SCREENSHOT',
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
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    const recordingState = await getCurrentRecordingState();

    sendResponse({
      type: 'GET_RECORDING_STATE',
      payload: {
        success: true,
        recordingState,
      },
    });
  } catch (error) {
    console.error('Failed to get recording state:', error);
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Failed to get recording state',
        context: 'GET_RECORDING_STATE',
      },
    });
  }
}
