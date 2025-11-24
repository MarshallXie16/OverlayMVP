# Tasks & Sprint Plan

Current sprint tasks, backlog, and technical debt tracking.

---

## Sprint 2: AI-Powered Review & Editing

**Sprint Goal**: Enable AI labeling of workflow steps and build admin review interface for editing/approving workflows.

**Sprint Duration**: 2 weeks
**Target Completion**: 2025-12-17
**Committed Story Points**: 43 SP (37 P0 + 6 P1)

**Status**: Sprint 1 Complete ✅ - 53 SP delivered
- Backend API foundation ✅
- Chrome extension recording ✅
- Dashboard authentication ✅

---

## EPIC-003: AI-Powered Review & Editing
**Goal**: Enable AI to automatically label workflow steps and provide admin UI for review/editing
**Success Metrics**: AI labeling >75% accuracy, admin can review and save workflows
**Target Completion**: Sprint 2

### AI-001: Set Up Celery Task Queue
**Type**: Backend Infrastructure
**Priority**: P0 (Critical - blocks all AI features)
**Epic**: EPIC-003
**Estimate**: 5 SP
**Status**: 📋 Todo

**Description**:
Configure Celery + Redis for background job processing. Create worker setup, task registration, and error handling infrastructure. This is foundational for all AI labeling features.

**Acceptance Criteria**:
- [ ] Celery worker starts and connects to Redis
- [ ] Can queue and execute simple test tasks
- [ ] Task results stored and retrievable
- [ ] Failed tasks retry with exponential backoff (max 3 attempts)
- [ ] Worker logs show task execution
- [ ] Documentation in `docs/celery-setup.md`

**Technical Context**:
- **Dependencies**: None (foundational task)
- **Affected Components**:
  - `backend/app/tasks/` - Celery tasks
  - `backend/app/celery_app.py` - Celery configuration
  - `backend/requirements.txt` - Add celery, redis dependencies
- **Key Files**:
  - `app/celery_app.py` - Celery app initialization
  - `app/tasks/__init__.py` - Task registration
  - `app/tasks/base.py` - Base task classes
  - `app/main.py` - Integrate Celery with FastAPI
- **Considerations**:
  - Use Redis as both broker and result backend
  - Configure task time limits (5 min per AI labeling task)
  - Set concurrency=5 for AI rate limiting
  - Use `task_always_eager=True` for testing

**Implementation Tasks**:
1. Install and configure Redis (local dev + production)
2. Set up Celery app configuration with FastAPI
3. Create base task classes with retry logic
4. Configure task routing and worker concurrency (max 5 parallel for AI)
5. Add Celery monitoring/logging
6. Create documentation for running workers

**Definition of Done**:
- Celery worker runs without errors
- Test task executes successfully
- Retry logic tested with failing task
- Documentation complete
- Integration tests passing

---

### AI-002: Claude Vision API Integration
**Type**: Backend AI Service
**Priority**: P0 (Critical)
**Epic**: EPIC-003
**Estimate**: 5 SP
**Status**: 📋 Todo

**Description**:
Integrate Anthropic Claude 3.5 Sonnet for vision-based step labeling. Build prompt templates, response parsing, and cost tracking.

**Acceptance Criteria**:
- [ ] Can send screenshot + metadata to Claude API
- [ ] Receives JSON response with label, instruction, confidence
- [ ] Handles rate limits gracefully (retry with backoff)
- [ ] Falls back to template labels if AI fails
- [ ] Logs API costs (input/output tokens)
- [ ] Unit tests with mocked API responses
- [ ] Integration tests with real API (limited, use test data)

**Technical Context**:
- **Dependencies**: AI-001 (Celery must be set up)
- **Affected Components**:
  - `backend/app/services/` - AI service layer
  - `backend/requirements.txt` - Add anthropic SDK
- **Key Files**:
  - `app/services/ai.py` - AI labeling service
  - `app/services/prompts.py` - Prompt templates
  - `app/utils/cost_tracker.py` - Track AI API costs
- **Considerations**:
  - Use `anthropic.messages.create()` with vision model
  - Max tokens: 1024 (keep responses concise)
  - Temperature: 0.3 (deterministic but not rigid)
  - Cost tracking: ~$0.03 per step (3.5 Sonnet pricing)
  - Fallback templates for common fields (email, password, etc.)

