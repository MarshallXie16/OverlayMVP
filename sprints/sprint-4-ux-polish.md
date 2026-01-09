# Sprint 4: UX Polish

**Duration**: 3-4 weeks
**Focus**: Replace alerts with toasts, add confirmations, improve accessibility
**Prerequisites**: Sprint 3 (Admin Dashboard) completed

---

## Sprint Goal

Polish the user experience by replacing all browser `alert()` calls with proper toast notifications, adding confirmation modals for destructive actions, and improving accessibility with proper ARIA labels.

---

## Tickets (7 items)

### 1. UX-001: Replace alert() with Toast Notifications

**Priority**: P2 (Medium)
**Component**: Dashboard
**Estimated Effort**: 2-3 days

#### Current State

Dashboard uses browser `alert()` for error messages throughout the codebase. This blocks user interaction, looks unprofessional, and provides poor UX.

#### Affected Files (15+ locations)

```
dashboard/src/pages/WorkflowReview.tsx (lines 160, 195, 209, 218, 223)
dashboard/src/pages/SettingsView.tsx (lines 85, 122, 129, 266, 520, 527, 553, 644)
dashboard/src/pages/HealthView.tsx (lines 63, 166)
dashboard/src/pages/WorkflowDetail.tsx (line 81)
dashboard/src/pages/LibraryView.tsx (line 75)
```

#### Implementation

**Step 1: Install Toast Library**

```bash
cd dashboard
npm install react-hot-toast
```

**Step 2: Set Up Toast Provider**

File: `dashboard/src/App.tsx`

```typescript
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 5000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            style: {
              background: '#10B981',
            },
            iconTheme: {
              primary: '#fff',
              secondary: '#10B981',
            },
          },
          error: {
            style: {
              background: '#EF4444',
            },
            duration: 6000,
          },
        }}
      />
      {/* rest of app */}
    </>
  );
}
```

**Step 3: Create Toast Utility**

File: `dashboard/src/utils/toast.ts`

```typescript
import toast from 'react-hot-toast';

export const showToast = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) => toast(message, {
    icon: '⚠️',
    style: { background: '#F59E0B', color: '#fff' },
  }),
  info: (message: string) => toast(message, {
    icon: 'ℹ️',
  }),
  loading: (message: string) => toast.loading(message),
  dismiss: (toastId?: string) => toast.dismiss(toastId),
  promise: <T,>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ) => toast.promise(promise, messages),
};
```

**Step 4: Replace All alert() Calls**

Example replacements:

```typescript
// Before (WorkflowReview.tsx:160)
alert('Failed to save changes');

// After
import { showToast } from '@/utils/toast';
showToast.error('Failed to save changes');

// Before (SettingsView.tsx:85)
alert('Link copied to clipboard!');

// After
showToast.success('Link copied to clipboard!');

// Before (WorkflowDetail.tsx:81)
alert(`Error loading workflow: ${error.message}`);

// After
showToast.error(`Error loading workflow: ${error.message}`);
```

#### Acceptance Criteria
- [x] react-hot-toast installed and configured
- [x] Toast utility created with success/error/warning/info methods
- [x] All `alert()` calls replaced (verify with `grep -r "alert(" dashboard/src`)
- [x] Error toasts are red with 6s duration
- [x] Success toasts are green with 5s duration
- [x] Toasts auto-dismiss appropriately
- [x] No blocking UI behavior
- [x] Build passes

#### Testing
```bash
# Verify no alert() calls remain
grep -r "alert(" dashboard/src --include="*.tsx" --include="*.ts" | grep -v "node_modules"

# Should return empty or only comments
```

---

### 2. FEAT-001: Step Delete Confirmation Modal

**Priority**: P2 (Medium)
**Component**: Dashboard
**Estimated Effort**: 1-2 days

#### Current State

Step deletion has no confirmation. Accidental deletes are permanent and there's no undo.

#### Implementation

**Step 1: Create Confirmation Modal Component**

File: `dashboard/src/components/ConfirmModal.tsx`

