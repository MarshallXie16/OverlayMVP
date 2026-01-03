import React from 'react';
import { WorkflowStatus } from '../types';

interface BadgeProps {
  status: WorkflowStatus;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => {
  const getStyles = () => {
    switch (status) {
      case WorkflowStatus.HEALTHY:
        return 'bg-green-50 text-green-700 border-green-200';
      case WorkflowStatus.NEEDS_REVIEW:
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case WorkflowStatus.BROKEN:
        return 'bg-red-50 text-red-700 border-red-200';
      case WorkflowStatus.PROCESSING:
        return 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
      default:
        return 'bg-neutral-50 text-neutral-700 border-neutral-200';
    }
  };

  const getLabel = () => {
    switch (status) {
      case WorkflowStatus.HEALTHY: return 'Healthy';
      case WorkflowStatus.NEEDS_REVIEW: return 'Needs Review';
      case WorkflowStatus.BROKEN: return 'Broken';
      case WorkflowStatus.PROCESSING: return 'Processing AI';
      default: return 'Draft';
    }
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border uppercase tracking-wide ${getStyles()}`}>
      {status === WorkflowStatus.HEALTHY && <span className="mr-1.5 text-sm">✓</span>}
      {status === WorkflowStatus.BROKEN && <span className="mr-1.5 text-sm">!</span>}
      {getLabel()}
    </span>
  );
};