/**
 * Type Mappers
 * Convert between backend API types and design system types
 */

import {
  WorkflowListItem,
  WorkflowResponse,
  StepResponse,
  UserResponse,
} from "@/api/types";
import {
  WorkflowStatus,
  DesignWorkflow,
  DesignStep,
  DesignUser,
} from "@/types/design";

/**
 * Map backend workflow status to design WorkflowStatus enum
 */
export function mapWorkflowStatus(
  backendStatus: WorkflowListItem["status"],
): WorkflowStatus {
  switch (backendStatus) {
    case "active":
    case "needs_review":
    case "broken":
      return WorkflowStatus.ACTIVE;
    case "processing":
      return WorkflowStatus.PROCESSING;
    case "archived":
      return WorkflowStatus.ARCHIVED;
    case "draft":
    default:
      return WorkflowStatus.DRAFT;
  }
}

/**
 * Map backend action type to design action type
 */
export function mapActionType(
  backendActionType: StepResponse["action_type"],
): DesignStep["actionType"] {
  switch (backendActionType) {
    case "click":
    case "submit":
      return "CLICK";
    case "input_commit":
      return "INPUT";
    case "select_change":
      return "SELECT";
    case "navigate":
      return "NAVIGATE";
    default:
      return "CLICK";
  }
}

/**
 * Generate avatar URL from user name
 */
export function generateAvatarUrl(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=100`;
}

/**
 * Map backend UserResponse to design DesignUser
 */
export function mapUserToDesign(user: UserResponse): DesignUser {
  return {
    id: String(user.id),
    name: user.name,
    avatarUrl: generateAvatarUrl(user.name),
  };
}

/**
 * Map backend StepResponse to design DesignStep
 */
export function mapStepToDesign(
  step: StepResponse,
  screenshotBaseUrl: string = "",
): DesignStep {
  // Generate screenshot URL if screenshot_id exists
  const screenshotUrl = step.screenshot_id
    ? `${screenshotBaseUrl}/api/screenshots/${step.screenshot_id}/image`
    : "";

  return {
    id: String(step.id),
    order: step.step_number,
    description: step.instruction || "",
    label: step.field_label || `Step ${step.step_number}`,
    selector: step.selectors?.primary || step.selectors?.css || "",
    actionType: mapActionType(step.action_type),
    value: step.action_data?.value,
    confidence: step.ai_confidence || 0,
    screenshotUrl,
  };
}

/**
 * Map backend WorkflowListItem to design DesignWorkflow
 */
export function mapWorkflowListItemToDesign(
  workflow: WorkflowListItem,
  creatorName: string = "Unknown",
): DesignWorkflow {
  return {
    id: String(workflow.id),
    title: workflow.name,
    description: workflow.description || "",
    creator: {
      id: String(workflow.created_by || 0),
      name: creatorName,
      avatarUrl: generateAvatarUrl(creatorName),
    },
    updatedAt: workflow.updated_at,
    stepCount: workflow.step_count,
    status: mapWorkflowStatus(workflow.status),
    steps: [],
    successRate: workflow.success_rate,
    totalRuns: workflow.total_uses,
  };
}

/**
 * Map backend WorkflowResponse (with steps) to design DesignWorkflow
 */
export function mapWorkflowResponseToDesign(
  workflow: WorkflowResponse,
  creatorName: string = "Unknown",
  screenshotBaseUrl: string = "",
): DesignWorkflow {
  return {
    id: String(workflow.id),
    title: workflow.name,
    description: workflow.description || "",
    creator: {
      id: String(workflow.created_by || 0),
      name: creatorName,
      avatarUrl: generateAvatarUrl(creatorName),
    },
    updatedAt: workflow.updated_at,
    stepCount: workflow.step_count,
    status: mapWorkflowStatus(workflow.status),
    steps: workflow.steps.map((step) =>
      mapStepToDesign(step, screenshotBaseUrl),
    ),
    successRate: workflow.success_rate,
    totalRuns: workflow.total_uses,
  };
}

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 * @deprecated Use formatRelativeTimeInTimezone from @/utils/timezone instead
 * for timezone-aware formatting.
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) {
    return date.toLocaleDateString();
  } else if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return "Just now";
  }
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}
