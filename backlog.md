# Backlog - Workflow Automation Platform

**Last Updated**: 2025-12-25

## Priority Levels
- **P0 - Critical**: Security vulnerabilities, production blockers
- **P1 - High**: Core functionality gaps, test coverage for critical paths
- **P2 - Medium**: Quality of life improvements, documentation
- **P3 - Low**: Nice-to-haves, future optimizations

---

## P0 - Critical

### SECURITY-001: Fix XPath Injection Vulnerability
**Type**: Bug/Security
**Component**: Extension
**File**: `extension/src/content/healing/candidateFinder.ts` (Lines 212-223)

**Description**: User text is directly interpolated into XPath queries without sanitization, creating potential injection vulnerability.

**Current Code**:
```typescript
const xpath = options.exact
  ? `//*[normalize-space(text())="${text}"]`  // No escaping!
  : `//*[contains(..., "${normalizedText}")]`;
```

**Risk**: If `text` comes from untrusted source, malicious XPath can be injected.

**Fix**: Sanitize text before XPath construction, add tests for malicious inputs.

**Acceptance Criteria**:
- [ ] Text sanitized before XPath interpolation
- [ ] Tests added for malicious input patterns
- [ ] No functional regression

---

### TEST-001: Add Walkthrough Tests (CRITICAL GAP)
**Type**: Tech Debt
**Component**: Extension
**File**: `extension/src/content/walkthrough.ts` (1571 lines)

**Description**: The largest file in the extension has ZERO tests. This is the core user-facing feature.

**Missing Coverage**:
- Basic walkthrough initialization and step navigation
- Element finding/healing integration
- Cleanup and memory leak prevention
- Error boundary scenarios
- Event listener cleanup

**Risk**: Memory leaks, race conditions, DOM manipulation errors, undefined behavior on errors.

**Acceptance Criteria**:
- [ ] Basic initialization tests
- [ ] Navigation tests (next, back, skip)
- [ ] Cleanup/memory leak tests
- [ ] Error handling tests
- [ ] 60%+ coverage target

---

### TEST-002: Add Workflow Service Security Tests
**Type**: Tech Debt
**Component**: Backend
**File**: `backend/app/services/workflow.py`

**Description**: Multi-tenant isolation is critical security feature but has no unit tests verifying the `company_id` filter.

**Missing Tests**:
- Try to access other company's workflows
- NULL company_id scenarios
- SQL injection attempts

**Acceptance Criteria**:
- [ ] Unit tests for multi-tenant isolation
- [ ] Tests for edge cases (null IDs, invalid company)
- [ ] Verified via security audit

---

### SECURITY-002: XSS via innerHTML in Walkthrough
**Type**: Bug/Security
**Component**: Extension
**File**: `extension/src/content/walkthrough.ts` (Lines 507, 828, 976, 1078)
**Discovered**: 2025-12-25 (Codebase audit with Codex)

**Description**: Walkthrough injects admin-controlled labels and instructions into DOM using `innerHTML` without sanitization. If an admin edits step labels maliciously (or if the backend is compromised), arbitrary HTML/JS can be injected into any page where walkthrough runs.

**Vulnerable Code Locations**:
```typescript
// Line 507 - healing confirmation overlay
confirmOverlay.innerHTML = `...`;

// Line 828 - tooltip element
tooltipElement.innerHTML = `...`;

// Line 976 - error state
tooltipElement.innerHTML = `...`;

