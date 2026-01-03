import React from "react";
import { Clock, SlidersHorizontal, Trash2, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { DesignWorkflow, WorkflowStatus } from "@/types/design";
import { formatRelativeTime } from "@/utils/typeMappers";

interface WorkflowCardProps {
  workflow: DesignWorkflow;
  onClick: (wf: DesignWorkflow) => void;
  onDelete?: (wfId: string) => void;
}

export const WorkflowCard: React.FC<WorkflowCardProps> = ({
  workflow,
  onClick,
  onDelete,
}) => {
  const getStatusBorderColor = (status: WorkflowStatus): string => {
    switch (status) {
      case WorkflowStatus.HEALTHY:
        return "bg-green-500";
      case WorkflowStatus.BROKEN:
        return "bg-red-500";
      case WorkflowStatus.NEEDS_REVIEW:
        return "bg-amber-500";
      case WorkflowStatus.PROCESSING:
        return "bg-blue-500";
      default:
        return "bg-neutral-300";
    }
  };

  return (
    <div
      onClick={() => onClick(workflow)}
      className="group bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-full relative overflow-hidden"
    >
      {/* Decorative top border based on status */}
      <div
        className={`absolute top-0 left-0 w-full h-1 transition-all duration-500 group-hover:h-1.5 ${getStatusBorderColor(workflow.status)}`}
      />

      {/* Header: Badge & Actions */}
      <div className="flex justify-between items-start mb-4 mt-2">
        <Badge status={workflow.status} />

        {/* Action Buttons Container */}
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Open Icon (Visual cue) */}
          <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center hover:bg-primary-100 transition-colors">
            <FolderOpen size={16} />
          </div>

          {/* Delete Button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(workflow.id);
              }}
              className="w-8 h-8 rounded-full bg-white text-neutral-400 hover:text-red-500 hover:bg-red-50 border border-neutral-100 flex items-center justify-center transition-colors shadow-sm"
              title="Delete Workflow"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Title & Description */}
      <h3 className="text-xl font-bold text-neutral-900 mb-2 group-hover:text-primary-600 transition-colors line-clamp-1">
        {workflow.title}
      </h3>
      <p className="text-neutral-500 text-sm mb-6 line-clamp-2 flex-1 leading-relaxed">
        {workflow.description || "No description"}
      </p>

      {/* Footer Meta Data */}
      <div className="flex items-center justify-between pt-4 border-t border-neutral-100 text-sm text-neutral-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5" title="Last updated">
            <Clock size={14} />
            <span>{formatRelativeTime(workflow.updatedAt)}</span>
          </div>
          <div className="flex items-center gap-1.5" title="Step count">
            <SlidersHorizontal size={14} />
            <span>{workflow.stepCount} steps</span>
          </div>
        </div>
        <img
          src={workflow.creator.avatarUrl}
          alt={workflow.creator.name}
          className="w-7 h-7 rounded-full border-2 border-white shadow-sm"
          title={`Created by ${workflow.creator.name}`}
        />
      </div>
    </div>
  );
};
