/**
 * Edit Step Modal (FE-009)
 * Modal dialog for editing step labels and instructions
 * Glassmorphic design
 */

import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { X, MousePointerClick, ChevronRight } from "lucide-react";
import type { StepResponse, UpdateStepRequest } from "@/api/types";
import { apiClient } from "@/api/client";
import { AuthenticatedImage } from "./AuthenticatedImage";
import { Button } from "@/components/ui/Button";
import { getScreenshotUrl } from "@/utils/stepUtils";

interface EditStepModalProps {
  step: StepResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedStep: StepResponse) => void;
}

export const EditStepModal: React.FC<EditStepModalProps> = ({
  step,
  isOpen,
  onClose,
  onSave,
}) => {
  const [fieldLabel, setFieldLabel] = useState("");
  const [instruction, setInstruction] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  useEffect(() => {
    if (step) {
      setFieldLabel(step.field_label || "");
      setInstruction(step.instruction || "");
      setError(null);
    }
  }, [step]);

  const handleSave = async () => {
    if (!step) return;

    if (!fieldLabel.trim()) {
      setError("Field label is required");
      return;
    }

    if (!instruction.trim()) {
      setError("Instruction is required");
      return;
    }

    if (fieldLabel.length > 100) {
      setError("Field label must be 100 characters or less");
      return;
    }

    if (instruction.length > 500) {
      setError("Instruction must be 500 characters or less");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updateData: UpdateStepRequest = {
        field_label: fieldLabel.trim(),
        instruction: instruction.trim(),
      };

      const updatedStep = await apiClient.updateStep(step.id, updateData);
      onSave(updatedStep);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (step) {
      setFieldLabel(step.field_label || "");
      setInstruction(step.instruction || "");
    }
    setError(null);
    onClose();
  };

  if (!step) return null;

  const screenshotUrl = getScreenshotUrl(step.screenshot_id);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-[1500]" onClose={handleCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-2xl bg-white shadow-2xl transition-all flex flex-col md:flex-row animate-fade-in border border-neutral-200">
                {/* Close Button */}
                <button
                  onClick={handleCancel}
                  className="absolute top-4 right-4 z-20 text-neutral-400 hover:text-white md:hover:text-neutral-600 bg-black/20 md:bg-neutral-100 p-2 rounded-full transition-colors"
                  aria-label="Close modal"
                >
                  <X size={20} />
                </button>

                {/* Left: Screenshot */}
                <div className="w-full md:w-3/5 bg-neutral-100 relative flex items-center justify-center overflow-hidden">
                  {screenshotUrl ? (
                    <AuthenticatedImage
                      src={screenshotUrl}
                      alt={`Step ${step.step_number} screenshot`}
                      className="max-w-full max-h-[40vh] md:max-h-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-64 text-neutral-400">
                      <svg
                        className="w-16 h-16"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-mono font-bold">
                    Step {step.step_number}
                  </div>
                </div>

                {/* Right: Form */}
                <div className="w-full md:w-2/5 p-6 md:p-8 flex flex-col h-full overflow-y-auto bg-white">
                  <Dialog.Title className="text-2xl font-bold text-neutral-900 mb-6">
                    Edit Step
                  </Dialog.Title>

                  <div className="space-y-6 flex-1">
                    {/* Error message */}
                    {error && (
                      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                        <p className="text-sm text-red-800">{error}</p>
                      </div>
                    )}

                    {/* Field label input */}
                    <div>
                      <label
                        htmlFor="field-label"
                        className="block text-sm font-bold text-neutral-700 mb-1.5"
                      >
                        Label <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="field-label"
                        type="text"
                        value={fieldLabel}
                        onChange={(e) => setFieldLabel(e.target.value)}
                        maxLength={100}
                        placeholder="e.g., Invoice Number Field"
                        className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-neutral-900 font-medium"
                      />
                      <div className="text-right text-xs text-neutral-400 mt-1">
                        {fieldLabel.length}/100
                      </div>
                    </div>

                    {/* Instruction textarea */}
                    <div>
                      <label
                        htmlFor="instruction"
                        className="block text-sm font-bold text-neutral-700 mb-1.5"
                      >
                        Instruction <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="instruction"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        maxLength={500}
                        rows={4}
                        placeholder="Describe what the user should do..."
                        className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-neutral-900 resize-none"
                      />
                      <div className="text-right text-xs text-neutral-400 mt-1">
                        {instruction.length}/500
                      </div>
                    </div>

                    {/* Technical details accordion */}
                    <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
                      <button
                        onClick={() =>
                          setShowTechnicalDetails(!showTechnicalDetails)
                        }
                        className="flex items-center gap-2 text-xs font-bold text-neutral-500 uppercase tracking-wide w-full"
                      >
                        <MousePointerClick size={14} />
                        Technical Details
                        <ChevronRight
                          size={14}
                          className={`ml-auto transition-transform ${showTechnicalDetails ? "rotate-90" : ""}`}
                        />
                      </button>

                      {showTechnicalDetails && (
                        <div className="mt-3 space-y-2 pt-3 border-t border-neutral-200">
                          <div>
                            <span className="text-xs text-neutral-400 block">
                              Action Type
                            </span>
                            <span className="text-sm font-mono text-neutral-700 bg-white px-2 py-0.5 rounded border border-neutral-200 inline-block">
                              {step.action_type}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-neutral-400 block">
                              Element
                            </span>
                            <span className="text-sm font-mono text-neutral-700">
                              {step.element_meta.tag_name}
                            </span>
                          </div>
                          {step.selectors.primary && (
                            <div>
                              <span className="text-xs text-neutral-400 block mb-1">
                                Selector
                              </span>
                              <code className="text-xs font-mono text-primary-700 bg-primary-50 px-2 py-1.5 rounded block break-all border border-primary-100">
                                {step.selectors.primary}
                              </code>
                            </div>
                          )}
                          {step.ai_confidence !== null && (
                            <div>
                              <span className="text-xs text-neutral-400 block">
                                AI Confidence
                              </span>
                              <span className="text-sm text-neutral-700">
                                {Math.round(step.ai_confidence * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-6 mt-6 border-t border-neutral-100 flex gap-3">
                    <Button
                      variant="secondary"
                      className="flex-1"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="accent"
                      className="flex-1"
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
