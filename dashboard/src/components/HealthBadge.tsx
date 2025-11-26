/**
 * HealthBadge Component
 * 
 * Displays workflow health status with icon, label, and tooltip.
 * Used in workflow cards and detail pages.
 * 
 * FE-012: Health Status Indicators
 */

import { getHealthInfo } from '@/utils/workflowHealth';
import type { WorkflowListItem } from '@/api/types';

interface HealthBadgeProps {
  workflow: WorkflowListItem;
  /** Size variant */
  size?: 'small' | 'large';
  /** Show label text alongside icon */
  showLabel?: boolean;
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({
  workflow,
  size = 'small',
  showLabel = true,
}) => {
  const health = getHealthInfo(workflow);

  // Size classes
  const sizeClasses = {
    small: 'px-2 py-1 text-xs',
    large: 'px-3 py-2 text-sm',
  };

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full font-medium ${health.colorClass} ${sizeClasses[size]}`}
      title={health.tooltipText}
    >
      <span>{health.icon}</span>
      {showLabel && <span>{health.label}</span>}
    </div>
  );
};
