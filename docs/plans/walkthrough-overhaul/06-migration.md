# Sprint 6: Migration & Cleanup

**Duration**: 2 days
**Dependencies**: Sprints 1-5
**Status**: Not Started

---

## Objective

Safely migrate from the old walkthrough system to the new one using a feature flag. Verify feature parity, remove old code, and update documentation.

---

## Tickets

### W-029: Implement Feature Flag
**Priority**: P0
**Estimate**: 3 hours
**Dependencies**: Sprints 1-5 complete
**Files to Create/Modify**:
- `extension/src/shared/config.ts` (~30 lines)
- `extension/src/content/index.ts` (modify initialization)
- `extension/src/background/index.ts` (modify initialization)

**Acceptance Criteria**:
- [ ] Feature flag toggles between old/new walkthrough
- [ ] Flag readable from chrome.storage.sync
- [ ] Default: old system (safe rollout)
- [ ] Can be toggled without extension reload
- [ ] Popup shows current mode (for testing)

**Implementation**:
```typescript
// extension/src/shared/config.ts

export const FEATURE_FLAGS = {
  USE_NEW_WALKTHROUGH: 'use_new_walkthrough',
};

export async function getFeatureFlag(flag: string): Promise<boolean> {
  const result = await chrome.storage.sync.get(flag);
  return result[flag] ?? false;  // Default to old system
}

export async function setFeatureFlag(flag: string, value: boolean): Promise<void> {
  await chrome.storage.sync.set({ [flag]: value });
}
```

**Content Script Initialization**:
```typescript
// extension/src/content/index.ts

import { getFeatureFlag, FEATURE_FLAGS } from '../shared/config';

async function initializeWalkthrough() {
  const useNew = await getFeatureFlag(FEATURE_FLAGS.USE_NEW_WALKTHROUGH);

  if (useNew) {
    // New modular system
    const { WalkthroughController } = await import('./walkthrough/index');
    const controller = new WalkthroughController();
    await controller.initialize();
  } else {
    // Old monolithic system
    const { initializeContentScript } = await import('./walkthrough');
    await initializeContentScript();
  }
}
```

---

### W-030: Parallel Testing Period
**Priority**: P0
**Estimate**: 4 hours (testing, not coding)
**Dependencies**: W-029

**Testing Matrix**:

| Scenario | Old System | New System | Status |
|----------|------------|------------|--------|
| Start walkthrough | | | |
| Complete single-page workflow | | | |
| Multi-page navigation | | | |
| Jump to step | | | |
| Go back | | | |
| Retry failed step | | | |
| Element healing (high conf) | | | |
| Element healing (medium conf) | | | |
| Element not found → skip | | | |
| Element not found → exit | | | |
| Browser back button | | | |
| Tab closure | | | |
| Session timeout | | | |
| Rapid button clicks | | | |

**Testing Procedure**:
1. Set `USE_NEW_WALKTHROUGH: false`
2. Run through all scenarios, record results
3. Set `USE_NEW_WALKTHROUGH: true`
4. Run through all scenarios, compare results
5. Document any differences

**Acceptance Criteria**:
- [ ] All scenarios pass with new system
- [ ] No regressions compared to old system
- [ ] Performance comparable or better
- [ ] No console errors

---

### W-031: Remove Old Walkthrough Code
**Priority**: P1
**Estimate**: 3 hours
**Dependencies**: W-030 verified
**Files to Remove/Modify**:
- `extension/src/content/walkthrough.ts` (DELETE - 2,266 lines)
- `extension/src/background/walkthroughSession.ts` (DELETE - ~450 lines)
- `extension/src/background/messaging.ts` (remove old handlers)
- `extension/src/shared/types.ts` (remove old types)

**Acceptance Criteria**:
- [ ] Old walkthrough.ts deleted
- [ ] Old walkthroughSession.ts deleted
- [ ] Old message handlers removed from messaging.ts
- [ ] Old types removed from types.ts
- [ ] No dead code remaining
- [ ] Build still passes
- [ ] Tests still pass

**Cleanup Checklist**:
```
□ DELETE extension/src/content/walkthrough.ts (2,266 lines)
□ DELETE extension/src/background/walkthroughSession.ts (~450 lines)
□ REMOVE WalkthroughState interface (old) from types.ts
□ REMOVE WalkthroughSessionState interface from types.ts
□ REMOVE handleStartWalkthrough() from messaging.ts
□ REMOVE handleWalkthroughData() from messaging.ts
□ REMOVE handleWalkthroughGetState() from messaging.ts
□ REMOVE handleWalkthroughStateUpdate() from messaging.ts
□ REMOVE handleWalkthroughNavigationDone() from messaging.ts
□ REMOVE feature flag code (no longer needed)
□ UPDATE imports in content/index.ts
□ UPDATE imports in background/index.ts
```

