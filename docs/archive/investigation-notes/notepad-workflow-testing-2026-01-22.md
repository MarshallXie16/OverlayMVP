# Notepad: Multi-Page Workflow Testing & Debugging
**Date**: 2026-01-22
**Task**: Test and debug 9-step multi-page recording workflow
**Status**: Investigation Phase

---

## Session Context
Continuation from previous session where we:
- Fixed IndexedDB screenshot storage (P0)
- Added keydown listener for Enter key capture (P1)
- Fixed walkthrough tab ID resolution (P2)
- Addressed Codex review issues (await upload, waitForTabLoad race, WALKTHROUGH_PING)

All 484 tests pass, but manual testing reveals the workflow still fails.

---

## Current Error (from user screenshots)

### Error 1: SQLite UNIQUE Constraint Failed
```
Failed to save workflow: Failed to create workflow:
(sqlite3.IntegrityError) UNIQUE constraint failed:
steps.workflow_id, steps.step_number
```

**Root Cause Hypothesis**: Duplicate step numbers are being recorded. This could be caused by:
1. Deduplicator not properly filtering duplicate events
2. Keydown + blur both recording the same input
3. Multiple navigation events being recorded
4. Step number counter not incrementing properly

### Error 2: Truncated data in save
The second screenshot shows truncated page context data suggesting the workflow is capturing steps, but failing on save due to the duplicate step number issue.

---

## Test Workflow: Google → Anthropic Docs → Google Docs

### Step-by-Step Expected Behavior

| Step | User Action | Action Type | Expected Behavior | Selector Context |
|------|-------------|-------------|-------------------|------------------|
| 1 | Type "claude code hooks" in Google search | `input_commit` | Capture input value, selector for search box | Google.com |
| 2 | Press Enter to submit | `submit` or `navigate` | Should NOT duplicate step 1. Form submission or navigation | Google.com |
| 3 | Click 2nd link (Anthropic docs) | `click` | Click with navigation side-effect | Google search results |
| 4 | Copy text block on Anthropic docs | `copy` | Capture copy action (clipboard event) | Anthropic docs page |
| 5 | Navigate to docs.google.com via address bar | `navigate` | Address bar navigation (no element selector) | Anthropic → Google Docs |
| 6 | Click "Create new document" button | `click` | Click with navigation side-effect | docs.google.com |
| 7 | Paste content in new doc | `paste` | Paste action (clipboard event) | New Google Doc |
| 8 | Click document name input | `click` or `input_commit` | Focus/click on title area | Google Doc |
| 9 | Click Google Docs home button | `click` | Click with navigation side-effect | Google Doc |

---

## Architecture Questions to Investigate

1. **How does the recorder handle step numbering?**
   - Where is `currentStepNumber` tracked?
   - How does it increment?
   - Can it create duplicates?

2. **How does the deduplicator work with keydown + enter?**
   - Does keydown bypass deduplicator? (Yes, based on previous fix)
   - What prevents keydown + submit from both recording?

3. **How are navigation events handled?**
   - Address bar navigation vs. link click navigation
   - Do both create `navigate` events?

4. **How does multi-page recording persist state?**
   - chrome.storage.session for session state
   - IndexedDB for screenshots
   - How does step number sync across pages?

5. **How does clipboard (copy/paste) recording work?**
   - Are copy/paste events captured?
   - What data is extracted?

---

## Investigation Findings

### Finding 1: ROOT CAUSE - Keydown Bypasses Deduplicator (CRITICAL)

**Location**: `recorder.ts:331-372`

The `handleKeydown()` function calls `recordInteraction()` DIRECTLY, bypassing the EventDeduplicator:

```typescript
function handleKeydown(event: KeyboardEvent): void {
  // ...
  recordInteraction(event, element);  // Line 368 - DIRECT CALL, NO DEDUP
}
```

**Problem Scenario (Google Search Enter):**
1. User types "claude code hooks" → `state.currentStepNumber = 0`
2. User presses Enter → `handleKeydown()` fires
   - Calls `recordInteraction()` directly
   - Increments: `state.currentStepNumber = 1`
   - Records step with `step_number: 1`