// Line 1078 - completion state
tooltipElement.innerHTML = `...`;
```

**Risk**: HIGH - XSS can steal cookies, session tokens, or perform actions as the user on any website where the extension is active.

**Fix**: Replace `innerHTML` with `textContent` for user-provided text, or use a sanitization library (DOMPurify) for any HTML that must be rendered.

**Acceptance Criteria**:
- [ ] All `innerHTML` assignments reviewed and sanitized
- [ ] User-provided text (labels, instructions) uses `textContent`
- [ ] Tests added for XSS payloads in step labels
- [ ] No visual regression in walkthrough UI

---

### SECURITY-003: PostMessage Spoofing Vulnerability
**Type**: Bug/Security
**Component**: Extension
**File**: `extension/src/content/walkthrough.ts` (Lines 1534-1561)
**Discovered**: 2025-12-25 (Codebase audit with Codex)

**Description**: The walkthrough listens for `window.postMessage` events and only checks `data.source === "overlay-dashboard"` but does NOT validate `event.origin`. Any malicious page can send a message with `{source: "overlay-dashboard", type: "START_WALKTHROUGH"}` and trigger a walkthrough, potentially leaking workflow data or causing unexpected behavior.

**Vulnerable Code**:
```typescript
// Line 1534
window.addEventListener("message", (event: MessageEvent) => {
  // Line 1541 - Only checks data.source, not event.origin!
  if (data.source !== "overlay-dashboard") return;

  if (data.type === "START_WALKTHROUGH") {
    // Attacker can trigger this from any page
  }
});
```

**Risk**: MEDIUM-HIGH - Malicious sites could trigger walkthrough with crafted payloads, potentially exfiltrating workflow metadata or causing UI confusion.

**Fix**:
1. Validate `event.origin` matches the dashboard domain before processing
2. Consider using a nonce/handshake mechanism for additional security
3. Use `chrome.runtime.sendMessage` from dashboard instead of postMessage where possible

**Acceptance Criteria**:
- [ ] `event.origin` validated against allowed dashboard URL
- [ ] Tests added for spoofed postMessage attacks
- [ ] Document the security model in architecture docs

---

### SECURITY-004: Missing Rate Limiting on Auth Endpoints
**Type**: Bug/Security
**Component**: Backend
**File**: `backend/app/api/auth.py` (Lines 17, 61)
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: `/signup` and `/login` endpoints have no rate limiting. Vulnerable to brute force password attacks, credential stuffing, and abuse.

**Risk**: HIGH - Attackers can attempt unlimited login attempts to guess passwords.

**Fix**: Add rate limiting middleware (e.g., `slowapi`) with limits like:
- Login: 5 attempts per 15 minutes per IP
- Signup: 10 attempts per hour per IP
- Failed attempts should trigger progressive delays

**Acceptance Criteria**:
- [ ] Rate limiting middleware installed and configured
- [ ] Login limited to 5 attempts / 15 min / IP
- [ ] Signup limited to 10 attempts / hour / IP
- [ ] Returns 429 Too Many Requests with retry-after header
- [ ] Tests for rate limiting behavior

---

## P1 - High Priority

### FEAT-009: Wire HealthView to Real Backend Data (Broken Admin Loop)
**Type**: Enhancement
**Component**: Dashboard
**File**: `dashboard/src/pages/HealthView.tsx` (Line 4 indicates mock data)
**Discovered**: 2025-12-25 (Codebase audit with Codex)

**Description**: The HealthView page currently imports from `@/data/mockData` and displays hardcoded data. Backend creates real `HealthLog` records, but the dashboard never fetches them. Admins cannot see actual workflow health, execution history, or failure patterns.

**Current State**:
```typescript
// Line 17 - Using mock data instead of API
import { RECENT_EXECUTIONS, HEALTH_STATS } from "@/data/mockData";
```

**Impact**: Core admin value proposition is broken - admins pay for reliability visibility but get static mock data.

**Fix**:
1. Add API endpoint `GET /api/health/logs` with pagination and filters
2. Add API endpoint `GET /api/health/stats` for aggregated metrics
3. Replace mock imports with real API calls
4. Add loading/error states

**Acceptance Criteria**:
- [ ] Backend endpoints for health logs and stats
- [ ] Dashboard fetches real data from backend
- [ ] Recent executions show actual workflow runs
- [ ] Health stats calculated from real data
- [ ] Loading and error states implemented

---

### FEAT-010: Complete Notification System (Broken Admin Loop)
**Type**: Enhancement
**Component**: Backend + Dashboard
**Files**:
- Backend: `backend/app/models/notification.py` (exists)
- Dashboard: `dashboard/src/components/Layout.tsx` (needs bell icon)
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: Backend creates `Notification` records when workflows break, but there's no API to fetch them and no UI to display them. Admins never see alerts about broken workflows.

**Current State**:
- Notification model exists in database
- Health service creates notifications on workflow degradation
- NO API endpoint to fetch notifications
- NO UI element to display notifications

**Fix**:
1. Add `GET /api/notifications` - list user's notifications
2. Add `PATCH /api/notifications/{id}` - mark as read
3. Add notification bell icon in Layout.tsx navbar
4. Add dropdown showing recent notifications
5. Link notifications to relevant workflow

**Acceptance Criteria**:
- [ ] API endpoints for list/update notifications
- [ ] Bell icon in navbar with unread count badge
- [ ] Dropdown shows recent notifications
- [ ] Click marks notification as read
- [ ] Clicking notification navigates to workflow

---

### BUG-001: Click Validation Bug in Walkthrough
**Type**: Bug
**Component**: Extension
**File**: `extension/src/content/walkthrough.ts` (Line 1191)
**Discovered**: 2025-12-25 (Codebase audit with Codex)

**Description**: Action validation compares `event.target !== targetElement`, which fails when users click on nested child elements (e.g., clicking on an SVG icon inside a button). This causes walkthrough to not auto-advance even when the user clicks the correct element.

**Problematic Code**:
```typescript
// Line 1188-1191
const eventTarget = event.target as HTMLElement;

