# Implementation Review Workflow

You are conducting a thorough code review of recently implemented features. Your goal is to ensure code quality, identify issues, and validate that implementations meet both technical standards and business requirements.

## Phase 1: Review Preparation

### 1.1 Context Gathering
Before reviewing:
1. Read the original ticket/user story from tasks.md or completed_tasks.md
2. Understand the business problem being solved
3. Note acceptance criteria and definition of done
4. Check memory.md for any architectural decisions or patterns

### 1.2 Change Scope Analysis
```bash
# Get overview of changes
git status
git diff --stat
git log --oneline -10

# Identify changed components
find . -name "*.py" -o -name "*.js" -o -name "*.vue" | xargs git diff --name-only
```

Document the scope:
- Number of files changed
- Lines added/removed
- Components affected
- New dependencies added

## Phase 2: Systematic File Review

### 2.1 Review Order Strategy
Review files in this order for maximum context:
1. **Documentation** - Understand intended behavior
2. **Tests** - Understand expected behavior
3. **Models/Schemas** - Data structure changes
4. **Business Logic** - Core functionality
5. **API/Controllers** - Interface changes
6. **UI Components** - User-facing changes
7. **Configuration** - Environment/deployment changes

### 2.2 Per-File Review Checklist

For each file, evaluate:

**Correctness**
- [ ] Does the code do what it's supposed to do?
- [ ] Are all acceptance criteria met?
- [ ] Are edge cases handled?
- [ ] Is error handling appropriate?

**Code Quality**
- [ ] Is the code readable and self-documenting?
- [ ] Are functions focused on single responsibilities?
- [ ] Is there unnecessary complexity?
- [ ] Are naming conventions followed?

**Best Practices**
- [ ] DRY - No duplicated logic?
- [ ] SOLID principles followed?
- [ ] Proper abstraction levels?
- [ ] Consistent with existing patterns?

**Security**
- [ ] Input validation present?
- [ ] SQL injection prevention?
- [ ] XSS protection?
- [ ] Proper authentication/authorization?
- [ ] Sensitive data handled correctly?

**Performance**
- [ ] Database queries optimized?
- [ ] No N+1 query problems?
- [ ] Appropriate caching used?
- [ ] Memory leaks prevented?
- [ ] Async operations handled correctly?

## Phase 3: Detailed Code Analysis

### 3.1 Critical Areas to Focus

**Data Layer**
```python
# Check for:
- Proper indexing on queried fields
- Transaction boundaries
- Rollback handling
- Connection pooling
- Query optimization
```

**Business Logic**
```python
# Check for:
- Clear separation of concerns
- Proper validation
- Consistent error handling
- Logging at appropriate levels
- Pure functions where possible
```

**API Endpoints**
```python
# Check for:
- RESTful conventions
- Proper HTTP status codes
- Request/response validation
- Rate limiting considerations
- API versioning
```

**Frontend Components**
```javascript
// Check for:
- Props validation
- State management
- Event handler cleanup
- Memoization where needed
- Accessibility (ARIA labels)
```

### 3.2 Pattern Violations to Flag

**Anti-patterns**:
- God objects/functions (doing too much)
- Callback hell (should use async/await)
- Magic numbers/strings
- Premature optimization
- Copy-paste programming
- Tight coupling between components

**Code Smells**:
- Functions > 50 lines
- Files > 300 lines
- Too many parameters (>4)
- Deeply nested conditionals (>3 levels)
- Commented-out code
- TODO comments without tickets

## Phase 4: Testing Validation

### 4.1 Test Coverage Assessment

Run coverage analysis:
```bash
# Examples - adjust for your stack
npm test -- --coverage
pytest --cov=module tests/
```

Evaluate:
- Overall coverage percentage
- Critical path coverage
- Edge case coverage
- Error path coverage

### 4.2 Test Quality Review

For each test file:
- [ ] Test names clearly describe scenarios
- [ ] Tests are independent (no shared state)
- [ ] Both positive and negative cases tested
- [ ] Mocks are appropriate and minimal
- [ ] Assertions are specific and meaningful

### 4.3 Missing Test Scenarios

Common overlooked test cases:
- Null/undefined inputs
- Empty collections
- Boundary values
- Concurrent operations
- Network failures
- Permission denied scenarios
- Timezone edge cases

## Phase 5: Review Output Format

### 5.1 Review Summary
```markdown
# Code Review - [Feature/Ticket Name]

## Summary
**Overall Quality**: [Excellent/Good/Needs Work/Poor]
**Recommendation**: [Approve/Request Changes/Major Rework Needed]

### Key Findings
- ✅ [What was done well]
- ⚠️ [Areas needing attention]
- ❌ [Critical issues found]

## Statistics
- Files Changed: X
- Lines Added/Removed: +X/-Y
- Test Coverage: X%
- New Dependencies: [List any]
```

### 5.2 Issues by Severity

Format issues clearly with context:

```markdown
## 🔴 Critical Issues (Must Fix)

### Issue 1: [Clear Title]
**File**: `path/to/file.py:L45-L52`
**Current Code**:
​```python
[snippet of problematic code]
​```
**Problem**: [Explain what's wrong and why it matters]
**Suggested Fix**:
​```python
[corrected code]
​```
**Impact if not fixed**: [Real consequences]

## 🟡 Important Issues (Should Fix)
[Same format as critical]

## 🔵 Suggestions (Consider Fixing)
[Same format but optional]

## ✨ Positive Highlights
- [Particularly elegant solution]
- [Good pattern that should be reused]
- [Excellent test coverage]
```

### 5.3 Actionable Feedback Template

For each issue, provide:
1. **What** - The specific problem
2. **Where** - Exact location (file, line numbers)
3. **Why** - Why this is a problem
4. **How** - Concrete suggestion to fix
5. **Example** - Code snippet if applicable

## Phase 6: Documentation & Knowledge Capture

### 6.1 Update Memory
Add to memory.md:
- New patterns discovered (good or bad)
- Architectural decisions validated/questioned
- Common mistakes to avoid
- Reusable components identified

### 6.2 Create Tech Debt Tickets
If issues are too large to fix immediately:

```markdown
## TECH-DEBT-XXX: [Issue Title]
**Found During**: Review of [Ticket]
**Priority**: [High/Medium/Low]
**Component**: [Affected area]
**Issue**: [Detailed description]
**Suggested Fix**: [Approach]
**Estimate**: [Story points]
**Risk if not addressed**: [Impact]
```

## Review Philosophy

### Be Constructive
- Start with what's good
- Explain why something is problematic
- Provide concrete alternatives
- Teach, don't just criticize

### Be Thorough but Pragmatic
- Don't nitpick style if functionality is broken
- Focus on high-impact improvements
- Consider effort vs benefit
- Respect existing patterns unless they're harmful

### Be Specific
- Line numbers and file paths
- Code examples
- Clear reproduction steps for bugs
- Measurable improvements

## Self-Review Questions

Before submitting review:
1. Have I been constructive and respectful?
2. Are my suggestions actionable?
3. Have I explained the "why" behind each issue?
4. Are critical issues clearly distinguished from nice-to-haves?
5. Have I acknowledged good work?
6. Would I be able to action this feedback?

## Review Collaboration

If the implementer disagrees with feedback:
1. Listen to their reasoning
2. Consider their perspective
3. Focus on objective criteria (performance, maintainability, correctness)
4. Escalate to user only if critical disagreement
5. Document decision and reasoning in memory.md

Remember: The goal is better code, not perfect code. Focus on issues that materially impact correctness, performance, security, and maintainability.