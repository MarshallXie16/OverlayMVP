# Walkthrough Redesign Notepad

**Started**: 2026-01-31
**Status**: Sprint 3 Action Detection - Planning
**Plan File**: `docs/plans/walkthrough-overhaul/03-action-detection.md`

---

## Sprint 1 Summary (Foundation) - COMPLETE

### Completed Tickets
- W-001: Shared types and constants
- W-002: StateMachine.ts implementation
- W-003: SessionManager.ts implementation
- W-004: WalkthroughController skeleton
- W-005: Unit tests for state machine (36 tests)

### Files Created
```
extension/src/shared/walkthrough/
├── index.ts              - Public exports
├── constants.ts          - Timeouts, retry limits
├── WalkthroughState.ts   - State interface, helpers
├── events.ts             - Event type definitions
├── messages.ts           - Message protocol (6 types)
├── StateMachine.ts       - Transition table, state machine class
└── __tests__/
    └── StateMachine.test.ts

extension/src/background/walkthrough/
├── index.ts              - Background entry point
└── SessionManager.ts     - Single source of truth

extension/src/content/walkthrough/
├── index.ts              - Content entry point
└── WalkthroughController.ts - Controller skeleton
```

---

## Sprint 2 Summary (UI Layer) - COMPLETE

### Completed Tickets
- W-006 to W-012: All UI component tickets complete
- 78 new UI component tests
- All Codex review issues addressed

### Files Created
```
extension/src/content/walkthrough/ui/
├── index.ts              (~50 lines) - Public exports
├── WalkthroughUI.ts      (~280 lines) - Facade/coordinator
├── OverlayManager.ts     (~170 lines) - Container + SVG backdrop
├── SpotlightRenderer.ts  (~145 lines) - Element highlighting
├── TooltipRenderer.ts    (~530 lines) - Step/error/completion modes
└── __tests__/
    ├── OverlayManager.test.ts
    ├── SpotlightRenderer.test.ts
    ├── TooltipRenderer.test.ts
    └── WalkthroughUI.test.ts
```

### Key Patterns from Sprint 2
- `renderId` pattern for async cancellation
- Centralized scroll/resize in WalkthroughUI facade
- TooltipAction callback: 'next' | 'back' | 'skip' | 'retry' | 'exit' | 'done'
- Drag handlers must be re-wired on innerHTML replacement

---

## Sprint 3: Action Detection - INVESTIGATION

### Investigation Date: 2026-02-01

### 1. Current walkthrough.ts Action Detection Patterns

**Must preserve these behaviors for backwards compatibility:**

#### 1.1 Click Validation (`isClickOnTarget`)
```typescript
// Three-tier approach:
function isClickOnTarget(event: Event, targetElement: HTMLElement): boolean {
  const eventTarget = event.target as HTMLElement;
  // 1. Direct match
  if (eventTarget === targetElement) return true;
  // 2. Contains check (for child elements like icons in buttons)
  if (targetElement.contains(eventTarget)) return true;
  // 3. Shadow DOM support via composedPath()
  if (event.composedPath) {
    return event.composedPath().includes(targetElement);
  }
  return false;
}
```

#### 1.2 Input Value Tracking
```typescript
// Baseline capture on focusin
const inputValues = new WeakMap<HTMLElement, string>();

targetElement.addEventListener("focusin", () => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    inputValues.set(element, element.value);
  }
});

// Compare on blur
function hasValueChanged(element: HTMLElement): boolean {
  const initialValue = inputValues.get(element) || "";
  return element.value !== initialValue;
}
```

#### 1.3 Form Submit Handling
```typescript
// CRITICAL: Attach to form, not button
if (eventType === "submit") {
  const form = targetElement.closest("form");
  if (!form) return; // Skip if no form
  form.addEventListener("submit", handler);
}
```

#### 1.4 Auto-Advance Delays
```typescript
const DELAYS = {
  click: 60,      // Fastest
  submit: 60,
  select_change: 120,  // Medium
  input_commit: 150,   // Slowest
  default: 100
};
```

#### 1.5 Click Interception
```typescript
// Capture phase for early interception
document.addEventListener("click", interceptor, true);

// Allowlist: tooltip, target element, overlay container
// Block everything else with preventDefault + stopPropagation
// Visual feedback: teal pulse + warning toast
```

### 2. Action Types Mapping

**Recording System (8 types):**
- `click`, `input_commit`, `select_change`, `submit` - Walkthrough supports
- `navigate` - Manual Next button progression
- `copy`, `cut`, `paste` - **GAP: Not supported in walkthrough events**

**Walkthrough Events (4 types):**
```typescript
actionType: "click" | "input_commit" | "select_change" | "submit"
```

**Gap Analysis:**
- `navigate` steps: User clicks Next manually (no auto-detection needed)
- `copy/cut/paste` steps: Rare in business workflows, can be manual progression for MVP

