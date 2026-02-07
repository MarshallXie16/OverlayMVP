/**
 * DynamicWorkflow Popup Component
 *
 * Shown in the popup when DYNAMIC_WORKFLOW_ENABLED feature flag is true.
 * Allows users to describe a goal in natural language and get AI-guided
 * step-by-step instructions to complete it.
 *
 * Features:
 * - Text input for the user's goal
 * - Start button to begin AI-guided workflow
 * - Status display when a session is active
 * - Entity confirmation UI for extracted parameters
 * - Stop button to end an active session
 */
import React, { useState, useEffect } from "react";
import { getFeatureFlag } from "../../shared/featureFlags";

interface DynamicWorkflowProps {}

export const DynamicWorkflow: React.FC<DynamicWorkflowProps> = () => {
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [goal, setGoal] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entities, setEntities] = useState<Record<string, string> | null>(null);
  const [status, setStatus] = useState<string>("idle");

  // Check feature flag and active session on mount
  useEffect(() => {
    // Check feature flag using shared helper (respects DEFAULT_FLAGS)
    getFeatureFlag("DYNAMIC_WORKFLOW_ENABLED").then(setFeatureEnabled);
    checkActiveSession();
  }, []);

  const checkActiveSession = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "DYNAMIC_COMMAND",
        command: "GET_STATE",
      });
      if (
        response?.success &&
        response?.state &&
        response.state.machineState !== "IDLE"
      ) {
        setIsActive(true);
        setStatus(response.state.machineState);
        setGoal(response.state.goal || "");
      }
    } catch {
      // No active session
    }
  };

  const handleStart = async () => {
    if (!goal.trim()) return;

    setIsStarting(true);
    setError(null);

    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        setError("No active tab found");
        setIsStarting(false);
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "DYNAMIC_COMMAND",
        command: "START",
        payload: { goal: goal.trim(), tabId: tab.id },
      });

      if (response?.success) {
        setIsActive(true);
        setStatus("INITIALIZING");

        // Check if entities need confirmation
        if (response.state?.machineState === "CONFIRMING_ENTITIES") {
          setEntities(response.state.goalEntities || {});
          setStatus("CONFIRMING_ENTITIES");
        }
      } else {
        setError(response?.error || "Failed to start workflow");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setIsStarting(false);
    }
  };

  const handleConfirmEntities = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "DYNAMIC_COMMAND",
        command: "CONFIRM_ENTITIES",
        payload: { entities: entities || {} },
      });

      if (response?.success) {
        setEntities(null);
        setStatus("CAPTURING");
      }
    } catch {
      setError("Failed to confirm entities");
    }
  };

  const handleStop = async () => {
    try {
      await chrome.runtime.sendMessage({
        type: "DYNAMIC_COMMAND",
        command: "EXIT",
      });
      setIsActive(false);
      setStatus("idle");
      setEntities(null);
      setGoal("");
    } catch {
      // Ignore
    }
  };

  // Don't render if feature is disabled or still loading
  if (featureEnabled === null || !featureEnabled) return null;

  // Active session UI
  if (isActive) {
    return (
      <div className="bg-white rounded-lg border border-indigo-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-indigo-700">
            AI Workflow Active
          </h3>
          <button
            onClick={handleStop}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
            aria-label="Stop AI workflow"
          >
            Stop
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-2 truncate" title={goal}>
          {goal}
        </p>

        {/* Entity confirmation */}
        {status === "CONFIRMING_ENTITIES" && entities && (
          <div className="bg-indigo-50 rounded-lg p-3 mb-3">
            <p className="text-xs font-medium text-indigo-700 mb-2">
              Confirm extracted info:
            </p>
            {Object.entries(entities).map(([key, value]) => (
              <div key={key} className="flex justify-between text-xs mb-1">
                <span className="text-gray-500">{key}:</span>
                <span className="font-medium text-gray-800">{value}</span>
              </div>
            ))}
            <button
              onClick={handleConfirmEntities}
              className="mt-2 w-full px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 transition-colors"
            >
              Looks good, start!
            </button>
          </div>
        )}

        {/* Status indicator */}
        {status !== "CONFIRMING_ENTITIES" && (
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full bg-green-400 animate-pulse"
              aria-hidden="true"
            ></div>
            <span className="text-xs text-gray-500">
              {status === "THINKING"
                ? "AI is thinking..."
                : status === "CAPTURING"
                  ? "Analyzing page..."
                  : status === "SHOWING_STEP"
                    ? "Showing next step..."
                    : status === "WAITING_ACTION"
                      ? "Waiting for action..."
                      : status === "NAVIGATING"
                        ? "Navigating..."
                        : status === "COMPLETED"
                          ? "Completed!"
                          : "Running..."}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Start workflow UI
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-2">
        AI-Guided Workflow
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        Describe what you want to do and AI will guide you step-by-step.
      </p>

      <label htmlFor="dynamic-workflow-goal" className="sr-only">
        Describe your goal
      </label>
      <textarea
        id="dynamic-workflow-goal"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder='e.g., "Submit an expense report for $56.99 from Walmart for printer ink"'
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
        rows={3}
        disabled={isStarting}
      />

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

      <button
        onClick={handleStart}
        disabled={!goal.trim() || isStarting}
        className="mt-2 w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isStarting ? "Starting..." : "Start AI Guidance"}
      </button>
    </div>
  );
};
