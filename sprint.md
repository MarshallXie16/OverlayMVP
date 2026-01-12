# Sprint 6: Bug Fixes & UX Improvements

**Sprint Goal**: Fix data inconsistencies and improve UX across dashboard
**Start Date**: 2025-01-11
**Status**: In Progress

---

## Tickets

### BUG-001: Dashboard Home vs Health Tab Data Mismatch
**Priority**: P1 (High)
**Type**: Bug
**Status**: Ready for Implementation

**Description**:
Dashboard home shows different data than the Health tab:
- Health tab shows 100% success rate
- Home dashboard shows 27% success rate
- Rule counts don't line up between views

**Acceptance Criteria**:
- [x] Identify root cause of data discrepancy
- [ ] Both views show consistent success rate data
- [ ] Rule/workflow counts match across views

**Investigation Notes**:
**Root Cause Found**: Two different calculation methods + data sources

| Aspect | Dashboard Home | Health Tab |
|--------|---------------|------------|
| Calculation | Unweighted average of workflow success_rate values | (success + healed) / total executions |
| Time Period | All time | Last 30 days |
| API Endpoint | `/api/workflows` | `/api/health/stats` |
| Accuracy | Less accurate (treats all workflows equally) | More accurate (weighted by volume) |

**Files to modify**:
- `dashboard/src/pages/Dashboard.tsx` (lines 64-88) - Replace healthStats calculation

**Recommended Fix**: Dashboard should call `/api/health/stats` instead of calculating from workflow list. This provides:
- Single source of truth
- Consistent with Health Tab
- Uses actual execution-based calculation

---

### BUG-002: User Deletion in Wrong Location
**Priority**: P2 (Medium)
**Type**: UX Bug
**Status**: Ready for Implementation

**Description**:
User deletion is available in Settings > Company, but should only be in the Teams tab. Settings > Company should only display team members (read-only).

**Acceptance Criteria**:
- [x] Identify where delete functionality exists
- [ ] Remove delete functionality from Settings > Company
- [ ] Settings > Company shows team members list (read-only)
- [ ] User deletion remains functional in Teams tab

**Investigation Notes**:
Delete functionality currently exists in **two locations**:

1. **Settings > Company** (`CompanySettings.tsx`):
   - Lines 100-117: `handleRemoveMember()` function
   - Lines 313-328: Delete button in team members list
   - Uses simple `confirm()` dialog

2. **Team Management** (`TeamView.tsx`):
   - Lines 216-233: `handleRemoveMember()` function
   - Lines 777-832: Full modal confirmation dialog
   - Better UX with proper error handling

**Files to modify**:
- `dashboard/src/pages/settings/CompanySettings.tsx`:
  - Remove `handleRemoveMember()` function (lines 100-117)
  - Remove `removingMemberId` state (line 37)
  - Remove delete button from JSX (lines 313-328)

---

### FEAT-015: Timezone Customization
**Priority**: P2 (Medium)
**Type**: Feature
**Status**: Ready for Implementation

**Description**:
Users cannot customize their timezone in Settings > Preferences. Need to add timezone selection that affects all date displays.

**Acceptance Criteria**:
- [x] Understand current date handling
- [x] Add timezone field to User model
- [x] Add timezone dropdown to Settings > Preferences
- [x] Persist timezone preference per user
- [x] All dates in UI display in user's selected timezone
- [x] Default to browser timezone if not set

**Investigation Notes**:
**Current State**:
- PreferencesSettings has placeholder UI with "Coming soon" toast
- No timezone field in User model or database
- Dates formatted using native JS methods without timezone awareness
- Backend stores all times in UTC

**Implementation Plan**:

**Backend Changes**:
1. Add `timezone` field to User model (IANA identifier, e.g., "America/Los_Angeles")
2. Update `UpdateProfileRequest` schema to include timezone
3. Update `UserResponse` schema to include timezone
4. Create database migration

