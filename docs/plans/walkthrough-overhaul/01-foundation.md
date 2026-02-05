# Sprint 1: Foundation

**Duration**: 4-5 days (revised per Codex review)
**Dependencies**: None
**Status**: Not Started
**Last Updated**: 2026-01-30 (incorporated Codex review feedback)

---

## Objective

Build the foundational layer: shared types, state machine, and session manager. This sprint establishes the architectural patterns that all subsequent sprints will build upon.

---

## Tickets

### W-001: Create Shared Types and Constants
**Priority**: P0 (Blocker for all other tickets)
**Estimate**: 4 hours
**Files to Create**:
- `extension/src/shared/walkthrough/WalkthroughState.ts` (~100 lines)
- `extension/src/shared/walkthrough/events.ts` (~80 lines)
- `extension/src/shared/walkthrough/constants.ts` (~40 lines)
- `extension/src/shared/walkthrough/index.ts` (~20 lines)

**Acceptance Criteria**:
- [ ] `WalkthroughMachineState` type with all 9 states
- [ ] `WalkthroughState` interface (unified, replaces dual state)
- [ ] `WalkthroughEvent` union type for all transition events
- [ ] Constants: timeouts, retry limits, confidence thresholds
- [ ] TypeScript compiles without errors

**Key Types to Define**:
```typescript
type WalkthroughMachineState =
  | 'IDLE' | 'INITIALIZING' | 'NAVIGATING' | 'SHOWING_STEP'
  | 'WAITING_ACTION' | 'HEALING' | 'TRANSITIONING' | 'ERROR' | 'COMPLETED';

interface WalkthroughState {
  sessionId: string;
  machineState: WalkthroughMachineState;
  workflowId: number;
  steps: StepResponse[];
  currentStepIndex: number;
  completedStepIndexes: number[];
  errorInfo: { type: string | null; message: string | null; retryCount: number };
  navigation: { inProgress: boolean; targetUrl: string | null };
  tabs: { primaryTabId: number; activeTabIds: number[] };
  timing: { sessionStartedAt: number; expiresAt: number };
  stepRetries: Record<number, number>;
}

type WalkthroughEvent =
  | { type: 'START'; workflowId: number }
  | { type: 'DATA_LOADED'; workflow: WorkflowResponse }
  | { type: 'ELEMENT_FOUND' }
  | { type: 'ELEMENT_NOT_FOUND' }
  | { type: 'ACTION_DETECTED' }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'JUMP_TO_STEP'; stepIndex: number }
  | { type: 'URL_CHANGED'; url: string }
  | { type: 'PAGE_LOADED' }
  | { type: 'RETRY' }
  | { type: 'EXIT' };
```

---

### W-002: Implement StateMachine.ts
**Priority**: P0
**Estimate**: 8 hours
**Dependencies**: W-001
**Files to Create**:
- `extension/src/shared/walkthrough/StateMachine.ts` (~300 lines)

**IMPORTANT (Codex Review)**: State machine must be in `shared/` (not content-only) so both
background and content can import it. Must have NO DOM or chrome.* side effects.

**Acceptance Criteria**:
- [ ] State machine with all 9 states
- [ ] Transition function with guard conditions
- [ ] Event dispatch mechanism
- [ ] State change listeners (pub/sub)
- [ ] Invalid transition rejection with error logging
- [ ] Serializable state (no Maps, only plain objects)

**Key API**:
```typescript
class WalkthroughStateMachine {
  constructor(initialState?: WalkthroughState);

  getState(): WalkthroughState;
  dispatch(event: WalkthroughEvent): WalkthroughState;
  subscribe(listener: (state: WalkthroughState) => void): () => void;
  canTransition(event: WalkthroughEvent): boolean;

  private transition(state: WalkthroughState, event: WalkthroughEvent): WalkthroughState;
  private getNextMachineState(current: WalkthroughMachineState, event: WalkthroughEvent): WalkthroughMachineState | null;
}
```

**Transition Matrix** (subset):
| Current State | Event | Next State | Guard |
|---------------|-------|------------|-------|
| IDLE | START | INITIALIZING | workflowId provided |
| INITIALIZING | DATA_LOADED | SHOWING_STEP | steps.length > 0 |
| SHOWING_STEP | ELEMENT_FOUND | WAITING_ACTION | element interactable |
| SHOWING_STEP | ELEMENT_NOT_FOUND | HEALING | candidates exist |
| WAITING_ACTION | ACTION_DETECTED | TRANSITIONING | action valid |
| WAITING_ACTION | URL_CHANGED | NAVIGATING | - |
| NAVIGATING | PAGE_LOADED | SHOWING_STEP | - |
| TRANSITIONING | (auto) | SHOWING_STEP | hasNextStep |
| TRANSITIONING | (auto) | COMPLETED | isLastStep |

---

### W-003: Implement SessionManager.ts
**Priority**: P0
**Estimate**: 8 hours
**Dependencies**: W-001, W-002
**Files to Create**:
- `extension/src/background/walkthrough/SessionManager.ts` (~300 lines)
- `extension/src/background/walkthrough/index.ts` (~30 lines)