3. **Shortly after**, blur event fires → `handleBlur()` triggers
   - EventDeduplicator adds to queue
   - Deduplicator may flush (100ms window or beforeunload)
   - **If it records**, increments: `state.currentStepNumber = 2`
   - Records step with `step_number: 2`

**But wait - the real bug might be different:**
The explore agent found that `handleKeydown` checks `hasInputValueChanged()` before recording.
If the blur fires BEFORE keydown processing completes, BOTH could try to record with the SAME step number!

**Comparison of handlers:**
| Handler | Uses Deduplicator | Direct Record | Risk |
|---------|------------------|----------------|------|
| handleClick | YES | NO | LOW |
| handleBlur | YES | NO | LOW |
| handleKeydown | **NO** | **YES** | **HIGH** |

### Finding 2: Clipboard Recording - Partial Support

**Recording**: ✅ Fully functional
- Event listeners for copy/cut/paste attached
- Action types defined: `"copy" | "cut" | "paste"`
- Clipboard preview captured (truncated to 100 chars)

**Walkthrough**: ❌ NOT implemented
- No clipboard event detection in `getEventsForActionType()`
- No validation in `validateAction()`
- User must manually click "Next" to proceed

**Impact on Workflow:**
- Step 4 (copy) and Step 7 (paste) will be RECORDED correctly
- But walkthrough cannot auto-detect when user performs clipboard action

### Finding 3: Navigation Handling - Correct Design

**Click → Navigate produces 2 steps (intentional):**
- Step X: "click" action with selectors
- Step X+1: "navigate" action (no selectors)

**Address bar navigation produces 1 step:**
- Only "navigate" action (no click event fires)

**The deduplicator properly handles this:**
1. Click event buffered
2. beforeunload fires (if navigation)
3. `forceFlush()` records buffered click
4. `recordNavigation()` records navigate step

**This is NOT the source of duplicate step_numbers** - click and navigate have different step numbers.

### Finding 4: Step Number Persistence Across Pages

**Content Script**: `state.currentStepNumber` (in-memory)
**Background**: `session.currentStepNumber` (chrome.storage.session)

**Flow:**
1. Page A records step, increments `state.currentStepNumber`
2. Navigation detected, navigate step recorded
3. Page unloads, content script dies
4. Page B loads, content script initializes
5. `restoreRecording()` fetches session from background
6. `state.currentStepNumber = session.currentStepNumber`

**Potential issue**: If the navigate step wasn't properly saved before page unload, the restored counter could be stale.

---

## Finding 5: TRUE ROOT CAUSE - Async Message Race Condition (CRITICAL)

### The Race Condition

**Location**: `recorder.ts:368` (handleKeydown) and `recorder.ts:433-437` (handleNavigation)

The core problem is:
1. Content script increments step number **synchronously** (`++state.currentStepNumber`)
2. But messages to background are **async** and may not complete before page unloads
3. If messages are lost during unload, session has stale `currentStepNumber`
4. Next page restores from stale session and reuses step numbers

### Detailed Trace (Google Search Enter Scenario)

```
Timeline:
─────────────────────────────────────────────────────────────────────
Content Script (Page A)          │  Background
─────────────────────────────────────────────────────────────────────
1. handleKeydown fires           │
   stepNumber = ++state.current  │
   stepNumber = 1                │
   addStep(step1) → send msg ────┼──▶ (message in flight)
                                 │
2. handleBlur fires              │
   → deduplicator buffers event  │
                                 │
3. beforeunload fires            │
   handleNavigation called       │
   forceFlush() called           │
     → recordInteraction         │
     stepNumber = ++state.current│
     stepNumber = 2              │
     addStep(step2) → send msg ──┼──▶ (message in flight)
   recordNavigation called       │
     stepNumber = ++state.current│
     stepNumber = 3              │
     addStep(step3) → send msg ──┼──▶ (message in flight)
                                 │
4. PAGE UNLOADS                  │  Messages arrive:
   Content script DIES           │  step1 received → session.currentStepNumber = 1
                                 │  step2 LOST (page already unloaded)
                                 │  step3 LOST (page already unloaded)
─────────────────────────────────────────────────────────────────────
Content Script (Page B)          │
─────────────────────────────────────────────────────────────────────
5. initializeRecorder()          │
   → RECORDING_GET_STATE         │
   session.currentStepNumber = 1 │  (STALE!)
   state.currentStepNumber = 1   │
                                 │
6. User clicks link              │
   stepNumber = ++state.current  │
   stepNumber = 2  ←── DUPLICATE!│
   addStep(step) → send msg ─────┼──▶ session.currentStepNumber = 2
                                 │
                                 │  NOW: session.steps has two steps with step_number = 2
─────────────────────────────────────────────────────────────────────
```

