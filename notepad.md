# Multi-Page Workflow Investigation

**Started**: 2026-01-15
**Objective**: Enable multi-page/multi-tab workflow recording and playback

---

# Walkthrough Overhaul Debug Notepad (Sample Workflow)

**Started**: 2026-02-05  
**Goal**: Fix walkthrough getting “stuck” after Google search navigation when running `docs/sample_workflow.md`.

## Symptom (User-Reported)
- Run walkthrough on the sample workflow.
- After completing “step 1 + 2” (type search query + press Enter), the browser navigates to Google search results.
- Walkthrough UI shows **step 1 again** on the results page (doesn’t progress).

## Evidence (Logs)
- Content script logs show state changes only between `NAVIGATING` and `SHOWING_STEP` (no `WAITING_ACTION` observed).
- After navigation completes, content shows `SHOWING_STEP` and renders **step 1/8**.
- Manual “Next” results in `JUMP_TO_STEP` but then `No selector matched any element` / `Cannot show step: target element not found` (likely step 2 has empty selectors).
- Service worker shows navigation detection works (`URL_CHANGED`, `PAGE_LOADED`), but step index is still `0` after navigation.

## Key Findings (Likely Root Causes)
1. **Element status is never reported → state machine never enters `WAITING_ACTION`**
   - `WalkthroughController.showStep()` finds element + renders UI but **does not send `WALKTHROUGH_ELEMENT_STATUS`**.
   - Background only transitions `SHOWING_STEP → WAITING_ACTION` on `ELEMENT_FOUND` (sent via `WALKTHROUGH_ELEMENT_STATUS`).
   - Result: action listeners never attach → user actions aren’t detected → step index never advances.
   - Code: `extension/src/content/walkthrough/WalkthroughController.ts` (`showStep()`).

2. **Recorder records `input_commit` on Enter keydown; walkthrough only detects `input_commit` on blur**
   - Recorder: `extension/src/content/recorder.ts` records `input_commit` on `keydown Enter` to capture values before navigation.
   - New walkthrough ActionDetector only emits `input_commit` on `blur` (`ActionDetector.setupInputListeners`).
   - On Google, pressing Enter (often) navigates without a reliable blur event → step 1 never completes.

3. **Navigate steps need special handling**
   - Recorder `navigate` steps have `selectors: {}` and `page_context.url` is the *departing* URL (`recordNavigation()`).
   - In walkthrough, step 2 appears to have empty selectors (consistent with `navigate`), so it can’t be highlighted/detected.
   - Suggestion: auto-advance `navigate` steps when `URL_CHANGED` occurs while they are current.

4. **Potential auto-advance bug**
   - `WalkthroughController.cleanupActionState()` clears `advanceTimeout` whenever leaving `WAITING_ACTION`.
   - Background dispatches `ACTION_DETECTED` immediately on valid actions (transitioning out of `WAITING_ACTION`), which can cancel the delayed `NEXT` (non-navigation actions).
   - Needs review/fix to avoid flakiness / “never advances”.

## Files of Interest
- Content:
  - `extension/src/content/walkthrough/WalkthroughController.ts`
  - `extension/src/content/walkthrough/actions/ActionDetector.ts`
  - `extension/src/content/walkthrough/actions/ActionValidator.ts`
  - `extension/src/content/walkthrough/navigation/NavigationHandler.ts`
- Background:
  - `extension/src/background/walkthrough/messageHandlers.ts` (REPORT_ACTION auto-advance)
  - `extension/src/shared/walkthrough/StateMachine.ts` (URL_CHANGED / PAGE_LOADED)
  - `extension/src/background/walkthrough/NavigationWatcher.ts`

## Working Hypothesis
Primary issue is **action detection never activates** (missing `ELEMENT_FOUND` reporting), plus **input_commit is not detected on Enter**. This prevents step progression before navigation, so after navigation the restored state still points to step 1.