if (eventTarget !== targetElement) {
  // This fails if user clicks a child element!
  return false;
}
```

**Expected Behavior**: Click on button's child SVG should still validate as correct.

**Fix**: Use `event.currentTarget` (the element with the listener) or check `targetElement.contains(eventTarget)` or use `event.composedPath()`.

**Acceptance Criteria**:
- [ ] Click validation uses `contains()` or `composedPath()`
- [ ] Clicks on child elements correctly validate
- [ ] Tests added for nested element clicks
- [ ] No regression in other action validations

---

### TEST-FIX-001: Fix Failing Backend Tests (14 failures)
**Type**: Tech Debt
**Component**: Backend
**Last Verified**: 2025-12-24

**Description**: 14 backend tests are currently failing. These need investigation and fixing.

**Failing Tests**:
- `test_ai_service.py` - 5 failures (AI mock/initialization issues)
- `test_auth_api.py` - Auth E2E flow failure
- `test_screenshots_api.py` - 4 failures (unauthorized access, URL generation)
- `test_workflows_api.py` - 3 failures (status assertions, update validation)
- `test_jwt.py` - Token uniqueness test failure

**Additional Errors**:
- `test_health_logging.py` - 5 errors (fixture/setup issues)

**Acceptance Criteria**:
- [ ] All 14 failing tests fixed
- [ ] All 5 errors resolved
- [ ] Build and test suite pass 100%

---

### TEST-FIX-002: Fix Failing Extension Tests (37 failures)
**Type**: Tech Debt
**Component**: Extension
**Last Verified**: 2025-12-24

**Description**: 37 extension tests are failing, primarily in healing factor tests.

**Failing Areas**:
- `positionSimilarity.test.ts` - Soft veto logic failures
- `autoHealer.test.ts` - Integration test failures
- `scorer.test.ts` - Scoring algorithm failures

**Root Causes to Investigate**:
- Position distance thresholds may have changed
- Soft veto logic discrepancy
- Score calculation mismatch

**Acceptance Criteria**:
- [ ] All 37 failing tests fixed
- [ ] Extension test suite passes 100%
- [ ] No regression in healing functionality

---

### TEST-003: Test Healing Factor Algorithms
**Type**: Tech Debt
**Component**: Extension
**Files**:
- `extension/src/content/healing/factors/textSimilarity.ts` (210 lines)
- `extension/src/content/healing/factors/positionSimilarity.ts` (190 lines)
- `extension/src/content/healing/factors/attributeMatch.ts` (264 lines)
- `extension/src/content/healing/candidateFinder.ts` (300 lines)

**Description**: Core healing algorithms have no unit tests verifying correctness.

**Risks**:
- Levenshtein distance algorithm correctness unverified
- Position similarity thresholds untested
- ID stability heuristics may have false positives

**Acceptance Criteria**:
- [ ] Tests for each factor module
- [ ] Algorithm correctness verified against known test cases
- [ ] Edge cases covered (empty strings, special chars, framework IDs)

---

### TEST-004: Add Healing API Integration Tests
**Type**: Tech Debt
**Component**: Backend
**File**: `backend/app/api/healing.py` (133 lines)

**Description**: Healing API endpoint has no tests.

**Missing Coverage**:
- Endpoint integration test
- Fallback behavior when AI unavailable
- Request validation
- Error response formats

**Acceptance Criteria**:
- [ ] Integration tests for POST /api/healing/validate
- [ ] Tests for fallback to deterministic scoring
- [ ] Error handling tests

---

### DOC-001: Create Missing QUICKSTART.md
**Type**: Documentation
**Component**: Root

**Description**: README.md references QUICKSTART.md but file doesn't exist. New developers cannot onboard efficiently.

**Required Content**:
- 5-minute setup guide
- Environment setup (Python venv, npm install)
- Database initialization
- Running all services (backend, celery, dashboard, extension)
- First workflow recording test
- Common setup errors and solutions

**Acceptance Criteria**:
- [ ] File created with comprehensive setup guide
- [ ] Tested by following steps on fresh clone
- [ ] Includes troubleshooting section

---

### DOC-002: Create Missing TESTING_GUIDE.md
**Type**: Documentation
**Component**: Root

**Description**: README.md references TESTING_GUIDE.md but file doesn't exist.

**Required Content**:
- End-to-end testing scenarios
- How to test recording → AI labeling → walkthrough
- Manual test checklist
- Automated test suite overview
- How to run tests for each package

**Acceptance Criteria**:
- [ ] File created with testing procedures
- [ ] Test data fixtures documented
- [ ] E2E scenarios documented

---

### DOC-003: Complete API Documentation
**Type**: Documentation
**Component**: Backend
**File**: `backend/API_EXAMPLES.md`

**Description**: Only auth and healing endpoints documented. Workflow, step, and screenshot endpoints missing.

**Missing Endpoints**:
- Workflow CRUD (GET, POST, PUT, DELETE /api/workflows)
- Step management (GET, PUT, DELETE /api/steps)
- Screenshot upload and retrieval
- Execution logging endpoints

**Acceptance Criteria**:
- [ ] All endpoints documented with examples
- [ ] Query parameters and pagination documented
- [ ] Error response formats included

---

### DOC-004: Create Deployment Guide
**Type**: Documentation
**Component**: Root

**Description**: No production deployment documentation exists.

**Required Content**:
- Production environment setup
- Environment variable documentation
- Database migration strategy
- Secrets management (JWT keys, API keys)
- AWS S3 setup instructions
- Redis/Celery production configuration
- Monitoring and logging setup
- Rollback procedures

**Acceptance Criteria**:
- [ ] Complete deployment checklist
- [ ] Environment variable reference
- [ ] Tested deployment to staging

---

## P2 - Medium Priority

### UX-001: Replace alert() with Toast Notifications
**Type**: Enhancement
**Component**: Dashboard
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: Dashboard uses browser `alert()` for error messages throughout the codebase. This blocks user interaction, looks unprofessional, and provides poor UX.

**Affected Files** (15+ locations):
- `dashboard/src/pages/WorkflowReview.tsx` (lines 160, 195, 209, 218, 223)
- `dashboard/src/pages/SettingsView.tsx` (lines 85, 122, 129, 266, 520, 527, 553, 644)
- `dashboard/src/pages/HealthView.tsx` (lines 63, 166)
- `dashboard/src/pages/WorkflowDetail.tsx` (line 81)
- `dashboard/src/pages/LibraryView.tsx` (line 75)

**Fix**:
1. Create or use existing toast notification component
2. Replace all `alert()` calls with toast notifications
3. Use different toast types for success/error/warning
4. Ensure toasts auto-dismiss appropriately

**Acceptance Criteria**:
- [ ] Toast component available (create or use library like react-hot-toast)
- [ ] All `alert()` calls replaced
- [ ] Error toasts are red, success toasts are green
- [ ] Toasts auto-dismiss after 5 seconds
- [ ] No blocking UI behavior

---

### REFACTOR-003: Extract Duplicate Frontend Utilities
**Type**: Tech Debt
**Component**: Dashboard
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: Multiple functions are duplicated across dashboard components, creating maintenance burden and inconsistency risk.

**Duplicate Functions**:
1. `getActionTypeColor()` - identical in:
   - `dashboard/src/pages/WorkflowDetail.tsx` (lines 117-130)
   - `dashboard/src/components/StepCard.tsx` (lines 35-48)

2. `formatActionType()` - identical in:
   - `dashboard/src/pages/WorkflowDetail.tsx` (lines 132-134)
   - `dashboard/src/components/StepCard.tsx` (lines 50-52)

3. Screenshot URL construction - repeated in:
   - `dashboard/src/pages/WorkflowDetail.tsx` (lines 111-115)
   - `dashboard/src/components/StepCard.tsx` (lines 54-56)
   - `dashboard/src/components/EditStepModal.tsx` (lines 97-99)

4. Spinner SVG - duplicated inline in:
   - `extension/src/popup/components/LoginForm.tsx` (lines 144-162)
   - `extension/src/popup/components/RecordingControls.tsx` (lines 152-170, 196-214)
   - `dashboard/src/pages/Signup.tsx` (lines 270-288)
   - `extension/src/popup/components/WorkflowList.tsx` (lines 90-109)

**Fix**: Extract to shared utility files:
- `dashboard/src/utils/stepUtils.ts` for step-related functions
- `dashboard/src/components/LoadingSpinner.tsx` for spinner component

**Acceptance Criteria**:
- [ ] Shared utility file created
- [ ] All duplicates replaced with imports
- [ ] No functional changes
- [ ] Build passes

---

### REFACTOR-004: Centralize API Base URL
**Type**: Tech Debt
**Component**: Dashboard
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: API base URL is hardcoded in multiple files instead of being defined once.

**Duplicate Definitions**:
- `dashboard/src/pages/WorkflowDetail.tsx` (line 36)
- `dashboard/src/components/StepCard.tsx` (line 18)
- `dashboard/src/components/EditStepModal.tsx` (line 15)

**Fix**: Define API base URL once in:
- `dashboard/src/config.ts` or
- Environment variable accessed via `import.meta.env.VITE_API_URL`

**Acceptance Criteria**:
- [ ] Single source of truth for API URL
- [ ] All files import from central location
- [ ] Works with environment variables for different environments

---

### REFACTOR-005: Standardize Backend Error Response Format
**Type**: Tech Debt
**Component**: Backend
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: Error responses mix different formats across endpoints, making client-side error handling inconsistent.

**Current Inconsistencies**:
- Some endpoints use nested: `{"code": "ERROR_CODE", "message": "..."}`
- Some use flat: `detail="error message"`
- Some include `status_code`, others rely on HTTP status

**Examples**:
- `backend/app/api/auth.py:84-87`: Uses `{"code": "INVALID_CREDENTIALS", "message": "..."}`
- `backend/app/api/steps.py:180`: Uses simple string `detail=f"Step {step_id} not found"`

**Fix**: Standardize on single format:
```python
{
    "error": {
        "code": "ERROR_CODE",
        "message": "Human readable message",
        "details": {}  # optional additional context
    }
}
```

**Acceptance Criteria**:
- [ ] Error response schema defined
- [ ] All endpoints use consistent format
- [ ] Frontend error handling updated if needed
- [ ] API documentation updated

---

### REFACTOR-006: Extract Duplicate Step-to-Response Logic
**Type**: Tech Debt
**Component**: Backend
**File**: `backend/app/api/workflows.py` (lines 204-234, 309-337, 451-480)
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: Code that converts Step models to StepResponse is duplicated in three endpoints, each performing identical JSON parsing of 17+ fields.

**Affected Endpoints**:
- `get_workflow_endpoint` (lines 204-234)
- `update_workflow_endpoint` (lines 309-337)
- `reorder_steps_endpoint` (lines 451-480)

**Fix**: Extract to service function:
```python
# In backend/app/services/workflow.py
def step_to_response(step: Step) -> StepResponse:
    """Convert Step model to StepResponse with JSON parsing."""
    ...
