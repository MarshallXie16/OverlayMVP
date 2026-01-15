# Multi-Page Workflow Investigation

**Started**: 2026-01-15
**Objective**: Enable multi-page/multi-tab workflow recording and playback

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
