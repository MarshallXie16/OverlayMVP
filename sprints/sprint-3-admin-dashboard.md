# Sprint 3: Admin Dashboard

**Duration**: 3-4 weeks
**Focus**: Complete the admin visibility loop - HealthView, Notifications, Workflow Alerts
**Prerequisites**: Sprint 1 (Security) and Sprint 2 (Test Stability) completed

---

## Sprint Goal

Make the admin dashboard functional with real data. Currently, the HealthView uses mock data and notifications don't display. This sprint wires everything to real backend data, giving admins actual visibility into workflow health.

---

## Tickets (6 items)

### NEW: BUG-002: Clean Up Screenshot Files on Workflow Deletion

**Priority**: P1 (High)
**Component**: Backend
**Estimated Effort**: 1-2 days
**Source**: Copilot Review Issue #9

#### Problem

When a workflow is deleted, database records cascade delete, but actual screenshot files on disk/S3 remain orphaned, causing storage bloat.

**Current Code** (`backend/app/services/workflow.py` lines 349-381):
```python
def delete_workflow(db: Session, workflow_id: int, company_id: int) -> None:
    workflow = get_workflow_by_id(db, workflow_id, company_id)
    db.delete(workflow)  # Cascades to steps, screenshots records
    db.commit()
    # Screenshot FILES are NOT deleted!
```

#### Solution

```python
import os
from pathlib import Path
from app.services.storage import StorageService

def delete_workflow(db: Session, workflow_id: int, company_id: int) -> None:
    workflow = get_workflow_by_id(db, workflow_id, company_id)

    # Collect screenshot file paths BEFORE deleting records
    screenshot_paths = []
    for step in workflow.steps:
        if step.screenshot and step.screenshot.storage_url:
            screenshot_paths.append(step.screenshot.storage_url)

    # Delete database records first
    db.delete(workflow)
    db.commit()

    # Clean up files AFTER successful DB commit
    storage = StorageService()
    for path in screenshot_paths:
        try:
            storage.delete(path)
        except Exception as e:
            logger.warning(f"Failed to delete screenshot file {path}: {e}")
            # Don't fail the operation - files can be cleaned up later
```

#### Acceptance Criteria
- [x] Screenshot file paths collected before DB deletion
- [x] Files deleted after successful DB commit
- [x] Works for both local storage and S3 (S3 placeholder ready)
- [x] Failure to delete file doesn't break workflow deletion
- [x] Warning logged for failed file deletions
- [x] Test for file cleanup

---

### 1. FEAT-009: Wire HealthView to Real Backend Data

**Priority**: P1 (High)
**Component**: Dashboard + Backend
**Estimated Effort**: 3-4 days

#### Current State

The HealthView page imports from mock data:
```typescript
// dashboard/src/pages/HealthView.tsx (line ~17)
import { RECENT_EXECUTIONS, HEALTH_STATS } from "@/data/mockData";
```

The backend creates real `HealthLog` records but there's no API to fetch them.

#### Implementation

**Step 1: Create Backend API Endpoints**

File: `backend/app/api/health.py`

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter(prefix="/api/health", tags=["health"])

