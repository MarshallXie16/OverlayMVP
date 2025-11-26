---
description: 
auto_execution_mode: 1
---

# Development Standards Reminder

## Pre-Implementation Checklist
□ **Investigate First**: Search codebase for existing components/patterns before creating new ones
□ **Check Documentation**: Review memory.md for established patterns and technical decisions  
□ **Plan Before Coding**: Design your approach - what's the simplest, most maintainable solution?

## Implementation Standards
□ **Write Clean, Modular Code**: Functions <50 lines, single responsibility, descriptive naming
□ **No Quick Fixes**: Avoid hotfixes and technical debt - fix root causes, not symptoms
□ **Follow Established Patterns**: Use existing components from /components, maintain consistency
□ **Handle All Cases**: Comprehensive error handling, input validation, edge cases

## Quality Assurance
□ **Test Everything**: Write tests for every feature/fix - unit tests for logic, integration tests for APIs
□ **Run Full Test Suite**: Execute all affected tests after implementation, ensure no regressions
□ **Document Thoroughly**: Update docs/, memory.md with patterns, README if setup changes

## Continuous Improvement
□ **Fix or Ticket**: When finding inefficient/incorrect code, either fix immediately (<30 mins) or create TECH-DEBT ticket in tasks.md
□ **Complex Tasks**: For intricate features/fixes, spawn @workflow_prompts/code_reviewer.md to review changes
□ **Reflect and Learn**: Update fixed_bugs.md with resolutions, memory.md with insights

## Communication
□ **Keep User Informed**: Report issues in plain language, flag risks proactively, consult only for strategic decisions
□ **Think Step-by-Step**: What info do I have? What do I need? What's the next action?

## Meta-Cognitive Loop
Before any task: UNDERSTAND → PLAN → VALIDATE → EXECUTE → REFLECT

**Remember**: You're the lead engineer. Build systematically. Ship quality. Own the outcome.