### Why This Causes SQLite UNIQUE Constraint Error

The backend has a UNIQUE constraint on `(workflow_id, step_number)`:
```python
# backend/app/models/step.py:128
UniqueConstraint("workflow_id", "step_number", name="uq_workflow_step_number")
```

When `handleStopRecording` sends steps to the API, if two steps have the same `step_number`, the INSERT fails.

### Key Code Locations

1. **Step number increment** (synchronous): `recorder.ts:545`
   ```typescript
   const stepNumber = ++state.currentStepNumber;
   ```

2. **Async message send** (not awaited during navigation): `recorder.ts:96-110`
   ```typescript
   await chrome.runtime.sendMessage({type: "RECORDING_ADD_STEP", ...});
   ```

3. **Session update** (happens IF message received): `recordingSession.ts:196-203`
   ```typescript
   currentStepNumber: step.step_number,
   ```

4. **Session restore** (uses potentially stale value): `recorder.ts:184`
   ```typescript
   state.currentStepNumber = session.currentStepNumber;
   ```

---

## Proposed Fix

### Option A: Background-Assigned Step Numbers (Recommended)

Instead of content script assigning step numbers, have the background service assign them:

1. Content script sends step WITHOUT step_number
2. Background assigns `session.currentStepNumber + 1`
3. Background stores step with assigned number
4. Content script doesn't track step numbers locally

**Pros**:
- Eliminates race condition entirely
- Single source of truth (background session)
- Works even if messages are delayed

**Cons**:
- Requires refactoring step creation flow
- Content script can't display step number immediately (minor)

### Option B: Synchronous Session Update Before Unload

Use `navigator.sendBeacon()` or `fetch(..., {keepalive: true})` to ensure messages complete before page unloads.

**Pros**:
- Minimal code changes
- Keeps current architecture

**Cons**:
- `sendBeacon` can't receive responses (can't confirm success)
- May still have edge cases with very fast navigations

### Option C: Mark Input as Recorded After Keydown

When `handleKeydown` records an input:
1. Call `state.deduplicator.markInputRecorded(element)` to prevent blur from re-recording
2. Update `inputValues` map with current value

**Note**: This fixes the duplicate ACTION problem (keydown + blur recording same input) but NOT the step number race condition. We need Option A or B for that.

---

## Test Plan

1. **Pre-test**: Rebuild extension, reload in Chrome
2. **Recording Test**:
   - Navigate to google.com
   - Execute all 9 steps
   - Observe console logs for step recording
   - Note any duplicate events
3. **Save Test**:
   - Click stop recording
   - Observe API request
   - Check for duplicate step numbers

---

## Progress Log

- [x] Create workflow documentation (this notepad)
- [x] Launch explore agents for architecture investigation
- [x] Document expected vs actual behavior
- [x] Debug duplicate step issue - ROOT CAUSE IDENTIFIED (async message race condition)
- [x] Implement fix (Option A: background-assigned step numbers)
  - Modified `recordingSession.ts`: `addStepToSession()` now assigns step numbers
  - Modified `messaging.ts`: Returns assigned step number in response
  - Modified `recorder.ts`: `recordInteraction()`, `recordNavigation()`, `recordClipboardAction()` use background-assigned numbers
  - Added `markInputRecorded()` to deduplicator to prevent blur re-recording after keydown
