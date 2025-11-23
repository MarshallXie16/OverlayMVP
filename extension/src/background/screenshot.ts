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
  code: 'NO_ACTIVE_TAB' | 'PERMISSION_DENIED' | 'CAPTURE_FAILED' | 'CONVERSION_FAILED';
  details?: any;
}

// ============================================================================
// SCREENSHOT CAPTURE
// ============================================================================

/**
 * Capture screenshot of the currently active tab
 *
 * @returns Promise resolving to screenshot data or error
 */
export async function captureScreenshot(): Promise<CaptureScreenshotResult | CaptureScreenshotError> {
  try {
    // Get the active tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab || !activeTab.id) {
      return {
        error: 'No active tab found',
        code: 'NO_ACTIVE_TAB',
      };
    }

    // Check if tab URL is capturable (chrome:// pages can't be captured)
    if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('chrome-extension://')) {
      return {
        error: 'Cannot capture screenshots of Chrome internal pages',
        code: 'PERMISSION_DENIED',
        details: { url: activeTab.url },
      };
    }

    console.log(`Capturing screenshot of tab ${activeTab.id}: ${activeTab.url}`);

    // Capture the visible tab with high quality
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
      format: 'jpeg',
      quality: 90,
    });

    // Convert data URL to Blob
    const blob = await dataUrlToBlob(dataUrl);

    return {
      dataUrl,
      blob,
      timestamp: Date.now(),
      tabId: activeTab.id,
      url: activeTab.url || '',
    };
  } catch (error) {
    console.error('Screenshot capture failed:', error);

    // Handle specific Chrome API errors
    if (error instanceof Error) {
      if (error.message.includes('permission')) {
        return {
          error: 'Screenshot permission denied. Please grant activeTab permission.',
          code: 'PERMISSION_DENIED',
          details: error.message,
        };
      }

      return {
        error: `Screenshot capture failed: ${error.message}`,
        code: 'CAPTURE_FAILED',
        details: error.message,
      };
    }

    return {
      error: 'Unknown screenshot capture error',
      code: 'CAPTURE_FAILED',
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
    console.error('Failed to convert data URL to Blob:', error);
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

  if ('error' in result) {
    console.error('Screenshot capture error:', result.error);
    return null;
  }

  return result.blob;
}