```typescript
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${
            confirmVariant === 'danger' ? 'bg-red-100' : 'bg-blue-100'
          }`}>
            <AlertTriangle className={`w-6 h-6 ${
              confirmVariant === 'danger' ? 'text-red-600' : 'text-blue-600'
            }`} />
          </div>

          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
              confirmVariant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Add Delete Confirmation to StepCard**

File: `dashboard/src/components/StepCard.tsx`

```typescript
import { useState } from 'react';
import { ConfirmModal } from './ConfirmModal';

export function StepCard({ step, onDelete, totalSteps }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(step.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      showToast.error('Failed to delete step');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Existing step card content */}
      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="..."
        aria-label="Delete step"
      >
        Delete
      </button>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Step?"
        message={`This will permanently delete step ${step.order_index + 1}. ${
          totalSteps > 1
            ? 'Remaining steps will be renumbered.'
            : 'This is the only step in the workflow.'
        }`}
        confirmLabel="Delete Step"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        loading={deleting}
      />
    </>
  );
}
```

#### Acceptance Criteria
- [x] ConfirmModal component created
- [x] Delete button shows confirmation modal
- [x] Message includes step number
- [x] Message mentions renumbering for multi-step workflows
- [x] Can cancel delete
- [x] Loading state shown during delete
- [x] Success/error toast after delete

---

### 3. FEAT-002: Prevent Deleting Last Step

**Priority**: P2 (Medium)
**Component**: Backend + Dashboard
**Estimated Effort**: 1 day

#### Current State

No guard preventing deletion of last remaining step in workflow. Deleting the last step would leave an invalid workflow.

#### Implementation

**Step 1: Backend Validation**

File: `backend/app/api/steps.py`

```python
@router.delete("/{step_id}")
async def delete_step(
    step_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    step = get_step_with_auth(step_id, current_user, db)

    # Count remaining steps
    step_count = db.query(Step).filter(
        Step.workflow_id == step.workflow_id,
        Step.deleted_at.is_(None)
    ).count()

    if step_count <= 1:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "CANNOT_DELETE_LAST_STEP",
                "message": "Cannot delete the last step in a workflow. Delete the workflow instead."
            }
        )

    # Proceed with deletion...
```

**Step 2: Frontend Disable Button**

File: `dashboard/src/components/StepCard.tsx`

