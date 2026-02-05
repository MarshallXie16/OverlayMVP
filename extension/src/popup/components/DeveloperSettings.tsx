/**
 * Developer Settings Component
 *
 * Provides toggles for feature flags and developer options.
 * Sprint 6: Enables switching between new and legacy walkthrough systems.
 */
import React, { useState, useEffect } from "react";
import { getFeatureFlag, setFeatureFlag } from "../../shared/featureFlags";

export const DeveloperSettings: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [useNewWalkthrough, setUseNewWalkthrough] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial flag value
  useEffect(() => {
    getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM")
      .then((value) => {
        setUseNewWalkthrough(value);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("[DeveloperSettings] Failed to load flag:", error);
        setIsLoading(false);
      });
  }, []);

  const handleToggle = async () => {
    const newValue = !useNewWalkthrough;
    setUseNewWalkthrough(newValue);

    try {
      await setFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM", newValue);
      console.log(
        `[DeveloperSettings] Walkthrough system set to: ${newValue ? "new" : "legacy"}`,
      );
    } catch (error) {
      console.error("[DeveloperSettings] Failed to save flag:", error);
      // Revert UI on error
      setUseNewWalkthrough(!newValue);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center space-x-2">
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="text-sm font-medium text-gray-700">
            Developer Settings
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          {/* Walkthrough System Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <label
                htmlFor="walkthrough-toggle"
                className="text-sm font-medium text-gray-700"
              >
                New Walkthrough System
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                {useNewWalkthrough
                  ? "Using state-machine based system"
                  : "Using legacy walkthrough system"}
              </p>
            </div>
            <button
              id="walkthrough-toggle"
              role="switch"
              aria-checked={useNewWalkthrough}
              disabled={isLoading}
              onClick={handleToggle}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full
                transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                ${isLoading ? "bg-gray-200 cursor-not-allowed" : useNewWalkthrough ? "bg-primary-600" : "bg-gray-300"}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                  ${useNewWalkthrough ? "translate-x-6" : "translate-x-1"}
                `}
              />
            </button>
          </div>

          {/* Info note */}
          <p className="text-xs text-gray-400 mt-3 flex items-start space-x-1">
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Reload the page after changing to apply the new system.</span>
          </p>
        </div>
      )}
    </div>
  );
};
