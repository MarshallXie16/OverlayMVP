import React from "react";
import { WorkflowStatus } from "@/types/design";

interface BadgeProps {
  status: WorkflowStatus;
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({ status, size = "md" }) => {
  const getStyles = (): string => {
    switch (status) {
      case WorkflowStatus.PROCESSING:
        return "bg-blue-50 text-blue-700 border-blue-200 animate-pulse";
      case WorkflowStatus.ACTIVE:
        return "bg-green-50 text-green-700 border-green-200";
      case WorkflowStatus.DRAFT:
      default:
        return "bg-neutral-50 text-neutral-700 border-neutral-200";
      case WorkflowStatus.ARCHIVED:
        return "bg-neutral-100 text-neutral-500 border-neutral-200";
    }
  };

  const getLabel = (): string => {
    switch (status) {
      case WorkflowStatus.PROCESSING:
        return "Processing";
      case WorkflowStatus.ACTIVE:
        return "Active";
      case WorkflowStatus.ARCHIVED:
        return "Archived";
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
      {getLabel()}
    </span>
  );
};