## TODO / Next Steps
- [x] Implement content-side element status reporting (found/not found) after step rendering.
- [x] Add Enter-key `input_commit` detection in `ActionDetector`.
- [x] Implement auto-advance for `navigate` steps on `URL_CHANGED` (state machine-level).
- [x] Move auto-advance scheduling to background (remove content-side `advanceTimeout`).
- [x] Improve recording: capture `navigate` destination URL + suppress Enter-search extra NAVIGATE.
- [x] Add/adjust tests + run extension build/tests.

## Implementation Notes (2026-02-05)
### Walkthrough (Playback)
- **Element status reporting**: `WalkthroughController.showStep()` now uses `findElement()` and sends `WALKTHROUGH_ELEMENT_STATUS` (found/false) so background transitions `SHOWING_STEP → WAITING_ACTION` and listeners attach.
- **Enter detection**: `ActionDetector` emits `input_commit` on **Enter keydown** (ignores Shift+Enter in textarea) and updates baseline to prevent blur double-emits.
- **Navigate step UX**: `action_type: "navigate"` steps render a centered tooltip (`renderNavigateStep`) and skip element finding.
- **Auto-advance moved to background**: `REPORT_ACTION` handler schedules `NEXT_STEP` with delays; content no longer schedules delayed `NEXT` (fixes canceled-timeout bug).
- **State machine robustness**: `URL_CHANGED` can complete navigate steps (match policy: origin + normalized path, ignore query/hash; expected `/` matches any same-origin path). Added transitions to tolerate races (`TRANSITIONING → NAVIGATING` on URL change; allow `NEXT_STEP` while navigating).

### Recording
- **Navigate destination capture**: `recordingSession.handleRecordingNavigationStart/Complete` patch `action_data.target_url` and `action_data.final_url` on pending `navigate` steps.
- **Suppress Enter-search extra NAVIGATE**: `recorder.ts` tracks immediate Enter `input_commit` and skips recording a separate `navigate` step on `beforeunload` when appropriate (pure helper: `recordingNavigation.ts`).

### Verification
- Build: `npm run build --workspace=extension` ✅
- Tests: `npm test --workspace=extension` ✅

### Code Review (Codex)
- Codex review run via `codex exec` (read-only). Key follow-ups applied:
  - Background guards added to ignore stale `ELEMENT_STATUS` / `REPORT_ACTION` when `stepIndex` doesn’t match `currentStepIndex`.
  - Recorder aligned with walkthrough: ignore Shift+Enter in textarea for immediate Enter commits (pure helper + tests).

---

# Walkthrough Overhaul Debug Notepad (Example Workflow Follow-up)

**Date**: 2026-02-05  
**Context**: Rerunning `docs/sample_workflow.md` (“example workflow”) exposed healing + UI issues on Google search results step.

## Issue A — Step 2 triggers auto-healing (82% match) when it shouldn’t

**Symptom**
- Step 2 (“click 1st search result”) correctly highlights the intended link, but via **auto-healing** with a confirmation modal at **~82% confidence**.
- Expectation: no healing prompt; deterministic selector match should find the element.

**Evidence**
- Service worker: `ELEMENT_STATUS ... found=false` for step 1 (0-based) → `SHOWING_STEP → HEALING`.
- Then: `HEALING_RESULT: success=true, confidence=0.8225...` → `HEALING → WAITING_ACTION`.

**Root Cause (confirmed by code)**
- `extension/src/content/utils/elementFinder.ts` ignores `selectors.stable_attrs` (including `href`) and does not do any link/text-specific matching.
- Recorded Google DOM CSS paths are brittle; when `primary/css/xpath/data-testid` fail, we declare `found=false` and invoke healing.

## Issue B — “Confirm Element” modal buttons do nothing (can’t proceed)

**Symptom**
- In the “Confirm Element” modal, clicking **No, Skip** or **Yes, Continue** appears to do nothing (stuck).

**Root Cause (confirmed by code)**
1. **Duplicate healing result reporting**
   - `WalkthroughController.showHealingIndicator()` awaits `healElement()`, and the user-prompt path returns a result after the promise resolves.
   - But `WalkthroughController.handleHealingConfirmation()` *also* immediately calls `handleHealingResult()` using `pendingHealResult`.
   - Result: two `WALKTHROUGH_HEALING_RESULT` messages; background logs show a second `HEAL_SUCCESS` attempted from `WAITING_ACTION` (`No valid transition...`).