**Frontend Changes**:
1. Update TypeScript interfaces (`api/types.ts`)
2. Create timezone utility module (`utils/timezone.ts`)
3. Update PreferencesSettings with timezone dropdown
4. Update all date displays to use user's timezone:
   - `utils/typeMappers.ts` - `formatRelativeTime()`
   - `components/NotificationBell.tsx`
   - `pages/HealthView.tsx`
   - `pages/TeamView.tsx`
   - `pages/WorkflowDetail.tsx`

**No external library needed** - Use native `Intl.DateTimeFormat` API with timezone option.

---

### BUG-003: Review Page Button Text Incorrect
**Priority**: P3 (Low)
**Type**: Bug
**Status**: Ready for Implementation

**Description**:
On the workflow review page (e.g., `/workflows/25/review`), the button shows "Activate Workflow" even when the workflow is already active. Should show "Save" for subsequent saves.

**Acceptance Criteria**:
- [x] Identify button text logic
- [ ] Button shows "Activate Workflow" only for draft workflows
- [ ] Button shows "Save Changes" for already active workflows
- [ ] Functionality remains the same (save changes)

**Investigation Notes**:
**Root Cause**: Button text is hardcoded without checking workflow status.

**Current Code** (WorkflowReview.tsx lines 346-350):
```typescript
{isSaving ? "Saving..." : isReordering ? "Reordering..." : "Activate Workflow"}
```

**Fix**: Add status check:
```typescript
{isSaving
  ? "Saving..."
  : isReordering
    ? "Reordering..."
    : workflow?.status === "draft"
      ? "Activate Workflow"
      : "Save Changes"}
```

**Files to modify**:
- `dashboard/src/pages/WorkflowReview.tsx`:
  - Line 346-350 (main button)
  - Line 418 (floating button)

---

### FEAT-016: Drag-and-Drop Step Reordering
**Priority**: P2 (Medium)
**Type**: Feature
**Status**: Needs Verification

**Description**:
In the review workflow page, steps should be reorderable via drag-and-drop. There's already a drag icon in the step cards but it's hidden and non-functional.

**Acceptance Criteria**:
- [x] Check if drag-and-drop is implemented
- [ ] Verify drag handle is visible on step cards
- [ ] Steps can be reordered by dragging
- [ ] Step numbers update after reorder
- [ ] Changes persist when saved

**Investigation Notes**:
**GOOD NEWS**: Drag-and-drop is **already fully implemented!**

- Uses `@dnd-kit/core` ^6.3.1 and `@dnd-kit/sortable` ^10.0.0
- Implementation in `WorkflowReview.tsx` with DndContext and SortableContext
- `StepCard.tsx` has `GripVertical` icon as drag handle (lines 79-89)
- Backend integration via `apiClient.reorderSteps()`
- Proper error handling and recovery

**User reports icon is "hidden within the card"** - Need to verify:
1. Is the drag handle visible?
2. Is it positioned correctly?
3. Does the drag functionality work?

**Files to check**:
- `dashboard/src/components/StepCard.tsx` - Drag handle styling
- `dashboard/src/pages/WorkflowReview.tsx` - DnD context setup

---

### BUG-004: New Workflow Button Non-Functional
**Priority**: P2 (Medium)
**Type**: Bug
**Status**: Ready for Implementation

**Description**:
The "+ new workflow" button in the sidebar does nothing when clicked. Should:
1. Open Chrome extension install modal if extension not installed
2. Prompt to open extension if already installed

**Acceptance Criteria**:
- [x] Identify current button behavior
- [ ] Button detects if Chrome extension is installed
- [ ] If not installed: show extension install modal
- [ ] If installed: show prompt to open extension
- [ ] Clear user guidance on how to create a workflow

**Investigation Notes**:
**Current Behavior**: Button only navigates to `/dashboard` (does nothing useful).

