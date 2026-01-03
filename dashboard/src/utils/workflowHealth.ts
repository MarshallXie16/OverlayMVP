/**
 * Workflow Health Utilities
 *
 * Calculates workflow health status based on:
 * - Workflow status (broken, needs_review, active, etc.)
 * - Success rate (percentage of successful executions)
 * - Consecutive failures (number of failures in a row)
 *
 * FE-012: Health Status Indicators
 */

import type { WorkflowListItem } from "@/api/types";

export type HealthStatus = "healthy" | "needs_review" | "broken" | "unknown";

export interface HealthInfo {
  status: HealthStatus;
  label: string;
  icon: string;
  colorClass: string;
  tooltipText: string;
}

// Minimum number of runs needed before applying success rate thresholds
const MIN_RUNS_FOR_HEALTH_STATUS = 5;

/**
 * Calculate workflow health status
 *
 * Priority hierarchy:
 * 1. Broken (status='broken' OR consecutive_failures >= 3)
 * 2. Needs Review (status='needs_review' OR success_rate 0.6-0.9 with enough data)
 * 3. Healthy (status='active' AND (success_rate > 0.9 OR insufficient data))
 * 4. Unknown (draft, processing, archived)
 */
export function calculateWorkflowHealth(
  workflow: WorkflowListItem,
): HealthStatus {
  // Broken takes highest priority (only if explicitly broken or has consecutive failures)
  if (workflow.status === "broken" || workflow.consecutive_failures >= 3) {
    return "broken";
  }

  // Check explicit needs_review status
  if (workflow.status === "needs_review") {
    return "needs_review";
  }

  // Active workflows: check success rate (only if we have enough data)
  if (workflow.status === "active") {
    // If not enough runs yet, assume healthy until we have reliable data
    if (workflow.total_uses < MIN_RUNS_FOR_HEALTH_STATUS) {
      return "healthy";
    }

    // Enough data - apply success rate thresholds
    if (workflow.success_rate > 0.9) {
      return "healthy";
    }
    if (workflow.success_rate >= 0.6) {
      return "needs_review";
    }
    // Active but low success rate with enough data is broken
    return "broken";
  }

  // Draft, processing, archived don't have health status yet
  return "unknown";
}

/**
 * Get complete health information including display properties
 */
export function getHealthInfo(workflow: WorkflowListItem): HealthInfo {
  const status = calculateWorkflowHealth(workflow);

  switch (status) {
    case "healthy":
      return {
        status: "healthy",
        label: "Healthy",
        icon: "✓",
        colorClass: "text-green-600 bg-green-50",
        tooltipText: `This workflow is running smoothly (${(workflow.success_rate * 100).toFixed(0)}% success rate)`,
      };

    case "needs_review":
      return {
        status: "needs_review",
        label: "Needs Review",
        icon: "⚠️",
        colorClass: "text-yellow-600 bg-yellow-50",
        tooltipText:
          workflow.status === "needs_review"
            ? "This workflow requires manual review"
            : `Success rate has dropped to ${(workflow.success_rate * 100).toFixed(0)}%`,
      };

    case "broken":
      return {
        status: "broken",
        label: "Broken",
        icon: "❌",
        colorClass: "text-red-600 bg-red-50",
        tooltipText:
          workflow.consecutive_failures >= 3
            ? `Failed ${workflow.consecutive_failures} times in a row`
            : "This workflow is not functioning properly",
      };

    case "unknown":
    default:
      return {
        status: "unknown",
        label: workflow.status,
        icon: "•",
        colorClass: "text-gray-600 bg-gray-50",
        tooltipText: `Workflow status: ${workflow.status}`,
      };
  }
}

/**
 * Compare function for sorting workflows by health
 * Broken workflows come first, then needs_review, then healthy, then unknown
 */
export function compareByHealth(
  a: WorkflowListItem,
  b: WorkflowListItem,
): number {
  const healthOrder: Record<HealthStatus, number> = {
    broken: 0,
    needs_review: 1,
    healthy: 2,
    unknown: 3,
  };

  const healthA = calculateWorkflowHealth(a);
  const healthB = calculateWorkflowHealth(b);

  const orderDiff = healthOrder[healthA] - healthOrder[healthB];

  // If same health status, sort by updated_at (newest first)
  if (orderDiff === 0) {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  }

  return orderDiff;
}