```typescript
interface StepCardProps {
  step: Step;
  totalSteps: number;
  onDelete: (stepId: string) => Promise<void>;
  // ...
}

export function StepCard({ step, totalSteps, onDelete }: StepCardProps) {
  const isLastStep = totalSteps === 1;

  return (
    <div>
      {/* ... */}
      <button
        onClick={() => setShowDeleteConfirm(true)}
        disabled={isLastStep}
        className={`... ${isLastStep ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={isLastStep ? 'Cannot delete the last step' : 'Delete step'}
        aria-label={isLastStep ? 'Cannot delete the last step' : 'Delete step'}
      >
        Delete
      </button>
    </div>
  );
}
```

#### Acceptance Criteria
- [x] Backend returns 400 if deleting last step
- [x] Error message explains why deletion is blocked
- [x] UI disables delete button when only 1 step
- [x] Tooltip explains why button is disabled
- [x] Test for backend validation

---

### 4. A11Y-001: Add Aria Labels to Icon Buttons

**Priority**: P2 (Medium)
**Component**: Dashboard + Extension
**Estimated Effort**: 1-2 days

#### Current State

Many icon-only buttons lack `aria-label` attributes, making them inaccessible to screen reader users.

#### Affected Areas

```
dashboard/src/components/StepCard.tsx - edit, delete buttons
dashboard/src/components/EditStepModal.tsx - close button (line 130)
dashboard/src/pages/WorkflowDetail.tsx - action buttons
dashboard/src/pages/HealthView.tsx - refresh button
extension/src/popup/components/* - various icon buttons
```

#### Implementation

**Audit and Fix All Icon Buttons**

Example fixes:

```typescript
// Before
<button onClick={onEdit}>
  <Edit className="w-4 h-4" />
</button>

// After
<button onClick={onEdit} aria-label="Edit step">
  <Edit className="w-4 h-4" />
</button>

// Before
<button onClick={onClose}>
  <X className="w-5 h-5" />
</button>

// After
<button onClick={onClose} aria-label="Close modal">
  <X className="w-5 h-5" />
</button>

// Before (refresh button)
<button onClick={refresh}>
  <RefreshCw className="w-4 h-4" />
</button>

// After
<button onClick={refresh} aria-label="Refresh data">
  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
</button>
```

#### Accessibility Audit Script

```bash
# Find icon-only buttons missing aria-label
# Run this in dashboard/src:
grep -rn "<button" --include="*.tsx" | grep -v "aria-label" | grep -E "Icon|<svg|lucide" | head -20
```

#### Acceptance Criteria
- [x] All icon-only buttons have aria-label
- [x] Labels are descriptive (e.g., "Delete step", not "X")
- [x] Labels are unique when multiple similar buttons exist
- [ ] Can navigate entire UI with screen reader (manual testing required)
- [x] Build passes

---

### 5. REFACTOR-003: Extract Duplicate Frontend Utilities

**Priority**: P2 (Medium)
**Component**: Dashboard
**Estimated Effort**: 1-2 days

#### Current State

Multiple functions are duplicated across dashboard components.

#### Duplicate Functions to Extract

**1. getActionTypeColor() and formatActionType()**

Duplicated in:
- `dashboard/src/pages/WorkflowDetail.tsx` (lines 117-134)
- `dashboard/src/components/StepCard.tsx` (lines 35-52)

**2. Screenshot URL construction**

Duplicated in:
- `dashboard/src/pages/WorkflowDetail.tsx` (lines 111-115)
- `dashboard/src/components/StepCard.tsx` (lines 54-56)
- `dashboard/src/components/EditStepModal.tsx` (lines 97-99)

#### Implementation

**Step 1: Create Utility File**

File: `dashboard/src/utils/stepUtils.ts`

```typescript
export type ActionType = 'click' | 'input' | 'navigation' | 'scroll' | 'hover' | 'select';

/**
 * Returns the appropriate color classes for an action type badge.
 */
export function getActionTypeColor(actionType: ActionType): string {
  const colors: Record<ActionType, string> = {
    click: 'bg-blue-100 text-blue-800',
    input: 'bg-green-100 text-green-800',
    navigation: 'bg-purple-100 text-purple-800',
    scroll: 'bg-yellow-100 text-yellow-800',
    hover: 'bg-pink-100 text-pink-800',
    select: 'bg-orange-100 text-orange-800',
  };
  return colors[actionType] || 'bg-gray-100 text-gray-800';
}

/**
 * Formats action type for display (capitalizes first letter).
 */
export function formatActionType(actionType: string): string {
  return actionType.charAt(0).toUpperCase() + actionType.slice(1);
}

/**
 * Constructs the full screenshot URL from a path.
 */
export function getScreenshotUrl(screenshotPath: string | null | undefined): string | null {
  if (!screenshotPath) return null;

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

  // If it's already a full URL, return as-is
  if (screenshotPath.startsWith('http')) {
    return screenshotPath;
  }

  // If it's an S3 path, construct S3 URL
  if (screenshotPath.startsWith('s3://')) {
    const bucket = import.meta.env.VITE_S3_BUCKET || 'overlay-screenshots';
    const key = screenshotPath.replace('s3://', '');
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }

  // Otherwise, assume it's a local path served by backend
  return `${API_BASE}/screenshots/${screenshotPath}`;
}
```

**Step 2: Update All Imports**

```typescript
// In WorkflowDetail.tsx, StepCard.tsx, EditStepModal.tsx:
import { getActionTypeColor, formatActionType, getScreenshotUrl } from '@/utils/stepUtils';