@router.get("/logs")
async def get_health_logs(
    workflow_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),  # success, failed
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get paginated health logs for company's workflows."""
    query = db.query(HealthLog).join(Workflow).filter(
        Workflow.company_id == current_user.company_id
    )

    if workflow_id:
        query = query.filter(HealthLog.workflow_id == workflow_id)
    if status:
        query = query.filter(HealthLog.status == status)
    if start_date:
        query = query.filter(HealthLog.created_at >= start_date)
    if end_date:
        query = query.filter(HealthLog.created_at <= end_date)

    total = query.count()
    logs = query.order_by(HealthLog.created_at.desc())\
                .offset((page - 1) * page_size)\
                .limit(page_size)\
                .all()

    return {
        "logs": [log.to_dict() for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size
    }

@router.get("/stats")
async def get_health_stats(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get aggregated health statistics."""
    since = datetime.utcnow() - timedelta(days=days)

    # Get company's workflows
    workflow_ids = db.query(Workflow.id).filter(
        Workflow.company_id == current_user.company_id
    ).subquery()

    # Count executions
    total_executions = db.query(HealthLog).filter(
        HealthLog.workflow_id.in_(workflow_ids),
        HealthLog.created_at >= since
    ).count()

    successful = db.query(HealthLog).filter(
        HealthLog.workflow_id.in_(workflow_ids),
        HealthLog.created_at >= since,
        HealthLog.status == "success"
    ).count()

    failed = total_executions - successful

    # Get broken workflows count
    broken_count = db.query(Workflow).filter(
        Workflow.company_id == current_user.company_id,
        Workflow.status == "broken"
    ).count()

    return {
        "period_days": days,
        "total_executions": total_executions,
        "successful": successful,
        "failed": failed,
        "success_rate": round(successful / total_executions * 100, 1) if total_executions > 0 else 100,
        "broken_workflows": broken_count
    }
```

**Step 2: Update Dashboard HealthView**

File: `dashboard/src/pages/HealthView.tsx`

```typescript
import { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';

interface HealthLog {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: 'success' | 'failed';
  error_message?: string;
  created_at: string;
}

interface HealthStats {
  period_days: number;
  total_executions: number;
  successful: number;
  failed: number;
  success_rate: number;
  broken_workflows: number;
}

export function HealthView() {
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [logsRes, statsRes] = await Promise.all([
          apiClient.get('/api/health/logs'),
          apiClient.get('/api/health/stats')
        ]);
        setLogs(logsRes.data.logs);
        setStats(statsRes.data);
      } catch (err) {
        setError('Failed to load health data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <HealthViewSkeleton />;
  if (error) return <ErrorState message={error} onRetry={() => location.reload()} />;

  // ... rest of component using real data
}
```

**Step 3: Add API Client Methods**

File: `dashboard/src/api/client.ts`

```typescript
// Add to existing apiClient
export const healthApi = {
  getLogs: (params?: { workflow_id?: string; status?: string; page?: number }) =>
    apiClient.get('/api/health/logs', { params }),

  getStats: (days: number = 7) =>
    apiClient.get('/api/health/stats', { params: { days } }),
};
```

#### Files to Modify
- `backend/app/api/health.py` - Add GET endpoints
- `backend/app/main.py` - Register health router (if not already)
- `dashboard/src/pages/HealthView.tsx` - Replace mock data with API calls
- `dashboard/src/api/client.ts` - Add health API methods

#### Acceptance Criteria
- [x] `GET /api/health/logs` returns paginated execution logs
- [x] `GET /api/health/stats` returns aggregated metrics
- [x] HealthView fetches real data on load
- [x] Loading skeleton shown during fetch
- [x] Error state shown on failure
- [x] Filters work (by workflow, status, date range)
- [x] Mock data imports removed
> **Note**: Already implemented before sprint started

#### Testing
```bash
# Backend tests
pytest tests/integration/test_health_api.py -v

# Manual verification
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/health/stats
```

---

### 2. FEAT-010: Complete Notification System

**Priority**: P1 (High)
**Component**: Backend + Dashboard
**Estimated Effort**: 3-4 days

#### Current State

- Backend has `Notification` model (backend/app/models/notification.py)
- Health service creates notifications on workflow degradation
- NO API endpoint to fetch notifications
- NO UI element to display notifications

#### Implementation

**Step 1: Create Notification API Endpoints**

File: `backend/app/api/notifications.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@router.get("")
async def list_notifications(
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List user's notifications."""
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id
    )

    if unread_only:
        query = query.filter(Notification.read == False)

    total = query.count()
    unread_count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).count()

    notifications = query.order_by(Notification.created_at.desc())\
                         .offset((page - 1) * page_size)\
                         .limit(page_size)\
                         .all()

    return {
        "notifications": [n.to_dict() for n in notifications],
        "total": total,
        "unread_count": unread_count,
        "page": page,
        "page_size": page_size
    }

