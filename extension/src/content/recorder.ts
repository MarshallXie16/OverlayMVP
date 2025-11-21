/**
 * Content Script: Event Recorder
 * Captures user interactions (clicks, inputs, navigation) during workflow recording
 *
 * Coordinates:
 * - Event listeners for user interactions
 * - Selector and metadata extraction
 * - IndexedDB storage
 * - Screenshot capture via background worker
 * - Upload coordination
 */

import type { StepCreate, ExtensionMessage } from '@/shared/types';
import { extractSelectors } from './utils/selectors';
import { extractMetadata, extractActionData } from './utils/metadata';
import { isInteractionMeaningful, getActionType, InputDebouncer } from './utils/filters';
import { addStep, getSteps, clearSteps, getStepCount, addScreenshot, getScreenshots, clearScreenshots } from './storage/indexeddb';
import { showRecordingWidget, hideRecordingWidget, updateWidgetStepCount, onWidgetStop, onWidgetPause } from './widget';
import { flashElement } from './feedback';

console.log('📝 Workflow Recorder: Content script (recorder) loaded');

// Test message passing to background worker
chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
  if (response) {
    console.log('Recorder received response from background:', response);
  }
});

// ============================================================================
// RECORDER STATE
// ============================================================================

interface RecorderState {
  isRecording: boolean;
  currentStepNumber: number;
  startingUrl: string | null;
  debouncer: InputDebouncer;
}

const state: RecorderState = {
  isRecording: false,
  currentStepNumber: 0,
  startingUrl: null,
  debouncer: new InputDebouncer(),
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handles click events
 */
async function handleClick(event: MouseEvent): Promise<void> {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording click on:', element);
    await recordInteraction(event, element);
  } catch (error) {
    console.error('Error handling click:', error);
  }
}

/**
 * Handles blur events on inputs (captures final values)
 */
async function handleBlur(event: FocusEvent): Promise<void> {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording input blur on:', element);
    await recordInteraction(event, element);
  } catch (error) {
    console.error('Error handling blur:', error);
  }
}

/**
 * Handles change events on selects and checkboxes/radios
 */
async function handleChange(event: Event): Promise<void> {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording change on:', element);
    await recordInteraction(event, element);
  } catch (error) {
    console.error('Error handling change:', error);
  }
}

/**
 * Handles form submit events
 */
async function handleSubmit(event: Event): Promise<void> {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording form submit on:', element);
    await recordInteraction(event, element);
  } catch (error) {
    console.error('Error handling submit:', error);
  }
}

/**
 * Handles navigation events (beforeunload)
 */
async function handleNavigation(_event: Event): Promise<void> {
  if (!state.isRecording) return;

  try {
    console.log('Recording navigation');
    // For navigation, we don't have a specific element
    // We'll create a step with page context only
    await recordNavigation();
  } catch (error) {
    console.error('Error handling navigation:', error);
  }
}

// ============================================================================
// RECORDING LOGIC
// ============================================================================

/**
 * Records a user interaction
 */
async function recordInteraction(event: Event, element: Element): Promise<void> {
  try {
    // Increment step number
    state.currentStepNumber++;

    // Extract selectors
    const selectors = extractSelectors(element);

    // Extract metadata
    const metadata = extractMetadata(element);

    // Get action type
    const actionType = getActionType(event, element);

    // Extract action-specific data
    const actionData = extractActionData(element, actionType);

    // Build page context
    const pageContext = buildPageContext();

    // Request screenshot from background (stores blob in IndexedDB)
    const screenshotId = await captureScreenshot(state.currentStepNumber);

    // Build step object
    const step: StepCreate = {
      step_number: state.currentStepNumber,
      timestamp: new Date().toISOString(),
      action_type: actionType,
      selectors,
      element_meta: metadata,
      page_context: pageContext,
      action_data: Object.keys(actionData).length > 0 ? actionData : null,
      dom_context: null, // Not implemented in MVP
      screenshot_id: screenshotId,
    };

    // Store in IndexedDB
    await addStep(step);

    // Update widget step counter
    updateWidgetStepCount(state.currentStepNumber);

    // Flash element for visual feedback
    flashElement(element);

    console.log(`✅ Step ${state.currentStepNumber} recorded:`, step);
  } catch (error) {
    console.error('Error recording interaction:', error);
    // Don't throw - continue recording even if one step fails
  }
}

/**
 * Records navigation event
 */
async function recordNavigation(): Promise<void> {
  try {
    // Increment step number
    state.currentStepNumber++;

    // Build page context
    const pageContext = buildPageContext();

    // Request screenshot from background (stores blob in IndexedDB)
    const screenshotId = await captureScreenshot(state.currentStepNumber);

    // Build step object
    const step: StepCreate = {
      step_number: state.currentStepNumber,
      timestamp: new Date().toISOString(),
      action_type: 'navigate',
      selectors: {},
      element_meta: {},
      page_context: pageContext,
      action_data: null,
      dom_context: null,
      screenshot_id: screenshotId,
    };

    // Store in IndexedDB
    await addStep(step);

    // Update widget step counter
    updateWidgetStepCount(state.currentStepNumber);

    console.log(`✅ Navigation step ${state.currentStepNumber} recorded`);
  } catch (error) {
    console.error('Error recording navigation:', error);
  }
}

