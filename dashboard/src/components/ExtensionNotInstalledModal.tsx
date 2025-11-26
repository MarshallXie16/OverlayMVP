/**
 * Extension Not Installed Modal
 * 
 * Simple modal shown when user tries to start walkthrough without extension installed.
 * Focus on UX, not fancy UI (per user preference).
 * 
 * FE-013: Start Walkthrough Button
 */

import { useEffect } from 'react';

interface ExtensionNotInstalledModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExtensionNotInstalledModal: React.FC<ExtensionNotInstalledModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <svg 
                className="w-8 h-8 text-blue-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M13 10V3L4 14h7v7l9-11h-7z" 
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
            Extension Required
          </h2>

          {/* Message */}
          <p className="text-gray-600 text-center mb-6">
            To start a walkthrough, you need to install our Chrome extension first.
            The extension provides step-by-step guidance as you complete workflows.
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <a
              href="chrome://extensions" // TODO: Replace with actual Chrome Web Store URL
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md text-center"
            >
              Install Extension
            </a>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
            >
              Close
            </button>
          </div>

          {/* Help text */}
          <p className="mt-4 text-xs text-gray-500 text-center">
            After installing, refresh this page and try again.
          </p>
        </div>
      </div>
    </>
  );
};