2. **Listeners never attach to healed element**
   - `handleHealingResult()` sets `currentTargetElement` on success, but **does not set** `currentTargetStepIndex`.
   - When state enters `WAITING_ACTION`, `setupActionListeners()` can’t reuse the healed element (step index mismatch) and falls back to selector lookup (still failing) → no target, no action listeners.
   - This makes the user “stuck” even after accepting the healed candidate.

## Planned Fixes
- Fix healing confirmation flow to report a single healing result (only from `showHealingIndicator`).
- Store healed element with `currentTargetStepIndex` so `WAITING_ACTION` attaches listeners.
- Improve `elementFinder` to use stable attrs + link/text heuristics (Google redirect URL parsing) so Step 2 is found deterministically and healing is not triggered.

---

# Walkthrough Demo Polish (Copy/Input Commit/Completion) — 2026-02-05

## Issue 1 — Walkthrough doesn’t detect `copy` but recorder does

**Symptom**
- On the docs page, Step 4 prompt asks user to copy selected text, but walkthrough does not detect any action.

**Root Cause (code)**
- New walkthrough ActionDetector only supports: `click`, `input_commit`, `select_change`, `submit`.
  - File: `extension/src/content/walkthrough/actions/ActionDetector.ts`
- Recorder detects clipboard via document-level `copy/cut/paste` (`extension/src/content/recorder.ts`).

**Proposed Fix**
- Add `copy` to walkthrough ActionDetector + ActionValidator.
- Capture copied text via `window.getSelection()?.toString()` (works without clipboard permissions); fall back to `ClipboardEvent.clipboardData`.
- Validate against recorded `action_data.clipboard_preview`:
  - Normalize whitespace.
  - If preview ends with `...` (truncated), treat as prefix; otherwise require exact match or prefix match.
- Ensure copy happened “on” the expected element by checking selection range common ancestor is within the highlighted element (or composedPath contains it).

## Issue 2 — Input commit not detected on Google Docs title field

**Symptom**
- User changes doc title and clicks out; walkthrough does not advance.

**Most Likely Root Cause (code)**
- For `input_commit`, ActionDetector listens for `blur` on the *target element*.
  - `blur` does **not** bubble, so if the highlighted “target” is a container (common on dynamic UIs), we miss the descendant input’s blur.
  - Using `focusout` (bubbles) or capture-phase `blur` fixes this.

**Proposed Fix**
- Switch commit detection from `blur` → `focusout` for `input_commit`.
- Add support for `contenteditable` elements (baseline + commit on focusout).

## Issue 3 — No completion modal

**Symptom**
- At the end, walkthrough session ends and UI disappears without a “completed” state.

**Root Cause (code)**
- Controller’s `COMPLETED` state handler is a placeholder (`showCompleted()` logs only).
  - File: `extension/src/content/walkthrough/WalkthroughController.ts`
- UI already supports completion render: `WalkthroughUI.showCompletion()` + `TooltipRenderer.renderCompletion()`.

**Proposed Fix**
- Wire controller `COMPLETED` state to `ui.showCompletion(state)`.
- Keep “Done” button mapped to `EXIT` (for now). Optional future: store dashboard tab URL at start and implement “Return to dashboard”.

## Implementation (Completed)
- Added walkthrough support for `copy` steps:
  - `ActionDetector` listens to document-level `copy` (capture) and emits value (prefers `ClipboardEvent.clipboardData`, falls back to `selection.toString()`).
  - `ActionValidator` validates copy origin + compares against `step.action_data.clipboard_preview` (whitespace-normalized; supports truncated `...` previews).
- Fixed `input_commit` detection for nested/dynamic inputs:
  - Switched commit detection from `blur` → `focusout` (bubbling), added baseline init for already-focused descendants, and contenteditable support.
  - Added a regression unit test that attaches to a container and commits from a descendant input.
