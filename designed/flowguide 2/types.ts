export enum WorkflowStatus {
    HEALTHY = 'HEALTHY',
    NEEDS_REVIEW = 'NEEDS_REVIEW',
    BROKEN = 'BROKEN',
    DRAFT = 'DRAFT',
    PROCESSING = 'PROCESSING'
}

export enum UserRole {
    ADMIN = 'ADMIN',
    EDITOR = 'EDITOR',
    VIEWER = 'VIEWER'
}

export enum UserStatus {
    ACTIVE = 'ACTIVE',
    PENDING = 'PENDING'
}

export interface Step {
    id: string;
    order: number;
    description: string;
    label: string;
    selector: string;
    actionType: 'CLICK' | 'INPUT' | 'SELECT' | 'NAVIGATE';
    value?: string;
    confidence: number; // 0 to 1
    screenshotUrl: string;
}

export interface User {
    id: string;
    name: string;
    avatarUrl: string;
}

export interface TeamMember extends User {
    email: string;
    role: UserRole;
    status: UserStatus;
    joinedAt: string;
}

export interface Workflow {
    id: string;
    title: string;
    description: string;
    creator: User;
    updatedAt: string;
    stepCount: number;
    status: WorkflowStatus;
    steps: Step[];
}

export interface AIAnalysisResult {
    summary: string;
    riskScore: number;
    suggestions: {
        stepId: string;
        issue: string;
        recommendation: string;
    }[];
}

export interface ExecutionLog {
    id: string;
    workflowId: string;
    workflowTitle: string;
    user: User;
    timestamp: string;
    status: 'SUCCESS' | 'HEALED' | 'FAILED';
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