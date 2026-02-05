# Sprint 5: Messaging & Integration

**Duration**: 2 days
**Dependencies**: Sprints 1-4
**Status**: ✅ COMPLETE (2026-02-03)

---

## Objective

Connect all components with a simplified message protocol. Reduce the current 12+ message types to 5 well-defined messages. Integrate the healing system and complete end-to-end functionality.

---

## Tickets

### W-024: Create BackgroundBridge.ts
**Priority**: P0
**Estimate**: 4 hours
**Dependencies**: Sprints 1-4
**Files to Create**:
- `extension/src/content/walkthrough/messaging/BackgroundBridge.ts` (~150 lines)
- `extension/src/content/walkthrough/messaging/index.ts` (~30 lines)

**Acceptance Criteria**:
- [ ] Wraps all chrome.runtime.sendMessage calls
- [ ] Handles response errors gracefully
- [ ] Provides typed message sending
- [ ] Subscribes to state broadcasts
- [ ] Retry logic for failed messages

**Key API**:
```typescript
interface CommandPayload {
  START: { workflowId: number };
  NEXT: {};
  PREV: {};
  JUMP_TO: { stepIndex: number };
  RETRY: {};
  EXIT: {};
  GET_STATE: {};
}

class BackgroundBridge {
  private stateListeners: Set<(state: WalkthroughState) => void> = new Set();

  constructor();

  // Commands
  async sendCommand<T extends keyof CommandPayload>(
    command: T,
    payload: CommandPayload[T]
  ): Promise<WalkthroughState>;

  // Element status
  async reportElementFound(stepIndex: number): Promise<void>;
  async reportElementNotFound(stepIndex: number): Promise<void>;

  // Healing
  async reportHealingResult(result: HealingResult): Promise<void>;

  // Execution logging
  async logExecution(entry: ExecutionLogEntry): Promise<void>;

  // State subscription
  subscribe(listener: (state: WalkthroughState) => void): () => void;

  // Lifecycle
  initialize(): void;
  destroy(): void;

  private handleMessage(message: any): void;
}

// Singleton export
export const backgroundBridge = new BackgroundBridge();
```

**Message Types Sent**:
```typescript
// To background
{ type: 'WALKTHROUGH_COMMAND', command: string, payload: object }
{ type: 'WALKTHROUGH_ELEMENT_STATUS', stepIndex: number, found: boolean }
{ type: 'WALKTHROUGH_HEALING_RESULT', result: HealingResult }
{ type: 'WALKTHROUGH_EXECUTION_LOG', entry: ExecutionLogEntry }
```

---

### W-025: Create DashboardBridge.ts
**Priority**: P1
**Estimate**: 3 hours
**Dependencies**: Sprint 1
**Files to Create**:
- `extension/src/content/walkthrough/messaging/DashboardBridge.ts` (~80 lines)

**Acceptance Criteria**:
- [ ] Handles window.postMessage from dashboard
- [ ] Security validation (origin, source)
- [ ] Forwards START_WALKTHROUGH to background
- [ ] Works on localhost:3000 (dashboard origin)

**Key API**:
```typescript
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://app.overlay.com',  // Production
];

class DashboardBridge {
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  initialize(): void;
  destroy(): void;

  private handleMessage(event: MessageEvent): void;
  private isValidOrigin(origin: string): boolean;
  private forwardToBackground(payload: StartWalkthroughPayload): Promise<void>;
}

export const dashboardBridge = new DashboardBridge();
```

**Security Checks**:
1. `ALLOWED_ORIGINS.includes(event.origin)`
2. `event.source === window` (same window, not iframe)
3. `event.data.source === 'overlay-dashboard'`

---

### W-026: Update Background Messaging
**Priority**: P0
**Estimate**: 5 hours
**Dependencies**: W-024, W-025
**Files to Modify**:
- `extension/src/background/messaging.ts` (significant changes)
- `extension/src/background/index.ts` (minor updates)

**Acceptance Criteria**:
- [ ] Handle new WALKTHROUGH_COMMAND messages
- [ ] Remove old message types (WALKTHROUGH_DATA, WALKTHROUGH_GET_STATE, etc.)
- [ ] Broadcast state changes to all tabs
- [ ] Clean up ~500 lines of old walkthrough messaging code

**Old Messages to Remove**:
- `WALKTHROUGH_DATA`
- `WALKTHROUGH_GET_STATE`
- `WALKTHROUGH_STATE_UPDATE`
- `WALKTHROUGH_NAVIGATION_DONE`
- `WALKTHROUGH_PING`
- `WALKTHROUGH_ERROR`
- `WALKTHROUGH_SESSION_END`

**New Message Handler**:
```typescript
async function handleWalkthroughCommand(
  message: { command: string; payload: object },
  sender: chrome.runtime.MessageSender
): Promise<WalkthroughState> {
  const { command, payload } = message;

  switch (command) {
    case 'START':
      return await handleStart(payload as { workflowId: number }, sender.tab?.id);
    case 'NEXT':
      return await sessionManager.dispatch({ type: 'NEXT_STEP' });
    case 'PREV':
      return await sessionManager.dispatch({ type: 'PREV_STEP' });
    case 'JUMP_TO':
      return await sessionManager.dispatch({ type: 'JUMP_TO_STEP', ...payload });
    case 'RETRY':
      return await sessionManager.dispatch({ type: 'RETRY' });
    case 'EXIT':
      return await sessionManager.dispatch({ type: 'EXIT' });
    case 'GET_STATE':
      return await sessionManager.getState();
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
```

---

