# Notepad: Recording & AI Labelling Investigation

**Date**: 2026-01-24
**Plan**: `/Users/marshallxie/.claude/plans/keen-launching-kahan.md`

---

## Problem Statement

User reported multiple issues after testing workflow recording:
1. AI labels are not accurate enough (lacking context)
2. Step 5 shows wrong domain (code.claude.com instead of docs.google.com)
3. Step 5 missing screenshot
4. Cursor not visible in screenshots
5. Interacted elements not highlighted in screenshots
6. Documentation is outdated

---

## Investigation Findings

### AI Labelling Pipeline
- **Location**: Backend Celery task `/backend/app/services/ai.py`
- **Model**: Claude Haiku with vision (`claude-haiku-4-5-20251001`)
- **Trigger**: `POST /api/workflows/{id}/start-processing`
- **Data sent**: Screenshot + limited metadata (tag, type, label, placeholder, nearby_text)
- **NOT sent**: visual_region, bounding_box, sibling_texts, page_url, form_context

### Step 5 Bug Root Cause
1. **Priority conflict**: `navigate` has priority 100, `input_commit` has 60
2. When user types in address bar + Enter, both events fire within 15ms
3. Navigate wins → action_type becomes "navigate" instead of "input_commit"
4. **Screenshot timing**: Captured on OLD page before navigation completes
5. **Domain attribution**: Records source page URL, not target URL

### Screenshot System
- Uses `chrome.tabs.captureVisibleTab()` - does NOT capture cursor
- `flashElement()` adds green glow but AFTER screenshot (not visible in image)
- Screenshots stored in IndexedDB (300-500KB each)

---

## Implementation Plan

### Phase 1: Quick Wins
1. **Element highlighting** - Add highlight BEFORE screenshot, remove after
2. **AI context** - Send more metadata to Claude prompt

### Phase 2: Step 5 Fix
- Capture destination screenshot after navigation completes
- Store target_url in action_data for NAVIGATE steps

### Phase 3: Documentation
- Create comprehensive `/docs/recording-process.md`
- Document action types, deduplication, known limitations

---

## Progress Log

### 2026-01-24

**Session 1: Investigation**
- [x] Launched 3 Explore agents to investigate:
  - AI labelling pipeline
  - Action type categorization
  - Screenshot & visual context
- [x] Identified root causes for all issues
- [x] User confirmed priorities: quick wins first, destination screenshot, green outline

**Session 1: Implementation**
- [x] Phase 1a: Element highlighting before screenshot ✅
  - Added `addHighlightForScreenshot()` function (green outline)
  - Modified `recordInteraction()` to highlight before capture
  - Modified `recordClipboardActionWithPreview()` similarly
  - Removed unused `flashElement()` function
  - Build passes, all 484 tests pass
- [x] Phase 1b: AI context improvements ✅
  - Enhanced `_build_prompt()` in `backend/app/services/ai.py`
  - Added: page URL, title, visual_region, section heading
  - Added: ARIA role, ARIA label, element text content, position
  - Added instructions about green highlight interpretation
  - Python syntax verified
- [x] Phase 2: Destination screenshot ✅
  - Added `pendingNavigateScreenshotStepNumber` to RecordingSessionState
  - Background captures screenshot after `webNavigation.onCompleted`
  - Content script no longer captures screenshot for NAVIGATE steps
  - Build passes, all 484 tests pass
- [x] Phase 3: Documentation ✅
  - Created comprehensive `/docs/recording-process.md` (450+ lines)
  - Covers: event capture, action types, deduplication, screenshots
  - Covers: multi-page recording, AI labelling, data structures
  - Includes known limitations and troubleshooting guide

---

## Key File References

| File | Line | Purpose |
|------|------|---------|
| `recorder.ts` | 44-53 | `flashElement()` - current visual feedback |
| `recorder.ts` | 97-123 | `recordInteraction()` - main recording function |
| `recorder.ts` | 731-764 | `captureScreenshot()` - screenshot request |
| `event-deduplicator.ts` | 22-33 | Event priority definitions |
| `screenshot.ts` | 124-127 | Chrome captureVisibleTab call |
| `ai.py` | 272-316 | Prompt builder for Claude |
| `ai.py` | 291-296 | Current metadata extraction |

---

## Code Snippets for Reference

### Current flashElement (recorder.ts:44-53)
```typescript
function flashElement(element: HTMLElement): void {
  const prevTransition = element.style.transition;
  const prevBoxShadow = element.style.boxShadow;
  element.style.transition = "box-shadow 0.2s ease";
  element.style.boxShadow = "0 0 0 3px rgba(34,197,94,0.6)"; // Green glow
  setTimeout(() => {
    element.style.boxShadow = prevBoxShadow;
    element.style.transition = prevTransition;
  }, 500);
}
```