---

### W-032: Update Manifest and Exports
**Priority**: P1
**Estimate**: 2 hours
**Dependencies**: W-031
**Files to Modify**:
- `extension/src/manifest.json` (if needed)
- `extension/vite.config.ts` (update entry points)
- `extension/package.json` (if needed)

**Acceptance Criteria**:
- [ ] Content script entry point updated
- [ ] Build produces correct output
- [ ] Manifest references correct files
- [ ] Extension loads without errors

**Vite Config Updates**:
```typescript
// If content script entry changed
build: {
  rollupOptions: {
    input: {
      content: 'src/content/index.ts',  // May need update
      background: 'src/background/index.ts',
      popup: 'src/popup/index.tsx',
    },
  },
},
```

---

### W-033: Documentation Update
**Priority**: P2
**Estimate**: 3 hours
**Dependencies**: W-031, W-032
**Files to Update**:
- `docs/walkthrough_overlay_ui.md`
- `docs/architecture.md` (if exists)
- `memory.md` (update walkthrough section)
- `README.md` (if walkthrough mentioned)

**Documentation Sections to Update**:

**1. Architecture Overview**:
- New module structure
- State machine states/transitions
- Message protocol

**2. Developer Guide**:
- How to add new states
- How to add new actions
- How to debug walkthrough

**3. Memory.md Updates**:
- Add lesson about state machine approach
- Document new file structure
- Note migration completion date

**Template for Walkthrough Docs**:
```markdown
# Walkthrough System Architecture

## Overview
The walkthrough system uses a state machine architecture with a single source
of truth in the background service worker.

## States
- IDLE: No active walkthrough
- INITIALIZING: Loading workflow data
- SHOWING_STEP: Displaying current step
- WAITING_ACTION: Listening for user action
- NAVIGATING: Page transition in progress
- HEALING: Auto-healing element selector
- TRANSITIONING: Moving between steps
- ERROR: Unrecoverable error state
- COMPLETED: Workflow finished

## Module Structure
[Include directory tree from overview.md]

## Message Protocol
[Include message table from overview.md]

## Adding New Features
1. Define new state (if needed) in WalkthroughState.ts
2. Add transition in StateMachine.ts
3. Handle state in WalkthroughController
4. Add tests
```

---

## Files Changed Summary

| Action | Path | Est. Lines |
|--------|------|------------|
| Create | `extension/src/shared/config.ts` | ~30 |
| Modify | `extension/src/content/index.ts` | ~+20 |
| Modify | `extension/src/background/index.ts` | ~+20 |
| Delete | `extension/src/content/walkthrough.ts` | -2,266 |
| Delete | `extension/src/background/walkthroughSession.ts` | -450 |
| Modify | `extension/src/background/messaging.ts` | -300 |
| Modify | `extension/src/shared/types.ts` | -80 |
| Modify | `extension/vite.config.ts` | ~+10 |
| Update | `docs/walkthrough_overlay_ui.md` | ~100 |
| Update | `memory.md` | ~50 |

**Total Lines Removed**: ~3,096
**Total Lines Added**: ~230
**Net Change**: -2,866 lines (while adding features!)

---

## Definition of Done

- [ ] Feature flag implemented and tested
- [ ] All scenarios pass with new system
- [ ] Old code removed
- [ ] Build passes
- [ ] All tests pass
- [ ] Documentation updated
- [ ] memory.md updated with lessons learned
- [ ] No console errors in extension

---

## Rollback Plan

If critical issues discovered after removing old code:

1. **Git revert**: `git revert HEAD~N` to restore old files
2. **Restore feature flag**: Temporarily re-add flag code
3. **Debug**: Investigate issue with old system running
4. **Fix**: Address issue in new system
5. **Re-deploy**: Remove old code again

**Timeline**: Rollback should take <30 minutes.

---

## Success Metrics

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Walkthrough success rate | ~85% | >95% |
| Multi-page completion rate | ~70% | >95% |
| Code lines (walkthrough) | 2,766 | ~2,760 (modular) |
| Test coverage | ~60% | >80% |
| Message types | 12+ | 5 |
| Race condition patches | 5 | 0 |

---

## Post-Migration Tasks

After successful migration:

1. **Monitor**: Watch for user reports of walkthrough issues
2. **Metrics**: Track walkthrough completion rates
3. **Iterate**: Gather feedback for improvements
4. **Document**: Update lessons.md with migration learnings