**Prompt Design**:
```
You are analyzing a recorded workflow step. Given:
- Screenshot of the page
- Element metadata: {tag, role, text, position}
- Action type: {click, input, select}
- Context: {page_url, page_title}

Generate:
1. field_label: Short name for the field (e.g., "Invoice Number")
2. instruction: User-friendly instruction (e.g., "Enter the invoice number")
3. confidence: 0.0-1.0 score

Return as JSON.
```

**Implementation Tasks**:
1. Set up Anthropic Python SDK
2. Create AI service layer (`app/services/ai.py`)
3. Design prompt template for step labeling
4. Implement response parsing (extract field_label, instruction, confidence)
5. Add error handling for API failures (rate limits, timeouts)
6. Track AI costs per request (log tokens used)
7. Create fallback template-based labeling

**Definition of Done**:
- AI service tested with real API
- Falls back gracefully on failures
- Cost tracking implemented
- Unit and integration tests passing
- Documentation in `docs/ai-service.md`

---

### AI-003: Background Job for AI Labeling
**Type**: Backend Task
**Priority**: P0 (Critical)
**Epic**: EPIC-003
**Estimate**: 5 SP
**Status**: 📋 Todo

**Description**:
Create Celery task that processes workflow steps asynchronously. Fetch screenshots from S3, call AI service, update step records with labels.

**Acceptance Criteria**:
- [ ] Task triggered automatically when workflow created
- [ ] All steps processed sequentially or in batches
- [ ] AI labels saved to database (field_label, instruction, ai_confidence)
- [ ] Workflow status updated to "draft" when complete
- [ ] Failed steps marked with error (can retry manually)
- [ ] Admin notified when ready for review
- [ ] Logs show processing progress

**Technical Context**:
- **Dependencies**: AI-001 (Celery), AI-002 (AI service)
- **Affected Components**:
  - `backend/app/tasks/` - Celery tasks
  - `backend/app/api/workflows.py` - Trigger task on workflow creation
- **Key Files**:
  - `app/tasks/labeling.py` - AI labeling task
  - `app/tasks/utils.py` - Task utilities
- **Considerations**:
  - Process steps sequentially (avoid overwhelming AI API)
  - Batch processing future optimization (5 at a time)
  - Store AI model version for tracking
  - Handle S3 presigned URL expiration

**Task Flow**:
```python
@celery_app.task(bind=True, max_retries=3)
def label_workflow_steps(self, workflow_id: int):
    workflow = get_workflow(workflow_id)
    steps = get_steps(workflow_id)
    
    for step in steps:
        screenshot = get_screenshot(step.screenshot_id)
        try:
            labels = ai_service.generate_labels(screenshot, step.element_meta)
            update_step_labels(step.id, labels)
        except AIServiceError:
            mark_step_low_confidence(step.id)
    
    update_workflow_status(workflow_id, "draft")
    notify_admin(workflow_id, "ready_for_review")
```

**Implementation Tasks**:
1. Create `label_workflow_steps` Celery task
2. Fetch workflow steps from database
3. For each step: fetch screenshot, call AI service, update database
4. Update workflow status: "processing" → "draft"
5. Handle partial failures
6. Send notification when complete
7. Add task progress tracking (optional)

**Definition of Done**:
- Task executes successfully
- All steps labeled with AI
- Workflow status updates correctly
- Error handling works
- Integration tests passing
- Documentation updated

---

### FE-008: Workflow Review Page UI
**Type**: Frontend Feature
**Priority**: P0 (Critical)
**Epic**: EPIC-003
**Estimate**: 8 SP
**Status**: 📋 Todo

**Description**:
Build dashboard page showing workflow steps in grid layout with AI-generated labels. Admin can view screenshots, labels, and instructions.

**Acceptance Criteria**:
- [ ] Review page accessible from dashboard workflow list
- [ ] Shows all steps in numbered order
- [ ] Each step card displays: screenshot, label, instruction, action type, value
- [ ] Confidence indicators color-coded (green >0.8, yellow 0.6-0.8, red <0.6)
- [ ] Loading spinner while workflow processes
- [ ] Auto-refreshes when status changes from "processing" to "draft"
- [ ] "Save Workflow" button visible at top and bottom
- [ ] Responsive design (mobile, tablet, desktop)