### Event Priority (event-deduplicator.ts:22-33)
```typescript
const EVENT_PRIORITY = {
  submit: 100,
  navigate: 100,
  change: 80,
  copy: 75,
  cut: 75,
  paste: 75,
  input_commit: 60,
  select_change: 80,
  click: 40,
};
```

### Current AI Prompt Data (ai.py:291-296)
```python
tag = element_meta.get("tag_name", "N/A")
elem_type = element_meta.get("type", "N/A")
label_text = element_meta.get("label_text", "N/A")
placeholder = element_meta.get("placeholder", "N/A")
nearby_text = element_meta.get("nearby_text", "N/A")
```

---

## Session 2: New Issues (2026-01-27)

### New Problems Reported

1. **Green outline timing** - Appears briefly, sometimes not captured in screenshot. User wants ~1s duration.
2. **AI labelling accuracy** - Need to review what context is sent to Claude
3. **Docs organization** - Many outdated/cluttered files in docs/
4. **Walkthrough mode broken** - No overlay renders after clicking "Run Walkthrough"

---

### Investigation Findings (Session 2)

#### Issue 1: Green Outline Timing

**Root Cause**: After `requestAnimationFrame` (~16ms), screenshot is taken, then highlight is immediately removed.
- Total visible time: ~150ms (not enough for reliable capture)
- `waitForRender()` uses single rAF - insufficient guarantee of paint completion

**Solution**: Add ~800ms delay before `cleanupHighlight()` to achieve ~1s total visibility
- Two locations need fix: `recordInteraction()` (line 679) and `recordClipboardActionWithPreview()` (line 599)

#### Issue 2: AI Labelling Context

**Current State**: Action type IS included in prompt ✅

**Critical Missing Context** (captured but NOT sent to Claude):
- `formContext` (form_id, field_index, total_fields) - CRITICAL for disambiguation
- `parentChain` - structural context
- `visibility` status
- `closest_label` from nearbyLandmarks
- `container_text`

**Bug Found**: `ai.py:328` uses `action_data.get("input_value")` but should be `action_data.get("value")`

**Recommendations**:
1. Fix input_value bug
2. Add form context to prompt
3. Add visibility status
4. Improve landmark context formatting

#### Issue 3: Docs Organization

**Assessment Summary** (27 files total):
- **Keep**: 13 files (core docs)
- **Update**: 3 files (outdated content)
- **Merge**: 3 files (duplicates)
- **Archive**: 8 files (notepads + sprint summaries)

**Key Actions**:
1. Create `/docs/archive/` with subfolders
2. Archive all 5 notepad files (investigation-notes/)
3. Archive BE-004, BE-005 summaries (completed-sprints/)
4. Merge `recording-system.md` into `recording-process.md`
5. Merge `testing.md` into `guides/TESTING_GUIDE.md`

#### Issue 4: Walkthrough Mode Broken (CRITICAL)

**Root Cause**: Race condition in initialization flow

**The Bug**:
1. Background navigates to URL, creates session, sends `WALKTHROUGH_DATA`
2. Content script loads after 50ms, sends `WALKTHROUGH_GET_STATE`
3. If GET_STATE completes before WALKTHROUGH_DATA arrives, init exits silently
4. WALKTHROUGH_DATA arrives but content script already exited init phase

**Key Files**:
- `walkthrough.ts:33-62` - `initializeContentScript()` exits if no session
- `walkthrough.ts:188-190` - 50ms timeout too aggressive
- `messaging.ts:734-816` - Navigation and message sending not synchronized
- `walkthroughSession.ts:331-344` - `navigationInProgress` never set to true before nav

**Solution Needed**: Fix initialization to properly wait for WALKTHROUGH_DATA or implement retry logic

### Session 2 Implementation: Task 1 - Walkthrough Bug Fix ✅

**Changes Made**:

1. **Fixed WALKTHROUGH_DATA handler async handling** (`walkthrough.ts:1944-1969`)
   - Changed handler to properly await `initializeWalkthrough()`
   - Now returns `true` to indicate async response
   - Properly reports success/failure to background

2. **Added guard to `initializeWalkthrough`** (`walkthrough.ts:299-305`)
   - Added check for `walkthroughState !== null` to prevent race conditions
   - Now throws error if no steps provided (better error reporting)

3. **Improved background WALKTHROUGH_DATA retry logic** (`messaging.ts:791-857`)
   - Now checks `response.success` to verify content script actually initialized
   - Reports failure to dashboard if all retries fail
   - Calls `endSession("error")` on failure to clean up