- Added completion UX:
  - Controller now renders `WalkthroughUI.showCompletion()` when the state machine enters `COMPLETED`.
- Updated shared unions/guards:
  - Shared walkthrough event unions now include `copy` + `wrong_value`.
  - Background now maps `wrong_value`/`invalid_target` correctly instead of defaulting to `wrong_action`.
- Verified:
  - `npm run build --workspace=extension` ✅
  - `npm test --workspace=extension` ✅

---

## Problem Statement

User reported:
1. Recording bar (widget) disappears when navigating to another page
2. No visibility into whether steps are being recorded after navigation
3. Cannot stop recording after navigation - shows "No active recording to stop"
4. Must reload page to reset extension state

**Target Workflow Example**:
1. Search article on google.com
2. Click link in search results
3. Copy text from article
4. Open docs.google.com, create blank document
5. Paste text
6. Name document

This spans multiple pages and multiple tabs - our app should handle this.

---

## Investigation Status

### Phase 1: Architecture Understanding - COMPLETE
- [x] Recording system architecture
- [x] State management during recording
- [x] Navigation handling
- [x] Widget/popup behavior
- [x] Background worker role
- [x] Content script lifecycle

### Phase 2: Root Cause Analysis - COMPLETE
- [x] Why does widget disappear on navigation?
- [x] Why is recording state lost?
- [x] How is state persisted (if at all)?
- [x] What happens to content scripts on navigation?

### Phase 3: Solution Design - IN PROGRESS
- [ ] State persistence strategy
- [ ] Cross-page communication
- [ ] Tab management
- [ ] UI/UX for multi-page recording

---

## ROOT CAUSE ANALYSIS - CRITICAL FINDINGS

### 1. Recording State is Stored in Content Script Memory (THE BUG)

**File**: `extension/src/content/recorder.ts:55-61`
```typescript
const state: RecorderState = {
  isRecording: false,
  currentStepNumber: 0,
  startingUrl: null,
  debouncer: new InputDebouncer(),
  deduplicator: new EventDeduplicator(),
};
```

This `state` object lives in JavaScript memory within the content script. When the user navigates:
1. Browser destroys the current page's content script
2. Browser loads new page
3. New content script is injected with **fresh state** (isRecording: false)
4. All previous state is lost

### 2. Widget is DOM Element - Lost on Navigation

The recording widget (`widget.ts`) creates a DOM element appended to `document.body`. On navigation:
1. Entire DOM is replaced
2. Widget element is gone
3. No restoration logic exists

### 3. Background Has Storage But Recorder Never Reads It

**File**: `extension/src/background/state.ts` has `saveRecordingState()` that persists to `chrome.storage.local`
**BUT** the content script `recorder.ts` **NEVER** queries this on initialization!

Compare with **walkthrough.ts** which DOES work across pages:
```typescript
// walkthrough.ts:33-62 - WORKS
export async function initializeContentScript(): Promise<void> {
  const response = await chrome.runtime.sendMessage({
    type: "WALKTHROUGH_GET_STATE",
    payload: {},
  });
  if (response?.payload?.session && response?.payload?.shouldRestore) {
    await restoreWalkthrough(session);
  }
}
```

**Recorder has NO equivalent initialization logic!**

### 4. The Pattern That Works (Walkthrough)

The walkthrough system has a complete multi-page solution:

1. **Session Manager** (`walkthroughSession.ts`):
   - Stores session in `chrome.storage.session`
   - Tracks: sessionId, currentStepIndex, tabIds, navigationInProgress
   - Methods: startSession, updateSession, getSessionForTab

2. **Content Script Restoration** (`walkthrough.ts:168-190`):
   - On load, calls `initializeWithRetry()`
   - Queries background for active session
   - If found, calls `restoreWalkthrough()` to recreate UI

3. **Background Navigation Tracking** (`index.ts:155-212`):
   - Listens to `webNavigation.onBeforeNavigate`
   - Listens to `webNavigation.onCompleted`
   - Tracks navigation state in session

### 5. What Recording LACKS