**Technical Context**:
- **Dependencies**: AI-003 (or mock data for development)
- **Affected Components**:
  - `dashboard/src/pages/` - Review page
  - `dashboard/src/components/` - StepCard component
- **Key Files**:
  - `src/pages/WorkflowReview.tsx` - Review page
  - `src/components/StepCard.tsx` - Step card component
  - `src/hooks/useWorkflowPolling.ts` - Polling hook for status updates
- **Considerations**:
  - Use React Query or SWR for data fetching
  - Implement optimistic updates for edits
  - Screenshot thumbnails: 200x150px (lazy load)
  - Virtualize list if >50 steps (performance)

**UI Design**:
```
┌─────────────────────────────────────────────┐
│ Review Workflow: "Submit Expense Report"    │
│ [Save Workflow] [Delete Workflow]           │
└─────────────────────────────────────────────┘

Step 1           Step 2           Step 3
┌──────────┐    ┌──────────┐    ┌──────────┐
│ [IMAGE]  │    │ [IMAGE]  │    │ [IMAGE]  │
│          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘
✓ Invoice #     ✓ Amount        ⚠️ Date
"Enter invoice" "Enter amount"  "Select date"
click           input_commit    select_change
[Edit]          [Edit]          [Edit]
```

**Implementation Tasks**:
1. Create `/workflows/:id/review` route
2. Fetch workflow + steps from API
3. Build StepCard component
4. Create grid layout (2-3 columns, responsive)
5. Add loading states and error handling
6. Show confidence indicators
7. Add "Save Workflow" button
8. Implement polling/websocket for status updates

**Definition of Done**:
- Review page renders correctly
- All steps displayed with metadata
- Confidence indicators work
- Auto-refresh on status change
- Responsive on all screen sizes
- No console errors
- Documentation updated

---

### FE-009: Edit Step Modal
**Type**: Frontend Feature
**Priority**: P0 (Critical)
**Epic**: EPIC-003
**Estimate**: 5 SP
**Status**: 📋 Todo

**Description**:
Create modal dialog for editing step labels and instructions. Show full-size screenshot, editable fields, technical details.

**Acceptance Criteria**:
- [ ] "Edit" button on each step card opens modal
- [ ] Modal shows full-size screenshot
- [ ] Label input (max 100 chars)
- [ ] Instruction textarea (max 500 chars)
- [ ] Technical details expandable accordion
- [ ] Save button updates database immediately
- [ ] Cancel button discards changes
- [ ] Validation errors shown inline
- [ ] Can edit same step multiple times
- [ ] Edited steps marked with badge

**Technical Context**:
- **Dependencies**: FE-008 (Review page), BE-006 (Update endpoint)
- **Affected Components**:
  - `dashboard/src/components/` - EditStepModal component
- **Key Files**:
  - `src/components/EditStepModal.tsx` - Modal component
  - `src/utils/validation.ts` - Form validation
- **Considerations**:
  - Use Headless UI or Radix UI for modal
  - Keyboard shortcuts: Escape to cancel, Enter to save
  - Optimistic updates (UI updates immediately)

**Implementation Tasks**:
1. Create EditStepModal component
2. Show full-size screenshot
3. Add editable text inputs
4. Display technical details (read-only)
5. Implement save/cancel actions
6. Validate inputs
7. Show "Edited by you" badge after save
8. Update API integration

**Definition of Done**:
- Modal opens and closes correctly
- Editing works for all fields
- Validation prevents empty submissions
- Optimistic updates work
- Edited badge displayed
- Tests for validation logic

---

### BE-006: Update Step Endpoint
**Type**: Backend Feature
**Priority**: P0 (Critical)
**Epic**: EPIC-003
**Estimate**: 3 SP
**Status**: 📋 Todo

**Description**:
Create API endpoint for updating step labels. Track edit history (edited_by, edited_at).

**Acceptance Criteria**:
- [ ] PUT /api/steps/:id accepts updates
- [ ] Validates label (1-100 chars) and instruction (1-500 chars)
- [ ] Updates database with new values
- [ ] Sets edited_at to current timestamp
- [ ] Sets edited_by to current user ID
- [ ] Returns 403 if step belongs to different company
- [ ] Returns 404 if step doesn't exist
- [ ] Unit tests for validation and multi-tenancy