4. **Increased init delay** (`walkthrough.ts:187-191`)
   - Changed from 50ms to 100ms for better timing alignment

5. **Updated test** (`walkthrough.test.ts:200-211`)
   - Test now expects error to be thrown for empty steps

**Build**: ✅ Passes
**Tests**: ✅ 484/484 pass

### Session 2 Implementation: Task 2 - Green Outline Timing ✅

**Changes Made**:
- Added 800ms delay before `cleanupHighlight()` in `recordInteraction()` (recorder.ts:~679)
- Added 800ms delay before `cleanupHighlight()` in `recordClipboardActionWithPreview()` (recorder.ts:~599)

**Build**: ✅ Passes
**Tests**: ✅ 484/484 pass

### Session 2 Implementation: Task 3 - AI Labelling Improvements ✅

**Changes Made**:
1. **Bug fix**: Changed `action_data.get("input_value")` to `action_data.get("value")` (ai.py:364)
2. **Added form context**: form_id, form_action, field_index, total_fields (ai.py:339-349)
3. **Added workflow context**: workflow name, step number, total steps (ai.py:367-374)
4. **Added visibility status**: Shows "Hidden" if element not visible (ai.py:334)
5. **Added closest_label**: From nearbyLandmarks (ai.py:354-355)
6. **Updated test**: Fixed test to use `value` key (test_ai_service.py:212)

**Build**: ✅ Passes
**Tests**: ✅ 372/372 backend tests pass

### Session 2 Implementation: Task 4 - Docs Organization ✅

**Archived** (9 files total):
```
archive/
├── completed-sprints/
│   ├── BE-004_IMPLEMENTATION_SUMMARY.md
│   └── BE-005_IMPLEMENTATION_SUMMARY.md
├── investigation-notes/
│   ├── notepad-duplicate-steps-regression-2026-01-23.md
│   ├── notepad-multipage-debug-2026-01-20.md
│   ├── notepad-multipage-recording.md
│   ├── notepad-recording-issues-2026-01-21.md
│   └── notepad-workflow-testing-2026-01-22.md
└── superseded/
    ├── recording-system.md (replaced by recording-process.md)
    └── testing.md (covered by guides/TESTING_GUIDE.md)
```

**Current notepad kept active**: `notepad-recording-ai-investigation-2026-01-24.md`

---

## Session 2 Summary - ALL TASKS COMPLETED ✅

| Task | Status | Changes |
|------|--------|---------|
| 1. Walkthrough race condition | ✅ | Async handler, error reporting, init timing |
| 2. Green outline timing | ✅ | 800ms delay before cleanup |
| 3. AI labelling context | ✅ | Bug fix + form/workflow/visibility context |
| 4. Docs organization | ✅ | 9 files archived |

**All tests pass**: 484 extension + 372 backend = 856 total

---

## Session 3: Walkthrough Still Broken (2026-01-27)

### Problem Report
User tested walkthrough after Session 2 fixes - still broken:
- Clicking "Run Walkthrough" opens new tab to target URL (google.com)
- No overlay renders on the target page
- Console shows: `[Walkthrough] No active session to restore`
- Service worker logs show **NO START_WALKTHROUGH message received**

### Investigation Findings

**Root Cause**: Cross-window postMessage was being silently rejected.

The dashboard (`extensionBridge.ts`) was:
1. Opening a new tab with `window.open(startingUrl, "_blank")`
2. Then posting START_WALKTHROUGH to that new tab: `newTab.postMessage(payload, "*")`

But the content script in `walkthrough.ts` has a security check:
```typescript
// SECURITY: Ensure message is from same window (not iframe)
if (event.source !== window) {
  return;  // <-- SILENTLY REJECTED HERE
}
```

When dashboard calls `newTab.postMessage()`, `event.source` is the **dashboard window**, not the target page window. The security check fails silently.

### Solution Implemented

**1. Fixed `dashboard/src/utils/extensionBridge.ts`**:
- Removed `window.open()` call - let background handle tab creation
- Changed `newTab.postMessage()` → `window.postMessage()` to own window
- Content script on localhost:3000 receives message and forwards to background

**2. Fixed `extension/src/background/messaging.ts`**:
- Changed `handleStartWalkthrough` to ALWAYS create new tab
- Previously: if sender.tab existed, it would navigate THAT tab (losing dashboard)
- Now: always creates new tab, keeping dashboard intact

### Files Modified

| File | Change |
|------|--------|
| `dashboard/src/utils/extensionBridge.ts` | Post to own window, not new tab |
| `extension/src/background/messaging.ts` | Always create new tab in handleStartWalkthrough |

### Session 3 Summary