| Feature | Walkthrough | Recording |
|---------|-------------|-----------|
| Session manager in background | ✅ walkthroughSession.ts | ❌ None |
| Content script init check | ✅ initializeContentScript() | ❌ None |
| Navigation tracking in background | ✅ webNavigation listeners | ❌ None (partial) |
| State sync messages | ✅ WALKTHROUGH_STATE_UPDATE | ❌ None |
| Session restoration | ✅ restoreWalkthrough() | ❌ None |

---

## SOLUTION DESIGN

### Approach: Mirror the Walkthrough Pattern

Create equivalent recording session management by adapting the proven walkthrough architecture.

### Files to Create

1. **`extension/src/background/recordingSession.ts`** (NEW)
   - Mirror of `walkthroughSession.ts` for recording
   - Store in `chrome.storage.session`
   - Track: sessionId, workflowName, startingUrl, currentStepNumber, tabId, status, startedAt

### Files to Modify

2. **`extension/src/content/recorder.ts`**
   - Add `initializeContentScript()` on load
   - Query background: `RECORDING_GET_STATE`
   - If active session, restore state and show widget
   - Add `syncStateToBackground()` to persist step count changes

3. **`extension/src/background/index.ts`**
   - Import recordingSession.ts
   - Add navigation handlers for recording tabs (currently only for walkthrough)

4. **`extension/src/background/messaging.ts`**
   - Add message handlers:
     - `RECORDING_GET_STATE` - return session for content script restoration
     - `RECORDING_STATE_UPDATE` - sync step count, status
     - `RECORDING_NAVIGATION_DONE` - clear navigation flag

5. **`extension/src/shared/types.ts`**
   - Add `RecordingSessionState` type
   - Add session storage key constant

### Message Flow After Fix

```
START_RECORDING:
  Popup → Background → Creates session → Injects recorder.js
  → recorder.js receives START_RECORDING → shows widget

NAVIGATION:
  User clicks link → webNavigation.onBeforeNavigate fires
  → Background marks session.navigationInProgress = true
  → Page loads, new recorder.js injected
  → recorder.js calls initializeContentScript()
  → Sends RECORDING_GET_STATE to background
  → Background returns session (shouldRestore: true)
  → recorder.js restores state, shows widget with correct step count
  → Sends RECORDING_NAVIGATION_DONE
  → Recording continues normally

STOP_RECORDING:
  User clicks Stop → stopRecording() → uploads workflow
  → Background clears session
```

---

## Technical Observations

### Key Files to Change
- `extension/src/content/recorder.ts` - Main recording logic (ADD init on load)
- `extension/src/content/widget.ts` - Widget can be reused as-is
- `extension/src/background/index.ts` - Add recording navigation handlers
- `extension/src/background/messaging.ts` - Add new message types
- `extension/src/shared/types.ts` - Add session types

### IndexedDB Consideration
- Steps and screenshots are stored in IndexedDB (origin-based)
- IndexedDB persists across navigations on same origin
- BUT different domains (google.com → docs.google.com) = different IndexedDB
- **Decision needed**: Store steps in session storage OR keep in IndexedDB per-origin?

### Multi-Tab Consideration
- Walkthrough tracks `tabIds[]` for multi-tab support
- Recording might need same if user opens new tab during workflow
- Need to decide: single-tab or multi-tab support?

---

## Questions for User

1. **Multi-tab support**: Should workflows support recording across multiple browser tabs (e.g., user opens link in new tab), or just same-tab navigation?

2. **Cross-origin steps**: When user navigates to different domain (google.com → article.com), should we:
   - a) Keep recording (steps stored centrally in background session)
   - b) Warn user about domain change but continue
   - c) Something else?

