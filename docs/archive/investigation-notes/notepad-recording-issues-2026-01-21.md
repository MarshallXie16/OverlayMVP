# Notepad: Recording & Walkthrough Issues Investigation
**Date**: 2026-01-21
**Task**: Investigate and fix multiple recording/walkthrough issues
**Status**: Investigation Phase

---

## Issues Summary (from User)

### Issue 1: Search Query Creates Two Steps with Empty Selectors
- **Observed**: Steps 1 & 2 both registered as "NAVIGATE" type
- **Expected**: Should be one step (type + enter = submit) OR two distinct steps (type, then enter)
- **Problem**: Both steps have empty selectors ('$' is empty)
- **User Action**: Typed "claude code hooks" in Google search, pressed Enter

### Issue 2: Missing Screenshots (Step 4+)
- **Observed**: Screenshots missing for steps 4 onwards (broken image icon)
- **Possible Cause**: Chrome API rate limiting (2 screenshots/second)
- **Related**: May be caused by double-registration of actions

### Issue 3: Address Bar Navigation Has No Selector
- **Observed**: Step 5 (navigate to docs.google.com) has empty selector
- **User Action**: Typed URL in browser address bar
- **Question**: Is this expected? Address bar is outside page context

### Issue 4: Steps 7 & 8 Rapid Succession
- **Observed**: Two steps registered quickly, need screenshots to debug
- **Unknown**: Can't diagnose without screenshots

### Issue 5: Walkthrough Mode Broken
- **Observed**: Walkthrough mode doesn't work
- **Need to investigate**: What specifically fails?

---

## Investigation Questions

1. How does the recorder capture "navigate" events?
2. Where does the empty selector come from for steps 1, 2, 5, 7?
3. How does screenshot capture work? Why would it fail after step 3?
4. What's the relationship between Enter key press and navigation?
5. What's broken in walkthrough mode?

---

## Key Files to Investigate

### Recording System
- `extension/src/content/recorder.ts` - Main event capture logic
- `extension/src/content/utils/selectors.ts` - Selector extraction
- `extension/src/background/recordingSession.ts` - Session storage
- `extension/src/background/messaging.ts` - Screenshot handling

### Walkthrough System
- `extension/src/content/walkthrough.ts` - Walkthrough UI/logic
- `extension/src/background/walkthroughSession.ts` - Session management

---

## Investigation Findings

### Issue 1: Search Query Creates Two Steps with Empty Selectors

**Agent Finding**: Navigation events (`beforeunload`) intentionally have empty selectors because there's no DOM element target during page unload.

**Root Cause Analysis**:
- When user types query and presses Enter:
  1. `blur` event fires on input → `input_commit` step (should have selectors)
  2. Form `submit` event fires → `submit` step (should have selectors)
  3. `beforeunload` event fires → `navigate` step (empty selectors BY DESIGN)
- The deduplicator doesn't suppress `navigate` after `submit` - they're separate events

**BUT**: User reports BOTH steps 1 AND 2 show empty selectors with "NAVIGATE" type.
This suggests something else is happening - perhaps the input/submit events aren't being captured at all, only the navigation.

**Files**:
- `recorder.ts:377-388` - handleNavigation
- `recorder.ts:546-580` - recordNavigation (hardcodes empty selectors)
- `event-deduplicator.ts:42-398` - No cross-event-type deduplication

---

### Issue 2: Missing Screenshots (Step 4+)

**Root Cause**: chrome.storage.session has ~1MB size limit!

**Calculation**:
- Each JPEG screenshot = 300-500KB as base64 dataUrl
- Step 1-3: ~900KB cumulative → fits
- Step 4: ~1.2MB cumulative → **EXCEEDS LIMIT**

**Silent Failure Chain**:
1. `chrome.storage.session.set()` fails with QuotaExceededError
2. `saveToStorage()` catches error, returns `false` (not checked!)
3. `addScreenshotToSession()` doesn't check return value
4. Response still sends `{ success: true }` to content script
5. Content script thinks it succeeded → SILENT FAILURE

