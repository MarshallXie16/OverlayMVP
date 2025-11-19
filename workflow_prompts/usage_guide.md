# Workflow Prompts Usage Guide

This guide explains how to effectively use the autonomous coding agent prompts for maximum productivity and code quality.

## Prompt Architecture

### System Prompt (Base Layer)
**File**: `autonomous_coding_agent_prompt.md`
**Purpose**: Establishes the agent's core operating principles, documentation system, and quality standards
**When to Use**: Include as the base context for ALL coding sessions

### Workflow Prompts (Task Layer)
Specialized prompts for specific development phases:

| Workflow | File | Use Case |
|----------|------|----------|
| User Story Implementation | `workflow_user_story_implementation.md` | When assigning new features/tasks |
| Sprint Planning | `workflow_sprint_planning.md` | Planning sessions, feature negotiation |
| Implementation Review | `workflow_implementation_review.md` | Code review after implementation |
| Testing & Documentation | `workflow_testing_documentation.md` | Adding missing tests/docs |
| Refactoring & Bug Fixing | `workflow_refactoring_bugfixing.md` | Debugging and optimization |

## Usage Patterns

### Pattern 1: New Feature Development
```
1. System Prompt + User Story Implementation Workflow
2. Agent investigates, designs, implements
3. System Prompt + Testing & Documentation Workflow
4. Agent ensures comprehensive coverage
5. System Prompt + Implementation Review Workflow
6. Agent self-reviews or reviews subagent work
```

### Pattern 2: Sprint Cycle
```
START OF SPRINT:
- System Prompt + Sprint Planning Workflow
- Agent creates detailed tickets in tasks.md

DURING SPRINT:
- System Prompt + User Story Implementation Workflow
- Agent works through tickets systematically

END OF SPRINT:
- System Prompt + Sprint Planning Workflow (retrospective section)
- Agent summarizes completed work
```

### Pattern 3: Bug Resolution
```
1. System Prompt + Refactoring & Bug Fixing Workflow
2. Agent investigates and fixes bug
3. System Prompt + Testing & Documentation Workflow
4. Agent adds regression tests
5. Update fixed_bugs.md with resolution
```

### Pattern 4: Code Quality Improvement
```
1. System Prompt + Implementation Review Workflow
2. Agent identifies issues in existing code
3. System Prompt + Refactoring & Bug Fixing Workflow
4. Agent systematically improves code
5. Create TECH-DEBT tickets for larger issues
```

## Example Prompts

### Starting a New Feature
```
[Include System Prompt]
[Include User Story Implementation Workflow]

Implement ticket FE-001 from tasks.md. This is the start of a new session, so read memory.md first to understand the project structure, then proceed with the implementation following the workflow.
```

### Planning Next Sprint
```
[Include System Prompt]
[Include Sprint Planning Workflow]

We've completed the current sprint. Please summarize what was delivered (be honest about any limitations or stubs), then let's plan the next sprint. The client wants to add user authentication and a dashboard. Discuss feasibility and create detailed tickets.
```

### Reviewing Subagent Work
```
[Include System Prompt]
[Include Implementation Review Workflow]

Another agent has implemented the payment processing feature. Review the implementation in src/payments/ for code quality, security, and adherence to our patterns. Focus especially on error handling and PCI compliance.
```

### Fixing Production Bug
```
[Include System Prompt]
[Include Refactoring & Bug Fixing Workflow]

URGENT: Users report that profile updates aren't saving. Error logs show: "TypeError: Cannot read property 'id' of undefined" in UserController.js. This is affecting 30% of users. Investigate and fix immediately.
```

## Best Practices

### 1. Session Continuity
Always include the System Prompt to maintain consistent behavior across sessions. The agent should always read memory.md at the start of new sessions.

### 2. Workflow Stacking
You can combine workflows for complex tasks:
```
[System Prompt]
[User Story Implementation Workflow]
[Testing & Documentation Workflow]

Implement the feature and ensure comprehensive test coverage and documentation in a single session.
```

### 3. Progressive Enhancement
Start with simple instructions and add workflows as needed:
- Quick fix: System Prompt only
- Feature work: + Implementation Workflow
- Quality focus: + Review Workflow
- Full cycle: All relevant workflows

### 4. Context Preservation
Ensure the agent updates these files consistently:
- `memory.md` - After each session with learnings
- `tasks.md` - As work progresses
- `completed_tasks.md` - When tasks finish
- `fixed_bugs.md` - After bug resolutions
- `docs/` - With technical documentation

### 5. Delegation Patterns

**For Subagents**:
Give subagents specific workflows without the full system prompt:
```
[Include User Story Implementation Workflow]

Implement the sorting algorithm for the data table component. Follow the investigation and design phases carefully, and ensure the solution is efficient for datasets up to 10,000 rows.
```

**For Review Agents**:
```
[Include Implementation Review Workflow]

Review the recent changes to the authentication system. Focus on security vulnerabilities and ensure OAuth implementation follows best practices.
```

## Quality Assurance Triggers

Use these triggers to invoke specific workflows:

| Trigger | Action |
|---------|--------|
| "Tests failing" | Apply Bug Fixing Workflow |
| "Code is messy" | Apply Refactoring section |
| "Missing documentation" | Apply Testing & Documentation Workflow |
| "Planning next features" | Apply Sprint Planning Workflow |
| "Need code review" | Apply Implementation Review Workflow |

## Measuring Success

Track these metrics to gauge agent effectiveness:

### Velocity Metrics
- Story points completed per sprint
- Bug resolution time
- Feature cycle time (idea → production)

### Quality Metrics
- Test coverage percentage
- Bugs per feature
- Technical debt accumulation rate
- Documentation completeness

### Process Metrics
- Tickets created vs completed
- Refactoring frequency
- Pattern reuse rate
- Memory.md update frequency

## Troubleshooting

### Agent Not Following Workflow
- Ensure workflow is included at START of prompt
- Be explicit: "Follow the User Story Implementation Workflow"
- Check if conflicting instructions exist

### Poor Code Quality
- Add Implementation Review Workflow for self-review
- Emphasize quality gates in prompt
- Request explicit adherence to standards

### Missing Documentation
- Always include Testing & Documentation Workflow after implementation
- Make documentation a blocking requirement
- Check docs/ folder regularly

### Accumulating Technical Debt
- Schedule regular refactoring sessions
- Review TECH-DEBT tickets weekly
- Apply Refactoring Workflow proactively

## Evolution & Customization

These workflows should evolve based on your project needs:

1. **Track Patterns**: Note recurring issues in memory.md
2. **Adjust Workflows**: Modify prompts based on learnings
3. **Add Constraints**: Include project-specific requirements
4. **Create New Workflows**: Develop specialized prompts for unique needs
5. **Share Learnings**: Document successful patterns for reuse

Remember: These workflows are tools to achieve systematic, high-quality development. Adjust them as needed, but maintain the core principles of investigation, thoughtful design, incremental implementation, comprehensive testing, and continuous improvement.