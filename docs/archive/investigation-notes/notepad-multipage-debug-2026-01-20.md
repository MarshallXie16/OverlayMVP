# Notepad: Multi-Page Recording Debug Session
**Date**: 2026-01-20
**Task**: Debug why recording widget disappears on page navigation

## Problem Statement
- User starts recording on google.com
- User types a query and presses Enter (navigation to search results)
- Recording widget disappears on the new page
- **Expected**: Widget should persist and show correct step count

## Session Handoff Summary
From `session-handoff.md`:
- All implementation code for multi-page recording was written (Phases 1-6)
- Build passes, tests pass
- Feature doesn't work in practice

### Suspected Root Cause
The original `startRecording()` flow likely does NOT call `startRecordingSession()`. The session may never be created in `chrome.storage.session`.

### Key Files to Investigate
1. `extension/src/background/state.ts` - Original recording start logic
2. `extension/src/background/messaging.ts:153-160` - START_RECORDING handler
3. `extension/src/content/recorder.ts:147-234` - initializeRecorder and restoreRecording
4. `extension/src/background/recordingSession.ts:103-144` - startRecordingSession

### Code Flow to Trace
```
popup clicks Start → background receives START_RECORDING
                   → messaging.ts handleStartRecording()
                   → state.ts startRecording()
                   → content script startRecording()

BUT: Where is recordingSession.ts:startRecordingSession() called?
     LIKELY NOWHERE - this is the bug!
```

## Investigation Progress
- [ ] Read state.ts to understand original recording flow
- [ ] Read messaging.ts START_RECORDING handler
- [ ] Read recordingSession.ts to understand session management
- [ ] Read recorder.ts initializeRecorder() function
- [ ] Trace the complete flow from popup → background → content script
- [ ] Identify where startRecordingSession() should be called
- [ ] Propose fix

## Findings (Verified via Codex + Manual Code Review)

### Root Cause #1: Session Never Created
**File**: `extension/src/background/messaging.ts:323-360`
**Problem**: The `handleStartRecording()` function only calls `startRecording()` from state.ts - it does NOT call `startRecordingSession()`. The session is never created in `chrome.storage.session`.

```typescript
// Current code (lines 339-340):
const recordingState = await startRecording(workflowName, startingUrl);
// Missing: await startRecordingSession(workflowName, startingUrl, tabId);
```

### Root Cause #2: Content Script Not Auto-Injected
**File**: `extension/src/manifest.json:29-35`
**Problem**: Only `content/walkthrough.js` is auto-injected via manifest - NOT `content/recorder.js`. The recorder script is only programmatically injected once when user clicks "Start Recording".

```json
// manifest.json only has:
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content/walkthrough.js"],  // <-- recorder.js NOT included!
    ...
  }
]
```

### Root Cause #3: No Re-injection on Navigation
**File**: `extension/src/background/index.ts:222-230`
**Problem**: When navigation completes, the background checks for recording session and calls `handleRecordingNavigationComplete()`, but does NOT re-inject the content script. Even if session existed, recorder wouldn't run on new page.

```typescript
// Current code (lines 222-230):
const { session: recordingSession, isRecordingTab } = await getRecordingSession(details.tabId);
if (recordingSession && isRecordingTab) {
  await handleRecordingNavigationComplete(details.tabId);
  // Missing: await chrome.scripting.executeScript({ target: { tabId: details.tabId }, files: ["content/recorder.js"] });
}
```

### Why Widget Disappears
1. User clicks "Start Recording" → recorder.js injected, widget shows
2. User navigates → DOM destroyed, content script unloaded
3. New page loads → walkthrough.js auto-injects (from manifest)
4. recorder.js does NOT inject because it's not in manifest
5. initializeRecorder() never runs on new page
6. Even if it did, session doesn't exist because startRecordingSession() was never called
7. Widget never appears

## Questions (Answered)
- Is startRecordingSession() ever called anywhere? **NO** - only imported but never called from START_RECORDING flow
- How does the old state.ts system interact with the new recordingSession.ts? **They don't** - this is the integration gap

## Proposed Fix

### Fix #1: Create Session When Recording Starts
**File**: `extension/src/background/messaging.ts:323-360`

```typescript
async function handleStartRecording(
  message: ExtensionMessage,
  sendResponse: (response?: any) => void,
): Promise<void> {
  try {
    const { workflowName, startingUrl } = message.payload || {};
    // ... validation ...

    // Get active tab ID for session tracking
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = activeTab?.id;
    if (!tabId) throw new Error("No active tab found");

    // Start recording (original flow)
    const recordingState = await startRecording(workflowName, startingUrl);

    // ALSO create session for multi-page persistence
    await startRecordingSession(workflowName, startingUrl, tabId);

    sendResponse({ type: "START_RECORDING", payload: { success: true, recordingState } });
  } catch (error) { ... }
}
```

### Fix #2: Re-inject Recorder on Navigation Complete
**File**: `extension/src/background/index.ts:222-230`

```typescript
// Check recording session
const { session: recordingSession, isRecordingTab } = await getRecordingSession(details.tabId);
if (recordingSession && isRecordingTab) {
  console.log(`[Background] Navigation completed in recording tab ${details.tabId}: ${details.url}`);
  await handleRecordingNavigationComplete(details.tabId);

  // Re-inject recorder content script for the new page
  await chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    files: ["content/recorder.js"],
  });
  console.log(`[Background] Re-injected recorder.js into tab ${details.tabId}`);
}
```

### Alternative Approach (Not Recommended)
Could add `content/recorder.js` to manifest.json content_scripts, but this would:
- Load recorder on EVERY page visit (wasteful)
- Need to handle "no session" case gracefully in initializeRecorder()
- Current "inject on demand" approach is more efficient

## Implementation Complete

### Changes Made

1. **`extension/src/background/messaging.ts`**:
   - `handleStartRecording()`: Added `startRecordingSession()` call after `startRecording()` (lines 340-358)
   - `handleStopRecording()`: Added `endRecordingSession("user_stop")` call for cleanup (line 458)

2. **`extension/src/background/index.ts`**:
   - `webNavigation.onCompleted` listener: Added content script re-injection for recording tabs (lines 231-257)
   - Skips chrome:// and chrome-extension:// URLs
   - Handles injection errors gracefully

### Build Status
- **Build**: ✅ PASSED
- **Content Script Format**: ✅ IIFE (correct)

## Code References

## TODOs
- [ ] Investigate with codex-delegate
- [ ] Identify the integration gap
- [ ] Plan the fix
- [ ] Implement the fix
- [ ] Test manually
- [ ] Run automated tests
- [ ] Request code review

---