### 3. Integration Points

**WalkthroughController:**
```typescript
// Placeholder method to implement
private setupActionListeners(): void {
  // TODO: Sprint 3
}
```

**State Machine Flow:**
```
SHOWING_STEP → ELEMENT_FOUND → WAITING_ACTION
                                    ↓
                          (action detected)
                                    ↓
WAITING_ACTION → ACTION_DETECTED → TRANSITIONING → SHOWING_STEP
```

**WalkthroughUI Integration:**
- `showStep(element, state)` returns `{ renderId }` for async cancellation
- Tooltip actions forwarded via callback

### 4. Event Listener Management

**Existing Pattern (`activeListeners` array):**
```typescript
const activeListeners: Array<{
  element: Element;
  event: string;
  handler: EventListener;
}> = [];

// On step change
activeListeners.forEach(({ element, event, handler }) => {
  element.removeEventListener(event, handler);
});
activeListeners.length = 0;
```

### 5. Validation Rules to Preserve

| Action Type | Events to Listen | Validation |
|------------|------------------|------------|
| click | `click` | `isClickOnTarget()` returns true |
| input_commit | `focusin`, `blur` | Event is blur AND value changed |
| select_change | `change` | Target or eventTarget is `<select>` |
| submit | `submit` (on form) | Event type is submit |

### 6. Click Blocking Allowlist

Elements that should NOT be blocked:
1. Target element and descendants
2. Tooltip element and descendants
3. Overlay container
4. (Could add: any element with `data-walkthrough-allow`)

---

## Architecture Decisions

### State Machine Design
- Lightweight custom implementation (~300 lines)
- XState-inspired but no external dependency
- Transition table with guards
- Pure functions, fully serializable state

### Single Source of Truth
- Background's SessionManager owns all state
- Persisted in chrome.storage.session
- Content scripts receive read-only broadcasts
- All mutations go through dispatch()

### Message Protocol (6 types)
1. WALKTHROUGH_COMMAND - Content → Background
2. WALKTHROUGH_STATE_CHANGED - Background → Content
3. WALKTHROUGH_TAB_READY - Content → Background
4. WALKTHROUGH_ELEMENT_STATUS - Content → Background
5. WALKTHROUGH_HEALING_RESULT - Content → Background
6. WALKTHROUGH_EXECUTION_LOG - Content → Background

---

## Backwards Compatibility

### Feature Flag Strategy
- [x] Add WALKTHROUGH_USE_NEW_SYSTEM flag (`src/shared/featureFlags.ts`)
- [x] Old walkthrough.ts remains untouched during development
- [x] New system in separate directory structure
- [x] Toggle at runtime via chrome.storage.local
- [x] Both systems share recording system (no changes needed)

### Verified No Coupling
- Grep shows NO imports between old/new systems
- Old: `walkthrough.ts`, `walkthroughSession.ts`
- New: `background/walkthrough/`, `content/walkthrough/`, `shared/walkthrough/`

---

## Sprint 3 Implementation Plan

### W-013: ActionDetector.ts
**Purpose**: Attach event listeners based on action type, emit detected actions

**Key Design:**
- Takes callback function for action events
- Stores listeners in array for cleanup
- Tracks input baselines via WeakMap
- Handles all 4 supported action types

### W-014: ActionValidator.ts
**Purpose**: Validate detected action matches expected step

**Key Design:**
- `isClickOnTarget()` with composedPath support
- Value change detection for inputs
- Retry count tracking per step
- Returns structured result with reason

### W-015: ClickInterceptor.ts
**Purpose**: Block clicks outside target during walkthrough

**Key Design:**
- Capture phase listener
- Allowlist: target, tooltip, overlay
- Visual feedback on blocked clicks
- Warning toast

### W-016: Integration with Controller
**Purpose**: Wire action detection into state machine flow

**Key Changes to WalkthroughController:**
- Add ActionDetector, ActionValidator, ClickInterceptor instances
- Implement `setupActionListeners()`
- Handle validated actions → dispatch to background
- Handle invalid actions → show error flash

### W-017: Tests
**Purpose**: Comprehensive test coverage

**Test Focus:**
- Event listener attachment/detachment
- Click validation (direct, child, shadow DOM)
- Input value change detection
- Retry counting
- Click interception

---

## Files to Read First (for implementation)
- `extension/src/content/walkthrough.ts` - Old implementation reference
- `extension/src/content/walkthrough/WalkthroughController.ts` - Integration point
- `extension/src/content/walkthrough/ui/WalkthroughUI.ts` - UI coordination
- `extension/src/shared/walkthrough/events.ts` - Event types
- `extension/src/shared/walkthrough/constants.ts` - Delay values

---

## Questions/Decisions Needed

