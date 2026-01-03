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
 * Opens workflow starting URL in new tab and triggers extension walkthrough mode.
 *
 * @param workflowId - Workflow ID to start
 * @param startingUrl - URL to open
 * @throws {Error} If extension not installed or walkthrough fails to start
 */
export async function startWalkthrough(
  workflowId: number,
  startingUrl: string,
): Promise<{ tabId: number; success: boolean }> {
  // Open starting URL in new tab
  const newTab = window.open(startingUrl, "_blank");

  if (!newTab) {
    throw new Error(
      "Failed to open new tab. Please allow popups for this site.",
    );
  }

  // Focus the new tab (user confirmation: automatically switch to new tab)
  newTab.focus();

  // Wait a bit for tab to load before sending message
  // This prevents race condition where extension content script isn't ready yet
  await new Promise((resolve) => setTimeout(resolve, 800));

  // Send START_WALKTHROUGH message to the new tab via window.postMessage.
  // Use '*' to tolerate redirects (e.g., to login). Content script filters by `source`.
  try {
    const payload = {
      source: "overlay-dashboard",
      type: "START_WALKTHROUGH",
      payload: { workflowId, startingUrl },
    } as const;

    // Fire a few times to survive redirects/late content script injection
    newTab.postMessage(payload, "*"); // ~0.8s after open
    setTimeout(() => newTab.postMessage(payload, "*"), 1000); // ~1.8s
    setTimeout(() => newTab.postMessage(payload, "*"), 2500); // ~3.3s

    return { tabId: -1, success: true };
  } catch (error) {
    newTab.close();
    throw error instanceof Error
      ? error
      : new Error("Failed to post message to new tab");
  }
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
