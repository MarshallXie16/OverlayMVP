/**
 * Content Script: Walkthrough Mode
 * Guides users through recorded workflows with visual overlays
 *
 * This is injected into web pages to provide step-by-step guidance.
 * Full implementation will be done after FE-005 (recorder) is complete.
 */

console.log('🎯 Workflow Recorder: Content script (walkthrough) loaded');

// Test message passing to background worker
chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
  if (response) {
    console.log('Walkthrough received response from background:', response);
  }
});

// Placeholder: Will implement after FE-005
// - Spotlight overlay for target elements
// - Tooltip positioning
// - Step progression tracking
// - Auto-healing element finding
// - Success/error feedback

/**
 * Initialize walkthrough mode
 * Will be called when user starts a workflow from dashboard
 */
function initializeWalkthrough(workflowId: string) {
  console.log('Walkthrough initialized for workflow:', workflowId, '(placeholder)');
  // TODO: Load workflow steps from API
  // TODO: Display first step with spotlight
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Walkthrough received message:', message);

  if (message.type === 'START_WALKTHROUGH') {
    initializeWalkthrough(message.workflowId);
    sendResponse({ success: true });
  }

  return true;
});
