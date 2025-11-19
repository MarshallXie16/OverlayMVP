# User Story Implementation Workflow

You are implementing a user story/ticket from tasks.md or user_stories.md. Follow this systematic workflow to ensure modular, maintainable, and well-tested code.

## Phase 1: Context Gathering & Investigation (15-20% time)

### 1.1 Story Analysis
- Read the complete user story/ticket including acceptance criteria
- Identify the core business problem being solved
- Note any constraints, dependencies, or specific requirements
- Check completed_tasks.md for related work that might inform this implementation

### 1.2 Codebase Investigation
```
Questions to answer:
- What existing components can I reuse?
- What patterns are already established for this type of feature?
- Are there similar implementations I can reference?
- What are the current data models and their relationships?
```

Actions:
1. Read memory.md for project architecture overview
2. Investigate relevant existing files (minimum 3-5 related components)
3. Trace through the data flow of similar features
4. Document any undocumented code you encounter
5. Note technical debt or inefficiencies for later action

### 1.3 Knowledge Gaps
- List what you don't know but need to know
- Perform targeted web searches for unfamiliar concepts
- Check internal documentation for patterns/conventions
- Review any external API documentation if integrations are involved

## Phase 2: Design & Planning (20-25% time)

### 2.1 Solution Design
Generate 2-3 potential approaches:
```
Approach A: [Name]
- Description: [1-2 sentences]
- Pros: [2-3 points]
- Cons: [2-3 points]
- Effort: [Low/Medium/High]
- Risk: [Low/Medium/High]
```

### 2.2 Trade-off Analysis
Consider:
- Performance implications (will this scale to 10x users?)
- Maintainability (will another dev understand this in 6 months?)
- Testability (can this be easily unit tested?)
- Reusability (can this solution be extracted for future use?)
- Technical debt (are we adding or reducing it?)

### 2.3 Decision & Validation
1. Select approach with rationale
2. Challenge your assumptions:
   - "What could go wrong with this approach?"
   - "Is there a simpler solution I'm missing?"
   - "Will this integrate cleanly with existing code?"
3. If the change is significant (>500 lines or architectural), outline the plan and get user confirmation

### 2.4 Implementation Plan
Break down into logical chunks:
```
1. [Component/Module name] - [What it does] (Est: X mins)
2. [Component/Module name] - [What it does] (Est: X mins)
3. Tests - [Coverage plan] (Est: X mins)
4. Documentation updates (Est: X mins)
```

## Phase 3: Implementation (40-45% time)

### 3.1 Incremental Development
For each logical chunk:
1. Write the component/function with clear interfaces
2. Add comprehensive docstrings immediately
3. Handle edge cases and errors explicitly
4. Commit after each working unit with descriptive message

### 3.2 Code Quality Checklist
While coding, ensure:
- [ ] Functions are < 50 lines (break down if larger)
- [ ] Variable names are descriptive and consistent
- [ ] Complex logic has explanatory comments
- [ ] Error messages include context
- [ ] No hardcoded values (use constants/config)
- [ ] Proper logging at key points
- [ ] Input validation and sanitization

### 3.3 Continuous Refactoring
As you implement:
- Fix any poorly written code you encounter (if scope < 30 mins)
- Extract common patterns into reusable utilities
- Update outdated comments/documentation
- For larger issues, create tickets in tasks.md with prefix `TECH-DEBT:`

## Phase 4: Testing (10-15% time)

### 4.1 Test Coverage Strategy
```
Unit Tests (Required):
- Core business logic
- Data transformations
- Utility functions
- Error handling paths

Integration Tests (If applicable):
- API endpoints
- Database operations
- External service interactions
```

### 4.2 Test Implementation
For each test:
1. Write descriptive test names that explain the scenario
2. Include edge cases (empty, null, boundary values)
3. Test both success and failure paths
4. Use meaningful assertions with clear failure messages

### 4.3 Regression Testing
Run the full test suite for affected components:
```bash
# Example commands (adjust based on project):
npm test -- --coverage [component]
python -m pytest tests/[component] -v
```

If any tests fail:
1. Determine if it's a valid regression
2. Fix the issue before proceeding
3. Document the fix in memory.md if it reveals a pattern

## Phase 5: Documentation & Completion (5-10% time)

### 5.1 Technical Documentation
Update/create in `docs/` directory:
- Component overview (what it does, why it exists)
- API documentation (if applicable)
- Configuration options
- Usage examples
- Known limitations or caveats

### 5.2 Memory Updates
Update memory.md with:
- New patterns established
- Key architectural decisions
- Lessons learned
- Component relationships

### 5.3 Task Completion
1. Remove completed task from tasks.md
2. Add entry to completed_tasks.md:
```markdown
## [DATE] - [TASK-CODE]: [Brief Title]
**Original Scope**: [1-2 sentences]
**Delivered**: [What was actually implemented]
**Key Changes**: [Any scope changes or decisions made]
**Files Modified**: [List main files]
**Tests Added**: [Test coverage summary]
**Time Taken**: [Actual vs estimated]
**Notes**: [Any important context for future work]
```

### 5.4 Technical Debt Tracking
If you encountered issues but couldn't fix them:
```markdown
# In tasks.md, add:
## TECH-DEBT-[NUMBER]: [Issue Title]
**Priority**: [Low/Medium/High]
**Component**: [Affected area]
**Issue**: [Description of problem]
**Impact**: [Why this matters]
**Suggested Fix**: [Proposed solution]
**Estimate**: [Story points]
```

## Quality Gates

Before considering the story complete, verify:
- [ ] All acceptance criteria are met
- [ ] Code is modular and reusable
- [ ] Tests pass and cover critical paths
- [ ] Documentation is complete and clear
- [ ] No console errors or warnings
- [ ] Performance is acceptable (no obvious inefficiencies)
- [ ] Error handling is comprehensive
- [ ] Code follows project conventions
- [ ] memory.md and tasks.md are updated

## Red Flags to Escalate

Immediately notify the user if:
- The technical approach has major risks
- The story requirements are technically infeasible
- Implementation would create significant technical debt
- External dependencies are unavailable or incompatible
- Security vulnerabilities are discovered
- Performance implications are severe (>2x slower)
- The change breaks backward compatibility

## Iteration Mindset

Remember: Investigate → Think → Design → Implement → Test → Document → Reflect

At each step, ask yourself:
- "What do I know now that I didn't before?"
- "Is my approach still the best one?"
- "What can I simplify?"
- "What am I assuming that I should verify?"

Take the time needed to do this right. Clean, maintainable code now saves exponentially more time later.