# Walkthrough System Overhaul - Overview

**Initiative**: Full rewrite of walkthrough system
**Total Duration**: 18-22 days across 6 sprints (revised per Codex review)
**Status**: Planning Complete - Ready for Sprint 1
**Last Updated**: 2026-01-30 (incorporated Codex review feedback)

---

## Executive Summary

The current walkthrough system is a 2,266-line monolith with dual state management, timing-based hacks for multi-page support, and race conditions patched with boolean guards. This initiative will replace it with a modular, state-machine-driven architecture.

### Goals
1. **Reliability**: Eliminate race conditions by design (formal state machine)
2. **Maintainability**: Break monolith into ~15 focused modules
3. **Multi-page Support**: Event-driven navigation (no timing hacks)
4. **User Flexibility**: Jump to any step, retry, restart, browser back/forward

### Key Decisions
- **State Machine**: Lightweight custom (~300 lines, XState-inspired, no dependencies)
- **Architecture**: Background-centric (SessionManager is single source of truth)
- **Migration**: Feature flag allows rollback during transition period
- **UI**: Keep existing walkthrough UI - wrap in modules, don't rewrite

### Codex Review Fixes (2026-01-30)
- **StateMachine location**: Moved to `shared/walkthrough/` (not content-only) so background can import
- **State fanout**: Use `chrome.tabs.sendMessage` instead of BroadcastChannel (origin issues)
- **Content handshake**: Added `TAB_READY` event for reliable content script initialization
- **StepRouter**: Moved to background (can't import SessionManager from content)
- **Estimates**: Revised to 18-22 days (was 14-16)

---

## Sprint Overview

| Sprint | Name | Duration | Tickets | Dependencies |
|--------|------|----------|---------|--------------|
| 1 | Foundation | 3-4 days | W-001 to W-005 | None |
| 2 | UI Layer | 2-3 days | W-006 to W-012 | Sprint 1 |
| 3 | Action Detection | 2 days | W-013 to W-017 | Sprint 1 |
| 4 | Navigation | 3 days | W-018 to W-023 | Sprints 1, 2, 3 |
| 5 | Messaging | 2 days | W-024 to W-028 | Sprints 1-4 |
| 6 | Migration | 2 days | W-029 to W-033 | All above |

```
Sprint 1 (Foundation)
    │
    ├── Sprint 2 (UI Layer)
    │       │
    │       └── Sprint 4 (Navigation) ──┐
    │                                   │
    └── Sprint 3 (Action Detection) ────┤
                                        │
                                        └── Sprint 5 (Messaging)
                                                │
                                                └── Sprint 6 (Migration)
```

---

## Architecture Overview

### State Machine (9 States)

```
IDLE → INITIALIZING → SHOWING_STEP ↔ WAITING_ACTION
                           ↓              ↓
                      NAVIGATING      TRANSITIONING → COMPLETED
                           ↓              ↓
                      HEALING ←──── ERROR
```

### Module Structure (Revised)

```
extension/src/
├── shared/walkthrough/            # Shared by content + background
│   ├── StateMachine.ts            # State transitions (MOVED HERE)
│   ├── WalkthroughState.ts        # Unified state interface
│   ├── events.ts                  # Event definitions
│   ├── messages.ts                # Message protocol (NEW)
│   └── constants.ts               # Timeouts, thresholds
│
├── content/walkthrough/           # Content script modules
│   ├── WalkthroughController.ts   # Orchestrator (renders state)
│   ├── ui/                        # UI wrappers (existing UI kept)
│   ├── actions/                   # User action handling
│   └── messaging/                 # Communication bridges
│
├── background/walkthrough/        # Background modules
│   ├── SessionManager.ts          # SINGLE SOURCE OF TRUTH
│   ├── NavigationWatcher.ts       # webNavigation events
│   ├── TabManager.ts              # Multi-tab support
│   └── StepRouter.ts              # Step navigation (MOVED HERE)
```

**Note**: Existing walkthrough UI (overlay, spotlight, tooltip CSS) is kept as-is.
Sprint 2 wraps existing UI in modules rather than rewriting.

### Message Protocol (Simplified)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `WALKTHROUGH_COMMAND` | Content → Background | START, NEXT, PREV, JUMP_TO, RETRY, EXIT |
| `WALKTHROUGH_STATE_CHANGED` | Background → Content | State broadcasts |
| `WALKTHROUGH_ELEMENT_STATUS` | Content → Background | Element found/not found |
| `WALKTHROUGH_HEALING_RESULT` | Content → Background | Healing outcome |
| `WALKTHROUGH_EXECUTION_LOG` | Content → Background | Log to backend |

---

## Success Criteria

### Per-Sprint
- [ ] All tickets completed
- [ ] Unit tests written and passing
- [ ] Build passes
- [ ] Code reviewed

### Initiative-Wide
- [ ] Multi-page walkthrough works without timing hacks
- [ ] User can navigate back to any step
- [ ] User can retry failed steps
- [ ] Feature flag allows rollback to old system
- [ ] All 484+ existing tests still pass
- [ ] Old monolith removed
- [ ] Documentation updated

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| State machine complexity | High | Medium | Comprehensive unit tests, state visualization |
| Multi-page timing | High | Low | Event-driven design, timeout safeguards |
| Feature parity regression | High | Medium | Feature flag rollback, parallel testing |
| Chrome storage limits | Medium | Low | Monitor usage, implement LRU |
| Service worker restarts | Medium | Low | Stateless design, all state in storage |

---

## References

- Original plan: `/Users/marshallxie/.claude/plans/twinkling-squishing-lollipop.md`
- Investigation notepad: `docs/notepad-recording-ai-investigation-2026-01-24.md`
- Current walkthrough: `extension/src/content/walkthrough.ts`
- Current session manager: `extension/src/background/walkthroughSession.ts`
