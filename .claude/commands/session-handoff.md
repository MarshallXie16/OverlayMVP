# Session Handoff

You're preparing to hand off context to a new session (or this context is about to be compacted). Your goal is to preserve everything a fresh agent would need to continue seamlessly.

**This is NOT a simple summary.** Capture the specific details that would be lost in a generic compaction.

## What to Preserve

### 1. Current Task State

**What am I working on right now?**
- Task ID and title
- Acceptance criteria (copy verbatim if not in sprint.md)
- Current progress (what's done, what remains)
- Any blockers or pending decisions

**What files am I actively modifying?**
- List specific file paths
- What changes have been made
- What changes are pending

### 2. Investigation Findings

**What did I learn that isn't documented elsewhere?**
- How specific components work (that I discovered by reading code)
- Gotchas or quirks I encountered
- Patterns I identified in the codebase
- Failed approaches (what I tried that didn't work, and why)

### 3. Decisions Made

**What did I decide and why?**
- Architectural choices made this session
- Trade-offs considered
- Alternatives rejected

### 4. Context That Would Be Lost

**What do I know that's not in memory.md or sprint.md?**
- Specific implementation details in progress
- User preferences or clarifications from this conversation
- Nuances about requirements
- Relationships between components I discovered

### 5. Next Steps

**What should the next session do first?**
- Immediate next action (be specific)
- Files to read for context
- Tests to run to verify state
- Decisions that need user input

## Output Format

```markdown
# Session Handoff: [Date/Time]

## Current Task
**Task**: [ID] [Title]
**Status**: [In Progress / Blocked / Ready for Review]
**Progress**: [What's done]
**Remaining**: [What's left]

## Active Files
- `path/to/file.ts` - [What I'm doing with it]
- `path/to/other.ts` - [Status]

## Key Findings This Session
1. [Specific finding that would be lost]
2. [Another finding]

## Decisions Made
- **Decision**: [What]
  **Rationale**: [Why]
  **Alternatives Rejected**: [What else was considered]

## Failed Approaches (Don't Repeat)
- Tried [X] but it didn't work because [Y]

## Important Context
- [Anything the next session needs to know]
- [User clarifications from this conversation]

## Immediate Next Steps
1. [First thing to do]
2. [Second thing]
3. [Third thing]

## Files to Read First
- `path/to/file` - [Why]

## Open Questions for User
- [Any pending decisions]
```

## Instructions

1. Review the entire conversation for insights worth preserving
2. Check what's already in memory.md and sprint.md (don't duplicate)
3. Focus on SPECIFIC details, not general summaries
4. Be concrete: file paths, function names, error messages, exact decisions
5. Write for a fresh agent who has access to memory.md and sprint.md but nothing else

## After Creating Handoff

Update these files if needed (at project root level):
- `sprint.md` - Update task status and progress
- `memory.md` - Add any new patterns or decisions (if significant)
- `lessons.md` - Add any bugs fixed or lessons learned
- `session-handoff.md` - Write the session handoff to this document

The handoff document can be provided to the next session via the user's first message.