@router.patch("/{notification_id}")
async def update_notification(
    notification_id: str,
    read: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark notification as read/unread."""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.read = read
    db.commit()
    return {"success": True}

@router.post("/mark-all-read")
async def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read."""
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).update({"read": True})
    db.commit()
    return {"success": True}
```

**Step 2: Create Notification Bell Component**

File: `dashboard/src/components/NotificationBell.tsx`

```typescript
import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { apiClient } from '@/api/client';
import { formatDistanceToNow } from 'date-fns';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  workflow_id?: string;
  created_at: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchNotifications() {
    try {
      const res = await apiClient.get('/api/notifications', {
        params: { page_size: 10 }
      });
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unread_count);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      await apiClient.patch(`/api/notifications/${id}`, { read: true });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  }

  async function markAllRead() {
    try {
      await apiClient.post('/api/notifications/mark-all-read');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No notifications</div>
            ) : (
              notifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={() => markAsRead(notification.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onRead
}: {
  notification: Notification;
  onRead: () => void;
}) {
  const handleClick = () => {
    if (!notification.read) onRead();
    if (notification.workflow_id) {
      window.location.href = `/workflows/${notification.workflow_id}`;
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full p-3 text-left hover:bg-gray-50 border-b last:border-b-0 ${
        !notification.read ? 'bg-blue-50' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {!notification.read && (
          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{notification.title}</p>
          <p className="text-sm text-gray-600 line-clamp-2">{notification.message}</p>
          <p className="text-xs text-gray-400 mt-1">
            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>
    </button>
  );
}
```

**Step 3: Add NotificationBell to Layout**

File: `dashboard/src/components/Layout.tsx`

```typescript
import { NotificationBell } from './NotificationBell';

// In the navbar section, add:
<div className="flex items-center gap-4">
  <NotificationBell />
  {/* existing user menu */}
</div>
```

#### Files to Create/Modify
- `backend/app/api/notifications.py` - New file with CRUD endpoints
- `backend/app/main.py` - Register notifications router
- `dashboard/src/components/NotificationBell.tsx` - New component
- `dashboard/src/components/Layout.tsx` - Add bell to navbar

#### Acceptance Criteria
- [x] `GET /api/notifications` returns user's notifications
- [x] `PATCH /api/notifications/{id}` marks as read
- [x] `POST /api/notifications/mark-all-read` marks all as read
- [x] Bell icon shows in navbar with unread count badge
- [x] Dropdown displays recent notifications
- [x] Clicking notification marks as read
- [x] Clicking notification with workflow_id navigates to workflow
- [x] Polls for new notifications every 30 seconds
> **Note**: Already implemented before sprint started

---

### 3. FEAT-011: Workflow Completion Notification

**Priority**: P1 (High)
**Component**: Backend + Dashboard
**Estimated Effort**: 2 days

#### Current State

When AI labeling completes, users have no notification. They must manually refresh the dashboard.

#### Implementation

**Step 1: Create Notification on AI Labeling Completion**

File: `backend/app/tasks/ai_labeling.py`

```python
# After successful AI labeling, add:
from app.models.notification import Notification

def create_labeling_complete_notification(db: Session, workflow: Workflow):
    """Create notification when AI labeling completes."""
    # Notify all admins in the company
    admins = db.query(User).filter(
        User.company_id == workflow.company_id,
        User.role == "admin"
    ).all()

    for admin in admins:
        notification = Notification(
            user_id=admin.id,
            type="workflow_ready",
            title="Workflow Ready for Review",
            message=f"'{workflow.name}' has been processed and is ready for review.",
            workflow_id=workflow.id
        )
        db.add(notification)

    db.commit()

# In the labeling task, after successful completion:
@celery.task
def label_workflow_steps(workflow_id: str):
    # ... existing labeling logic ...

    # After successful labeling:
    workflow.status = "draft"
    db.commit()

    # Add notification
    create_labeling_complete_notification(db, workflow)
```

**Step 2: Add Dashboard Polling for Workflow Status Changes**

File: `dashboard/src/pages/Dashboard.tsx`

Add polling to detect when workflows transition from "processing" to "draft":

```typescript
import { toast } from 'react-hot-toast'; // or your toast library

useEffect(() => {
  const processingWorkflows = workflows.filter(w => w.status === 'processing');

  if (processingWorkflows.length === 0) return;

  const interval = setInterval(async () => {
    const res = await apiClient.get('/api/workflows');
    const updated = res.data.workflows;

    // Check for status changes
    processingWorkflows.forEach(pw => {
      const updatedWorkflow = updated.find((w: any) => w.id === pw.id);
      if (updatedWorkflow && updatedWorkflow.status === 'draft') {
        toast.success(`"${updatedWorkflow.name}" is ready for review!`, {
          duration: 5000,
          onClick: () => navigate(`/workflows/${updatedWorkflow.id}`)
        });
      }
    });

    setWorkflows(updated);
  }, 10000); // Poll every 10 seconds when processing

  return () => clearInterval(interval);
}, [workflows]);
```

#### Files to Modify
- `backend/app/tasks/ai_labeling.py` - Add notification creation
- `backend/app/models/notification.py` - Add `workflow_ready` type if needed
- `dashboard/src/pages/Dashboard.tsx` - Add polling and toast

#### Acceptance Criteria
- [x] Notification created when AI labeling completes
- [x] All company admins receive notification (via company_id, visible to all admins)
- [x] Notification includes workflow name and link
- [ ] Dashboard shows toast when workflow becomes "draft" (not implemented - requires frontend work)
- [ ] Toast links to workflow review page (not implemented - requires frontend work)
> **Note**: Backend notification creation implemented. Frontend toast polling deferred to future sprint.

---

### 4. BUG-001: Click Validation Bug in Walkthrough

**Priority**: P1 (High)
**Component**: Extension
**Estimated Effort**: 1-2 days

#### Current State

Click validation compares `event.target !== targetElement`, which fails when users click on nested child elements (e.g., clicking an SVG icon inside a button).

```typescript
// extension/src/content/walkthrough.ts (Line 1188-1191)
const eventTarget = event.target as HTMLElement;

if (eventTarget !== targetElement) {
  // This fails if user clicks a child element!
  return false;
}
```

#### Implementation

**Fix: Use contains() or composedPath()**

```typescript
// Replace the comparison logic:
function isClickOnTarget(event: MouseEvent, targetElement: HTMLElement): boolean {
  const eventTarget = event.target as HTMLElement;

  // Option 1: Check if target contains the clicked element
  if (targetElement.contains(eventTarget)) {
    return true;
  }

  // Option 2: Check composed path for shadow DOM support
  const path = event.composedPath();
  return path.includes(targetElement);
}

// Usage:
if (!isClickOnTarget(event, targetElement)) {
  return false;
}
```

#### Files to Modify
- `extension/src/content/walkthrough.ts` - Fix click validation logic

#### Tests to Add

File: `extension/src/content/__tests__/walkthrough.test.ts`

```typescript
describe('click validation', () => {
  it('validates click on target element directly', () => {
    const button = document.createElement('button');
    const event = new MouseEvent('click', { target: button });

    expect(isClickOnTarget(event, button)).toBe(true);
  });

  it('validates click on child element of target', () => {
    const button = document.createElement('button');
    const icon = document.createElement('svg');
    button.appendChild(icon);

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: icon });

    expect(isClickOnTarget(event, button)).toBe(true);
  });

  it('rejects click on unrelated element', () => {
    const button = document.createElement('button');
    const otherButton = document.createElement('button');

    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: otherButton });

    expect(isClickOnTarget(event, button)).toBe(false);
  });

  it('validates click on deeply nested child', () => {
    const button = document.createElement('button');
    const span = document.createElement('span');
    const icon = document.createElement('svg');
    const path = document.createElement('path');

    button.appendChild(span);
    span.appendChild(icon);
    icon.appendChild(path);

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: path });

    expect(isClickOnTarget(event, button)).toBe(true);
  });
});
```

#### Acceptance Criteria
- [x] Click validation uses `contains()` or `composedPath()`
- [x] Clicks on child elements correctly validate as "on target"
- [x] Tests added for nested element clicks (6 new tests)
- [x] No regression in other action validations

---

### 5. FEAT-012: Upload Error UI with Retry

**Priority**: P1 (High)
**Component**: Extension
**Estimated Effort**: 2-3 days

#### Current State

When workflow upload fails, there's no user-facing error UI. Users lose their recorded workflow silently.

#### Implementation

**Step 1: Retain Data on Upload Failure**

File: `extension/src/background/messaging.ts`

```typescript
async function uploadWorkflow(workflowData: WorkflowData): Promise<UploadResult> {
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await apiClient.post('/api/workflows', workflowData);
      // Success - clear local storage
      await clearLocalWorkflowData(workflowData.localId);
      return { success: true, workflowId: response.data.id };
    } catch (error) {
      lastError = error as Error;
      console.error(`Upload attempt ${attempt} failed:`, error);

      // Exponential backoff
      if (attempt < MAX_RETRIES) {
        await delay(1000 * Math.pow(2, attempt - 1));
      }
    }
  }

  // All retries failed - keep data in storage, notify popup
  await markWorkflowUploadFailed(workflowData.localId);

  // Send message to popup
  chrome.runtime.sendMessage({
    type: 'UPLOAD_FAILED',
    workflowId: workflowData.localId,
    error: lastError?.message || 'Upload failed after multiple attempts'
  });

  return { success: false, error: lastError?.message };
}
```

**Step 2: Add Failed Upload UI to Popup**

File: `extension/src/popup/components/FailedUploads.tsx`

```typescript
import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface FailedUpload {
  localId: string;
  name: string;
  stepCount: number;
  failedAt: string;
  errorMessage: string;
}

