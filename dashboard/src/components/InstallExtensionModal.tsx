/**
 * Install Extension Modal
 *
 * Post-signup modal prompting users to install the Chrome extension.
 * For MVP, shows a placeholder message since extension isn't on Chrome Web Store yet.
 *
 * Story 1.3: Extension Installation
 */

import { useEffect } from "react";
import { Puzzle, ArrowRight, X } from "lucide-react";
import { showToast } from "@/utils/toast";

interface InstallExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSkip: () => void;
}

export const InstallExtensionModal: React.FC<InstallExtensionModalProps> = ({
  isOpen,
  onClose: _onClose, // Kept for API compatibility, using onSkip for all close actions
  onSkip,
}) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onSkip();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onSkip]);

  const handleInstallClick = () => {
    // For MVP: Show placeholder message
    // TODO: Replace with actual Chrome Web Store URL once extension is published
    showToast.info(
      "Coming soon to Chrome Web Store! For now, load the extension manually in developer mode.",
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onSkip}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
          {/* Close button */}
          <button
            onClick={onSkip}
            className="absolute top-4 right-4 p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <X size={20} />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center">
              <Puzzle className="w-10 h-10 text-primary-600" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-center text-neutral-900 mb-3">
            Install the FlowGuide Extension
          </h2>

          {/* Message */}
          <p className="text-neutral-600 text-center mb-8">
            Record and play workflows directly in your browser. The extension
            provides step-by-step guidance as you complete tasks.
          </p>

          {/* Features list */}
          <div className="space-y-3 mb-8">
            {[
              "Record workflows with one click",
              "Auto-guided walkthroughs for your team",
              "Works on any web application",
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg
                    className="w-3 h-3 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <span className="text-sm text-neutral-700">{feature}</span>
              </div>
            ))}
          </div>

          {/* Install Button */}
          <button
            onClick={handleInstallClick}
            className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl text-white bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 font-semibold shadow-lg transition-all duration-200 hover:-translate-y-0.5 mb-4"
          >
            Install Extension
            <ArrowRight size={18} />
          </button>

          {/* Skip link */}
          <button
            onClick={onSkip}
            className="w-full text-center text-sm text-neutral-500 hover:text-neutral-700 font-medium py-2 transition-colors"
          >
            I&apos;ll do this later
          </button>
        </div>
      </div>
    </>
  );
};
