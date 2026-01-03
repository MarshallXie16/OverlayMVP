import React from "react";
import { WorkflowStatus } from "@/types/design";

interface BadgeProps {
  status: WorkflowStatus;
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({ status, size = "md" }) => {
  const getStyles = (): string => {
    switch (status) {
      case WorkflowStatus.HEALTHY:
        return "bg-green-50 text-green-700 border-green-200";
      case WorkflowStatus.NEEDS_REVIEW:
        return "bg-amber-50 text-amber-700 border-amber-200";
      case WorkflowStatus.BROKEN:
        return "bg-red-50 text-red-700 border-red-200";
      case WorkflowStatus.PROCESSING:
        return "bg-blue-50 text-blue-700 border-blue-200 animate-pulse";
      case WorkflowStatus.DRAFT:
      default:
        return "bg-neutral-50 text-neutral-700 border-neutral-200";
    }
  };

  const getLabel = (): string => {
    switch (status) {
      case WorkflowStatus.HEALTHY:
        return "Healthy";
      case WorkflowStatus.NEEDS_REVIEW:
        return "Needs Review";
      case WorkflowStatus.BROKEN:
        return "Broken";
      case WorkflowStatus.PROCESSING:
        return "Processing";
      case WorkflowStatus.DRAFT:
      default:
        return "Draft";
    }
  };

  const sizeStyles =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold border uppercase tracking-wide ${sizeStyles} ${getStyles()}`}
    >
      {status === WorkflowStatus.HEALTHY && (
        <span className="mr-1 text-xs">✓</span>
      )}
      {status === WorkflowStatus.BROKEN && (
        <span className="mr-1 text-xs">!</span>
      )}
      {getLabel()}
    </span>
  );
};