**Acceptance Criteria**:
- [ ] Single source of truth for walkthrough state
- [ ] Persists to chrome.storage.session
- [ ] State machine instance for transitions
- [ ] Broadcasts state changes to all tabs
- [ ] Session timeout handling (30 minutes)
- [ ] Tab tracking (add/remove)

**Key API**:
```typescript
class SessionManager {
  private stateMachine: WalkthroughStateMachine;

  async initialize(): Promise<void>;
  async getState(): Promise<WalkthroughState | null>;
  async dispatch(event: WalkthroughEvent): Promise<WalkthroughState>;

  async addTab(tabId: number): Promise<void>;
  async removeTab(tabId: number): Promise<void>;
  async markTabReady(tabId: number): Promise<void>;  // NEW: TAB_READY handshake

  private async persistState(): Promise<void>;
  private async loadState(): Promise<WalkthroughState | null>;
  private async broadcastStateToTabs(state: WalkthroughState): Promise<void>;
}

// Singleton export
export const sessionManager = new SessionManager();
```

**IMPORTANT (Codex Review)**:
- Do NOT use BroadcastChannel (content scripts have different origin than service worker)
- Use `chrome.tabs.sendMessage(tabId, { type: 'WALKTHROUGH_STATE_CHANGED', state })` instead
- Add `TAB_READY` event/tracking for reliable content script initialization

---

### W-004: Create WalkthroughController Skeleton
**Priority**: P1
**Estimate**: 4 hours
**Dependencies**: W-001, W-002
**Files to Create**:
- `extension/src/content/walkthrough/WalkthroughController.ts` (~100 lines initial)
- `extension/src/content/walkthrough/index.ts` (~30 lines)
- `extension/src/content/walkthrough/types.ts` (~50 lines)

**Acceptance Criteria**:
- [ ] Controller class with state subscription
- [ ] Message listener for state broadcasts
- [ ] Placeholder methods for UI, actions, navigation
- [ ] Cleanup method
- [ ] TypeScript compiles

**Initial Structure**:
```typescript
class WalkthroughController {
  private currentState: WalkthroughState | null = null;

  async initialize(): Promise<void>;

  private onStateChanged(state: WalkthroughState): void;
  private async handleMachineState(state: WalkthroughMachineState): Promise<void>;

  // Placeholders for later sprints
  private showStep(): Promise<void>;
  private setupActionListeners(): void;
  private handleNavigation(): void;

  destroy(): void;
}
```

---

### W-005: Unit Tests for State Machine
**Priority**: P1
**Estimate**: 6 hours
**Dependencies**: W-002
**Files to Create**:
- `extension/src/content/walkthrough/__tests__/StateMachine.test.ts` (~200 lines)
- `extension/src/background/walkthrough/__tests__/SessionManager.test.ts` (~150 lines)

**Test Cases**:

**StateMachine.test.ts**:
- [ ] Initial state is IDLE
- [ ] START transitions IDLE → INITIALIZING
- [ ] DATA_LOADED transitions INITIALIZING → SHOWING_STEP
- [ ] Invalid transitions are rejected
- [ ] Guards prevent invalid state changes
- [ ] Listeners are notified on state change
- [ ] State is serializable (no Maps)

**SessionManager.test.ts**:
- [ ] State persists to chrome.storage.session
- [ ] State loads on initialization
- [ ] Dispatch updates state and persists
- [ ] Tab tracking (add/remove)
- [ ] Session expiration handled

---

## Files Changed Summary

| Action | Path | Est. Lines |
|--------|------|------------|
| Create | `extension/src/shared/walkthrough/WalkthroughState.ts` | ~100 |
| Create | `extension/src/shared/walkthrough/events.ts` | ~80 |
| Create | `extension/src/shared/walkthrough/constants.ts` | ~40 |
| Create | `extension/src/shared/walkthrough/index.ts` | ~20 |
| Create | `extension/src/content/walkthrough/StateMachine.ts` | ~300 |
| Create | `extension/src/content/walkthrough/WalkthroughController.ts` | ~100 |
| Create | `extension/src/content/walkthrough/index.ts` | ~30 |
| Create | `extension/src/content/walkthrough/types.ts` | ~50 |
| Create | `extension/src/background/walkthrough/SessionManager.ts` | ~300 |
| Create | `extension/src/background/walkthrough/index.ts` | ~30 |
| Create | `extension/src/content/walkthrough/__tests__/StateMachine.test.ts` | ~200 |
| Create | `extension/src/background/walkthrough/__tests__/SessionManager.test.ts` | ~150 |

**Total New Lines**: ~1,400

---

## Definition of Done

- [ ] All 5 tickets completed
- [ ] TypeScript compiles without errors
- [ ] All tests pass (`npm test` in extension/)
- [ ] Build passes (`npm run build` in extension/)
- [ ] State machine transitions verified manually
- [ ] Code reviewed
- [ ] No regressions in existing functionality (old walkthrough still works)

---

## Notes

- **Do NOT modify** existing walkthrough.ts yet - we're building alongside it
- State machine should be pure (no side effects in transitions)
- SessionManager handles all persistence and broadcasting
- Content script receives state via broadcast, doesn't store authoritative state