```

**Acceptance Criteria**:
- [ ] Service function created
- [ ] All three endpoints use shared function
- [ ] No functional changes
- [ ] Tests pass

---

### A11Y-001: Add Aria Labels to Icon Buttons
**Type**: Enhancement
**Component**: Dashboard + Extension
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: Many icon-only buttons lack `aria-label` attributes, making them inaccessible to screen reader users.

**Affected Areas**:
- Dashboard action buttons (edit, delete, refresh icons)
- Extension popup buttons
- Modal close buttons (e.g., `EditStepModal.tsx` line 130)

**Fix**: Add `aria-label` to all icon-only buttons with descriptive text.

**Acceptance Criteria**:
- [ ] All icon buttons have aria-label
- [ ] Labels are descriptive (e.g., "Delete step", not "X")
- [ ] Can navigate with screen reader

---

### PERF-002: Add Composite Database Indexes
**Type**: Tech Debt
**Component**: Backend
**Files**:
- `backend/app/models/workflow.py` (lines 130-134)
- `backend/app/models/step.py` (lines 127-131)
**Discovered**: 2025-12-25 (Codebase audit)

**Description**: Missing composite indexes for common query patterns will cause performance issues at scale.

**Current Indexes**:
```python
Index("idx_workflows_company", "company_id"),
Index("idx_workflows_status", "status"),
Index("idx_steps_workflow", "workflow_id"),
```

**Missing Indexes** (needed for common queries):
```python
# For "get all active workflows for company sorted by updated"
Index("idx_workflows_company_status", "company_id", "status"),
Index("idx_workflows_company_updated", "company_id", "updated_at"),