| Task | Status | Changes |
|------|--------|---------|
| Fix walkthrough (REAL root cause) | ✅ | Fixed cross-window postMessage issue |

**All tests pass**: 484 extension tests

---

## Session 5: Walkthrough System Overhaul (2026-01-30)

### Objective
Full rewrite of walkthrough system to eliminate race conditions, improve multi-page support,
and make the codebase maintainable.

### Investigation Completed
- Launched 3 Explore agents to analyze current walkthrough system
- Identified issues: 2,266-line monolith, dual state, timing hacks, race condition patches
- User confirmed: Full rewrite, critical multi-page, full navigation flexibility, both reliability + maintainability

### Sprint Plans Created
Located in: `docs/plans/walkthrough-overhaul/`
- `00-overview.md` - High-level overview
- `01-foundation.md` - Sprint 1: State machine, types, SessionManager
- `02-ui-layer.md` - Sprint 2: UI wrappers (keep existing UI)
- `03-action-detection.md` - Sprint 3: Action handling
- `04-navigation.md` - Sprint 4: Multi-page (critical path)
- `05-messaging.md` - Sprint 5: Message protocol
- `06-migration.md` - Sprint 6: Feature flag, cleanup

### Codex Review Feedback (Applied)
**P0 Fixes**:
1. StateMachine.ts → moved to `shared/walkthrough/` (not content-only)
2. BroadcastChannel → replaced with `chrome.tabs.sendMessage`
3. Added TAB_READY event for content script handshake
4. StepRouter → moved to background (needs SessionManager access)
5. Estimates revised to 18-22 days

**Key Decision**: Keep existing walkthrough UI - it's good. Sprint 2 wraps it, doesn't rewrite.

### Architecture Summary
```
shared/walkthrough/      ← StateMachine, types, events, messages
background/walkthrough/  ← SessionManager (SOURCE OF TRUTH), NavigationWatcher, StepRouter
content/walkthrough/     ← WalkthroughController (renders state), UI wrappers, actions
```

### Current Status
- Sprint plans updated with Codex feedback ✅
- Sprint 1: Foundation - COMPLETED ✅

### Sprint 1 Implementation (2026-01-30)

**Files Created**:
| File | Lines | Purpose |
|------|-------|---------|
| `shared/walkthrough/constants.ts` | ~90 | Timeouts, thresholds, UI constants |
| `shared/walkthrough/WalkthroughState.ts` | ~250 | Unified state interface, helper functions |
| `shared/walkthrough/events.ts` | ~310 | All event types for state machine |
| `shared/walkthrough/messages.ts` | ~340 | Message protocol (6 message types) |
| `shared/walkthrough/StateMachine.ts` | ~500 | State machine with transition table |
| `shared/walkthrough/index.ts` | ~110 | Barrel exports |
| `background/walkthrough/SessionManager.ts` | ~320 | Single source of truth, persistence |
| `background/walkthrough/index.ts` | ~15 | Barrel exports |
| `content/walkthrough/types.ts` | ~65 | Content-specific types |
| `content/walkthrough/WalkthroughController.ts` | ~290 | Controller skeleton with placeholders |
| `content/walkthrough/index.ts` | ~15 | Barrel exports |
| `shared/walkthrough/__tests__/StateMachine.test.ts` | ~420 | 36 unit tests for state machine |

**Total**: ~2,725 new lines across 12 files

**Tests**: 520 total (484 original + 36 new)

**Next**: Sprint 2 - UI Layer (OverlayManager, SpotlightRenderer, TooltipRenderer)

### Key File References
| File | Purpose |
|------|---------|
| `extension/src/shared/walkthrough/` | New walkthrough types, state machine, messages |
| `extension/src/background/walkthrough/` | SessionManager (source of truth) |
| `extension/src/content/walkthrough/` | WalkthroughController skeleton |
| `extension/src/content/walkthrough.ts` | OLD monolith (2,266 lines) - will be replaced |
| `extension/src/background/walkthroughSession.ts` | OLD session manager - will be replaced |

---

## Session Handoff Notes

If starting a new session, read this notepad first. Key context:
1. Plan approved at `/Users/marshallxie/.claude/plans/keen-launching-kahan.md`
2. Session 1: highlight → AI context → destination screenshot → docs - ALL COMPLETED ✅
3. Session 2: walkthrough race condition fix, outline timing, AI context, docs - ALL COMPLETED ✅
4. Session 3: Fixed REAL walkthrough bug - cross-window postMessage issue ✅
5. Session 4: Fixed 5 UX bugs (see session-handoff.md) ✅
6. Session 5: Walkthrough overhaul Sprint 1 Foundation - COMPLETED ✅
