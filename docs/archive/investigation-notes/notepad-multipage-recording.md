# Notepad: Multi-Page Workflow Recording

**Task**: Implement multi-page workflow recording for Chrome extension
**Created**: 2026-01-19
**Status**: Investigation Phase

---

## User Requirements Summary

### Example Workflow (Reference)
1. Workflow starts on google.com - user enters 'claude code hooks' in search bar
2. User presses enter (submits search query)
3. On search results page, user clicks 2nd link (navigates to Anthropic docs)
4. On Anthropic docs, user copies a block of text
5. User navigates to docs.google.com on SAME tab (via browser address bar)
6. On docs.google.com, user clicks new document button
7. Inside new document, user pastes content
8. User clicks document name input box
9. User presses gdocs home button
END OF WORKFLOW

### Key Requirements
- [ ] Recording must persist across page navigations (same tab)
- [ ] Recording widget must show correct step count across pages
- [ ] Handle navigation via: link clicks, form submits, address bar typing
- [ ] Handle ambiguous actions (typing vs submitting as separate steps)
- [ ] Robust recording logic for various navigation scenarios

### Current Behavior (Per User)
- Recording stops when switching tabs or websites
- Widget disappears on navigation

---

## Investigation Findings

### Architecture Overview

**Three-Layer Recording Architecture:**
1. **Content Script** (`recorder.ts`) - Runs in page context, captures events
2. **IndexedDB Storage** (`indexeddb.ts`) - Local buffering before upload
3. **Background Worker** (`state.ts`, `messaging.ts`) - Orchestrates upload and state management

**Key Insight**: The walkthrough system ALREADY has multi-page support via `WalkthroughSessionState`. We can adapt this pattern for recording.

### Current Recording Flow

1. User clicks "Start Recording" in popup
2. Background worker saves `RecordingState` to `chrome.storage` (state.ts:46)
3. Background injects `recorder.js` into active tab via `chrome.scripting.executeScript()` (state.ts:199)
4. Background sends `START_RECORDING` message to content script (state.ts:211)
5. Content script sets `state.isRecording = true`, shows widget, registers listeners
6. Events captured, deduped, stored in IndexedDB
7. On stop: IndexedDB data sent to background → uploaded to API → cleared

### Key Files to Examine
- `extension/src/content/recorder.ts` - Main recorder (lines 382-436 start, 441-525 stop)
- `extension/src/background/messaging.ts` - Message router (lines 124-260)
- `extension/src/background/state.ts` - Recording state (lines 29-53 start, 60-78 stop)
- `extension/src/background/walkthroughSession.ts` - **TEMPLATE** for session persistence
- `extension/src/content/widget.ts` - Recording widget (lines 287-291 step counter)
- `extension/src/content/storage/indexeddb.ts` - Step buffering (lines 95-154 addStep)
- `extension/manifest.json` - Content scripts config (lines 29-36)
- `extension/src/background/index.ts` - Navigation event listeners (lines 155-212)

### Identified Challenges

| Challenge | Current Behavior | Multi-Page Problem |
|-----------|------------------|-------------------|
| **Step counter reset** | Local memory (`state.currentStepNumber`) | Resets to 0 on new page |
| **State recovery** | No recovery mechanism | New page doesn't know recording is active |
| **Widget persistence** | Lost on navigation | No recording indicator on page 2+ |
| **Content script scope** | Per-page-load | Each page is new context, must re-init |
| **Recording active flag** | Local var in recorder.ts | Lost on navigation |
| **Screenshot coordination** | Local IndexedDB buffer | Works across pages (origin-scoped) |

### Existing Multi-Page Infrastructure (from Walkthrough)

The walkthrough system shows how to solve these problems:

1. **Session State Persistence**: Uses `chrome.storage.session` (survives page loads)
2. **Navigation Tracking**: `onBeforeNavigate` / `onCompleted` events in background/index.ts
3. **Tab Management**: `tabIds[]`, `primaryTabId` in session state
4. **Content Script Restoration**: walkthrough.ts queries background on load, restores if session active
5. **Navigation Flags**: `navigationInProgress` prevents premature restoration

### WalkthroughSessionState Template (types.ts:340-371)
```typescript
interface WalkthroughSessionState {
  sessionId: string;
  primaryTabId: number;
  tabIds: number[];
  navigationInProgress: boolean;
  expectedUrl: string | null;
  currentStepIndex: number;
  status: "active" | "paused" | "completed" | "error";
  startedAt: number;
  expiresAt: number;
}
```