/**
 * Builds page context object
 */
function buildPageContext(): Record<string, any> {
  return {
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    scroll: {
      x: window.scrollX,
      y: window.scrollY,
    },
    user_agent: navigator.userAgent,
  };
}

/**
 * Requests screenshot from background worker and stores it in IndexedDB
 * Returns null for screenshot_id (will be assigned after upload)
 */
async function captureScreenshot(stepNumber: number): Promise<number | null> {
  try {
    // Send message to background to capture screenshot
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
    });

    if (response && response.type === 'SCREENSHOT_CAPTURED' && response.payload) {
      // Convert dataUrl to Blob
      const dataUrl = response.payload.dataUrl;
      const blob = await dataUrlToBlob(dataUrl);

      // Store screenshot blob in IndexedDB
      await addScreenshot({
        step_number: stepNumber,
        blob,
        timestamp: new Date().toISOString(),
      });

      console.log(`Screenshot captured and stored for step ${stepNumber}`);
    }

    // Return null for screenshot_id (will be filled after upload to server)
    return null;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return null;
  }
}

/**
 * Convert data URL to Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

/**
 * Convert Blob to data URL
 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================================
// RECORDER CONTROL
// ============================================================================

/**
 * Starts recording workflow
 */
async function startRecording(): Promise<void> {
  try {
    if (state.isRecording) {
      console.warn('Already recording');
      return;
    }

    console.log('🎬 Starting workflow recording');

    // Clear any existing steps and screenshots
    await clearSteps();
    await clearScreenshots();

    // Initialize state
    state.isRecording = true;
    state.currentStepNumber = 0;
    state.startingUrl = window.location.href;

    // Add event listeners in capture phase (to catch events before page handlers)
    document.addEventListener('click', handleClick, true);
    document.addEventListener('blur', handleBlur, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('submit', handleSubmit, true);
    window.addEventListener('beforeunload', handleNavigation, true);

    // Show recording widget
    showRecordingWidget();
    updateWidgetStepCount(0);

    // Wire up widget callbacks
    onWidgetStop(() => {
      console.log('Stop button clicked in widget');
      stopRecording();
    });

    onWidgetPause(() => {
      console.log('Pause button clicked in widget');
      // TODO: Implement pause functionality in future sprint
      alert('Pause functionality coming soon!');
    });

    console.log('✅ Recording started on:', state.startingUrl);
  } catch (error) {
    console.error('Error starting recording:', error);
    state.isRecording = false;
  }
}

/**
 * Stops recording and uploads workflow
 */
async function stopRecording(): Promise<void> {
  try {
    if (!state.isRecording) {
      console.warn('Not currently recording');
      return;
    }

    console.log('⏹️ Stopping workflow recording');

    // Stop recording
    state.isRecording = false;

    // Hide recording widget
    hideRecordingWidget();

    // Remove event listeners
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('blur', handleBlur, true);
    document.removeEventListener('change', handleChange, true);
    document.removeEventListener('submit', handleSubmit, true);
    window.removeEventListener('beforeunload', handleNavigation, true);

    // Clear debouncer
    state.debouncer.clear();

    // Get all steps and screenshots from IndexedDB
    const steps = await getSteps();
    const screenshots = await getScreenshots();
    const stepCount = await getStepCount();

    console.log(`📤 Uploading ${stepCount} steps and ${screenshots.length} screenshots to background worker`);

    // Convert screenshot blobs to dataUrls for message passing
    const screenshotsWithDataUrls = await Promise.all(
      screenshots.map(async (screenshot) => ({
        step_number: screenshot.step_number,
        dataUrl: await blobToDataUrl(screenshot.blob),
        timestamp: screenshot.timestamp,
      }))
    );

    // Send steps and screenshots to background for upload
    const response = await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING',
      payload: {
        startingUrl: state.startingUrl,
        steps,
        screenshots: screenshotsWithDataUrls,
      },
    });

    if (response && response.success) {
      console.log('✅ Steps and screenshots sent to background worker for upload');

      // Clear IndexedDB after successful upload
      await clearSteps();
      await clearScreenshots();
      console.log('🗑️ Local steps and screenshots cleared');
    } else {
      console.error('❌ Failed to send steps to background worker');
      // Keep steps in IndexedDB for retry
    }

    // Reset state
    state.currentStepNumber = 0;
    state.startingUrl = null;
  } catch (error) {
    console.error('Error stopping recording:', error);
  }
}

// ============================================================================
// MESSAGE LISTENERS
// ============================================================================

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  console.log('Recorder received message:', message);

  if (message.type === 'START_RECORDING') {
    startRecording().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error starting recording:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'STOP_RECORDING') {
    stopRecording().then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Error stopping recording:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }

  return true;
});