- [x] All 484 tests pass
- [x] Test workflow with Chrome MCP - Workflow 36 "testing10"
- [x] Verify fix works - **NO DUPLICATE STEP NUMBER ERROR** ✅
- [ ] Fix remaining issues:
  - [ ] Issue A: Missing screenshots (steps 4-8)
  - [ ] Issue B: Missing PASTE action
  - [ ] Issue C: CLICK actions recorded as NAVIGATE

---

## Fix Implemented

### Summary of Changes

1. **`recordingSession.ts`** - Background now assigns step numbers
   - `addStepToSession()` returns `{ success: boolean, stepNumber: number }`
   - Step number is `session.currentStepNumber + 1` (atomic, sequential)
   - Content script's step_number is ignored

2. **`messaging.ts`** - Returns assigned step number
   - `handleRecordingAddStep()` returns `stepNumber` in response payload

3. **`recorder.ts`** - Uses background-assigned step numbers
   - `recordInteraction()`, `recordNavigation()`, `recordClipboardAction()` send placeholder `step_number: -1`
   - After response, update local state with `response.payload.stepNumber`
   - Screenshot captured with correct step number

4. **`event-deduplicator.ts`** - Prevents duplicate actions
   - Added `markInputRecorded()` to update `inputValues` map
   - Called by `handleKeydown` after recording to prevent blur re-recording

---

## Workflow 36 Test Results (Post-Fix)

### ✅ SUCCESS: No Duplicate Step Number Error
The workflow saved successfully with 8 sequential steps (1-8). **The background-assigned step number fix worked!**

### Observed Steps

| Step | Action Type | Label | Domain | Screenshot | Notes |
|------|-------------|-------|--------|------------|-------|
| 1 | INPUT_COMMIT | Search Query Input | google.com | ✅ | Typed "claude code hooks" |
| 2 | NAVIGATE | Search Input Field | google.com | ✅ | After typing (shows autocomplete) |
| 3 | NAVIGATE | Search Results Navigation | google.com | ✅ | Search results page |
| 4 | COPY | Field | code.claude.com | ❌ MISSING | Copy action on Claude docs |
| 5 | NAVIGATE | Field | code.claude.com | ❌ MISSING | Address bar navigation |
| 6 | NAVIGATE | Field | docs.google.com | ❌ MISSING | Should be CLICK? |
| 7 | INPUT_COMMIT | Field | docs.google.com | ❌ MISSING | Doc title input |
| 8 | NAVIGATE | Field | docs.google.com | ❌ MISSING | Should be CLICK? |

### Issues Identified

#### Issue A: Missing Screenshots (Steps 4-8) - P0
- Steps 1-3 (Google) have screenshots
- Steps 4-8 (Claude docs, Google Docs) have NO screenshots
- **Hypothesis**: Screenshot capture happening BEFORE step number is assigned, or IndexedDB session ID mismatch across origins

#### Issue B: Missing PASTE Action - P1
- User performed paste in Google Doc, but no PASTE step recorded
- Expected 9 steps, got 8
- **Hypothesis**: Paste event not firing or not being captured

#### Issue C: CLICK Actions Recorded as NAVIGATE - P2
- Step 3: Clicking search result → recorded as NAVIGATE (should be CLICK + NAVIGATE)
- Step 6: Clicking "Create new doc" → recorded as NAVIGATE (should be CLICK)
- Step 8: Clicking home button → recorded as NAVIGATE (should be CLICK)
- **Hypothesis**: The click is being recorded but merged with navigate by deduplicator, OR click isn't captured at all

#### Issue D: Generic AI Labels - P3
- Steps 4-8 all labeled "Field" - AI may lack context
- Not a recording bug, but affects usability

---

## Deep Investigation Results (2026-01-23)

### Issue A: Missing Screenshots - ROOT CAUSE FOUND

**Root Cause**: Session ID mismatch and timing issues during cross-origin navigation

**Detailed Trace**:
```
Step 4 on code.claude.com:
  1. recordInteraction() called
  2. addStep() returns stepNumber=4
  3. captureScreenshot(4) called → message sent to background
  4. Page starts navigating to docs.google.com
  5. RECORDING_ADD_SCREENSHOT message arrives at background
  6. handleRecordingAddScreenshot() calls getRecordingSession()
  7. Session lookup during navigation transition → may return null/stale
  8. Screenshot NOT stored, error silently caught
  9. Step saved but screenshot_id remains null
```

