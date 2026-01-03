/**
 * Design system types
 * These types are used by the UI components and are mapped from backend types
 */

export enum WorkflowStatus {
  HEALTHY = "HEALTHY",
  NEEDS_REVIEW = "NEEDS_REVIEW",
  BROKEN = "BROKEN",
  DRAFT = "DRAFT",
  PROCESSING = "PROCESSING",
}

export enum UserRole {
  ADMIN = "ADMIN",
  EDITOR = "EDITOR",
  VIEWER = "VIEWER",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  PENDING = "PENDING",
}

export interface DesignStep {
  id: string;
  order: number;
  description: string;
  label: string;
  selector: string;
  actionType: "CLICK" | "INPUT" | "SELECT" | "NAVIGATE";
  value?: string;
  confidence: number; // 0 to 1
  screenshotUrl: string;
}

export interface DesignUser {
  id: string;
  name: string;
  avatarUrl: string;
}

export interface TeamMember extends DesignUser {
  email: string;
  role: UserRole;
  status: UserStatus;
  joinedAt: string;
}

export interface DesignWorkflow {
  id: string;
  title: string;
  description: string;
  creator: DesignUser;
  updatedAt: string;
  stepCount: number;
  status: WorkflowStatus;
  steps: DesignStep[];
  successRate?: number;
  totalRuns?: number;
}

export interface ExecutionLog {
  id: string;
  workflowId: string;
  workflowTitle: string;
  user: DesignUser;
  timestamp: string;
  status: "SUCCESS" | "HEALED" | "FAILED";
  duration: string;
  errorMessage?: string;
}

export interface HealthStats {
  successRate: number;
  totalRuns: number;
  brokenWorkflows: number;
  healedCount: number;
  avgExecutionTime: string;
}
