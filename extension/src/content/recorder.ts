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
import { EventDeduplicator } from './utils/event-deduplicator';
import { addStep, getSteps, clearSteps, getStepCount, addScreenshot, getScreenshots, clearScreenshots } from './storage/indexeddb';
import { showRecordingWidget, hideRecordingWidget, updateWidgetStepCount, onWidgetStop, onWidgetPause } from './widget';
// Minimal success flash without importing shared module (prevents code-splitting for content scripts)
function flashElement(element: HTMLElement): void {
  const prevTransition = element.style.transition;
  const prevBoxShadow = element.style.boxShadow;
  element.style.transition = 'box-shadow 0.2s ease';
  element.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.6)';
  setTimeout(() => {
    element.style.boxShadow = prevBoxShadow;
    element.style.transition = prevTransition;
  }, 500);
}

// CSS is loaded via manifest.json content_scripts.css

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
  deduplicator: EventDeduplicator;
}

const state: RecorderState = {
  isRecording: false,
  currentStepNumber: 0,
  startingUrl: null,
  debouncer: new InputDebouncer(),
  deduplicator: new EventDeduplicator(),
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handles focus events on inputs (to track value changes)
 */
function handleFocus(event: FocusEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;
    
    if (element instanceof HTMLInputElement) {
      state.deduplicator.onInputFocus(element);
    }
  } catch (error) {
    console.error('Error handling focus:', error);
  }
}

/**
 * Handles click events
 */
function handleClick(event: MouseEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Filter out clicks on the recording widget itself
    if (element.closest('#workflow-recording-widget')) {
      console.log('[ContentRecorder] Ignoring click on recording widget');
      return;
    }

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording click on:', element);
    
    // Add to deduplicator instead of recording immediately
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
  } catch (error) {
    console.error('Error handling click:', error);
  }
}

/**
 * Handles blur events on inputs (captures final values)
 */
function handleBlur(event: FocusEvent): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording input blur on:', element);
    
    // Add to deduplicator - it will check if value changed
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
  } catch (error) {
    console.error('Error handling blur:', error);
  }
}

/**
 * Handles change events on selects and checkboxes
 */
function handleChange(event: Event): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording change on:', element);
    
    // Add to deduplicator
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
  } catch (error) {
    console.error('Error handling change:', error);
  }
}

/**
 * Handles form submit events
 */
