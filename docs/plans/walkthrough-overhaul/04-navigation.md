# Sprint 4: Navigation & Multi-Page

**Duration**: 4 days (revised per Codex review)
**Dependencies**: Sprints 1, 2, 3
**Status**: Not Started
**Last Updated**: 2026-01-30 (incorporated Codex review feedback)

---

## Objective

Implement robust multi-page navigation support using event-driven coordination (no timing hacks). This is the most critical sprint for reliability - it replaces the fragile `navigationInProgress` flag with proper state machine transitions.

---

## Tickets

### W-018: Create NavigationWatcher.ts (Background)
**Priority**: P0
**Estimate**: 5 hours
**Dependencies**: Sprint 1 complete
**Files to Create**:
- `extension/src/background/walkthrough/NavigationWatcher.ts` (~150 lines)

**Acceptance Criteria**:
- [ ] Listens to chrome.webNavigation events
- [ ] Dispatches URL_CHANGED on onBeforeNavigate
- [ ] Dispatches PAGE_LOADED on onCompleted
- [ ] Handles navigation errors (onErrorOccurred)
- [ ] Detects browser back/forward (onHistoryStateUpdated)
- [ ] 30-second navigation timeout
- [ ] Main frame only (frameId === 0)

**Key API**:
```typescript
class NavigationWatcher {
  private sessionManager: SessionManager;
  private navigationTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionManager: SessionManager);

  initialize(): void;
  destroy(): void;

  private handleBeforeNavigate(details: chrome.webNavigation.WebNavigationFrameInfo): Promise<void>;
  private handleCompleted(details: chrome.webNavigation.WebNavigationFrameInfo): Promise<void>;
  private handleError(details: chrome.webNavigation.WebNavigationErrorInfo): Promise<void>;
  private handleHistoryUpdate(details: chrome.webNavigation.WebNavigationTransitionInfo): Promise<void>;

  private isRelevantTab(tabId: number): Promise<boolean>;
  private setNavigationTimeout(): void;
  private clearNavigationTimeout(): void;
}
```

**Event Handling**:
| Chrome Event | State Machine Event | Condition |
|--------------|---------------------|-----------|
| onBeforeNavigate | URL_CHANGED | Tab in session, main frame |
| onCompleted | PAGE_LOADED | Tab in session, main frame |
| onErrorOccurred | INIT_FAILED | Tab in session, main frame |
| onHistoryStateUpdated | JUMP_TO_STEP | Back/forward detected |

---

### W-019: Create NavigationHandler.ts (Content)
**Priority**: P0
**Estimate**: 4 hours
**Dependencies**: Sprint 1, W-018
**Files to Create**:
- `extension/src/content/walkthrough/navigation/NavigationHandler.ts` (~150 lines)
- `extension/src/content/walkthrough/navigation/index.ts` (~30 lines)

**Acceptance Criteria**:
- [ ] Checks for active session on page load
- [ ] Notifies background that tab is ready
- [ ] Handles state broadcasts during navigation
- [ ] Coordinates with controller for step rendering
- [ ] No timing delays (event-driven only)

**Key API**:
```typescript
class NavigationHandler {
  private controller: WalkthroughController;
  private hasCheckedSession: boolean = false;

  constructor(controller: WalkthroughController);

  /**
   * Called on content script initialization
   * Checks if there's an active session to restore
   */
  async checkAndRestore(): Promise<void>;

  /**
   * Handle state changes that affect navigation
   */
  onStateChanged(state: WalkthroughState): void;

  private async queryBackgroundForSession(): Promise<WalkthroughState | null>;
  private notifyTabReady(): Promise<void>;
}
```

**Restoration Flow** (replaces 200ms delay hack):
```
Content script loads
    ↓
NavigationHandler.checkAndRestore()
    ↓
Send WALKTHROUGH_COMMAND { command: 'GET_STATE' }
    ↓
Background returns state (or null)
    ↓
If state.machineState !== 'IDLE':
    ↓
    Send WALKTHROUGH_ELEMENT_STATUS { tabReady: true }
    ↓
    Controller receives state via broadcast
    ↓
    Controller renders current step
```

---

