/**
 * Background Service Worker (Manifest V3)
 * Handles:
 * - Message passing between popup and content scripts
 * - Screenshot capture
 * - State management (recording status, workflow data)
 * - Extension lifecycle events
 */

console.log('🚀 Workflow Recorder: Background service worker loaded');

// Service worker event listeners
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details);

  if (details.reason === 'install') {
    // First install - could open onboarding page
    console.log('First time installation!');
  } else if (details.reason === 'update') {
    // Extension updated
    console.log('Extension updated to version:', chrome.runtime.getManifest().version);
  }
});

// Message passing handler (will be expanded in FE-003)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from', sender);

  // Handle different message types
  switch (message.type) {
    case 'PING':
      sendResponse({ type: 'PONG', timestamp: Date.now() });
      break;

    default:
      console.warn('Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
  }

  // Return true to indicate async response
  return true;
});

// Tab events (for tracking navigation during recording)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tabId, tab.url);
  }
});

// Keep service worker alive (optional, for debugging)
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    console.log('Service worker heartbeat');
  }, 20000);
}
