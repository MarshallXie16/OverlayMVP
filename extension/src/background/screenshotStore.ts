/**
 * Screenshot Store - IndexedDB storage for screenshots
 *
 * Uses IndexedDB instead of chrome.storage.session because:
 * - chrome.storage.session has ~1MB limit
 * - Each screenshot is 300-500KB base64
 * - IndexedDB has no practical size limit
 *
 * Note: IndexedDB is origin-scoped, but that's fine since the background
 * service worker has a single origin (chrome-extension://...). Screenshots
 * are stored by session ID, so they're accessible regardless of which
 * page the recording is happening on.
 */

const DB_NAME = "OverlayRecordingDB";
const DB_VERSION = 1;
const SCREENSHOTS_STORE = "screenshots";

interface StoredScreenshot {
  id?: number; // Auto-increment primary key
  sessionId: string;
  stepNumber: number;
  dataUrl: string;
  timestamp: string;
}

/**
 * Open or create the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error(
        "[ScreenshotStore] Failed to open database:",
        request.error,
      );
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create screenshots object store if it doesn't exist
      if (!db.objectStoreNames.contains(SCREENSHOTS_STORE)) {
        const store = db.createObjectStore(SCREENSHOTS_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });

        // Index by sessionId for efficient retrieval
        store.createIndex("sessionId", "sessionId", { unique: false });

        // Compound index for sessionId + stepNumber (for finding specific screenshots)
        store.createIndex("sessionStep", ["sessionId", "stepNumber"], {
          unique: false,
        });

        console.log("[ScreenshotStore] Created screenshots object store");
      }
    };
  });
}

/**
 * Store a screenshot for a recording session
 */
export async function storeScreenshot(
  sessionId: string,
  stepNumber: number,
  dataUrl: string,
): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SCREENSHOTS_STORE, "readwrite");
      const store = transaction.objectStore(SCREENSHOTS_STORE);

      const screenshot: StoredScreenshot = {
        sessionId,
        stepNumber,
        dataUrl,
        timestamp: new Date().toISOString(),
      };

      const request = store.add(screenshot);

      request.onsuccess = () => {
        console.log(
          "[ScreenshotStore] Stored screenshot for step:",
          stepNumber,
          "session:",
          sessionId.slice(0, 8),
        );
        resolve(true);
      };

      request.onerror = () => {
        console.error(
          "[ScreenshotStore] Failed to store screenshot:",
          request.error,
        );
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("[ScreenshotStore] Error storing screenshot:", error);
    return false;
  }
}

/**
 * Get all screenshots for a recording session
 * Returns screenshots sorted by step number
 */
export async function getScreenshotsForSession(
  sessionId: string,
): Promise<Array<{ stepNumber: number; dataUrl: string; timestamp: string }>> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SCREENSHOTS_STORE, "readonly");
      const store = transaction.objectStore(SCREENSHOTS_STORE);
      const index = store.index("sessionId");

      const request = index.getAll(sessionId);

      request.onsuccess = () => {
        const screenshots = (request.result as StoredScreenshot[])
          .sort((a, b) => a.stepNumber - b.stepNumber)
          .map(({ stepNumber, dataUrl, timestamp }) => ({
            stepNumber,
            dataUrl,
            timestamp,
          }));

        console.log(
          "[ScreenshotStore] Retrieved",
          screenshots.length,
          "screenshots for session:",
          sessionId.slice(0, 8),
        );
        resolve(screenshots);
      };

      request.onerror = () => {
        console.error(
          "[ScreenshotStore] Failed to get screenshots:",
          request.error,
        );
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("[ScreenshotStore] Error getting screenshots:", error);
    return [];
  }
}

/**
 * Get screenshot count for a session (lightweight check without loading data)
 */
export async function getScreenshotCountForSession(
  sessionId: string,
): Promise<number> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SCREENSHOTS_STORE, "readonly");
      const store = transaction.objectStore(SCREENSHOTS_STORE);
      const index = store.index("sessionId");

      const request = index.count(sessionId);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error(
          "[ScreenshotStore] Failed to count screenshots:",
          request.error,
        );
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("[ScreenshotStore] Error counting screenshots:", error);
    return 0;
  }
}

/**
 * Clear all screenshots for a recording session
 */
export async function clearScreenshotsForSession(
  sessionId: string,
): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SCREENSHOTS_STORE, "readwrite");
      const store = transaction.objectStore(SCREENSHOTS_STORE);
      const index = store.index("sessionId");

      // Get all keys for this session
      const keysRequest = index.getAllKeys(sessionId);

      keysRequest.onsuccess = () => {
        const keys = keysRequest.result;

        if (keys.length === 0) {
          console.log(
            "[ScreenshotStore] No screenshots to clear for session:",
            sessionId.slice(0, 8),
          );
          resolve(true);
          return;
        }

        // Delete each screenshot
        let deletedCount = 0;
        let errorOccurred = false;

        keys.forEach((key) => {
          const deleteRequest = store.delete(key);

          deleteRequest.onsuccess = () => {
            deletedCount++;
            if (deletedCount === keys.length && !errorOccurred) {
              console.log(
                "[ScreenshotStore] Cleared",
                deletedCount,
                "screenshots for session:",
                sessionId.slice(0, 8),
              );
              resolve(true);
            }
          };

          deleteRequest.onerror = () => {
            if (!errorOccurred) {
              errorOccurred = true;
              console.error(
                "[ScreenshotStore] Failed to delete screenshot:",
                deleteRequest.error,
              );
              reject(deleteRequest.error);
            }
          };
        });
      };

      keysRequest.onerror = () => {
        console.error(
          "[ScreenshotStore] Failed to get keys for deletion:",
          keysRequest.error,
        );
        reject(keysRequest.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("[ScreenshotStore] Error clearing screenshots:", error);
    return false;
  }
}

/**
 * Clear all screenshots (for cleanup/debugging)
 */
export async function clearAllScreenshots(): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SCREENSHOTS_STORE, "readwrite");
      const store = transaction.objectStore(SCREENSHOTS_STORE);

      const request = store.clear();

      request.onsuccess = () => {
        console.log("[ScreenshotStore] Cleared all screenshots");
        resolve(true);
      };

      request.onerror = () => {
        console.error(
          "[ScreenshotStore] Failed to clear all screenshots:",
          request.error,
        );
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error("[ScreenshotStore] Error clearing all screenshots:", error);
    return false;
  }
}