// Remove local duplicate definitions
```

#### Acceptance Criteria
- [x] `stepUtils.ts` created with extracted functions
- [x] All duplicate definitions removed
- [x] All components import from shared utility
- [x] No functional changes (behavior identical)
- [x] Build passes
- [x] Tests pass

---

### 6. REFACTOR-004: Centralize API Base URL

**Priority**: P2 (Medium)
**Component**: Dashboard
**Estimated Effort**: 0.5 days

#### Current State

API base URL is hardcoded in multiple files:
- `dashboard/src/pages/WorkflowDetail.tsx` (line 36)
- `dashboard/src/components/StepCard.tsx` (line 18)
- `dashboard/src/components/EditStepModal.tsx` (line 15)

#### Implementation

**Step 1: Create Config File**

File: `dashboard/src/config.ts`

```typescript
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  s3Bucket: import.meta.env.VITE_S3_BUCKET || 'overlay-screenshots',
  appName: 'Overlay',
} as const;

// Export individual values for convenience
export const API_URL = config.apiUrl;
```

**Step 2: Update Environment Types**

File: `dashboard/src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_S3_BUCKET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

**Step 3: Update All Files**

```typescript
// Before
const API_BASE_URL = 'http://localhost:8000';

// After
import { API_URL } from '@/config';
```

**Step 4: Update .env.example**

File: `dashboard/.env.example`

```env
# API Configuration
VITE_API_URL=http://localhost:8000

# S3 Configuration (optional)
VITE_S3_BUCKET=overlay-screenshots
```

#### Acceptance Criteria
- [x] Single source of truth for API URL in config.ts
- [x] All files import from central location
- [x] Works with environment variables
- [x] .env.example updated (created dashboard/.env.example)
- [x] Build passes in dev and production modes

---

### 7. FEAT-003: Notification UI (Bell Icon) - Verification

**Priority**: P2 (Medium)
**Component**: Dashboard
**Estimated Effort**: 0.5 days

#### Purpose

This is a verification task to ensure FEAT-010 (from Sprint 3) is working correctly. If Sprint 3 was completed, this should just be verification. If not, implement here.

#### Verification Checklist

- [x] Bell icon visible in navbar
- [x] Unread count badge shows correctly
- [x] Clicking bell opens dropdown
- [x] Notifications load from API
- [x] Clicking notification marks as read
- [x] Clicking notification with workflow_id navigates correctly
- [x] "Mark all read" works
- [x] Polling updates badge every 60 seconds (implementation uses 60s, not 30s)
- [x] Empty state shows when no notifications
- [x] Dropdown closes when clicking outside

#### If Not Implemented

Follow the implementation from Sprint 3 FEAT-010.

---

## Sprint Execution Checklist

### Before Starting
- [x] Sprint 3 (Admin Dashboard) completed
- [x] All tests passing
- [x] Review this sprint plan
- [x] Install react-hot-toast: `cd dashboard && npm install react-hot-toast`

### During Sprint
- [x] Update sprint.md with daily progress
- [x] Commit after each ticket
- [x] Run tests before each commit

### Before Completing
- [x] All acceptance criteria met (except screen reader test)
- [x] All tests passing
- [x] No `alert()` calls remain in codebase
- [ ] Accessibility audit passed (screen reader test - manual testing required)
- [ ] Manual testing completed

---

## Verification Commands

```bash
# Check for remaining alert() calls
grep -r "alert(" dashboard/src --include="*.tsx" --include="*.ts" | grep -v "node_modules" | grep -v "//.*alert"

# Check for icon buttons missing aria-label (approximate)
grep -rn "<button" dashboard/src --include="*.tsx" | grep -v "aria-label" | wc -l

# Run tests
cd dashboard && npm test

# Build check
cd dashboard && npm run build
```

---

## Completion Criteria

Sprint is complete when:
1. ✅ All `alert()` replaced with toast notifications
2. ✅ Step delete has confirmation modal
3. ✅ Cannot delete last step (backend + UI)
4. ✅ All icon buttons have aria-labels
5. ✅ Duplicate utilities extracted to shared files
6. ✅ API URL centralized
7. ✅ Notification UI verified working
8. ✅ All tests pass
9. ⏳ Manual testing confirms all features (pending)

**Sprint Status**: 95% Complete - Awaiting manual testing and .env.example update