### W-020: Create StepRouter.ts
**Priority**: P0
**Estimate**: 5 hours
**Dependencies**: Sprint 1, W-018, W-019
**Files to Create**:
- `extension/src/background/walkthrough/StepRouter.ts` (~200 lines)

**IMPORTANT (Codex Review)**: StepRouter must be in background (not content) because:
1. It needs direct access to SessionManager
2. Content scripts can't import background singletons
3. Navigation should be background-driven (`chrome.tabs.update`) for reliability

**Acceptance Criteria**:
- [ ] Jump to any step (not just next/prev)
- [ ] Handle same-page jumps (just update UI)
- [ ] Handle cross-page jumps (trigger navigation)
- [ ] Validate step accessibility
- [ ] Restart workflow (jump to step 0)
- [ ] URL matching with normalization

**Key API**:
```typescript
interface JumpResult {
  success: boolean;
  navigating?: boolean;
  reason?: 'invalid_index' | 'same_step' | 'no_session';
}

class StepRouter {
  constructor(private sessionManager: SessionManager);

  async next(): Promise<JumpResult>;
  async previous(): Promise<JumpResult>;
  async jumpToStep(targetIndex: number): Promise<JumpResult>;
  async retry(): Promise<JumpResult>;
  async restart(): Promise<JumpResult>;

  private async getCurrentState(): Promise<WalkthroughState | null>;
  private urlsMatch(url1: string, url2: string): boolean;
  private needsNavigation(currentUrl: string, targetUrl: string | null): boolean;
  private initiateNavigation(targetIndex: number, url: string): Promise<JumpResult>;
}
```

**URL Matching**:
```typescript
private urlsMatch(url1: string, url2: string): boolean {
  try {
    const u1 = new URL(url1);
    const u2 = new URL(url2);
    // Compare origin + pathname (ignore query params for flexibility)
    return u1.origin === u2.origin && u1.pathname === u2.pathname;
  } catch {
    return url1 === url2;
  }
}
```

---

### W-021: Create TabManager.ts
**Priority**: P1
**Estimate**: 3 hours
**Dependencies**: Sprint 1
**Files to Create**:
- `extension/src/background/walkthrough/TabManager.ts` (~100 lines)

**Acceptance Criteria**:
- [ ] Tracks tabs in active session
- [ ] Handles tab closure (chrome.tabs.onRemoved)
- [ ] Promotes primary tab if closed
- [ ] Ends session if all tabs closed
- [ ] Handles new tab creation from walkthrough

**Key API**:
```typescript
class TabManager {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager);

  initialize(): void;
  destroy(): void;

  private handleTabRemoved(tabId: number): Promise<void>;
  private handleTabCreated(tab: chrome.tabs.Tab): Promise<void>;

  async addTab(tabId: number): Promise<void>;
  async removeTab(tabId: number): Promise<void>;
  async getPrimaryTab(): Promise<number | null>;
  async promotePrimaryTab(): Promise<void>;
}
```

**Tab Lifecycle**:
1. Session starts → primary tab set
2. User opens new tab from workflow → add to tabIds
3. Tab closes → remove from tabIds
4. Primary tab closes → promote first remaining tab
5. All tabs close → end session

---

### W-022: Session Restoration Logic
**Priority**: P0
**Estimate**: 4 hours
**Dependencies**: W-018, W-019, W-020
**Files to Modify**:
- `extension/src/content/walkthrough/WalkthroughController.ts` (~+100 lines)
- `extension/src/background/walkthrough/SessionManager.ts` (~+50 lines)

**Acceptance Criteria**:
- [ ] Content script restores state on page load
- [ ] No timing-based delays
- [ ] Handles rapid page transitions
- [ ] State machine in correct state after restore
- [ ] UI renders correctly after restore

**Restoration Sequence**:
```
1. Page loads (navigation complete)
2. Content script initializes
3. NavigationHandler.checkAndRestore()
4. Background returns current state
5. Controller subscribes to state broadcasts
6. Controller calls showCurrentStep()
7. Background receives PAGE_LOADED event
8. State machine transitions NAVIGATING → SHOWING_STEP
9. State broadcast updates any other tabs
```

