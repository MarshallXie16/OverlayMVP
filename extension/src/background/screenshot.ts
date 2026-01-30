/**
 * Screenshot Capture Module
 *
 * Handles capturing screenshots of the active tab using Chrome's
 * captureVisibleTab API. Converts screenshots to Blobs for upload.
 *
 * FE-003: Background Service Worker
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CaptureScreenshotResult {
  dataUrl: string;
  blob: Blob;
  timestamp: number;
  tabId: number;
  url: string;
}

export interface CaptureScreenshotError {
  error: string;
  code:
    | "NO_ACTIVE_TAB"
    | "PERMISSION_DENIED"
    | "CAPTURE_FAILED"
    | "CONVERSION_FAILED";
  details?: any;
}

// ============================================================================
// SCREENSHOT CAPTURE
// ============================================================================

/**
 * Capture screenshot of a specific tab or the currently active tab
 *
 * @param targetTabId - Optional tab ID to capture. If not provided, captures active tab.
 * @returns Promise resolving to screenshot data or error
 */
export async function captureScreenshot(
  targetTabId?: number,
): Promise<CaptureScreenshotResult | CaptureScreenshotError> {
  console.log(`[Screenshot] 📷 Called with targetTabId: ${targetTabId}`);

  try {
    let tabToCapture: chrome.tabs.Tab | undefined;

    if (targetTabId) {
      // Capture the specific tab (e.g., sender's tab during recording)
      try {
        tabToCapture = await chrome.tabs.get(targetTabId);
        console.log(
          `[Screenshot] ✅ Got tab ${targetTabId}:`,
          JSON.stringify({
            url: tabToCapture.url,
            status: tabToCapture.status,
            active: tabToCapture.active,
            windowId: tabToCapture.windowId,
          }),
        );
      } catch (error) {
        console.error(
          `[Screenshot] ❌ Failed to get tab ${targetTabId}:`,
          error,
        );
        return {
          error: `Tab ${targetTabId} not found`,
          code: "NO_ACTIVE_TAB",
          details: error,
        };
      }
    } else {
      // Fallback: Get the active tab (legacy behavior)
      console.log(
        `[Screenshot] ⚠️ No targetTabId, falling back to active tab query`,
      );
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tabToCapture = activeTab;
      console.log(
        `[Screenshot] Active tab query result: ${activeTab?.id} - ${activeTab?.url}`,
      );
    }

    if (!tabToCapture || !tabToCapture.id) {
      return {
        error: "No tab found to capture",
        code: "NO_ACTIVE_TAB",
      };
    }

    // Check if tab URL is capturable (chrome:// pages can't be captured)
    if (
      tabToCapture.url?.startsWith("chrome://") ||
      tabToCapture.url?.startsWith("chrome-extension://")
    ) {
      return {
        error: "Cannot capture screenshots of Chrome internal pages",
        code: "PERMISSION_DENIED",
        details: { url: tabToCapture.url },
      };
    }

    // Get window ID for the tab
    const windowId = tabToCapture.windowId;
    if (!windowId) {
      return {
        error: "Tab has no window ID",
        code: "CAPTURE_FAILED",
        details: { tabId: tabToCapture.id },
      };
    }

    console.log(
      `[Screenshot] 🎯 About to captureVisibleTab for window ${windowId} (tab ${tabToCapture.id} at ${tabToCapture.url})`,
    );

    // Capture the visible tab with high quality
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "jpeg",
        quality: 90,
      });

      console.log(
        `[Screenshot] ✅ captureVisibleTab SUCCESS! dataUrl length: ${dataUrl.length}`,
      );

      // Convert data URL to Blob
      const blob = await dataUrlToBlob(dataUrl);

      return {
        dataUrl,
        blob,
        timestamp: Date.now(),
        tabId: tabToCapture.id,
        url: tabToCapture.url || "",
      };
    } catch (captureError) {
      console.error(
        `[Screenshot] ❌ captureVisibleTab FAILED for window ${windowId}:`,
        captureError,
      );
      throw captureError;
    }
  } catch (error) {
    console.error("[Screenshot] ❌ Overall capture failed:", error);

    // Handle specific Chrome API errors
    if (error instanceof Error) {
      if (error.message.includes("permission")) {
        return {
          error:
            "Screenshot permission denied. Please grant activeTab permission.",
          code: "PERMISSION_DENIED",
          details: error.message,
        };
      }

      return {
        error: `Screenshot capture failed: ${error.message}`,
        code: "CAPTURE_FAILED",
        details: error.message,
      };
    }

    return {
      error: "Unknown screenshot capture error",
      code: "CAPTURE_FAILED",
      details: error,
    };
  }
}

/**
 * Convert data URL to Blob
 *
 * @param dataUrl - Base64 encoded data URL
 * @returns Promise resolving to Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error("Failed to convert data URL to Blob:", error);
    throw new Error(`Failed to convert screenshot to Blob: ${error}`);
  }
}

/**
 * Capture screenshot and return only the Blob
 * Convenience method for direct upload
 *
 * @returns Promise resolving to Blob or null on error
 */
export async function captureScreenshotBlob(): Promise<Blob | null> {
  const result = await captureScreenshot();

  if ("error" in result) {
    console.error("Screenshot capture error:", result.error);
    return null;
  }

  return result.blob;
}