# For health trending queries
Index("idx_health_logs_workflow_created", "workflow_id", "created_at"),
```

**Acceptance Criteria**:
- [ ] Composite indexes added
- [ ] Migration created
- [ ] Query performance verified

---

### FEAT-001: Step Delete Confirmation Modal
**Type**: Enhancement
**Component**: Dashboard
**User Story**: 3.3

**Description**: Step deletion has no confirmation modal. Accidental deletes are permanent.

**Acceptance Criteria**:
- [ ] Confirmation modal shows before delete
- [ ] Message includes step number and renumbering warning
- [ ] Can cancel delete

---

### FEAT-002: Prevent Deleting Last Step
**Type**: Enhancement
**Component**: Backend/Dashboard
**User Story**: 3.3

**Description**: No guard preventing deletion of last remaining step in workflow.

**Acceptance Criteria**:
- [ ] Backend returns 400 if deleting last step
- [ ] UI disables delete button when only 1 step
- [ ] Error message explains why

---

### FEAT-003: Notification UI for Broken Workflows
**Type**: Enhancement
**Component**: Dashboard
**User Story**: 5.2

**Description**: Backend creates notifications but dashboard has no notification bell/panel.

**Acceptance Criteria**:
- [ ] Bell icon in navbar with badge count
- [ ] Dropdown panel shows notifications
- [ ] Click marks notification as read
- [ ] Links to workflow health page

---

### FEAT-004: Settings Page for Team Management
**Type**: Enhancement
**Component**: Dashboard
**User Story**: 1.2

**Description**: Settings page exists but team member management not implemented.

**Acceptance Criteria**:
- [ ] Invite link displayed with copy button
- [ ] Team member list showing name, email, role
- [ ] Admin can remove team members
- [ ] Success/error toasts

---

### TEST-005: Add Dashboard Component Tests
**Type**: Tech Debt
**Component**: Dashboard

**Description**: No React component tests exist. Only utility function tests.

**Missing Coverage**:
- Page components (Dashboard, WorkflowDetail, WorkflowReview)
- Reusable components (StepCard, HealthBadge)
- Integration tests for user flows

**Acceptance Criteria**:
- [ ] Tests for critical pages
- [ ] Tests for reusable components
- [ ] 50%+ coverage target

---

### REFACTOR-001: Extract Magic Numbers in Healing
**Type**: Tech Debt
**Component**: Extension

**Description**: Healing factors have magic numbers without explanation.

**Example**:
```typescript
if (distance < 50) {
  positionScore = 0.9;  // Why 50? Why 0.9?
}
```

**Acceptance Criteria**:
- [ ] Extract to named constants
- [ ] Add comments explaining thresholds
- [ ] Document in architecture docs

---

### REFACTOR-002: Simplify autoHealer.ts Complexity
**Type**: Tech Debt
**Component**: Extension
**File**: `extension/src/content/healing/autoHealer.ts` (Lines 104-243)

**Description**: Deep nesting and high cyclomatic complexity makes code hard to test and maintain.

**Acceptance Criteria**:
- [ ] Extract helper functions
- [ ] Reduce nesting depth
- [ ] Improve readability

---

### DOC-005: Add JSDoc to Dashboard Components
**Type**: Documentation
**Component**: Dashboard

**Description**: React components lack JSDoc documentation.

**Acceptance Criteria**:
- [ ] All component files have header docs
- [ ] Props documented with descriptions
- [ ] Complex hooks explained

---

### DOC-006: Create CONTRIBUTING.md
**Type**: Documentation
**Component**: Root

**Description**: No contribution guidelines for new developers.

**Required Content**:
- Code style guide (Python, TypeScript)
- PR template and review process
- Commit message conventions
- Testing requirements
- Branch naming conventions

**Acceptance Criteria**:
- [ ] File created with guidelines
- [ ] Linked from README
- [ ] PR template created

---

## P3 - Low Priority

### FEAT-005: Workflow Search and Filter
**Type**: Enhancement
**Component**: Dashboard
**User Story**: 4.1 Backlog

**Description**: No search or filter functionality for workflows.

**Acceptance Criteria**:
- [ ] Search by workflow name
- [ ] Filter by status (healthy/broken)
- [ ] Filter by creator
- [ ] Sort options

---

### FEAT-006: Keyboard Shortcuts in Walkthrough
**Type**: Enhancement
**Component**: Extension
**User Story**: 4.3 Backlog

**Description**: No keyboard navigation in walkthrough mode.

**Acceptance Criteria**:
- [ ] N for next step
- [ ] B for back
- [ ] Esc to exit
- [ ] Keyboard shortcut hint in UI

---

### FEAT-007: Input Format Validation in Walkthrough
**Type**: Enhancement
**Component**: Extension
**User Story**: 4.4

**Description**: Walkthrough doesn't validate input formats (dates, emails, etc.)

**Acceptance Criteria**:
- [ ] Detect expected format from step metadata
- [ ] Show warning for incorrect format
- [ ] Allow user to correct without losing progress

---

### FEAT-008: Retry Limit with Skip Option
**Type**: Enhancement
**Component**: Extension
**User Story**: 4.4

**Description**: No retry limit per step in walkthrough.

**Acceptance Criteria**:
- [ ] Track retries per step
- [ ] After 3 retries, offer "Skip" and "Report issue"
- [ ] Log skipped steps

---

### DOC-007: Architecture Diagrams
**Type**: Documentation
**Component**: Docs

**Description**: No visual system architecture diagrams.

**Acceptance Criteria**:
- [ ] High-level system diagram
- [ ] Data flow diagrams
- [ ] Sequence diagrams for key flows

---

### PERF-001: Performance Tests for Large Workflows
**Type**: Tech Debt
**Component**: All

**Description**: No performance tests exist for workflows with many steps.

**Acceptance Criteria**:
- [ ] Test with 100+ step workflow
- [ ] Memory usage profiling
- [ ] Benchmark healing with many candidates

---

## Completed Items

_(Move items here when done)_

---

## Notes

### How to Prioritize
1. P0 items block production deployment - fix immediately
2. P1 items impact core functionality - address within 1-2 sprints
3. P2 items improve quality - plan for upcoming sprints
4. P3 items are nice-to-haves - address when capacity allows

### Adding New Items
Follow the template:
```markdown
### TICKET-XXX: Title
**Type**: Bug/Enhancement/Tech Debt/Documentation
**Component**: Extension/Backend/Dashboard/Root
**File**: (if applicable)

**Description**: What and why

**Acceptance Criteria**:
- [ ] Specific, testable criteria
```
