/**
 * Edit Step Modal (FE-009)
 * Modal dialog for editing step labels and instructions
 */

import { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import type { StepResponse, UpdateStepRequest } from '@/api/types';
import { apiClient } from '@/api/client';
import { AuthenticatedImage } from './AuthenticatedImage';

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
  const [fieldLabel, setFieldLabel] = useState('');
  const [instruction, setInstruction] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Reset form when step changes
  useEffect(() => {
    if (step) {
      setFieldLabel(step.field_label || '');
      setInstruction(step.instruction || '');
      setError(null);
    }
  }, [step]);

  const handleSave = async () => {
    if (!step) return;

    // Validation
    if (!fieldLabel.trim()) {
      setError('Field label is required');
      return;
    }

    if (!instruction.trim()) {
      setError('Instruction is required');
      return;
    }

    if (fieldLabel.length > 100) {
      setError('Field label must be 100 characters or less');
      return;
    }

    if (instruction.length > 500) {
      setError('Instruction must be 500 characters or less');
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
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (step) {
      setFieldLabel(step.field_label || '');
      setInstruction(step.instruction || '');
    }
    setError(null);
    onClose();
  };

  if (!step) return null;

  const screenshotUrl = step.screenshot_id
    ? `http://localhost:8000/api/screenshots/${step.screenshot_id}/image`
    : null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleCancel}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
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
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white shadow-xl transition-all">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200">
                  <Dialog.Title className="text-lg font-semibold text-gray-900">
                    Edit Step {step.step_number}
                  </Dialog.Title>
                  <p className="mt-1 text-sm text-gray-500">
                    Update the field label and instruction for this step
                  </p>
                </div>

                {/* Content */}
                <div className="px-6 py-6 space-y-6 max-h-[calc(100vh-16rem)] overflow-y-auto">
                  {/* Screenshot */}
                  {screenshotUrl && (
                    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                      <AuthenticatedImage
                        src={screenshotUrl}
                        alt={`Step ${step.step_number} screenshot`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  {/* Error message */}
                  {error && (
                    <div className="rounded-md bg-red-50 p-4">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  {/* Field label input */}
                  <div>
                    <label
                      htmlFor="field-label"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Field Label <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="field-label"
                      type="text"
                      value={fieldLabel}
                      onChange={(e) => setFieldLabel(e.target.value)}
                      maxLength={100}
                      placeholder="e.g., Email Address"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {fieldLabel.length}/100 characters
                    </p>
                  </div>

                  {/* Instruction textarea */}
                  <div>
                    <label
                      htmlFor="instruction"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Instruction <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="instruction"
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="e.g., Enter your company email address"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {instruction.length}/500 characters
                    </p>
                  </div>

                  {/* Technical details accordion */}
                  <div>
                    <button
                      onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                      className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          showTechnicalDetails ? 'rotate-90' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      Technical Details
                    </button>

                    {showTechnicalDetails && (
                      <div className="mt-3 p-4 bg-gray-50 rounded-lg space-y-2 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">Action:</span>{' '}
                          <span className="text-gray-600">{step.action_type}</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Element:</span>{' '}
                          <span className="text-gray-600">
                            {step.element_meta.tag_name}
                          </span>
                        </div>
                        {step.selectors.primary && (
                          <div>
                            <span className="font-medium text-gray-700">Selector:</span>{' '}
                            <code className="text-xs bg-white px-2 py-1 rounded">
                              {step.selectors.primary}
                            </code>
                          </div>
                        )}
                        {step.ai_confidence !== null && (
                          <div>
                            <span className="font-medium text-gray-700">
                              AI Confidence:
                            </span>{' '}
                            <span className="text-gray-600">
                              {Math.round(step.ai_confidence * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