**Key Code Issues**:

| Location | Issue |
|----------|-------|
| `recordingSession.ts:24` | `cachedSession` not invalidated on navigation |
| `messaging.ts:1602` | No check for `navigationInProgress` before storage |
| `messaging.ts:1618-1623` | Errors caught silently, screenshot lost |
| Message timing | Old page's message arrives after navigation "complete" |

**Why Steps 1-3 Work**: All on google.com, no navigation = no timing issues

---

### Issue B: Missing PASTE - ROOT CAUSE FOUND

**Root Cause**: Clipboard events bypass deduplicator entirely

**Code Evidence**:
```typescript
// recorder.ts:464-482 - handleClipboard
async function handleClipboard(event: ClipboardEvent): Promise<void> {
  // ...
  await recordClipboardAction(event, element, actionType);
  // ↑ DIRECT CALL - no deduplicator!
}

// Compare to handleClick which uses:
state.deduplicator.addEvent(event, element, actionType, recordInteraction);
```

**Google Docs Specific Issue**:
- Paste on contenteditable fires multiple events: `paste`, `input`, `change`, `beforeinput`
- Without deduplication, these events interfere/conflict
- COPY worked because Claude docs is simpler (standard text selection)
- PASTE lost because Google Docs event storm causes race conditions

**Missing Pieces**:
1. `EVENT_PRIORITY` has no `copy`/`cut`/`paste` entries (priority = 0)
2. `isInteractionMeaningful()` returns `false` for clipboard events
3. No timing buffer to let related events settle

---

### Issue C: CLICK → NAVIGATE - ROOT CAUSE FOUND

**Root Cause**: 100ms debounce window vs <50ms navigation timing

**Timing Diagram**:
```
T=0ms    | Click event → deduplicator.addEvent()
         | Schedules flush for T=100ms
T=15ms   | Browser follows link href (navigation starts)
T=20ms   | beforeunload fires → forceFlush() runs
         | BUT pendingEvents may be EMPTY (100ms hasn't passed)
T=25ms   | handleNavigation() records NAVIGATE step
T=30ms   | Page unloads, old recorder context destroyed
T=100ms  | Scheduled flush fires → but new page loaded, old code gone
```

**Secondary Issue**: `flush()` doesn't await async callbacks
```typescript
// event-deduplicator.ts:267
recordCallback(bestEvent.event, bestEvent.element);  // No await!
// recordInteraction is async - may not complete before unload
```

**Priority Issue**: `EVENT_PRIORITY.navigate = 100` vs `click = 40`
- Even if both were buffered, navigate wins
- Click → Navigate relationship not recognized as related

**Key Locations**:
- `event-deduplicator.ts:45` - `bufferDelay = 100` (too slow)
- `event-deduplicator.ts:246-274` - `flush()` not async-aware
- `recorder.ts:443-459` - `handleNavigation()` not properly awaited

---

## Key Files Reference

### Recording System
- `extension/src/content/recorder.ts` - Event capture
- `extension/src/content/utils/event-deduplicator.ts` - Event deduplication
- `extension/src/background/recordingSession.ts` - Session state management
- `extension/src/background/messaging.ts` - Message handling

### Relevant Code Locations (to be filled)
- Step number tracking: ???
- Keydown handler: `recorder.ts:~327`
- Deduplicator logic: ???
- Navigation handling: `recorder.ts:~handleNavigation`

---

## Phase 2 Fixes Implemented (2026-01-23)

All three issues from workflow 36 testing have been addressed:

### Phase 1: Fix Screenshot Timing (Issue A) - ✅ COMPLETE

**Problem**: Screenshots for steps 4-8 were missing because session lookup failed during cross-origin navigation.

**Root Cause**: `cachedSession` was not invalidated when navigation completed, causing stale session data during screenshot storage.

**Fix Applied**:

1. **`recordingSession.ts`** - Added cache invalidation on navigation complete:
   ```typescript
   export async function handleRecordingNavigationComplete(tabId: number): Promise<void> {
     // CRITICAL: Invalidate cache FIRST to ensure fresh session read
     cachedSession = null;
     // ... rest of function
   }
   ```

2. **`messaging.ts`** - Added retry logic for screenshot storage:
   ```typescript
   async function handleRecordingAddScreenshot(...): Promise<void> {
     let session = (await getRecordingSession()).session;

     if (!session) {
       // Retry after delay for navigation timing
       await new Promise((r) => setTimeout(r, 100));
       session = (await getRecordingSession()).session;
       // Second retry if needed...
     }
     // Store screenshot with validated session
   }
   ```

### Phase 2: Fix Click/Navigate Timing (Issue C) - ✅ COMPLETE

**Problem**: Click events were being lost before navigation because 100ms buffer delay was slower than 15ms browser navigation timing.

**Root Cause**: The deduplicator's `flush()` was synchronous and didn't await async callbacks, so recordings didn't complete before page unload.

**Fix Applied**:

1. **`event-deduplicator.ts`** - Reduced buffer delay and made flush async:
   ```typescript
   // Reduced from 100ms to 15ms
   private readonly bufferDelay = 15;

   // Made flush async to await recording callbacks
   private async flush(recordCallback: RecordCallback): Promise<void> {
     for (const group of groups) {
       const bestEvent = this.pickBestEvent(group);
       await recordCallback(bestEvent.event, bestEvent.element); // Now awaited
     }
   }

   // forceFlush now returns Promise
   async forceFlush(recordCallback: RecordCallback): Promise<void> {
     await this.flush(recordCallback);
   }
   ```

2. **`recorder.ts`** - Updated handleNavigation to await flush:
   ```typescript
   async function handleNavigation(_event: Event): Promise<void> {
     // CRITICAL: Must await to ensure events are recorded before page unloads
     await state.deduplicator.forceFlush(recordInteraction);
     await recordNavigation();
   }
   ```

### Phase 3: Fix Clipboard Recording (Issue B) - ✅ COMPLETE

**Problem**: PASTE action on Google Docs was not recorded because clipboard events bypassed the deduplicator, causing race conditions with Google Docs' event storm.

**Root Cause**: `handleClipboard()` called `recordClipboardAction()` directly without going through the deduplicator.

**Fix Applied**:

1. **`event-deduplicator.ts`** - Added clipboard priorities:
   ```typescript
   const EVENT_PRIORITY = {
     submit: 100,
     navigate: 100,
     change: 80,
     copy: 75,    // NEW
     cut: 75,     // NEW
     paste: 75,   // NEW
     input_commit: 60,
     select_change: 80,
     click: 40,
   };
   ```

2. **`filters.ts`** - Added clipboard event handling:
   ```typescript
   // In isInteractionMeaningful()
   case "copy":
   case "cut":
   case "paste":
     return true;

   // In getActionType()
   case "copy": return "copy";
   case "cut": return "cut";
   case "paste": return "paste";
   ```

3. **`recorder.ts`** - Route clipboard through deduplicator:
   ```typescript
   function handleClipboard(event: ClipboardEvent): void {
     // Capture clipboard preview synchronously (before it becomes stale)
     const clipboardPreview = event.clipboardData?.getData("text/plain")?.substring(0, 100);

     // Route through deduplicator for proper event grouping
     state.deduplicator.addEvent(
       event, element, actionType,
       async (_evt, el) => {
         await recordClipboardActionWithPreview(el, actionType, clipboardPreview);
       }
     );
   }
   ```

### Summary of All Files Modified

| File | Changes |
|------|---------|
| `recordingSession.ts` | Cache invalidation on navigation complete |
| `messaging.ts` | Retry logic for screenshot storage during navigation |
| `event-deduplicator.ts` | 15ms buffer, async flush, clipboard priorities |
| `recorder.ts` | Await forceFlush, route clipboard through deduplicator |
| `filters.ts` | Clipboard events in isInteractionMeaningful and getActionType |

### Test Results

- ✅ Build passes
- ✅ All 484 tests pass
- Ready for manual testing with 9-step workflow

---
