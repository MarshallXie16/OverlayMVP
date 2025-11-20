/**
 * Content Script: Event Recorder
 * Captures user interactions (clicks, inputs, navigation) during workflow recording
 *
 * This is injected into web pages to record user actions.
 * Full implementation in FE-005.
 */

console.log('📝 Workflow Recorder: Content script (recorder) loaded');

// Test message passing to background worker
chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
  if (response) {
    console.log('Recorder received response from background:', response);
  }
});

// Placeholder: Will implement in FE-005
// - Event listeners for clicks, inputs, form submissions
// - Element selector extraction (ID, CSS, XPath)
// - Element metadata capture (tag, role, text, position)
// - Screenshot requests to background worker
// - Local storage of steps in IndexedDB

/**
 * Initialize recorder
 * Will be called when user starts recording from popup
 */
function initializeRecorder() {
  console.log('Recorder initialized (placeholder)');
  // TODO: FE-005 - Add event listeners for user interactions
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Recorder received message:', message);

  if (message.type === 'START_RECORDING') {
    initializeRecorder();
    sendResponse({ success: true });
  }

  return true;
});
