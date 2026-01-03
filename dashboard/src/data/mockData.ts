/**
 * Mock Data for new views (Team, Health, Settings)
 * This data is used while these features are not yet connected to the backend
 */

// User roles and statuses
export enum UserRole {
  ADMIN = "ADMIN",
  EDITOR = "EDITOR",
  VIEWER = "VIEWER",
}

export enum UserStatus {
  ACTIVE = "ACTIVE",
  PENDING = "PENDING",
}

// Team member interface
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: UserRole;
  status: UserStatus;
  joinedAt: string;
}

// Execution log interface
export interface ExecutionLog {
  id: string;
  workflowId: string;
  workflowTitle: string;
  user: {
    name: string;
    avatarUrl: string;
  };
  timestamp: string;
  status: "SUCCESS" | "HEALED" | "FAILED";
  duration: string;
  errorMessage?: string;
}

// Health stats interface
export interface HealthStats {
  successRate: number;
  totalRuns: number;
  brokenWorkflows: number;
  healedCount: number;
  avgExecutionTime: string;
}

// Mock team members
export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: "u1",
    name: "Sarah Jenkins",
    email: "sarah@company.io",
    avatarUrl:
      "https://ui-avatars.com/api/?name=Sarah+Jenkins&background=6366f1&color=fff",
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    joinedAt: "Oct 12, 2023",
  },
  {
    id: "u2",
    name: "Alex Chen",
    email: "alex@company.io",
    avatarUrl:
      "https://ui-avatars.com/api/?name=Alex+Chen&background=0ea5e9&color=fff",
    role: UserRole.EDITOR,
    status: UserStatus.ACTIVE,
    joinedAt: "Nov 05, 2023",
  },
  {
    id: "u3",
    name: "Mike Ross",
    email: "mike@company.io",
    avatarUrl:
      "https://ui-avatars.com/api/?name=Mike+Ross&background=22c55e&color=fff",
    role: UserRole.VIEWER,
    status: UserStatus.PENDING,
    joinedAt: "Dec 01, 2023",
  },
  {
    id: "u4",
    name: "Emily Blunt",
    email: "emily@company.io",
    avatarUrl:
      "https://ui-avatars.com/api/?name=Emily+Blunt&background=f59e0b&color=fff",
    role: UserRole.VIEWER,
    status: UserStatus.ACTIVE,
    joinedAt: "Jan 15, 2024",
  },
];

// Mock execution logs
export const RECENT_EXECUTIONS: ExecutionLog[] = [
  {
    id: "ex1",
    workflowId: "wf1",
    workflowTitle: "Register Vendor Invoice",
    user: { name: "Alex Chen", avatarUrl: TEAM_MEMBERS[1].avatarUrl },
    timestamp: "10 mins ago",
    status: "SUCCESS",
    duration: "45s",
  },
  {
    id: "ex2",
    workflowId: "wf1",
    workflowTitle: "Register Vendor Invoice",
    user: { name: "Emily Blunt", avatarUrl: TEAM_MEMBERS[3].avatarUrl },
    timestamp: "1 hour ago",
    status: "HEALED",
    duration: "52s",
    errorMessage: "Selector #submit-btn not found. Auto-healed using AI match.",
  },
  {
    id: "ex3",
    workflowId: "wf3",
    workflowTitle: "Monthly Tax Report Generation",
    user: { name: "Sarah Jenkins", avatarUrl: TEAM_MEMBERS[0].avatarUrl },
    timestamp: "2 hours ago",
    status: "FAILED",
    duration: "12s",
    errorMessage: "Critical element .export-data missing from DOM.",
  },
  {
    id: "ex4",
    workflowId: "wf2",
    workflowTitle: "Onboard New Employee",
    user: { name: "Mike Ross", avatarUrl: TEAM_MEMBERS[2].avatarUrl },
    timestamp: "Yesterday",
    status: "SUCCESS",
    duration: "2m 10s",
  },
  {
    id: "ex5",
    workflowId: "wf1",
    workflowTitle: "Register Vendor Invoice",
    user: { name: "Alex Chen", avatarUrl: TEAM_MEMBERS[1].avatarUrl },
    timestamp: "Yesterday",
    status: "SUCCESS",
    duration: "42s",
  },
];

// Mock health stats
export const HEALTH_STATS: HealthStats = {
  successRate: 94.2,
  totalRuns: 1243,
  brokenWorkflows: 1,
  healedCount: 15,
  avgExecutionTime: "1m 12s",
};
