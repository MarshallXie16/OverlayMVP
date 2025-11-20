/**
 * RecordingControls Component
 * Manages workflow recording start/stop controls
 *
 * FE-004: Popup UI (Login/Recording Controls)
 */

import React, { useState } from 'react';
import { useRecordingStore } from '../store/recordingStore';

export const RecordingControls: React.FC = () => {
  const [workflowNameInput, setWorkflowNameInput] = useState('');
  const [showNameInput, setShowNameInput] = useState(false);
  const [validationError, setValidationError] = useState('');

  const {
    isRecording,
    workflowName,
    isLoading,
    error,
    startRecording,
    stopRecording,
  } = useRecordingStore();

  const handleStartClick = () => {
    setShowNameInput(true);
    setValidationError('');
  };

  const handleStartRecording = async () => {
    // Validate workflow name
    if (!workflowNameInput.trim()) {
      setValidationError('Workflow name is required');
      return;
    }

    if (workflowNameInput.trim().length < 3) {
      setValidationError('Workflow name must be at least 3 characters');
      return;
    }

    try {
      await startRecording(workflowNameInput.trim());
      setWorkflowNameInput('');
      setShowNameInput(false);
      setValidationError('');
    } catch (err) {
      // Error is already set in the store
    }
  };

  const handleStopRecording = async () => {
    try {
      await stopRecording();
    } catch (err) {
      // Error is already set in the store
    }
  };

  const handleCancel = () => {
    setShowNameInput(false);
    setWorkflowNameInput('');
    setValidationError('');
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        Recording Controls
      </h2>

      {/* Recording Status Indicator */}
      <div className="mb-4 flex items-center">
        <div
          className={`w-3 h-3 rounded-full mr-2 ${
            isRecording ? 'bg-accent-500 animate-pulse' : 'bg-gray-300'
          }`}
        />
        <span className="text-sm font-medium text-gray-700">
          {isRecording ? (
            <>
              Recording: <span className="text-accent-600">{workflowName}</span>
            </>
          ) : (
            'Not Recording'
          )}
        </span>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Workflow Name Input (when starting) */}
      {!isRecording && showNameInput && (
        <div className="mb-3 space-y-2">
          <label
            htmlFor="workflowName"
            className="block text-sm font-medium text-gray-700"
          >
            Workflow Name
          </label>
          <input
            id="workflowName"
            type="text"
            value={workflowNameInput}
            onChange={(e) => setWorkflowNameInput(e.target.value)}
            disabled={isLoading}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
              validationError ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="e.g., Login to Dashboard"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleStartRecording();
              } else if (e.key === 'Escape') {
                handleCancel();
              }
            }}
          />
          {validationError && (
            <p className="text-sm text-red-600">{validationError}</p>
          )}
        </div>
      )}

      {/* Control Buttons */}
      <div className="space-y-2">
        {!isRecording && !showNameInput && (
          <button
            onClick={handleStartClick}
            disabled={isLoading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed"
          >
            Start Recording
          </button>
        )}

        {!isRecording && showNameInput && (
          <div className="flex gap-2">
            <button
              onClick={handleStartRecording}
              disabled={isLoading}
              className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Starting...
                </>
              ) : (
                'Start'
              )}
            </button>
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        )}

        {isRecording && (
          <button
            onClick={handleStopRecording}
            disabled={isLoading}
            className="w-full bg-accent-600 hover:bg-accent-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Stopping...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <rect x="6" y="6" width="8" height="8" />
                </svg>
                Stop Recording
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
