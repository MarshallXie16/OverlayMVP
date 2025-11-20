/**
 * Main Popup App Component
 * Handles authentication state and displays appropriate UI
 */
import React from 'react';

const App: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-primary-50 to-primary-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-primary-900 mb-2">
          Workflow Recorder
        </h1>
        <p className="text-sm text-primary-700">
          Extension build successful!
        </p>
        <div className="mt-4 p-4 bg-white rounded-lg shadow-sm">
          <p className="text-xs text-gray-600">
            This is a placeholder. Authentication and recording UI will be implemented in FE-004.
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;