function handleSubmit(event: Event): void {
  if (!state.isRecording) return;

  try {
    const element = event.target as Element;

    // Check if this is a meaningful interaction
    if (!isInteractionMeaningful(event, element)) {
      return;
    }

    console.log('Recording form submit on:', element);
    
    // Add to deduplicator (high priority - will suppress button clicks)
    const actionType = getActionType(event, element);
    state.deduplicator.addEvent(event, element, actionType, recordInteraction);
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
 * Records a user interaction (called by deduplicator after event grouping)
 */
async function recordInteraction(event: Event, element: Element): Promise<void> {
  try {
    // Atomically increment and capture step number to avoid race conditions
    const stepNumber = ++state.currentStepNumber;

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
    const screenshotId = await captureScreenshot(stepNumber);

    // Build step object
    const step: StepCreate = {
      step_number: stepNumber,
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

    // Update widget step counter with current max
    updateWidgetStepCount(state.currentStepNumber);

    // Flash element for visual feedback
    if (element instanceof HTMLElement) {
      flashElement(element);
    }

    console.log(`✅ Step ${stepNumber} recorded:`, step);
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
    // Atomically increment and capture step number
    const stepNumber = ++state.currentStepNumber;

    // Build page context
    const pageContext = buildPageContext();

    // Request screenshot from background (stores blob in IndexedDB)
    const screenshotId = await captureScreenshot(stepNumber);

    // Build step object
    const step: StepCreate = {
      step_number: stepNumber,
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

    console.log(`✅ Navigation step ${stepNumber} recorded`);
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
    console.log('[ContentRecorder] startRecording called');
    
    if (state.isRecording) {
      console.warn('[ContentRecorder] Already recording');
      return;
    }

    console.log('[ContentRecorder] 🎬 Starting workflow recording');

    // Clear any existing steps and screenshots
    console.log('[ContentRecorder] Clearing existing steps and screenshots');
    await clearSteps();
    await clearScreenshots();

    // Initialize state
    state.isRecording = true;
    state.currentStepNumber = 0;
    state.startingUrl = window.location.href;
    console.log('[ContentRecorder] State initialized:', { startingUrl: state.startingUrl });

    // Add event listeners in capture phase (to catch events before page handlers)
    console.log('[ContentRecorder] Adding event listeners');
    document.addEventListener('focus', handleFocus, true);  // Track input focus for value changes
    document.addEventListener('click', handleClick, true);
    document.addEventListener('blur', handleBlur, true);
    document.addEventListener('change', handleChange, true);
    document.addEventListener('submit', handleSubmit, true);
    window.addEventListener('beforeunload', handleNavigation, true);

    // Show recording widget
    console.log('[ContentRecorder] Showing recording widget');
    showRecordingWidget();
    updateWidgetStepCount(0);
    console.log('[ContentRecorder] Widget should now be visible');

    // Wire up widget callbacks
    onWidgetStop(() => {
      console.log('[ContentRecorder] Stop button clicked in widget');
      stopRecording();
    });

    onWidgetPause(() => {
      console.log('[ContentRecorder] Pause button clicked in widget');
      // TODO: Implement pause functionality in future sprint
      alert('Pause functionality coming soon!');
    });

    console.log('[ContentRecorder] ✅ Recording started successfully on:', state.startingUrl);
  } catch (error) {
    console.error('[ContentRecorder] Error starting recording:', error);
    state.isRecording = false;
  }
}

/**
 * Stops recording and uploads workflow
 */
async function stopRecording(): Promise<void> {
  try {
    if (!state.isRecording) {
      console.warn('[ContentRecorder] Not currently recording');
      return;
    }

    console.log('[ContentRecorder] ⏹️ Stopping workflow recording');

    // IMPORTANT: Remove event listeners FIRST to prevent recording the stop button click
    document.removeEventListener('focus', handleFocus, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('blur', handleBlur, true);
    document.removeEventListener('change', handleChange, true);
    document.removeEventListener('submit', handleSubmit, true);
    window.removeEventListener('beforeunload', handleNavigation, true);

    // Force flush any pending events before stopping
    state.deduplicator.forceFlush(recordInteraction);
    
    // Wait a bit for flush to complete
    await new Promise(resolve => setTimeout(resolve, 150));

    // Stop recording state
    state.isRecording = false;

    // Hide recording widget
    hideRecordingWidget();

    // Clear debouncer and deduplicator
    state.debouncer.clear();
    state.deduplicator.clear();

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
    console.log('[ContentRecorder] Sending message to background:', { stepCount: steps.length, screenshotCount: screenshotsWithDataUrls.length });
    
    const response = await chrome.runtime.sendMessage({
      type: 'STOP_RECORDING',
      payload: {
        startingUrl: state.startingUrl,
        steps,
        screenshots: screenshotsWithDataUrls,
      },
    });

    console.log('[ContentRecorder] Response from background:', response);

    // Check response correctly - background returns {type: 'STOP_RECORDING', payload: {success: true, ...}}
    if (response?.payload?.success) {
      console.log('[ContentRecorder] ✅ Workflow uploaded successfully. ID:', response.payload.workflowId);

      // Clear IndexedDB after successful upload
      await clearSteps();
      await clearScreenshots();
      console.log('[ContentRecorder] 🗑️ Local steps and screenshots cleared');
    } else {
      const errorMsg = response?.payload?.error || 'Unknown error';
      console.error('[ContentRecorder] ❌ Failed to upload workflow:', errorMsg);
      // Keep steps in IndexedDB for retry
      alert(`Failed to save workflow: ${errorMsg}\n\nYour recording has been saved locally. Please try again.`);
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
  console.log('[ContentRecorder] Received message:', message.type);
  console.log('[ContentRecorder] Full message:', message);

  if (message.type === 'START_RECORDING') {
    console.log('[ContentRecorder] Processing START_RECORDING message');
    startRecording().then(() => {
      console.log('[ContentRecorder] START_RECORDING completed successfully');
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('[ContentRecorder] Error in START_RECORDING:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'STOP_RECORDING') {
    console.log('[ContentRecorder] Processing STOP_RECORDING message');
    stopRecording().then(() => {
      console.log('[ContentRecorder] STOP_RECORDING completed successfully');
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('[ContentRecorder] Error in STOP_RECORDING:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  }

  console.log('[ContentRecorder] Unknown message type:', message.type);
  return true;
});