**Technical Context**:
- **Dependencies**: None (backend only)
- **Affected Components**:
  - `backend/app/api/steps.py` - Step endpoints
  - `backend/app/schemas/step.py` - Update schema
- **Key Files**:
  - `app/api/steps.py` - PUT /api/steps/:id endpoint
  - `app/schemas/step.py` - UpdateStepRequest schema
  - `app/services/step.py` - Update service logic

**API Endpoint**:
```python
PUT /api/steps/{step_id}
{
  "field_label": "Updated Label",
  "instruction": "Updated instruction",
  "label_edited": true,
  "instruction_edited": true,
  "edited_by": <user_id from JWT>
}
```

**Implementation Tasks**:
1. Create PUT /api/steps/:id endpoint
2. Accept field_label and instruction updates
3. Validate inputs (not empty, max length)
4. Update edited_by, edited_at fields
5. Return updated step data
6. Enforce multi-tenant isolation

**Definition of Done**:
- Endpoint works correctly
- Validation prevents invalid data
- Multi-tenancy enforced
- Unit tests passing
- Integration tests passing
- Documentation updated

---

### FE-011: Save Workflow Button
**Type**: Frontend Feature
**Priority**: P0 (Critical)
**Epic**: EPIC-003
**Estimate**: 2 SP
**Status**: 📋 Todo

**Description**:
Implement "Save Workflow" button that changes status from "draft" to "active". Validate all steps have labels.

**Acceptance Criteria**:
- [ ] Button disabled if any step missing label/instruction
- [ ] Button shows validation error on click if incomplete
- [ ] On click, updates workflow status to "active"
- [ ] Success notification shown
- [ ] Redirects to dashboard
- [ ] Workflow now visible to all team members

**Technical Context**:
- **Dependencies**: FE-008 (Review page), BE-008 (Update endpoint)
- **Affected Components**:
  - `dashboard/src/pages/WorkflowReview.tsx` - Add save button
- **Key Files**:
  - `src/pages/WorkflowReview.tsx` - Save button logic
  - `src/api/client.ts` - API call to update status

**Implementation Tasks**:
1. Add "Save Workflow" button (top and bottom)
2. Validate all steps complete
3. Show validation errors if incomplete
4. Call PUT /api/workflows/:id with status="active"
5. Show success notification
6. Redirect to dashboard

**Definition of Done**:
- Button validates correctly
- Saves workflow successfully
- Redirects to dashboard
- Success notification shown
- Tests passing

---

### BE-008: Update Workflow Status Endpoint
**Type**: Backend Feature
**Priority**: P0 (Critical)
**Epic**: EPIC-003
**Estimate**: 2 SP
**Status**: 📋 Todo

**Description**:
Update existing PUT /api/workflows/:id endpoint to support status changes. Validate all steps have labels before activating.

**Acceptance Criteria**:
- [ ] PUT /api/workflows/:id accepts status updates
- [ ] Returns 400 if activating workflow with incomplete steps
- [ ] Updates database with new status
- [ ] Sets updated_at to current timestamp
- [ ] Returns complete workflow data
- [ ] Unit tests for validation

**Technical Context**:
- **Dependencies**: None (extends existing endpoint)
- **Affected Components**:
  - `backend/app/api/workflows.py` - Update endpoint
  - `backend/app/services/workflow.py` - Validation logic
- **Key Files**:
  - `app/api/workflows.py` - PUT /api/workflows/:id
  - `app/services/workflow.py` - validate_workflow_complete()

**Implementation Tasks**:
1. Add status update to existing endpoint
2. Validate all steps have field_label and instruction
3. Update workflow.updated_at timestamp
4. Return updated workflow data

**Definition of Done**:
- Status updates work
- Validation prevents incomplete activation
- Unit tests passing
- Integration tests passing

---

### FE-010: Delete Step Functionality (P1 - Should-Have)
**Type**: Frontend Feature
**Priority**: P1 (Should-have)
**Epic**: EPIC-003
**Estimate**: 3 SP
**Status**: 📋 Todo

**Description**:
Add delete button to step cards with confirmation modal. Handle step renumbering on frontend.

**Acceptance Criteria**:
- [ ] Delete button on each step card
- [ ] Confirmation modal shown
- [ ] On confirm, step deleted from database
- [ ] Remaining steps renumbered (UI updates immediately)
- [ ] Cannot delete if only 1 step
- [ ] Success notification shown
- [ ] Error handling if deletion fails