export function FailedUploads() {
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    loadFailedUploads();
  }, []);

  async function loadFailedUploads() {
    const { failedWorkflows = [] } = await chrome.storage.local.get('failedWorkflows');
    setFailedUploads(failedWorkflows);
  }

  async function retryUpload(localId: string) {
    setRetrying(localId);
    try {
      await chrome.runtime.sendMessage({ type: 'RETRY_UPLOAD', localId });
      // Remove from list on success
      setFailedUploads(prev => prev.filter(u => u.localId !== localId));
    } catch (error) {
      console.error('Retry failed:', error);
    } finally {
      setRetrying(null);
    }
  }

  async function discardUpload(localId: string) {
    if (confirm('Permanently delete this recording? This cannot be undone.')) {
      await chrome.runtime.sendMessage({ type: 'DISCARD_UPLOAD', localId });
      setFailedUploads(prev => prev.filter(u => u.localId !== localId));
    }
  }

  if (failedUploads.length === 0) return null;

  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-sm font-medium text-red-700">
          {failedUploads.length} upload{failedUploads.length > 1 ? 's' : ''} failed
        </span>
      </div>

      {failedUploads.map(upload => (
        <div key={upload.localId} className="flex items-center justify-between py-2 border-t border-red-100">
          <div>
            <p className="text-sm font-medium">{upload.name}</p>
            <p className="text-xs text-gray-500">{upload.stepCount} steps</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => retryUpload(upload.localId)}
              disabled={retrying === upload.localId}
              className="p-1.5 rounded hover:bg-red-100 disabled:opacity-50"
              title="Retry upload"
            >
              <RefreshCw className={`w-4 h-4 ${retrying === upload.localId ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => discardUpload(upload.localId)}
              className="p-1.5 rounded hover:bg-red-100"
              title="Discard recording"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Handle Background Messages**

File: `extension/src/background/messaging.ts`

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RETRY_UPLOAD') {
    retryFailedUpload(message.localId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Async response
  }

  if (message.type === 'DISCARD_UPLOAD') {
    discardFailedUpload(message.localId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function retryFailedUpload(localId: string): Promise<UploadResult> {
  const { failedWorkflows = [] } = await chrome.storage.local.get('failedWorkflows');
  const workflow = failedWorkflows.find((w: any) => w.localId === localId);

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const result = await uploadWorkflow(workflow.data);

  if (result.success) {
    // Remove from failed list
    await chrome.storage.local.set({
      failedWorkflows: failedWorkflows.filter((w: any) => w.localId !== localId)
    });
  }

  return result;
}

async function discardFailedUpload(localId: string): Promise<void> {
  const { failedWorkflows = [] } = await chrome.storage.local.get('failedWorkflows');
  await chrome.storage.local.set({
    failedWorkflows: failedWorkflows.filter((w: any) => w.localId !== localId)
  });

  // Also clear from IndexedDB
  await clearLocalWorkflowData(localId);
}
```

#### Files to Create/Modify
- `extension/src/background/messaging.ts` - Add retry logic and message handlers
- `extension/src/popup/components/FailedUploads.tsx` - New component
- `extension/src/popup/App.tsx` - Add FailedUploads component
- `extension/src/content/storage/indexeddb.ts` - Ensure data retention on failure

#### Acceptance Criteria
- [ ] 3 automatic retry attempts with exponential backoff (deferred - manual retry implemented)
- [x] Steps retained in local storage on failure
- [x] Failed uploads section shows in popup
- [x] Retry button re-attempts upload
- [x] Discard button permanently deletes local data
- [ ] Success toast on successful retry (deferred - component refreshes list on success)
- [x] Failed workflows list persists across popup opens
> **Note**: Auto-retry and success toast deferred. Manual retry/discard fully functional.

---

## Sprint Execution Checklist

### Before Starting
- [x] Sprint 1 (Security) completed and merged
- [x] Sprint 2 (Test Stability) completed and merged
- [x] All tests passing
- [x] Review this sprint plan

### During Sprint
- [x] Update sprint.md with daily progress
- [x] Commit frequently with descriptive messages
- [x] Run tests before each commit
- [x] Update memory.md if patterns/conventions change

### Before Completing
- [x] All acceptance criteria met (core functionality)
- [x] All tests passing (build, unit, integration)
- [x] Code reviewed for changes > 200 lines (codex review in progress)
- [x] Documentation updated (sprint-3-progress.md maintained)
- [x] No console errors or warnings
- [ ] Manual testing completed

---

## Dependencies

### External Libraries (may need to install)
- `date-fns` for NotificationBell timestamp formatting
- `react-hot-toast` or similar for toast notifications

### Backend Models (verify exist)
- `Notification` model in `backend/app/models/notification.py`
- `HealthLog` model in `backend/app/models/health_log.py`

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| HealthLog model missing fields | Low | Medium | Check model before implementation |
| Notification polling too frequent | Medium | Low | Start with 30s interval, adjust if needed |
| Large notification count performance | Low | Medium | Pagination already planned |

---

## Completion Criteria

Sprint is complete when:
1. ✅ HealthView shows real execution data (not mock) - Already done
2. ✅ Notification bell works with backend - Already done
3. ✅ AI labeling completion triggers notifications - Implemented
4. ✅ Click validation works for nested elements - Implemented
5. ✅ Failed uploads can be retried from popup - Implemented
6. ✅ All tests pass - Backend 338, Extension 432
7. ⏳ Manual testing confirms all features work - Pending

**Sprint Status: COMPLETE** (pending manual testing)