**Key Changes to SessionManager**:
```typescript
class SessionManager {
  // New method for content script queries
  async getStateForTab(tabId: number): Promise<{
    state: WalkthroughState | null;
    shouldRestore: boolean;
  }> {
    const state = await this.getState();
    if (!state) return { state: null, shouldRestore: false };

    const isInSession = state.tabs.activeTabIds.includes(tabId);
    const shouldRestore = isInSession && state.machineState !== 'IDLE';

    return { state: shouldRestore ? state : null, shouldRestore };
  }
}
```

---

### W-023: Navigation Integration Tests
**Priority**: P1
**Estimate**: 6 hours
**Dependencies**: W-018 to W-022
**Files to Create**:
- `extension/src/background/walkthrough/__tests__/NavigationWatcher.test.ts` (~100 lines)
- `extension/src/content/walkthrough/navigation/__tests__/StepRouter.test.ts` (~100 lines)
- `extension/src/content/walkthrough/navigation/__tests__/integration.test.ts` (~150 lines)

**Test Cases**:

**NavigationWatcher.test.ts**:
- [ ] Dispatches URL_CHANGED on navigation start
- [ ] Dispatches PAGE_LOADED on navigation complete
- [ ] Ignores non-session tabs
- [ ] Ignores iframe navigations (frameId !== 0)
- [ ] Handles navigation timeout (30s)
- [ ] Detects browser back/forward

**StepRouter.test.ts**:
- [ ] next() advances to next step
- [ ] previous() goes back one step
- [ ] jumpToStep() jumps to arbitrary step
- [ ] Same-page jump doesn't trigger navigation
- [ ] Cross-page jump triggers window.location change
- [ ] URL matching normalizes paths
- [ ] restart() jumps to step 0

**integration.test.ts**:
- [ ] Full navigation cycle (start → navigate → restore → continue)
- [ ] Multiple page transitions in sequence
- [ ] Back button handling
- [ ] Tab closure during walkthrough

---

## Files Changed Summary

| Action | Path | Est. Lines |
|--------|------|------------|
| Create | `extension/src/background/walkthrough/NavigationWatcher.ts` | ~150 |
| Create | `extension/src/background/walkthrough/TabManager.ts` | ~100 |
| Create | `extension/src/content/walkthrough/navigation/index.ts` | ~30 |
| Create | `extension/src/content/walkthrough/navigation/NavigationHandler.ts` | ~150 |
| Create | `extension/src/content/walkthrough/navigation/StepRouter.ts` | ~200 |
| Modify | `extension/src/content/walkthrough/WalkthroughController.ts` | ~+100 |
| Modify | `extension/src/background/walkthrough/SessionManager.ts` | ~+50 |
| Create | `extension/src/background/walkthrough/__tests__/NavigationWatcher.test.ts` | ~100 |
| Create | `extension/src/content/walkthrough/navigation/__tests__/StepRouter.test.ts` | ~100 |
| Create | `extension/src/content/walkthrough/navigation/__tests__/integration.test.ts` | ~150 |

**Total New Lines**: ~1,130

---

## Definition of Done

- [ ] All 6 tickets completed
- [ ] Multi-page navigation works without timing hacks
- [ ] Browser back/forward detected and handled
- [ ] Tab closure cleans up properly
- [ ] All tests pass
- [ ] Build passes
- [ ] Manual testing: complete multi-page workflow

---

## Key Differences from Old System

| Aspect | Old System | New System |
|--------|------------|------------|
| Navigation detection | `navigationInProgress` flag | State machine NAVIGATING state |
| Timing | 200ms delay after page load | Event-driven (PAGE_LOADED event) |
| Restoration | `shouldRestore` check in content script | State broadcast from background |
| Flag stuck | `forceNavigationComplete()` workaround | State machine prevents stuck states |
| Back button | Not handled | onHistoryStateUpdated detection |

---

## Critical Path

This sprint is the **critical path** for the entire initiative. The old navigation system's fragility is the #1 complaint. Getting this right eliminates:

1. "Walkthrough disappeared after page change"
2. "Had to refresh to continue walkthrough"
3. "Walkthrough got stuck on wrong page"

**Risk Mitigation**:
- Comprehensive tests before integration
- Manual testing of multi-page workflows
- Feature flag allows quick rollback
