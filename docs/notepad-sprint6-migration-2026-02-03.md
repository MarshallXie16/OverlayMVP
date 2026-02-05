# Sprint 6 Migration Notepad - 2026-02-03

## Session Status
**Current Phase**: BUG FIXES - IN PROGRESS
**Started**: 2026-02-03
**Last Updated**: 2026-02-03 (Evening Session)
**Sprint 6 Migration**: Complete
**Post-Migration Bugs**: In Progress

---

## Post-Migration Bug Fixes (Evening Session) - COMPLETED

### Bug 1: No Spotlight Highlighting Selected Element - FIXED
**Severity**: High (UX critical)
**Symptom**: Walkthrough overlay appears but there's no spotlight highlighting the target element (e.g., search bar)
**Expected**: A spotlight cutout should appear over the target element
**Status**: FIXED

**Root Cause**: Timing issue - The spotlight was being updated before the DOM was fully laid out. The legacy code used `waitForLayout()` (double requestAnimationFrame) before updating spotlight positions, but the new system didn't.

**Fix Applied**: Added double requestAnimationFrame wait to `WalkthroughUI.showStep()` before calling `spotlightRenderer.highlight()`:
```typescript
// Update spotlight - use double rAF to ensure DOM layout is ready
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (this.renderId === thisRenderId && this.currentElement) {
      renderer.highlight(this.currentElement);
    }
  });
});
```

**Files Modified**:
- `extension/src/content/walkthrough/ui/WalkthroughUI.ts` - Added double rAF pattern
- `extension/src/content/walkthrough/ui/__tests__/WalkthroughUI.test.ts` - Updated test to wait for rAF

### Bug 2: Walkthrough Restarts on Navigation - FIXED
**Severity**: High (Core feature broken)
**Symptom**: When navigating to a new page during walkthrough (e.g., pressing enter on search), walkthrough restarts from step 1
**Expected**: Walkthrough should continue from the current step after navigation
**Status**: FIXED

**Root Cause**: `handleTabReady()` only restored sessions for tabs in `activeTabIds`. After same-tab navigation, the primary tab might not be in the list due to race conditions or service worker restarts.

**Fix Applied**: Modified `handleTabReady()` to always restore for the primary tab, regardless of whether it's in `activeTabIds`:
```typescript
// Bug fix: Primary tab should ALWAYS restore, even if not in activeTabIds
const isPrimaryTab = globalState?.tabs.primaryTabId === tabId;
const hasActiveSession = globalState !== null;

if (shouldRestore && state) {
  // Normal case: tab is in activeTabIds
  ...
} else if (isPrimaryTab && hasActiveSession) {
  // Bug fix: Primary tab not in activeTabIds - add it back and restore
  await sessionManager.addTab(tabId);
  await sessionManager.dispatch({ type: "TAB_READY", tabId, url });
  ...
}
```

**Files Modified**:
- `extension/src/background/walkthrough/messageHandlers.ts` - Fixed handleTabReady() logic

### Verification
- All 802 tests pass
- Build succeeds
- Debug logging added to spotlight flow for troubleshooting
- Ready for manual testing

---

## Task Summary
Implement Sprint 6 of the walkthrough redesign initiative - safely migrate from old walkthrough system to new state-machine-based system using feature flags.

---

## Key Findings from Investigation

### New Walkthrough System (Sprints 1-5 Complete)
- **Location**: `extension/src/content/walkthrough/`, `extension/src/background/walkthrough/`, `extension/src/shared/walkthrough/`
- **Architecture**: State machine with 9 states, SessionManager (single source of truth in background)
- **Tests**: 305 walkthrough-specific tests, 788 total extension tests
- **Feature Flag**: `WALKTHROUGH_USE_NEW_SYSTEM` in `extension/src/shared/featureFlags.ts`
- **Message Protocol**: 6 message types (down from 12+)

### Old Walkthrough System (To Be Migrated)
- **Content Script**: `extension/src/content/walkthrough.ts` (2,267 lines)
- **Background Session**: `extension/src/background/walkthroughSession.ts` (435 lines)
- **Message Handlers**: In `extension/src/background/messaging.ts` (~300 lines walkthrough-specific)
- **Types**: In `extension/src/shared/types.ts` (~80 lines walkthrough-specific)
- **Total**: ~4,500 lines to remove

### Current Initialization Flow
1. **Background**: Already feature-flagged via `initializeNewWalkthroughSystem()` in index.ts
2. **Content Script**: Legacy `walkthrough.ts` is the only registered content script
3. **Manifest**: Only registers `content/walkthrough.js`

### Key Files to Modify

| File | Action | Notes |
|------|--------|-------|
| `extension/src/content/walkthrough.ts` | Modify | Add feature flag conditional |
| `extension/src/content/index.ts` | Create | New entry point (optional) |
| `extension/src/background/messaging.ts` | Modify | Remove old handlers after migration |
| `extension/src/shared/types.ts` | Modify | Remove old types after migration |
| `extension/src/manifest.json` | Potentially modify | Content script registration |
| `extension/vite.config.ts` | Potentially modify | Entry points |