1. **Navigate steps**: Manual Next button progression is correct approach?
2. **Copy/Cut/Paste steps**: Skip for MVP, require manual progression?
3. **Visual feedback on valid action**: Flash effect before auto-advance?
4. **Error on wrong element**: Show message in tooltip or separate toast?

---

## Codex Review Findings (2026-02-01)

### Assessment: Needs Revision (5 Critical, 2 Warning)

### Critical Issues

1. **ClickInterceptor Lifecycle Mismatch**
   - Plan: Activate/deactivate around WAITING_ACTION
   - Legacy: Session-scoped (enabled at start, disabled only on exit)
   - **Fix**: Make session-scoped, update target per step

2. **Input Baseline Missing at Attach Time**
   - Plan: Only captures baseline on focusin
   - Legacy: Sets baseline immediately when listeners attach (`walkthrough.ts:1901`)
   - **Fix**: Set `baseline = element.value` on attach, PLUS refresh on focusin

3. **Select/Submit Validation Quirks Not Preserved**
   - Plan: Generic isClickOnTarget check
   - Legacy: Accepts either event.target OR targetElement being `<select>` (`walkthrough.ts:1817`)
   - **Fix**: Mirror legacy per-action validation rules exactly

4. **State Machine Integration Miswired**
   - Plan: Calls `sendCommand('NEXT')` after delay
   - Correct: Dispatch ACTION_DETECTED to background, let background drive NEXT_STEP
   - **Fix**: Add REPORT_ACTION command, background dispatches events

5. **Retry/Skip UX Not Preserved**
   - Plan: Uses ERROR state for wrong actions
   - Legacy: Inline error in WAITING_ACTION, Skip after 3 failures
   - **Fix**: Keep feedback in WAITING_ACTION, ensure stepRetries reset on success

### Warning Issues

6. **Shadow DOM Handling Inconsistent**
   - ClickInterceptor uses `contains()`, validation uses `composedPath()`
   - **Fix**: Use exported `isClickOnTarget()` in interceptor

7. **Blur Capture Phase Changes Behavior**
   - Plan uses capture=true, legacy uses bubble phase
   - **Fix**: Match legacy (no capture), document limitation

### Missing Considerations

- Manual Next/Back allowed in WAITING_ACTION (legacy behavior)
- Navigate/clipboard step types need explicit handling
- Submit-triggered navigation may unload before delayed NEXT
- Flash effect timeouts need cleanup on rapid transitions

---

## Progress Tracking

- [x] Investigation: Old walkthrough action detection
- [x] Investigation: Recording system action types
- [x] Investigation: New walkthrough system integration
- [x] Create detailed implementation plan
- [x] Codex review of plan
- [x] Address Codex findings in plan
- [x] User approval
- [x] W-013: ActionDetector.ts
- [x] W-014: ActionValidator.ts
- [x] W-015: ClickInterceptor.ts
- [x] W-016: Integration
- [x] W-017: Tests (53 new tests)
- [x] Codex review of implementation
- [x] Address Codex review findings (3 critical issues fixed)
- [x] Sprint 3 Complete

---

## Sprint 3 Summary (Action Detection) - COMPLETE

### Completed Tickets
- W-013: ActionDetector.ts (~320 lines)
- W-014: ActionValidator.ts (~355 lines)
- W-015: ClickInterceptor.ts (~230 lines)
- W-016: Controller Integration + REPORT_ACTION message
- W-017: 53 new tests

### Files Created
```
extension/src/content/walkthrough/actions/
├── index.ts              - Public exports
├── ActionDetector.ts     - Event listener management
├── ActionValidator.ts    - Action validation + isClickOnTarget
├── ClickInterceptor.ts   - Session-scoped click blocking
└── __tests__/
    ├── ActionDetector.test.ts
    ├── ActionValidator.test.ts
    └── ClickInterceptor.test.ts
```

### Key Patterns from Sprint 3
- `isClickOnTarget()` - Three-tier check: direct match → contains() → composedPath()
- Input baseline set at attach time AND refreshed on focusin (legacy parity)
- ClickInterceptor is session-scoped (enable at start, disable at end)
- REPORT_ACTION command for content → background action reporting
- `cleanupActionState()` for proper cleanup on state transitions
- `advanceTimeout` tracked and cancelled on destroy/state change

### Codex Review Findings (Addressed)
1. **Critical**: No cleanup when leaving WAITING_ACTION → Added `cleanupActionState()`
2. **Critical**: NEXT setTimeout not cancelled on destroy → Track `advanceTimeout`
3. **Critical**: Stale listeners possible → Explicit cleanup in state transitions
4. **Warning**: ClickInterceptor always-on → Acceptable (allows all clicks when no target)
5. **Warning**: Hardcoded selectors → Known limitation, documented

### Test Results
- 651 tests passing (53 new + 598 existing)
- Build succeeds
