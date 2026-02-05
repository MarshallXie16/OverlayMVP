# Sprint 4: Navigation & Multi-Page - Investigation Notepad

**Created**: 2026-02-02
**Status**: Planning Complete (pending user confirmation)
**Sprint**: 4 of 6 (Walkthrough System Redesign)
**Plan File**: `/Users/marshallxie/.claude/plans/atomic-tumbling-lerdorf.md`

---

## Quick Reference

### Sprint 4 Tickets
| Ticket | Name | Priority | Status | Est Hours |
|--------|------|----------|--------|-----------|
| W-018 | NavigationWatcher.ts (Background) | P0 | Not Started | 5h |
| W-019 | NavigationHandler.ts (Content) | P0 | Not Started | 4h |
| W-020 | StepRouter.ts (Background) | P0 | Not Started | 5h |
| W-021 | TabManager.ts | P1 | Not Started | 3h |
| W-022 | Session Restoration Logic | P0 | Not Started | 4h |
| W-023 | Navigation Integration Tests | P1 | Not Started | 6h |

**Total**: ~27 hours

### Key Dependencies
- Sprint 1: Foundation (StateMachine, SessionManager) - COMPLETE
- Sprint 2: UI Layer (Overlay, Spotlight, Tooltip) - COMPLETE
- Sprint 3: Action Detection (ActionDetector, ActionValidator, ClickInterceptor) - COMPLETE

---

## Investigation Progress

### 1. Current Walkthrough Architecture (Sprints 1-3)
**Status**: COMPLETE

Key Findings:
- State machine has 9 states including NAVIGATING
- Navigation state fields exist: `inProgress`, `sourceUrl`, `targetUrl`, `startedAt`
- Events defined: URL_CHANGED, PAGE_LOADED, NAVIGATION_TIMEOUT, TAB_READY
- SessionManager broadcasts state via `chrome.tabs.sendMessage`
- WalkthroughController has placeholder `showNavigating()` method
- TAB_READY handshake exists in `signalTabReady()`

### 2. Legacy Navigation Handling
**Status**: COMPLETE

Key Findings:
- 200ms setTimeout hack in content script initialization
- `navigationInProgress` flag can get stuck
- `forceNavigationComplete()` workaround exists
- Race condition between content script init and webNavigation.onCompleted
- Two sources of truth (content script state + background flag)

### 3. Recording System (Backwards Compatibility)
**Status**: COMPLETE

Key Findings:
- Steps use `page_context.url` for the DEPARTING page URL
- Navigate steps have NO `target_url` field - destination inferred from next step
- URL matching ignores query params, normalizes trailing slashes
- `expectedUrl` in session state is set from webNavigation events

---

## Codex Review Summary (2026-02-02)

**Overall Assessment**: Needs revision

### Critical Issues Identified

1. **Navigation not tab-correlated**: Any tab's PAGE_LOADED can complete navigation
   - **Fix**: Add `navigation.tabId` to state, guard PAGE_LOADED

2. **SW restart breaks timeout**: In-memory setTimeout lost
   - **Fix**: Use `chrome.alarms` OR compute from `startedAt` on init

3. **JUMP_TO only from TRANSITIONING**: StepRouter can't jump from active states
   - **Fix**: Add state machine transitions from SHOWING_STEP/WAITING_ACTION

4. **Tab promotion conflicts**: SessionManager ends session on primary close
   - **Fix**: Decided to END session (simpler MVP)

5. **Double URL_CHANGED events**: StepRouter + NavigationWatcher both dispatch
   - **Fix**: NavigationWatcher is sole producer

### Missing Considerations
- Restricted URLs (chrome://, extension pages)
- Redirect chains
- SPA route changes without full reload

---

## Design Decisions

### Decision 1: End Session on Primary Tab Close
**Options**: (A) Promote next tab, (B) End session
**Chosen**: (B) End session
**Rationale**: Simpler to implement, avoids race conditions during promotion

### Decision 2: Single-Tab Navigation MVP
**Options**: (A) Multi-tab navigation, (B) Primary tab only
**Chosen**: (B) Primary tab only
**Rationale**: Only `primaryTabId` drives navigation events, removes biggest race surface

### Decision 3: NavigationWatcher as Sole Producer of URL_CHANGED
**Options**: (A) StepRouter also dispatches, (B) NavigationWatcher only
**Chosen**: (B) NavigationWatcher only
**Rationale**: Avoids double-sourcing, cleaner event flow

### Decision 4: chrome.alarms for Navigation Timeout
**Options**: (A) setTimeout, (B) chrome.alarms
**Chosen**: (B) chrome.alarms
**Rationale**: Survives service worker restarts

---

## Code References

### Files to Create
```
extension/src/background/walkthrough/
├── NavigationWatcher.ts    (~150 lines)
├── StepRouter.ts           (~200 lines)
└── TabManager.ts           (~100 lines)

extension/src/content/walkthrough/navigation/
├── index.ts                (~30 lines)
└── NavigationHandler.ts    (~150 lines)
```

### Files to Modify
```
extension/src/shared/walkthrough/
├── StateMachine.ts         (add transitions, guard PAGE_LOADED)
└── WalkthroughState.ts     (add navigation.tabId)

extension/src/background/walkthrough/
└── SessionManager.ts       (add getStateForTab method)

extension/src/content/walkthrough/
└── WalkthroughController.ts (integrate NavigationHandler)
```

---

## Session Log

### 2026-02-02 - Session 1
- Read Sprint 4 plan and overview
- Created notepad
- Launched 3 Explore agents for:
  1. New walkthrough architecture (Sprints 1-3)
  2. Legacy navigation handling
  3. Recording system / backwards compatibility
- Read key files: StateMachine.ts, messages.ts, SessionManager.ts, WalkthroughController.ts
- Created detailed implementation plan
- Invoked Codex review - identified 5 critical issues
- Updated plan to address Codex findings
- Pending: User confirmation on design decisions
