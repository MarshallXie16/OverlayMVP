# Sprint Review Checklist

Great work! Before we move onto the next sprint/task, let's take a moment to check through each of these systematically:

## 1) Check Test Coverage

Good test coverage is critical for ensuring the feature works as expected and protects us from regressions.

- For each component, ensure both the **happy path** and **ALL non-trivial edge cases** are tested.
- Ensure the tests are testing **behaviour, NOT implementation details** since these details may change over time.

## 2) Run All Affected Tests

Run all affected tests, including both newly added tests and tests for components whose behaviour has changed.

- If any tests fail, **trace down the root cause** and address it.
- Do **NOT** make symptom/quick fixes.
- Do **NOT** claim failed tests are unrelated; all tests were passing before implementing this feature.
- For non-trivial bugs/failures, launch a **debugger subagent** to investigate the issue.
- For really nasty bugs, use the `codex-delegate` skill to launch a **debugger codex subagent** for a more thorough investigation.

## 3) Update Documentation

Ensure all documentation is up-to-date.

- Systematically identify the changes made in this sprint/task, find or create the relevant documentation md files, and update the docs while **preserving the original writing style/tone**.
- Focus on documenting **architectural decisions/changes** and how specific functionality works at a high level.
- Do **NOT** document implementation details — these can change over time.
- As a rule of thumb, the documentation should be thorough enough to give an overview of the codebase and how the application works, while being concise and easy to read enough that an intern/junior can understand it.
- All documentation is maintained in `@docs/` and can be split into different folders for different parts of the project (e.g. frontend, backend, hosting, etc.).
- Maintain an `__INDEX.md__` file in `@docs/` directory for quick lookups.

## 4) Update Memories and Context Files

To ensure a deep, persistent understanding of the codebase, update the relevant context files. This ensures continuity across work sessions, so you remember the design decisions made, reasoning behind these decisions, and where everything is located.

> A good rule of thumb: **anything that is not written down is potentially lost!**

Preserve all valuable context by recording them in the following files:

### `memory.md` — Project Context & Codebase Conventions

This is the synthesized state of the entire project. It includes:

- What we're building (elevator pitch)
- Tech stack with versions
- Directory structure with annotations
- Code conventions and patterns
- Architecture decisions
- Current project state

Modify this file if there were any significant changes in this sprint.

### `backlog.md` — Future Work & Known Issues

Any bugs/issues found, optimization opportunities, or concerns that surfaced in this sprint that were **not addressed** should be added to this file. These tasks will be tackled in the future, so provide sufficient context to make investigation easier.

### `sprint.md` (or a specific plan file) — Session-Level Memory

This serves as a record of what happened in this session.

- Update the sprint plan to verify that **all tasks have been completed** up to standard.
- Go through each of the **acceptance criteria one by one** to ensure that we have met each one.
- Any deviations from the plan should be **flagged or justified** (sometimes priorities change throughout a sprint).

### `rules.md` — Learning & Self-Improvement

This file is how you learn and improve over time. It's an additional prompt layer applied on top of `CLAUDE.md` (your system prompt) which you have control over.

- Update this file with rules and reminders that you want your future self to follow (usually based on learning from your mistakes in this sprint).
- **Prune this file regularly** and keep it lightweight; under 200 lines.
- Focus on **quality over quantity**.