---

## Design Considerations

### Approach Options

**Option A: Adapt Walkthrough Session Pattern (Recommended)**
- Create `RecordingSessionState` similar to `WalkthroughSessionState`
- Store session in `chrome.storage.session` (survives page loads, cleared on browser close)
- Auto-inject recorder.js via manifest (like walkthrough.js)
- Content script queries background on load, restores if recording active
- Background tracks navigation events, manages tab lifecycle

**Option B: Background-Centric Recording**
- Move all recording logic to background worker
- Content script only forwards raw events to background
- Background captures screenshots, manages steps, handles navigation
- Simpler content script, but more complex message passing

**Option C: Hybrid with Service Worker Storage**
- Keep current recorder logic but add recovery mechanism
- Store recording state in Service Worker (background)
- On page load, content script asks background "am I recording?"
- Re-inject recorder and restore widget if yes

### Critical Technical Issue: IndexedDB is Origin-Scoped!

**Problem**: IndexedDB data stored on google.com is NOT accessible from anthropic.com!

This means: Steps recorded on google.com cannot be read from anthropic.com's content script.

**Solution**: Move step storage to `chrome.storage.session` or background worker state (shared across all origins).

### Tradeoffs

| Approach | Pros | Cons |
|----------|------|------|
| **A: Session Pattern** | Proven pattern (walkthrough works), clean separation | More code changes, need to refactor IndexedDB usage |
| **B: Background-Centric** | Solves origin-scoping naturally | Complex message passing, harder to debug |
| **C: Hybrid** | Minimal changes to recorder | Doesn't solve IndexedDB origin issue |

---

## Questions for User (ANSWERED)

| Question | User Answer |
|----------|-------------|
| Multi-tab support? | **Same tab only** - simpler, covers most use cases |
| Tab close behavior? | **Auto-save recording** - save whatever was recorded |
| Session timeout? | **30 minute timeout** - matches walkthrough |
| Copy/paste capture? | **Yes, capture copy/paste** - additional complexity accepted |

---

## Progress Log

### 2026-01-19
- [x] Created notepad
- [x] Launched investigation agents (3 Explore agents in parallel)
- [x] Reviewed current recording architecture
- [x] Identified key challenges (IndexedDB origin-scoping is the critical blocker)
- [x] Asked user clarifying questions (multi-tab, tab close, timeout, clipboard)
- [x] Launched Plan agent for detailed design
- [x] Wrote final plan to `/Users/marshallxie/.claude/plans/serene-wondering-oasis.md`
- [x] Phase 1.1: Created RecordingSessionState type in types.ts
- [x] Phase 1.2: Created recordingSession.ts background module
- [x] Phase 1.3: Added new message types (RECORDING_GET_STATE, etc.)
- [x] Phase 1.4: Added message handlers to messaging.ts
- [x] Verified build compiles successfully

### 2026-01-20
- [x] Phase 2.1: Modified recorder.ts to use session storage (addStep, addScreenshot via messages)
- [x] Phase 2.2: Added session initialization check (initializeRecorder on script load)
- [x] Phase 2.3: Implemented restoreRecording() for state restoration after navigation
- [x] Phase 4: Added widget restoreState() method for timer/pause state persistence
- [x] Phase 3: Added navigation listeners in background/index.ts
  - webNavigation.onBeforeNavigate - marks navigationInProgress
  - webNavigation.onCompleted - clears navigationInProgress
  - tabs.onRemoved - auto-save recording on tab close
- [x] Phase 5: Implemented auto-save and 30-minute timeout
  - handleRecordingTabClose() function
  - 60-second interval for timeout checking
- [x] Phase 6: Added clipboard event handlers (copy, cut, paste)
  - handleClipboard() function
  - recordClipboardAction() with clipboard preview extraction
  - Event listeners registered in startRecording/restoreRecording
- [x] Build compiles successfully
- [x] All 372 backend tests pass

**Status: IMPLEMENTATION COMPLETE** - Ready for manual testing

---

## Code References
(Important code snippets and file locations)

---

## TODOs
- [ ] Understand current recording lifecycle
- [ ] Understand how content scripts are injected
- [ ] Understand background-content script communication
- [ ] Understand state persistence mechanisms
- [ ] Draft implementation plan
- [ ] Review plan with user
