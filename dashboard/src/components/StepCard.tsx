/**
 * StepCard Component
 * Displays a workflow step with screenshot, labels, and edit button
 */

import type { StepResponse } from '@/api/types';
import { AuthenticatedImage } from './AuthenticatedImage';

interface StepCardProps {
  step: StepResponse;
  onEdit: (step: StepResponse) => void;
}

export const StepCard: React.FC<StepCardProps> = ({ step, onEdit }) => {
  // Get confidence color
  const getConfidenceColor = (confidence: number | null): string => {
    if (!confidence) return 'bg-gray-100 text-gray-600';
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  // Get screenshot URL
  const screenshotUrl = step.screenshot_id
    ? `http://localhost:8000/api/screenshots/${step.screenshot_id}/image`
    : null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      {/* Step number header */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Step {step.step_number}
        </span>
        {step.ai_confidence !== null && (
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${getConfidenceColor(
              step.ai_confidence
            )}`}
          >
            {Math.round(step.ai_confidence * 100)}%
          </span>
        )}
      </div>

      {/* Screenshot */}
      <div className="relative aspect-video bg-gray-100">
        {screenshotUrl ? (
          <AuthenticatedImage
            src={screenshotUrl}
            alt={`Step ${step.step_number} screenshot`}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <svg
              className="w-12 h-12"
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
      </div>

      {/* Labels */}
      <div className="p-4 space-y-3">
        {/* Field label */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase">
              Label
            </span>
            {step.label_edited && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Edited
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900">
            {step.field_label || (
              <span className="text-gray-400 italic">No label</span>
            )}
          </p>
        </div>

        {/* Instruction */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 uppercase">
              Instruction
            </span>
            {step.instruction_edited && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Edited
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700">
            {step.instruction || (
              <span className="text-gray-400 italic">No instruction</span>
            )}
          </p>
        </div>

        {/* Action type */}
        <div className="pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-500">
            Action: <span className="font-medium">{step.action_type}</span>
          </span>
          {step.action_data?.input_value && (
            <span className="ml-2 text-xs text-gray-500">
              → "{step.action_data.input_value}"
            </span>
          )}
        </div>

        {/* Edit button */}
        <button
          onClick={() => onEdit(step)}
          className="w-full mt-3 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
        >
          Edit
        </button>
      </div>
    </div>
  );
};