**Files**:
- `recordingSession.ts:71-82` - saveToStorage swallows error
- `recordingSession.ts:221-257` - addScreenshotToSession doesn't check return
- `messaging.ts:1426-1454` - handleRecordingAddScreenshot returns success regardless

---

### Issue 3: Address Bar Navigation Has No Selector

**Expected Behavior**: This is correct! Content scripts cannot:
- Access address bar DOM (it's browser chrome)
- Detect what the user typed
- Only see `beforeunload` event when navigation happens

**Conclusion**: Empty selector for URL bar navigation is unavoidable and correct.

---

### Issue 5: Walkthrough Mode Broken

**Possible Failure Points**:
1. **Content script injection timing** - script not ready before message sent
2. **navigationInProgress stuck as true** - restoration blocked
3. **Message handler timeout** - WALKTHROUGH_GET_STATE not responding
4. **Session expiry** - 30-minute timeout exceeded
5. **Duplicate initialization guard** - silently ignoring re-injection

**Key Files**:
- `index.ts:175-240` - Navigation listeners
- `walkthroughSession.ts:395-410` - shouldRestore check
- `walkthrough.ts:33-62` - initializeContentScript
- `messaging.ts:1185-1220` - handleGetWalkthroughState

---

## User Answers (from clarification questions)

1. **Issue 1 action**: Type + Enter (not clicking suggestion)
   - **This is a bug**: Should capture `input_commit` + `submit`, but only getting `navigate`
   - Google may use client-side navigation, not traditional form submit

2. **Walkthrough failure**: Nothing happens at all when clicking Start Walkthrough
   - Overlay doesn't appear
   - Need to investigate why initialization fails completely

3. **Screenshot errors**: User will check console during next recording

4. **Search UX preference**: Two steps (type, then submit) is correct behavior
   - But we're only getting navigate events, not the input/submit

---

## Root Cause Hypotheses

### Issue 1: Only NAVIGATE captured, not input_commit/submit
- **Hypothesis A**: Google's search is client-side JS, no traditional form submit
- **Hypothesis B**: Event listeners not attached properly after navigation
- **Hypothesis C**: Input blur not firing because focus goes to dropdown

### Issue 2: Missing screenshots
- **Root cause**: chrome.storage.session 1MB limit exceeded
- Need to verify with console errors

### Issue 5: Walkthrough not starting
- Need to check: Is the session being created? Is content script injected?
- Check console for errors when clicking Start Walkthrough

---

## Raw Workflow Data
**Workflow ID**: 32
(Need to fetch from API)

---

## Plan File
**Location**: `/Users/marshallxie/.claude/plans/keen-launching-kahan.md`

## Progress Log
- [x] Launch Explore agents for recording issues
- [x] Launch Explore agent for walkthrough issues
- [x] Identify root causes
- [x] Design fixes (Plan agent)
- [x] Write plan file
- [x] Review plan with user
- [x] Implement fixes
  - Phase 1: IndexedDB screenshot storage (screenshotStore.ts)
  - Phase 2: Keydown listener for Enter key capture
  - Phase 3: Walkthrough tab ID resolution fix
- [ ] Test manually
- [x] Run automated tests (484 tests pass)
- [x] Code review with Codex

---

## Codex Review Findings (2026-01-21)

### Overall Assessment: **Needs Fixes**
The IndexedDB move is the right direction, but the current upload/cleanup flow can still lose screenshots due to MV3 service worker lifecycle + clearing timing.

### Critical Issues

1. **Fire-and-forget screenshot upload** (`messaging.ts:503`)
   - `uploadScreenshotsAsync()` is launched without being awaited
   - In MV3, service worker can be suspended after `sendResponse`
   - **Fix**: Await completion or persist upload job with `chrome.alarms`/queue

2. **Premature screenshot clearing** (`messaging.ts:516`)
   - `clearScreenshotsForSession()` runs immediately after starting async upload
   - If upload fails or worker suspends, screenshots are permanently lost
   - **Fix**: Only clear after confirmed successful upload

### Warnings

3. **Auto-save doesn't clean IndexedDB** (`index.ts:357`)
   - Tab-close/timeout sessions don't upload/clean screenshots
   - Screenshots can accumulate indefinitely
   - **Fix**: Add cleanup policy or TTL-based purge

4. **waitForTabLoad race condition** (`messaging.ts:683`)
   - Status can briefly be "complete" before navigation starts
   - Can inject into wrong page (dashboard instead of workflow target)
   - **Fix**: Also check `tab.url` matches intended destination

5. **Duplicate walkthrough.js injection** (`messaging.ts:709`)
   - Manifest already injects on `<all_urls>`
   - Re-injecting can duplicate listeners
   - **Fix**: Use WALKTHROUGH_PING first, only inject if ping fails

6. **Noisy Enter key capture** (`recorder.ts:331`)
   - Includes textarea, bypasses deduplicator
   - Can create extra steps (Enter-as-newline)
   - **Fix**: Gate to specific input types (search, text) or form contexts

### Suggestions

7. **IndexedDB robustness** (`screenshotStore.ts:30`)
   - Missing `request.onblocked`, `transaction.onabort` handlers
   - Add consistent `db.close()` on all paths

8. **Memory/concurrency concerns** (`screenshotStore.ts:137`, `messaging.ts:799`)
   - `getAll` loads all screenshots into memory
   - `Promise.all` uploads concurrently without limit
   - **Fix**: Upload with concurrency limit or stream via cursor

### Positive Observations
- Good call moving screenshots off chrome.storage.session
- WALKTHROUGH_PING provides foundation for eliminating injection timing races
- Recording session + screenshot storage separation is conceptually clean

---

## Follow-up Actions (COMPLETED 2026-01-21)
- [x] Fix critical issue #1: Await upload or persist job
- [x] Fix critical issue #2: Clear screenshots only after success
- [x] Address warning #4: waitForTabLoad race condition
- [x] Address warning #5: Use WALKTHROUGH_PING before injection

### Changes Made to Address Codex Review:

1. **Screenshot upload timing** (`messaging.ts:503-530`)
   - Now awaits `uploadScreenshotsAsync()` completion
   - Screenshots only cleared from IndexedDB after successful upload
   - On failure, screenshots remain in IndexedDB with session ID for retry

2. **waitForTabLoad race condition** (`messaging.ts:630-680`)
   - Added `expectedUrl` parameter
   - Two-phase wait: first for URL to match, then for status "complete"
   - Uses `tab.pendingUrl` in addition to `tab.url`
   - Handles URL comparison with origin/pathname normalization

3. **WALKTHROUGH_PING before injection** (`messaging.ts:750-780`)
   - Sends WALKTHROUGH_PING first to check if content script exists
   - Only injects walkthrough.js if ping fails
   - Avoids duplicate listeners from manifest + executeScript

### Final Status
- Build passes
- All 484 tests pass
- Ready for manual testing

## Implementation Summary (2026-01-21)

### Phase 1: Screenshot Storage Fix (Issue 2)
- Created `screenshotStore.ts` with IndexedDB operations
- Updated `messaging.ts` to store/retrieve screenshots from IndexedDB
- Removed screenshots array from `RecordingSessionState` (types.ts)
- Removed `addScreenshotToSession` from `recordingSession.ts`

### Phase 2: Input Event Capture Fix (Issue 1)
- Added `handleKeydown` listener to `recorder.ts`
- Updated `getActionType` in `filters.ts` to handle keydown events
- Enhanced `handleNavigation` to call `forceFlush` before recording
- When Enter is pressed on input, immediately records `input_commit`

### Phase 3: Walkthrough Fix (Issue 5)
- Fixed `handleStartWalkthrough` in `messaging.ts`
- Now properly navigates to workflow's starting_url before injecting
- Added `waitForTabLoad` helper function
- Added `WALKTHROUGH_PING` message type for readiness check

---
