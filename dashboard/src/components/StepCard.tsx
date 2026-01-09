/**
 * StepCard Component
 * Displays a workflow step with screenshot, labels, and edit button
 * Glassmorphic design
 */

import {
  Edit2,
  CheckCircle,
  AlertCircle,
  Trash2,
  GripVertical,
} from "lucide-react";
import type { StepResponse } from "@/api/types";
import { AuthenticatedImage } from "./AuthenticatedImage";
import { Button } from "@/components/ui/Button";
import {
  getActionTypeColor,
  formatActionType,
  getScreenshotUrl,
} from "@/utils/stepUtils";

interface StepCardProps {
  step: StepResponse;
  onEdit: (step: StepResponse) => void;
  onDelete?: (stepId: number) => void;
  disableDelete?: boolean;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}

export const StepCard: React.FC<StepCardProps> = ({
  step,
  onEdit,
  onDelete,
  disableDelete = false,
  dragHandleProps,
  isDragging = false,
}) => {
  const screenshotUrl = getScreenshotUrl(step.screenshot_id);
  const isComplete = step.field_label && step.instruction;

  return (
    <div
      className={`glass-card rounded-2xl overflow-hidden border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer group ${
        isComplete ? "border-white/60" : "border-amber-200"
      } ${isDragging ? "opacity-50 shadow-2xl ring-2 ring-primary-500" : ""}`}
      onClick={() => onEdit(step)}
    >
      {/* Step number header */}
      <div className="relative">
        {/* Screenshot */}
        <div className="relative aspect-video bg-neutral-100 overflow-hidden">
          {screenshotUrl ? (
            <AuthenticatedImage
              src={screenshotUrl}
              alt={`Step ${step.step_number} screenshot`}
              className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-neutral-400">
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

          {/* Step number badge with drag handle */}
          <div className="absolute top-3 left-3 flex items-center gap-1">
            {dragHandleProps && (
              <div
                {...dragHandleProps}
                className="bg-neutral-900/80 backdrop-blur-sm text-white/70 hover:text-white p-1 rounded-md shadow-lg cursor-grab active:cursor-grabbing"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical size={14} />
              </div>
            )}
            <div className="bg-neutral-900/80 backdrop-blur-sm text-white text-xs font-bold font-mono px-2.5 py-1 rounded-md shadow-lg">
              Step {step.step_number}
            </div>
          </div>

          {/* Confidence badge */}
          {step.ai_confidence !== null && (
            <div
              className={`absolute top-3 right-3 px-2 py-1 rounded-md text-xs font-medium ${
                step.ai_confidence >= 0.8
                  ? "bg-green-100/90 text-green-800"
                  : step.ai_confidence >= 0.6
                    ? "bg-amber-100/90 text-amber-800"
                    : "bg-red-100/90 text-red-800"
              }`}
            >
              {Math.round(step.ai_confidence * 100)}%
            </div>
          )}

          {/* Edit overlay */}
          <div className="absolute inset-0 bg-primary-900/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
            <span className="bg-white text-neutral-900 px-4 py-2 rounded-xl font-semibold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2">
              <Edit2 size={14} /> Edit Step
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-3">
        {/* Action type badge and status */}
        <div className="flex items-center justify-between">
          <span
            className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${getActionTypeColor(step.action_type)}`}
          >
            {formatActionType(step.action_type)}
          </span>
          {isComplete ? (
            <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
              <CheckCircle size={12} /> Complete
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
              <AlertCircle size={12} /> Needs review
            </span>
          )}
        </div>

        {/* Field label */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Label
            </span>
            {step.label_edited && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Edited
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-neutral-900 line-clamp-1">
            {step.field_label || (
              <span className="text-neutral-400 italic">No label</span>
            )}
          </p>
        </div>

        {/* Instruction */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
              Instruction
            </span>
            {step.instruction_edited && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                Edited
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-600 line-clamp-2">
            {step.instruction || (
              <span className="text-neutral-400 italic">No instruction</span>
            )}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            icon={<Edit2 size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(step);
            }}
          >
            Edit Labels
          </Button>
          {onDelete && (
            <Button
              variant="secondary"
              size="sm"
              className={
                disableDelete
                  ? "text-neutral-400 cursor-not-allowed"
                  : "text-red-600 hover:bg-red-50 hover:border-red-200"
              }
              icon={<Trash2 size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                if (!disableDelete) {
                  onDelete(step.id);
                }
              }}
              disabled={disableDelete}
              title={disableDelete ? "Cannot delete the last step" : undefined}
              aria-label={
                disableDelete ? "Cannot delete the last step" : "Delete step"
              }
            />
          )}
        </div>
      </div>
    </div>
  );
};