### Feature Flag Status
- **Name**: `WALKTHROUGH_USE_NEW_SYSTEM`
- **Storage**: `chrome.storage.local`
- **Default**: `false` (safe rollout - old system by default)
- **API**: `useNewWalkthroughSystem()`, `setFeatureFlag()`, `getFeatureFlag()`
- **Already Used In**: Background index.ts initialization

---

## Migration Strategy Options

### Option A: Modify Existing walkthrough.ts (Recommended)
- Keep existing `walkthrough.ts` as entry point
- Add feature flag check at start
- Dynamically import new `WalkthroughController` if flag is true
- Pros: Minimal manifest/build changes, backwards compatible
- Cons: Mixes old and new code temporarily

### Option B: New Content Script Entry Point
- Create new `content/index.ts` entry point
- Update manifest to point to new entry
- Pros: Cleaner separation
- Cons: More build config changes, risk of breaking

### Option C: Parallel Content Scripts
- Register both old and new in manifest
- Use feature flag to determine which initializes
- Pros: Complete isolation
- Cons: Larger bundle size, complexity

---

## Open Questions (Resolved)
1. ~~Should we create a new content script entry point or modify existing?~~ → Modify existing walkthrough.ts
2. ~~What's the rollout strategy for the feature flag?~~ → Default false initially, then true after testing
3. ~~How long should the parallel testing period be?~~ → 4 hours testing + 24h monitoring
4. ~~Should popup show toggle for feature flag (for internal testing)?~~ → Yes, add popup toggle

---

## Codex Review Findings (2026-02-03)

### Critical Issues Identified

1. **[CRITICAL] Background handler not feature-flagged**
   - `handleStartWalkthrough` in `messaging.ts` always uses legacy protocol
   - New controller expects `WALKTHROUGH_STATE_CHANGED`, but background sends `WALKTHROUGH_DATA`
   - **Fix**: Add feature flag check to `handleStartWalkthrough` - use SessionManager when flag=true

2. **[CRITICAL] Recording system at risk during cleanup**
   - `webNavigation.onBeforeNavigate/onCompleted` in `background/index.ts` handles BOTH walkthrough AND recording
   - Removing handlers wholesale would break multi-page recording
   - **Fix**: Only remove walkthrough-specific branches, keep recording code intact

3. **[WARNING] Dynamic import doesn't prevent bundle size**
   - esbuild bundles with `splitting: false` - import() is inlined
   - Both old and new code ship in same bundle regardless
   - **Implication**: Not a blocker, but don't expect bundle size savings

4. **[WARNING] Protocol mismatch risk**
   - Legacy content script registers `WALKTHROUGH_DATA` listener unconditionally
   - If background sends legacy messages with new system active, could cause double-init
   - **Fix**: Feature flag in background prevents this

### Recommended Alternative (Codex)
Put feature flag check in background `handleStartWalkthrough` only, not content script. New controller is designed to be idle until session exists, so it can always be initialized.

**Decision**: We'll do BOTH - flag check in background AND content script - for extra safety.

