/**
 * Failed Uploads Component (FEAT-012)
 *
 * Displays failed workflow uploads with retry and discard options.
 * Data is retained in chrome.storage.local for persistence.
 */
import React, { useState, useEffect, useCallback } from "react";

interface FailedUpload {
  localId: string;
  name: string;
  stepCount: number;
  failedAt: string;
  errorMessage: string;
}

export const FailedUploads: React.FC = () => {
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFailedUploads = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_FAILED_UPLOADS",
      });

      if (response?.payload?.success) {
        setFailedUploads(response.payload.uploads || []);
      }
    } catch (err) {
      console.error("Failed to load failed uploads:", err);
    }
  }, []);

  useEffect(() => {
    loadFailedUploads();
  }, [loadFailedUploads]);

  const handleRetry = async (localId: string) => {
    setRetrying(localId);
    setError(null);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "RETRY_UPLOAD",
        payload: { localId },
      });

      if (response?.payload?.success) {
        // Remove from list on success
        setFailedUploads((prev) => prev.filter((u) => u.localId !== localId));
      } else {
        setError(response?.payload?.error || "Retry failed");
        // Refresh the list to get updated error message
        await loadFailedUploads();
      }
    } catch (err) {
      console.error("Retry failed:", err);
      setError("Failed to retry upload");
    } finally {
      setRetrying(null);
    }
  };

  const handleDiscard = async (localId: string) => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm("Permanently delete this recording? This cannot be undone.")) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: "DISCARD_UPLOAD",
        payload: { localId },
      });

      if (response?.payload?.success) {
        setFailedUploads((prev) => prev.filter((u) => u.localId !== localId));
      }
    } catch (err) {
      console.error("Discard failed:", err);
    }
  };

  // Format relative time
  const formatTimeAgo = (isoDate: string): string => {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (failedUploads.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-4 h-4 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-sm font-medium text-red-700">
          {failedUploads.length} upload{failedUploads.length > 1 ? "s" : ""}{" "}
          failed
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-2 text-xs text-red-600 bg-red-100 p-2 rounded">
          {error}
        </div>
      )}

      {/* Failed uploads list */}
      {failedUploads.map((upload) => (
        <div
          key={upload.localId}
          className="flex items-center justify-between py-2 border-t border-red-100"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {upload.name}
            </p>
            <p className="text-xs text-gray-500">
              {upload.stepCount} step{upload.stepCount !== 1 ? "s" : ""}{" "}
              &middot; {formatTimeAgo(upload.failedAt)}
            </p>
          </div>
          <div className="flex gap-1 ml-2">
            {/* Retry button */}
            <button
              onClick={() => handleRetry(upload.localId)}
              disabled={retrying === upload.localId}
              className="p-1.5 rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
              title="Retry upload"
            >
              <svg
                className={`w-4 h-4 text-gray-600 ${
                  retrying === upload.localId ? "animate-spin" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            {/* Discard button */}
            <button
              onClick={() => handleDiscard(upload.localId)}
              className="p-1.5 rounded hover:bg-red-100 transition-colors"
              title="Discard recording"
            >
              <svg
                className="w-4 h-4 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
