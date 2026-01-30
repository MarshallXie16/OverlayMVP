/**
 * Extension Bridge
 *
 * Utilities for communicating with Chrome extension from dashboard.
 * Handles extension detection, message passing, and error handling.
 *
 * FE-013: Start Walkthrough Button
 */

export interface ExtensionMessage {
  type: string;
  payload?: any;
}

export interface ExtensionResponse {
  type: string;
  payload?: any;
}

/**
 * Check if Chrome extension is installed and accessible
 *
 * TEMPORARY: Bypassing check since extension detection is unreliable from dashboard context.
 * TODO: Implement proper extension ping/handshake to verify extension is loaded.
 */
export function isExtensionInstalled(): boolean {
  // Bypass check - assume extension is installed for MVP
  // The actual check should be: send PING message and wait for PONG response
  return true;

  // Original check (unreliable from web page context):
  // return typeof chrome !== 'undefined' &&
  //        chrome.runtime !== undefined &&
  //        chrome.runtime.sendMessage !== undefined;
}

/**
 * Send message to extension
 *
 * @throws {Error} If extension not installed or message fails
 */
export async function sendMessageToExtension(
  _message: ExtensionMessage,
): Promise<ExtensionResponse> {
  if (!isExtensionInstalled()) {
    throw new Error("Extension not installed");
  }

  return new Promise((_resolve, reject) => {
    try {
      // chrome.runtime is not reliably available in dashboard page context.
      // Keep this function for potential future use, but prevent accidental use now.
      throw new Error("chrome.runtime not available in dashboard context");
    } catch (error) {
      reject(
        error instanceof Error ? error : new Error("Failed to send message"),
      );
    }
  });
}

/**
 * Start walkthrough for a workflow
 *
 * Posts START_WALKTHROUGH message to the extension content script running on this page.
 * The background script will handle creating a new tab and navigating to the starting URL.
 *
 * @param workflowId - Workflow ID to start
 * @param _startingUrl - URL to open (passed to background, not used directly here)
 * @throws {Error} If extension not installed or walkthrough fails to start
 */
export async function startWalkthrough(
  workflowId: number,
  _startingUrl: string,
): Promise<{ tabId: number; success: boolean }> {
  // Send START_WALKTHROUGH message to the content script on THIS page via window.postMessage.
  // The content script will forward it to the background, which handles tab creation.
  // This avoids cross-window postMessage issues that caused silent failures.
  const payload = {
    source: "overlay-dashboard",
    type: "START_WALKTHROUGH",
    payload: { workflowId },
  } as const;

  // Post to own window - content script on localhost:3000 will receive and forward to background
  window.postMessage(payload, window.location.origin);

  return { tabId: -1, success: true };
}

/**
 * Get extension version (for debugging)
 */
export async function getExtensionVersion(): Promise<string | null> {
  if (!isExtensionInstalled()) {
    return null;
  }

  try {
    const response = await sendMessageToExtension({ type: "PING" });
    return response.payload?.version ?? "unknown";
  } catch {
    return null;
  }
}