3. **Copy/paste detection**: The example workflow mentions "copy text" - how should we detect this action? (Ctrl+C doesn't fire a DOM event we can easily capture)

---

## Session Log

### 2026-01-15 Session 1
- [x] Initial investigation started
- [x] Read core files: recorder.ts, walkthrough.ts, walkthroughSession.ts, messaging.ts, index.ts
- [x] Identified root cause: Content script state lost on navigation
- [x] Identified working pattern: Walkthrough session restoration
- [x] Subagents launched for architecture and test coverage exploration
- [ ] Pending: Subagent results
- [ ] Pending: User answers to design questions

---

## Next Steps (for session recovery)

If session crashes, pick up here:
1. Review findings above - root cause is clear
2. Check if subagent outputs are available
3. Implement solution based on design above
4. Key files to modify: recorder.ts, messaging.ts, index.ts
5. Create new file: recordingSession.ts

---

## Walkthrough Modal Dismiss Fixes (2026-02-06)

### New User-Reported Issues
1. Completion modal `Done` button does not dismiss walkthrough.
2. Auto-healing modal `X` should cancel healing flow (not act like hard exit).

### Root Cause Analysis
- **Completion modal stuck**:
  - `SessionManager.endSession()` exits early when `hasActiveSession()` is false.
  - `hasActiveSession()` depends on `isActiveWalkthrough()`.
  - `isActiveWalkthrough()` incorrectly returned false for `COMPLETED` and `ERROR`, so `EXIT` command became a no-op in those states.

- **Healing modal X behavior wrong**:
  - Tooltip event delegation treated all close/exit buttons the same and emitted `exit` regardless of mode.
  - In healing UI, this should cancel healing (equivalent to reject), not force session exit.
  - If user closes during spinner phase (before confirmation resolver exists), there was no cancellation path.

### Implemented Fixes
- `extension/src/shared/walkthrough/WalkthroughState.ts`
  - Updated `isActiveWalkthrough()` to treat all non-`IDLE` states as active.
  - This allows `EXIT` from `COMPLETED` and `ERROR` to end session and broadcast `IDLE` cleanup.

- `extension/src/content/walkthrough/ui/TooltipRenderer.ts`
  - Close/exit buttons are now mode-aware:
    - In `healing` mode: emit `reject_heal`.
    - Other modes: keep emitting `exit`.

- `extension/src/content/walkthrough/WalkthroughController.ts`
  - Added `handleHealingRejectFromUI()`:
    - If confirmation prompt is active, resolves as rejected.
    - If still in spinner phase, cancels in-flight healing attempt and sends `WALKTHROUGH_HEALING_RESULT` failure (`"User canceled auto-healing"`) so state exits `HEALING` cleanly.

### Tests Added/Updated
- `extension/src/shared/walkthrough/__tests__/WalkthroughState.test.ts`
  - Verifies `isActiveWalkthrough()` behavior for `IDLE`, `COMPLETED`, `ERROR`.

- `extension/src/content/walkthrough/ui/__tests__/TooltipRenderer.test.ts`
  - Verifies healing close button dispatches `reject_heal`.

- `extension/src/content/walkthrough/__tests__/healingFlow.test.ts`
  - Verifies closing healing before confirmation reports `WALKTHROUGH_HEALING_RESULT` failure and cancels in-progress healing.

### Validation
- `npm run build --workspace=extension` ✅
- `npm test --workspace=extension` ✅

### Code Quality / Maintainability Opportunities Observed
1. **State semantics drift**: `isActiveWalkthrough()` had become semantically inconsistent with `getState()` (`getState()` already treated non-`IDLE` as an active session snapshot). Consider formalizing utility contracts with unit tests for all exported state helpers.
2. **Mode-action coupling in TooltipRenderer**: action routing is currently switch-based with mode-specific branches. Consider an explicit `actionMapByMode` table to reduce regressions when new modes/buttons are added.
3. **Healing cancellation path centralization**: healing cancel/reject logic now exists in multiple branches (resolver vs spinner). Consider consolidating into a single cancel API to reduce future race-condition risk.
- Follow-up improvement implemented: `TooltipRenderer` now removes drag handlers before rendering non-step modes (`error`, `completion`, `navigation`, `navigate_step`, `healing`) to avoid document-level handler leaks across mode transitions.
- Added regression test: `TooltipRenderer.test.ts` verifies `removeEventListener` is called for drag handlers when switching from step mode to completion mode.
- Attempted codex read-only review command timed out at 120s; no actionable automated findings were returned in final output.
