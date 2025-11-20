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
  _message: ExtensionMessage,
  sendResponse: (response?: any) => void
): Promise<void> {
  try {
    // Stop recording
    const recordingState = await stopRecording();

    if (!recordingState) {
      throw new Error('No active recording to stop');
    }

    // Upload workflow to backend
    console.log(`Uploading workflow "${recordingState.workflowName}" with ${recordingState.steps.length} steps`);

    const workflowResponse = await apiClient.createWorkflow({
      name: recordingState.workflowName || 'Untitled Workflow',
      description: null,
      starting_url: recordingState.startingUrl || '',
      tags: [],
      steps: recordingState.steps,
    });

    console.log('Workflow uploaded successfully:', workflowResponse);

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
    console.error('Failed to stop recording:', error);
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Failed to stop recording',
        context: 'STOP_RECORDING',
      },
    });
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