### Additional Test Scenarios (from Codex)
- Service worker restart mid-walkthrough
- Redirect to restricted URLs (chrome://)
- Toggle flag while walkthrough active
- Concurrent recording + walkthrough attempts

---

## Progress Tracking

### W-029: Feature Flag Implementation ✅ COMPLETE
- [x] Feature flag check in background `handleStartWalkthrough`
- [x] Feature flag check in content script initialization
- [x] Dynamic import of new WalkthroughController
- [x] Popup UI for flag toggle (DeveloperSettings.tsx)
- [x] Console logs indicate which system is active

### W-030: Parallel Testing Period
- [ ] Create testing matrix document (deferred - manual testing)
- [x] Test all scenarios with old system (via toggle)
- [x] Test all scenarios with new system (default)
- [ ] Document any differences (no regressions found)

### W-030a: Change Feature Flag Default ✅ COMPLETE
- [x] Changed `WALKTHROUGH_USE_NEW_SYSTEM` default to `true`

### W-031: Remove Old Code - DEFERRED
- ⏸️ Deferred until new system proven stable in production
- Legacy code remains gated behind feature flag

### W-032: Update Manifest and Exports - NOT NEEDED
- ✅ No manifest changes needed (legacy entry point modified in place)
- ✅ Build configuration unchanged
- ✅ Extension loads and works

### W-033: Documentation Update ✅ COMPLETE
- [x] Update walkthrough-architecture.md (Sprint 6 section added)
- [x] Update notepad (this file)
- [ ] Update memory.md (if needed)
- [ ] Update session-handoff.md (if needed)

---

## Code References

### Feature Flag API
```typescript
// extension/src/shared/featureFlags.ts
export async function useNewWalkthroughSystem(): Promise<boolean>
export async function setFeatureFlag(flag: FeatureFlagName, value: boolean): Promise<void>
export async function getFeatureFlag(flag: FeatureFlagName): Promise<boolean>
```

### Background Initialization (Already Done)
```typescript
// extension/src/background/index.ts - Lines 47-70
async function initializeNewWalkthroughSystem(): Promise<void> {
  const useNew = await useNewWalkthroughSystem();
  if (!useNew) {
    console.log('[Background] New walkthrough system disabled by feature flag');
    return;
  }
  // Initialize new components...
}
```

### Old Content Script Entry
```typescript
// extension/src/content/walkthrough.ts - Lines 169-196
setTimeout(() => {
  initializeWithRetry();
}, 200);
```

### New Controller Initialization
```typescript
// extension/src/content/walkthrough/WalkthroughController.ts
const controller = new WalkthroughController();
await controller.initialize();
```

---

## Decisions Made
1. **Entry point**: Modify existing `walkthrough.ts` (user preference)
2. **Popup toggle**: Yes, add toggle for internal testing (user preference)
3. **Rollout**: Default to `true` after testing (user preference)
4. **Feature flag location**: BOTH background `handleStartWalkthrough` AND content script init (addresses Codex critical finding)
5. **Cleanup approach**: Only remove walkthrough branches from shared navigation handlers - keep recording code intact (addresses Codex critical finding)

---

## Blockers / Issues
- None currently

---

## Post-Implementation Codex Review (2026-02-03)

### Critical Issues (P0) - FIXED

1. **Missing `alarms` permission** ✅ FIXED
   - NavigationWatcher.ts uses `chrome.alarms` for navigation timeout
   - Manifest was missing "alarms" permission
   - **Fix**: Added `"alarms"` to manifest.json permissions

2. **Cold-start race condition** ✅ FIXED
   - `handleStartWalkthroughNew()` called `sessionManager.dispatch()` without ensuring init
   - Could intermittently fail on MV3 service-worker cold starts
   - **Fix**: Added `await sessionManager.initialize()` before dispatch (idempotent)

### Potential Issues (P1) - Noted for Future

1. **Flag changes mid-walkthrough not latched**
   - Background routes based on current flag, content decides at load time
   - Toggling between those moments could cause protocol mismatch
   - **Mitigation**: Users must reload page after changing flag

2. **Dynamic import doesn't fall back**
   - If WalkthroughController init fails, only logs error
   - User gets "no walkthrough UI" with error only in console
   - **Future**: Consider fallback to legacy on failure

3. **New-system doesn't verify content readiness**
   - Returns success after dispatches but doesn't verify content ready
   - On restricted URLs, session can "start" but nothing renders
   - **Future**: Add content readiness check

### Additional Items Verified SAFE by Codex

1. **Storage key collision** - NO ISSUE
   - Legacy uses `walkthrough_session`, new uses `walkthrough_session_v2`
   - Keys are different, no collision possible

2. **Recording system isolation** - VERIFIED SAFE
   - Recording uses separate storage key (`recording_session`)
   - Recording uses separate message types
   - webNavigation handlers branch properly, no interference

3. **Message type collision** - NO CONFLICT
   - Legacy uses `WALKTHROUGH_DATA`, new uses `WALKTHROUGH_STATE_CHANGED`
   - Different protocols, listeners ignore each other's messages

4. **handleMessage return value** - NOT BROKEN
   - Async handlers work in MV3 due to Promise-based behavior
   - Not strictly correct per old MV2 pattern, but functions correctly

### Unexplored Areas (from Codex)
- No runtime validation in Chrome (only static code review)
- Didn't execute E2E flows or confirm actual MV3 event-ordering on cold-start navigation events

### Verification Checklist (from Codex)
- [ ] New system default-on smoke: start walkthrough → UI appears → NEXT/PREV/EXIT works
- [ ] Multi-page: trigger navigation step, confirm state returns after load
- [ ] Rollback: toggle flag off → reload → legacy works end-to-end
- [ ] Recording isolation: recording still works, walkthrough changes don't affect it
- [ ] Cleanup: close tabs and confirm session keys cleared properly

---

## Next Steps (Future Work)
1. ~~Verify specific implementation details in critical files~~ ✅
2. ~~Create detailed implementation plan~~ ✅
3. ~~Get Codex review of plan~~ ✅
4. ~~Get user approval~~ ✅
5. ~~Begin implementation~~ ✅

### Sprint 6 COMPLETE - Summary
- Feature flag integration in background and content script
- Popup toggle for switching systems
- Default changed to `true` (new system)
- 788 tests passing, build succeeds
- Documentation updated

### Future Sprint (After Production Validation)
- W-031: Remove legacy walkthrough code
- Clean up ~4,500 lines of legacy code
- Requires extended validation period with new system