**Technical Context**:
- **Dependencies**: FE-008 (Review page), BE-007 (Delete endpoint)
- **Affected Components**:
  - `dashboard/src/components/StepCard.tsx` - Delete button
- **Key Files**:
  - `src/components/DeleteStepModal.tsx` - Confirmation modal
  - `src/api/client.ts` - DELETE API call

**Implementation Tasks**:
1. Add "Delete" button to StepCard
2. Create confirmation modal
3. Call DELETE /api/steps/:id endpoint
4. Optimistically update UI
5. Show success notification
6. Disable delete if only 1 step

**Definition of Done**:
- Delete works correctly
- Confirmation prevents accidents
- UI updates optimistically
- Error handling works
- Tests passing

---

### BE-007: Delete Step Endpoint (P1 - Should-Have)
**Type**: Backend Feature
**Priority**: P1 (Should-have)
**Epic**: EPIC-003
**Estimate**: 3 SP
**Status**: 📋 Todo

**Description**:
Create DELETE endpoint for steps. Renumber remaining steps after deletion.

**Acceptance Criteria**:
- [ ] DELETE /api/steps/:id deletes step
- [ ] Remaining steps renumbered automatically
- [ ] Returns 400 if only 1 step remains
- [ ] Returns 403 if step belongs to different company
- [ ] Returns 404 if step doesn't exist
- [ ] Unit tests for renumbering logic

**Technical Context**:
- **Dependencies**: None (backend only)
- **Affected Components**:
  - `backend/app/api/steps.py` - Delete endpoint
  - `backend/app/services/step.py` - Delete logic
- **Key Files**:
  - `app/api/steps.py` - DELETE /api/steps/:id
  - `app/services/step.py` - delete_step_and_renumber()

**Implementation Tasks**:
1. Create DELETE /api/steps/:id endpoint
2. Validate step exists and belongs to user's company
3. Delete step from database
4. Renumber remaining steps
5. Return success response
6. Handle edge case: cannot delete if only 1 step

**Definition of Done**:
- Endpoint works correctly
- Renumbering tested
- Multi-tenancy enforced
- Unit tests passing
- Integration tests passing

---

## Sprint 2 Summary

**Total Story Points**: 43 SP
- **P0 (Must-Have)**: 37 SP (8 tasks)
- **P1 (Should-Have)**: 6 SP (2 tasks)

**Epic 3 Complete Deliverables**:
- AI labeling infrastructure (Celery + Claude API)
- Background job processing workflows
- Admin review page with AI-generated labels
- Edit step labels and instructions
- Save workflows (draft → active)
- Optional: Delete unwanted steps

**Success Criteria**:
- [ ] AI labeling accuracy >75%
- [ ] Review page loads <2 seconds
- [ ] AI processing <2 minutes for 10-step workflow
- [ ] Admin can edit and save workflows
- [ ] Workflows available to team after activation

---

## Backlog (Future Sprints)

### Sprint 3: Walkthrough Mode & Auto-Healing
- FE-012: Walkthrough Mode Overlay UI
- FE-013: Element Finding & Deterministic Auto-Healing
- FE-014: AI-Assisted Auto-Healing Integration
- BE-009: Health Monitoring Endpoints
- BE-010: Notification System

### Sprint 4: Polish & Testing
- TEST-001: End-to-End Testing Setup
- PERF-001: Performance Optimization  
- DOC-001: User Documentation
- BUG-XXX: Bug fixes from testing

---

## Sprint 1 Completed Tasks (Archived)

**Sprint 1 delivered 53 SP across 13 tasks.** All Sprint 1 work is documented in `completed_tasks.md`.

**Key Deliverables**:
- Backend API (auth, workflows, screenshots) ✅
- Chrome extension recording capability ✅
- Dashboard with authentication ✅
- 7,900+ lines of production code
- 54 tests passing (100% pass rate)

---

## Technical Debt

None currently identified.

---

## Blockers

None currently.

---

## Notes

- **Sprint 1 velocity**: 53 SP delivered over 2 weeks
- **Sprint 2 target**: 43 SP (37 P0 + 6 P1)
- **Risk areas**: AI labeling quality, Claude API rate limits, prompt engineering
- **Next sprint planning**: After Sprint 2 completion
