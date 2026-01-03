import { Workflow, WorkflowStatus, TeamMember, UserRole, UserStatus, ExecutionLog, HealthStats } from './types';

export const MOCK_USER = {
    id: 'u1',
    name: 'Sarah Jenkins',
    avatarUrl: 'https://picsum.photos/seed/sarah/200'
};

export const TEAM_MEMBERS: TeamMember[] = [
    {
        id: 'u1',
        name: 'Sarah Jenkins',
        email: 'sarah@flowguide.io',
        avatarUrl: 'https://picsum.photos/seed/sarah/200',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        joinedAt: 'Oct 12, 2023'
    },
    {
        id: 'u2',
        name: 'Alex Chen',
        email: 'alex@flowguide.io',
        avatarUrl: 'https://picsum.photos/seed/alex/200',
        role: UserRole.EDITOR,
        status: UserStatus.ACTIVE,
        joinedAt: 'Nov 05, 2023'
    },
    {
        id: 'u3',
        name: 'Mike Ross',
        email: 'mike@flowguide.io',
        avatarUrl: 'https://picsum.photos/seed/mike/200',
        role: UserRole.VIEWER,
        status: UserStatus.PENDING,
        joinedAt: 'Dec 01, 2023'
    },
    {
        id: 'u4',
        name: 'Emily Blunt',
        email: 'emily@flowguide.io',
        avatarUrl: 'https://picsum.photos/seed/emily/200',
        role: UserRole.VIEWER,
        status: UserStatus.ACTIVE,
        joinedAt: 'Jan 15, 2024'
    }
];

export const WORKFLOWS: Workflow[] = [
    {
        id: 'wf1',
        title: 'Register Vendor Invoice',
        description: 'Standard process for entering new vendor invoices into the NetSuite portal.',
        creator: MOCK_USER,
        updatedAt: '2 days ago',
        stepCount: 7,
        status: WorkflowStatus.HEALTHY,
        steps: [
            {
                id: 's1',
                order: 1,
                actionType: 'NAVIGATE',
                description: 'Go to the vendor portal',
                label: 'Vendor Portal URL',
                selector: 'window.location',
                value: 'https://portal.netsuite.com/vendor',
                confidence: 1.0,
                screenshotUrl: 'https://picsum.photos/seed/nav/800/450'
            },
            {
                id: 's2',
                order: 2,
                actionType: 'CLICK',
                description: 'Click on "Transactions"',
                label: 'Transactions Menu',
                selector: '#top-menu-transactions',
                confidence: 0.95,
                screenshotUrl: 'https://picsum.photos/seed/click1/800/450'
            },
            {
                id: 's3',
                order: 3,
                actionType: 'INPUT',
                description: 'Enter the invoice number from the PDF',
                label: 'Invoice # Field',
                selector: 'input[name="tranid"]',
                confidence: 0.88,
                screenshotUrl: 'https://picsum.photos/seed/input1/800/450'
            },
             {
                id: 's4',
                order: 4,
                actionType: 'INPUT',
                description: 'Enter the total amount',
                label: 'Amount Field',
                selector: 'input[name="total"]',
                confidence: 0.92,
                screenshotUrl: 'https://picsum.photos/seed/input2/800/450'
            }
        ]
    },
    {
        id: 'wf2',
        title: 'Onboard New Employee',
        description: 'HR checklist for provisioning accounts and sending welcome emails.',
        creator: { ...MOCK_USER, name: 'Alex Chen' },
        updatedAt: '5 hours ago',
        stepCount: 12,
        status: WorkflowStatus.NEEDS_REVIEW,
        steps: []
    },
    {
        id: 'wf3',
        title: 'Monthly Tax Report Generation',
        description: 'Exporting data from Salesforce and formatting for compliance.',
        creator: MOCK_USER,
        updatedAt: '1 week ago',
        stepCount: 24,
        status: WorkflowStatus.BROKEN,
        steps: []
    }
];

export const RECENT_EXECUTIONS: ExecutionLog[] = [
    {
        id: 'ex1',
        workflowId: 'wf1',
        workflowTitle: 'Register Vendor Invoice',
        user: TEAM_MEMBERS[1],
        timestamp: '10 mins ago',
        status: 'SUCCESS',
        duration: '45s'
    },
    {
        id: 'ex2',
        workflowId: 'wf1',
        workflowTitle: 'Register Vendor Invoice',
        user: TEAM_MEMBERS[3],
        timestamp: '1 hour ago',
        status: 'HEALED',
        duration: '52s',
        errorMessage: 'Selector #submit-btn not found. Auto-healed using AI match.'
    },
    {
        id: 'ex3',
        workflowId: 'wf3',
        workflowTitle: 'Monthly Tax Report Generation',
        user: TEAM_MEMBERS[0],
        timestamp: '2 hours ago',
        status: 'FAILED',
        duration: '12s',
        errorMessage: 'Critical element .export-data missing from DOM.'
    },
    {
        id: 'ex4',
        workflowId: 'wf2',
        workflowTitle: 'Onboard New Employee',
        user: TEAM_MEMBERS[2],
        timestamp: 'Yesterday',
        status: 'SUCCESS',
        duration: '2m 10s'
    },
    {
        id: 'ex5',
        workflowId: 'wf1',
        workflowTitle: 'Register Vendor Invoice',
        user: TEAM_MEMBERS[1],
        timestamp: 'Yesterday',
        status: 'SUCCESS',
        duration: '42s'
    }
];

export const HEALTH_STATS: HealthStats = {
    successRate: 94.2,
    totalRuns: 1243,
    brokenWorkflows: 1,
    healedCount: 15,
    avgExecutionTime: '1m 12s'
};