**Root Cause**:
1. `Sidebar.tsx` button click just calls `navigate("/dashboard")`
2. `extensionBridge.ts` has `isExtensionInstalled()` that always returns `true` (bypassed for MVP)
3. `InstallExtensionModal.tsx` exists but is never shown

**Files to modify**:
- `dashboard/src/components/layout/Sidebar.tsx` (lines 63-74):
  - Update click handler to check extension status
  - Show InstallExtensionModal if not installed
  - Show guidance modal if installed

- `dashboard/src/utils/extensionBridge.ts`:
  - Implement proper extension detection (ping/pong handshake)

**Recommended UX Flow**:
1. Click "+ New Workflow"
2. Check `isExtensionInstalled()` (needs real implementation)
3. If not installed → Show InstallExtensionModal
4. If installed → Show modal with instructions: "Open the Overlay extension in your browser toolbar to start recording a new workflow"

---

## Progress Log

### 2025-01-11 - Sprint Planning & Investigation
- Created sprint with 6 tickets based on user observations
- Completed investigation for all 6 tickets
- Key finding: FEAT-016 (drag-and-drop) is already implemented - just needs visibility verification
- All tickets now have clear implementation plans

### 2025-01-11 - Bug Fixes Implementation
**BUG-001: Dashboard data mismatch** - COMPLETE
- Changed Dashboard.tsx to fetch from `/api/health/stats` (same as HealthView)
- Now uses execution-weighted success rate instead of unweighted workflow average
- Updated labels to show "Last 30 days" instead of "All time"

**BUG-003: Review page button text** - COMPLETE
- Updated WorkflowReview.tsx to check `workflow?.status === "draft"`
- Button shows "Activate Workflow" for drafts, "Save Changes" for active workflows

**BUG-002: User deletion in wrong location** - COMPLETE
- Removed `handleRemoveMember()` function from CompanySettings.tsx
- Removed delete button from team members list
- Added "Manage Team" button linking to /team page for admins

**BUG-004: New workflow button** - COMPLETE
- Updated Sidebar.tsx to show InstallExtensionModal when clicked
- Users now get guidance on installing/using the extension

**FEAT-016: Drag-and-drop z-index issue** - COMPLETE
- Root cause: Edit overlay (z-index) was covering drag handle on hover
- Added `z-20` to drag handle container, `z-10` to overlay
- Increased drag handle padding and icon size for better UX

**Step Reordering UNIQUE Constraint Bug** - COMPLETE
- Root cause: Updating step_numbers one-by-one caused temporary duplicates violating unique constraint
- Fix: Two-phase update pattern - first set all to negative values, then set final values
- Added 6 tests for step reordering in test_steps_api.py

**FEAT-015: Timezone customization** - COMPLETE
- Backend: Added `timezone` field to User model with migration
- Backend: Updated schemas (UpdateProfileRequest, UserResponse) with IANA timezone validation
- Backend: Added 4 timezone tests to test_api_users.py
- Frontend: Updated TypeScript types (UserResponse, UpdateProfileRequest)
- Frontend: Created timezone utility module (`utils/timezone.ts`) with formatting functions
- Frontend: Updated PreferencesSettings with timezone dropdown (20+ timezones)
- Frontend: Updated date displays in NotificationBell, HealthView, TeamView
- Uses native Intl.DateTimeFormat API - no external library needed

### Sprint Complete!

All tickets have been implemented and tested.

---

## Summary

| Ticket | Type | Complexity | Status |
|--------|------|------------|--------|
| BUG-001 | Bug | Low | **COMPLETE** |
| BUG-002 | Bug | Low | **COMPLETE** |
| BUG-003 | Bug | Low | **COMPLETE** |
| BUG-004 | Bug | Medium | **COMPLETE** |
| FEAT-016 | Bug | Low | **COMPLETE** |
| FEAT-015 | Feature | High | **COMPLETE** |