### W-027: Integrate Healing System
**Priority**: P1
**Estimate**: 4 hours
**Dependencies**: W-024, Sprints 1-4
**Files to Modify**:
- `extension/src/content/walkthrough/WalkthroughController.ts` (~+80 lines)

**Acceptance Criteria**:
- [ ] Healing triggers on ELEMENT_NOT_FOUND
- [ ] Confidence thresholds preserved (85%, 70%, 60%)
- [ ] AI validation for medium confidence
- [ ] Healing indicators in UI
- [ ] Healing results logged

**Integration Points**:
```typescript
class WalkthroughController {
  private async handleElementNotFound(stepIndex: number): Promise<void> {
    // Transition to HEALING state
    await backgroundBridge.sendCommand('dispatch', { type: 'ELEMENT_NOT_FOUND' });

    // Attempt healing
    const step = this.currentState.steps[stepIndex];
    const result = await healElement(step);

    if (result.success) {
      if (result.confidence >= 0.85) {
        // High confidence - proceed seamlessly
        await this.showStepWithElement(result.element);
      } else if (result.confidence >= 0.70) {
        // Medium-high - show subtle indicator
        this.ui.showHealingIndicator(result.element);
        await this.showStepWithElement(result.element);
      } else if (result.confidence >= 0.60) {
        // Medium - ask for confirmation
        const confirmed = await this.ui.showHealingConfirmation(result);
        if (confirmed) {
          await this.showStepWithElement(result.element);
        } else {
          await this.handleHealingRejected(stepIndex);
        }
      }

      await backgroundBridge.reportHealingResult(result);
    } else {
      await this.handleHealingFailed(stepIndex);
    }
  }
}
```

---

### W-028: End-to-End Integration Tests
**Priority**: P0
**Estimate**: 6 hours
**Dependencies**: W-024 to W-027
**Files to Create**:
- `extension/src/content/walkthrough/__tests__/e2e.test.ts` (~300 lines)

**Test Scenarios**:

**Scenario 1: Basic Single-Page Workflow**
- [ ] Start walkthrough from dashboard
- [ ] Show first step
- [ ] Detect click action
- [ ] Advance to next step
- [ ] Complete workflow

**Scenario 2: Multi-Page Workflow**
- [ ] Start walkthrough
- [ ] Navigate to different page
- [ ] Restore state after navigation
- [ ] Continue to completion

**Scenario 3: Navigation Features**
- [ ] Jump to specific step
- [ ] Go back to previous step
- [ ] Restart workflow
- [ ] Exit workflow

**Scenario 4: Error Handling**
- [ ] Element not found → healing
- [ ] Healing success → continue
- [ ] Healing failure → error UI
- [ ] Skip step
- [ ] Retry step

**Scenario 5: Edge Cases**
- [ ] Rapid button clicks
- [ ] Tab closure during walkthrough
- [ ] Browser back button
- [ ] Session timeout

---

## Files Changed Summary

| Action | Path | Est. Lines |
|--------|------|------------|
| Create | `extension/src/content/walkthrough/messaging/index.ts` | ~30 |
| Create | `extension/src/content/walkthrough/messaging/BackgroundBridge.ts` | ~150 |
| Create | `extension/src/content/walkthrough/messaging/DashboardBridge.ts` | ~80 |
| Modify | `extension/src/background/messaging.ts` | ~+200, -500 |
| Modify | `extension/src/background/index.ts` | ~+20 |
| Modify | `extension/src/content/walkthrough/WalkthroughController.ts` | ~+80 |
| Create | `extension/src/content/walkthrough/__tests__/e2e.test.ts` | ~300 |

**Total New Lines**: ~860 (net: ~360 after removing old code)

---

## Definition of Done

- [x] All 5 tickets completed
- [x] Message flow simplified (12+ → 6 types)
- [x] Dashboard can start walkthrough
- [x] Healing integrates with new state machine
- [x] All tests pass (including E2E) - 788 tests passing
- [x] Build passes
- [x] Full workflow completes E2E

---

## Message Protocol Summary

### Final Protocol (Revised per Codex Review)

| Message | Direction | Payload |
|---------|-----------|---------|
| `WALKTHROUGH_COMMAND` | Content → Background | `{ command, payload }` |
| `WALKTHROUGH_STATE_CHANGED` | Background → Content | `{ state }` |
| `WALKTHROUGH_TAB_READY` | Content → Background | `{ tabId, url }` (NEW) |
| `WALKTHROUGH_ELEMENT_STATUS` | Content → Background | `{ stepIndex, found, tabId }` |
| `WALKTHROUGH_HEALING_RESULT` | Content → Background | `{ stepIndex, result }` |
| `WALKTHROUGH_EXECUTION_LOG` | Content → Background | `{ entry }` |

**Commands** (via WALKTHROUGH_COMMAND):
- `START` - Start walkthrough with workflowId
- `NEXT` - Advance to next step
- `PREV` - Go back one step
- `JUMP_TO` - Jump to specific step index
- `RETRY` - Retry current step
- `EXIT` - Exit walkthrough
- `GET_STATE` - Query current state

### Removed Messages (Old System)

- `WALKTHROUGH_DATA` → Replaced by state broadcasts
- `WALKTHROUGH_GET_STATE` → Replaced by `COMMAND { command: 'GET_STATE' }`
- `WALKTHROUGH_STATE_UPDATE` → Replaced by state machine dispatch
- `WALKTHROUGH_NAVIGATION_DONE` → Replaced by PAGE_LOADED event
- `WALKTHROUGH_PING` → No longer needed
- `WALKTHROUGH_ERROR` → Handled by state machine ERROR state
- `WALKTHROUGH_SESSION_END` → Handled by EXIT command
