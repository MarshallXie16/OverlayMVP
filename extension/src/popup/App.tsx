/**
 * Main Popup App Component
 * Handles authentication state and displays appropriate UI
 *
 * FE-004: Popup UI (Login/Recording Controls)
 */
import React, { useEffect } from "react";
import { useAuthStore } from "./store/authStore";
import { useRecordingStore } from "./store/recordingStore";
import { LoginForm } from "./components/LoginForm";
import { RecordingControls } from "./components/RecordingControls";
import { WorkflowList } from "./components/WorkflowList";
import { FailedUploads } from "./components/FailedUploads";
import { DeveloperSettings } from "./components/DeveloperSettings";

const App: React.FC = () => {
  const { user, isLoading, checkAuth, logout } = useAuthStore();
  const { checkRecordingState } = useRecordingStore();

  useEffect(() => {
    checkAuth();
    // Check recording state when popup opens
    checkRecordingState();
  }, [checkAuth, checkRecordingState]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      // Error handling is done in the store
    }
  };

  // Loading state
  if (isLoading && !user) {
    return (
      <div className="w-[400px] h-[600px] flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-2"
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
          <p className="text-sm text-primary-700">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login form
  if (!user) {
    return (
      <div className="w-[400px] h-[600px] flex items-center justify-center p-6 bg-gradient-to-br from-primary-50 to-primary-100">
        <LoginForm />
      </div>
    );
  }

  // Authenticated - show main UI
  return (
    <div className="w-[400px] h-[600px] bg-gradient-to-br from-primary-50 to-primary-100">
      {/* Header with user info and logout */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">
                {user.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.company_name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
            aria-label="Logout"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div
        className="p-4 space-y-4 overflow-y-auto"
        style={{ height: "calc(600px - 60px)" }}
      >
        <FailedUploads />
        <RecordingControls />
        <WorkflowList />
        <DeveloperSettings />
      </div>
    </div>
  );
};

export default App;
