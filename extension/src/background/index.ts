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

import { handleMessage } from './messaging';
import { getCurrentRecordingState } from './state';
import type { ExtensionMessage } from '@/shared/types';

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('🚀 Workflow Recorder: Background service worker loaded');

// ============================================================================
// LIFECYCLE EVENTS
// ============================================================================

/**
 * Handle extension installation and updates
 */
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details);

  if (details.reason === 'install') {
    // First install - could open onboarding page
    console.log('First time installation!');
  } else if (details.reason === 'update') {
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
  console.log('Service worker started');

  try {
    // Check if there was an active recording before shutdown
    const recordingState = await getCurrentRecordingState();
    if (recordingState.isRecording) {
      console.warn('Detected interrupted recording. State preserved:', {
        workflowName: recordingState.workflowName,
        steps: recordingState.steps.length,
      });
    }
  } catch (error) {
    console.error('Failed to restore recording state:', error);
  }
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Route messages to appropriate handlers
 */
chrome.runtime.onMessage.addListener((
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => {
  // Wrap in try-catch for top-level error handling
  try {
    return handleMessage(message, sender, sendResponse);
  } catch (error) {
    console.error('Unhandled error in message handler:', error);
    sendResponse({
      type: 'ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        context: 'MESSAGE_HANDLER',
      },
    });
    return true;
  }
});

// ============================================================================
// TAB EVENTS
// ============================================================================

/**
 * Track tab navigation during recording
 * This helps capture page transitions in workflows
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log(`Tab ${tabId} loaded: ${tab.url}`);

    // Check if recording is active
    try {
      const recordingState = await getCurrentRecordingState();
      if (recordingState.isRecording) {
        console.log('Navigation detected during recording:', tab.url);
        // Future enhancement: Auto-capture navigation events
      }
    } catch (error) {
      console.error('Failed to check recording state on tab update:', error);
    }
  }
});

// ============================================================================
// DEVELOPMENT UTILITIES
// ============================================================================

/**
 * Keep service worker alive in development mode
 * Prevents service worker from being terminated during debugging
 */
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    console.log('Service worker heartbeat');
  }, 20000);
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Global error handler for unhandled promise rejections
 */
self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in service worker:', event.reason);
  event.preventDefault();
});

/**
 * Global error handler for uncaught errors
 */
self.addEventListener('error', (event) => {
  console.error('Uncaught error in service worker:', event.error);
  event.preventDefault();
});
