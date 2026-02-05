# Documentation Index

Quick reference for the Overlay Guidance codebase documentation.

## Architecture

| Document | Description |
|----------|-------------|
| [walkthrough-architecture.md](./walkthrough-architecture.md) | **Primary**: New state machine-based walkthrough system (Sprints 1-4) |
| [architecture/walkthrough-system.md](./architecture/walkthrough-system.md) | Legacy walkthrough architecture (pre-redesign) |
| [architecture/auto-healing.md](./architecture/auto-healing.md) | Auto-healing element recovery system |
| [action_detection_design.md](./action_detection_design.md) | Action detection design rationale |
| [recording-process.md](./recording-process.md) | Recording system workflow |

## Guides

| Document | Description |
|----------|-------------|
| [guides/QUICKSTART.md](./guides/QUICKSTART.md) | Getting started guide |
| [guides/TESTING_GUIDE.md](./guides/TESTING_GUIDE.md) | Testing practices |
| [guides/PRE_COMMIT_CHECKLIST.md](./guides/PRE_COMMIT_CHECKLIST.md) | Pre-commit quality checks |
| [../backend/docs/celery-setup.md](../backend/docs/celery-setup.md) | Celery and Redis background worker setup |
| [debugging-with-mcp.md](./debugging-with-mcp.md) | Debug with Chrome DevTools MCP |

## API & Database

| Document | Description |
|----------|-------------|
| [API_EXAMPLES.md](./API_EXAMPLES.md) | API usage examples |
| [DATABASE.md](./DATABASE.md) | Database schema documentation |

## Planning

| Document | Description |
|----------|-------------|
| [plans/walkthrough-overhaul/](./plans/walkthrough-overhaul/) | Walkthrough redesign sprint plans |
| [SME_VALUE_PROPOSITION.md](./SME_VALUE_PROPOSITION.md) | Business context |
| [plan.md](./plan.md) | High-level roadmap |

## Key Concepts

### Walkthrough System (New)

The walkthrough system guides users through recorded workflows. Architecture:

- **State Machine**: 9 states (IDLE → INITIALIZING → SHOWING_STEP → WAITING_ACTION → etc.)
- **Background**: SessionManager (single source of truth), NavigationWatcher, StepRouter, TabManager
- **Content**: WalkthroughController, UI layer, Action detection, Navigation handler
- **Messaging**: BackgroundBridge (typed commands, retry logic), DashboardBridge (origin validation)

See [walkthrough-architecture.md](./walkthrough-architecture.md) for details.

### Sprint Status

| Sprint | Focus | Status |
|--------|-------|--------|
| 1 | Foundation (State Machine) | Complete |
| 2 | UI Layer | Complete |
| 3 | Action Detection | Complete |
| 4 | Navigation & Multi-Page | Complete |
| 5 | Messaging Integration | Complete |
| 6 | Feature Flag Integration | Complete |

### Test Count

Test totals change frequently. Use `docs/guides/TESTING_GUIDE.md` commands to get current counts.

### Feature Flags

The walkthrough system uses a feature flag (`WALKTHROUGH_USE_NEW_SYSTEM`) to toggle between the legacy and new systems:

- **Default**: `true` (new system active)
- **Toggle**: Via popup Developer Settings
- **Storage**: `chrome.storage.local`

When flag is `true`:
- Background uses `SessionManager` state machine
- Content uses `WalkthroughController`

When flag is `false`:
- Background uses legacy `walkthroughSession.ts`
- Content uses legacy `walkthrough.ts` monolith
