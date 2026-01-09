# Backlog - Workflow Automation Platform

**Last Updated**: 2025-01-08

## Summary

| Priority | Count | Focus Area |
|----------|-------|------------|
| **P0 - Critical** | 5 | Security vulnerabilities, test coverage gaps |
| **P1 - High** | 20 | Core features, admin visibility, tests |
| **P2 - Medium** | 17 | UX polish, refactoring, documentation, accessibility |
| **P3 - Low** | 11 | Nice-to-haves, performance, enhancements |
| **Completed** | 10 | Sprint 4 UX Polish (7), SECURITY-004/005/006 |
| **Total** | 53 | |

### Sprint 1 Status (2025-01-07)
**Completed (Backend)**:
- ✅ SECURITY-004: Rate limiting on auth endpoints
- ✅ SECURITY-005: JWT secret fallback fix
- ✅ SECURITY-006: Path traversal fix

**Deferred (Extension - higher risk, wait for stability)**:
- ⏸️ SECURITY-001: XPath injection (affects healing)
- ⏸️ SECURITY-002: XSS via innerHTML (affects walkthrough UI)
- ⏸️ SECURITY-003: PostMessage spoofing (affects dashboard-extension comm)
- ⏸️ SECURITY-007: Extension API URL config (affects build)

### Recent Additions (from Copilot Review 2025-01-07)
- ~~SECURITY-005: Hardcoded JWT secret fallback (P0)~~ ✅ Complete
- ~~SECURITY-006: Path traversal in screenshots (P0)~~ ✅ Complete
- SECURITY-007: Extension API URL config (P0) → Deferred
- BUG-002: Screenshot file cleanup on delete (P1) → Sprint 3
- BUG-003: Deprecated datetime.utcnow() (P2) → Sprint 6
- BUG-004: Wrong AI pricing estimates (P2) → Sprint 6
- BUG-005: Whitespace screenshot URLs (P2) → Backlog
- BUG-006: Invite token validation (P3) → Backlog
- FEAT-018: Token expiration handling (P2) → Backlog
- REFACTOR-007: Remove dead code (P3) → Backlog

### Quick Links
- [P0 - Critical](#p0---critical) - Fix before any deployment
- [P1 - High Priority](#p1---high-priority) - Fix for SME launch readiness
- [P2 - Medium Priority](#p2---medium-priority) - Polish and quality
- [P3 - Low Priority](#p3---low-priority) - Future enhancements

---

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
**Status**: ⏸️ DEFERRED - Extension not yet released; fix when extension is more stable

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
**Status**: ⏸️ DEFERRED - Previous fix attempt broke application; wait for extension stability

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
**Status**: ⏸️ DEFERRED - Affects dashboard-extension communication; needs careful testing

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

### ~~SECURITY-004: Missing Rate Limiting on Auth Endpoints~~ ✅ COMPLETE
**Status**: ✅ Completed 2025-01-07 - See Completed Items section

---

## P1 - High Priority

### FEAT-011: Workflow Completion Notification
**Type**: Enhancement
**Component**: Dashboard + Extension
**User Story**: 2.3
**Discovered**: 2025-01-07 (Feature audit)

**Description**: When AI labeling completes, users have no notification. They must manually check the dashboard to see if their workflow is ready for review. This creates poor UX especially for longer workflows.

**Current Behavior**:
- User stops recording → workflow shows "Processing"
- AI labeling runs in background (30-60s)
- User has to refresh/check dashboard manually
- No indication when "Draft" status is reached

**Expected Behavior**:
- Toast notification appears when AI labeling completes
- Browser notification (if permitted)
- Dashboard shows badge/indicator for newly ready workflows

**Implementation Notes**:
- Backend: Celery task completion triggers notification creation
- Dashboard: Poll `/api/workflows` or use WebSocket for real-time updates
- Extension: Can show notification via `chrome.notifications` API
- Existing notification model can be extended

**Files to Investigate**:
- `backend/app/tasks/ai_labeling.py` - Task completion point
- `backend/app/models/notification.py` - Existing notification model
- `dashboard/src/pages/Dashboard.tsx` - Workflow list polling

**Acceptance Criteria**:
- [ ] Backend creates notification when AI labeling completes
- [ ] Dashboard shows toast when workflow becomes "draft"
- [ ] Extension shows chrome notification (optional)
- [ ] Notification includes workflow name and link to review
- [ ] Works for concurrent workflow processing

---

### FEAT-012: Upload Error UI with Retry
**Type**: Enhancement
**Component**: Extension + Dashboard
**User Story**: 2.3
**Discovered**: 2025-01-07 (Feature audit)

**Description**: When workflow upload fails (network error, server error), there's no user-facing error UI or retry mechanism. Users lose their recorded workflow.

**Current Behavior**:
- Upload fails silently in background
- Error logged to console only
- Local storage may or may not be cleared
- User sees nothing

**Expected Behavior**:
- Extension shows error toast: "Upload failed. Your recording is saved locally."
- Retry button available in popup
- Dashboard shows failed upload in a "Drafts" or "Pending Upload" section
- Steps retained in IndexedDB until successfully uploaded

**Implementation Notes**:
- Extension already buffers in IndexedDB (verify retention on error)
- Need upload retry mechanism in background worker
- Consider exponential backoff already implemented in API client
- Dashboard may need "Local Drafts" view (stretch goal)

**Files to Investigate**:
- `extension/src/background/messaging.ts` - Upload error handling
- `extension/src/content/storage/indexeddb.ts` - Data retention
- `extension/src/popup/components/RecordingControls.tsx` - UI for retry

**Acceptance Criteria**:
- [ ] Error toast shown on upload failure
- [ ] Steps retained in IndexedDB on failure
- [ ] Retry button in extension popup
- [ ] Successful retry clears local storage
- [ ] 3 automatic retry attempts before manual retry needed

---

### FEAT-013: Complete Settings Page - Team Management
**Type**: Enhancement
**Component**: Dashboard
**User Story**: 6.1
**Discovered**: 2025-01-07 (Feature audit)

**Description**: Settings page has a TeamView component but it uses mock data. Admins cannot actually see or manage their team members.

**Current State**:
- TeamView page exists at `/team`
- Shows invite link with copy button ✓
- Team member list uses MOCK DATA from `@/data/mockData`
- Remove member functionality not wired to backend
- Backend APIs exist (`/api/companies/me/members`, DELETE `/members/{id}`)

**Missing Functionality**:
1. Fetch real team members from `/api/companies/me/members`
2. Display actual roles (admin/regular)
3. Wire "Remove" button to DELETE endpoint
4. Show loading/error states
5. Confirmation modal before removing member

**Files to Modify**:
- `dashboard/src/pages/TeamView.tsx` (or SettingsView.tsx)
- `dashboard/src/api/client.ts` - Add team member API calls
- Backend endpoints already exist: `backend/app/api/companies.py`

**API Endpoints Available**:
```
GET /api/companies/me/members - List team members
DELETE /api/companies/me/members/{user_id} - Remove member (admin only)
PATCH /api/companies/me/members/{user_id}/role - Update role (future)
```

**Acceptance Criteria**:
- [ ] Team member list shows real data from API
- [ ] Each member shows: name, email, role, join date
- [ ] Admin sees "Remove" button (not on self)
- [ ] Confirmation modal before removal
- [ ] Success/error toasts (not alerts)
- [ ] Loading skeleton during fetch
- [ ] Empty state if no team members

---

### FEAT-014: Profile Settings Page
**Type**: Enhancement
**Component**: Dashboard
**User Story**: 6.2
**Discovered**: 2025-01-07 (Feature audit)

**Description**: Users cannot update their profile information (name, password). No profile page exists.

**Current State**:
- No profile editing page
- User name set at signup, never changeable
- Password reset not implemented
- No avatar support

**Required Features (MVP)**:
1. View current profile (name, email, role)
2. Edit display name
3. Change password (requires current password)

**Future Features (post-MVP)**:
- Avatar upload
- Email change (requires verification)
- Two-factor authentication

**Backend Changes Needed**:
- `PATCH /api/users/me` - Update name
- `POST /api/users/me/change-password` - Change password

**Files to Create/Modify**:
- `dashboard/src/pages/ProfileSettings.tsx` - New page
- `backend/app/api/users.py` - Profile endpoints
- `dashboard/src/api/client.ts` - API calls

**Acceptance Criteria**:
- [ ] Profile page accessible from settings/navbar
- [ ] Shows current user info (name, email, role)
- [ ] Can edit display name (saves on blur or button)
- [ ] Can change password with current password verification
- [ ] Password validation (8+ chars, match confirmation)
- [ ] Success/error feedback
- [ ] Logout after password change (security)

---

### FEAT-015: Email Notifications for Workflow Alerts
**Type**: Enhancement
**Component**: Backend
**User Story**: 5.2
**Discovered**: 2025-01-07 (Feature audit)

**Description**: When workflows break, admins only see in-app notifications (which currently don't display). Critical alerts should also go via email for immediate awareness.

**Use Cases**:
1. Workflow marked as "Broken" (3+ consecutive failures)
2. Weekly health summary digest
3. Team member invitation (already partially implemented)

**Implementation Options**:
- Resend (recommended - simple, modern API)
- SendGrid (more features, higher cost)
- AWS SES (cheapest at scale)

**Backend Changes**:
- Add email service (`backend/app/services/email.py`)
- Extend notification creation to trigger email
- Add email templates for different notification types
- User preference for email notifications (future)

**Files to Investigate**:
- `backend/app/services/health.py` - Where broken workflow detected
- `backend/app/models/notification.py` - Notification creation
- `backend/app/services/email_service.py` - May already exist

**Environment Variables Needed**:
```
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=noreply@yourapp.com
```

**Acceptance Criteria**:
- [ ] Email service integrated (Resend recommended)
- [ ] Broken workflow alert emails to admin(s)
- [ ] Email template with workflow name, link, failure details
- [ ] Unsubscribe link in email (CAN-SPAM compliance)
- [ ] Rate limiting (max 1 email per workflow per hour)
- [ ] Test mode for development (no real emails)

---

### FEAT-016: SSO/SAML Integration (Enterprise)
**Type**: Enhancement
**Component**: Backend + Dashboard
**User Story**: Enterprise requirement
**Priority Context**: Required for enterprise customers, not for SMEs

**Description**: Enterprise customers require Single Sign-On via SAML 2.0 or OIDC to integrate with their identity providers (Okta, Azure AD, Google Workspace).

**Scope**:
- SAML 2.0 SP (Service Provider) implementation
- OIDC support (Google, Microsoft, Okta)
- JIT (Just-In-Time) user provisioning
- Mapping IdP groups to app roles

**Implementation Notes**:
- Use established library (python-saml, authlib for OIDC)
- SSO is per-company configuration
- Fallback to email/password for non-SSO users
- Store IdP metadata in database

**Database Changes**:
```python
# New table
class CompanySSOConfig(Base):
    company_id: FK
    provider: str  # 'saml', 'oidc', 'google', 'microsoft'
    metadata_url: str  # For SAML IdP metadata
    client_id: str  # For OIDC
    client_secret: str  # Encrypted
    enabled: bool
```

**Endpoints Needed**:
- `GET /auth/sso/{company_slug}` - Initiate SSO
- `POST /auth/sso/callback` - SAML ACS or OIDC callback
- `GET /api/companies/me/sso` - Get SSO config (admin)
- `PUT /api/companies/me/sso` - Update SSO config (admin)

**Acceptance Criteria**:
- [ ] SAML 2.0 SP-initiated login flow
- [ ] OIDC flow for Google/Microsoft
- [ ] User created on first SSO login (JIT provisioning)
- [ ] SSO config UI for admins
- [ ] Graceful fallback if SSO fails
- [ ] Security: Validate signatures, check assertions

**Estimated Effort**: 2-3 weeks (complex integration)

---

### FEAT-017: Audit Logging (Enterprise)
**Type**: Enhancement
**Component**: Backend
**User Story**: Enterprise compliance requirement
**Priority Context**: Required for SOC 2, HIPAA, enterprise security reviews

**Description**: Enterprise customers need audit logs for compliance. Track who did what, when, from where.

**Events to Log**:
- User login/logout
- User created/invited/removed
- Role changes
- Workflow created/updated/deleted/activated
- Step edited
- Walkthrough started/completed/failed
- Settings changes
- SSO configuration changes

**Data to Capture**:
```python
class AuditLog(Base):
    id: UUID
    timestamp: datetime
    user_id: UUID (nullable for system events)
    company_id: UUID
    action: str  # 'user.login', 'workflow.create', etc.
    resource_type: str  # 'user', 'workflow', 'step'
    resource_id: UUID
    ip_address: str
    user_agent: str
    old_values: JSON (nullable)
    new_values: JSON (nullable)
    metadata: JSON
```

**API Endpoints**:
- `GET /api/audit-logs` - List logs (admin only, paginated)
- `GET /api/audit-logs/export` - Export as CSV

**Retention Policy**:
- Default: 90 days
- Configurable per company (enterprise plan)
- Automatic cleanup job

**Acceptance Criteria**:
- [ ] Audit log model and migrations
- [ ] Middleware/decorator for automatic logging
- [ ] API endpoints for viewing logs
- [ ] Export to CSV functionality
- [ ] Filter by user, action, resource, date range
- [ ] Retention cleanup job
- [ ] Cannot modify/delete logs (append-only)

**Estimated Effort**: 1-2 weeks

---

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

### DOC-008: Fix README Dashboard Port Discrepancy
**Type**: Documentation
**Component**: Root
**Discovered**: 2025-01-07 (Documentation audit)

**Description**: Root README says dashboard runs on port 5173, but vite.config.ts and dashboard/README.md say port 3000. This causes confusion for new developers.

**Current State**:
- `README.md` line ~45: "Dashboard at http://localhost:5173"
- `dashboard/vite.config.ts`: `port: 3000`
- `dashboard/README.md`: "http://localhost:3000"

**Fix**: Update root README.md to say port 3000.

**Acceptance Criteria**:
- [ ] Root README says port 3000
- [ ] Consistent across all documentation
- [ ] Verified by running `npm run dev` in dashboard

---

### DOC-009: Update QUICKSTART.md with Environment Variables
**Type**: Documentation
**Component**: Root
**Discovered**: 2025-01-07 (Documentation audit)

**Description**: QUICKSTART.md doesn't explain required environment variables. Developers get errors when running without them.

**Missing Information**:
1. Required environment variables:
   - `JWT_SECRET_KEY` - Required for auth
   - `ANTHROPIC_API_KEY` - Required for AI labeling
   - `REDIS_URL` - Required for Celery
2. How to create `.env` from `.env.example`
3. What happens if variables are missing

**Acceptance Criteria**:
- [ ] Environment variables section added
- [ ] Clear distinction between required vs optional
- [ ] Example values provided
- [ ] Error messages explained

---

### DOC-010: Update memory.md Recent Work Summary
**Type**: Documentation
**Component**: Root
**Discovered**: 2025-01-07 (Documentation audit)

**Description**: memory.md "Recent Work Summary" and "Next Steps" sections are outdated. Shows Sprint 4 as current but unclear what's complete vs in-progress.

**Issues**:
- Sprint 4 dates show "2025-12-24" (likely meant 2024)
- No clear "Current Status" section
- Test status (14 failed backend, 37 failed extension) not mentioned
- No mention of what's production-ready vs in-development

**Required Updates**:
1. Add "Current Status" section with clear feature completion matrix
2. Update test status with actual numbers
3. Clarify what's production-ready
4. Add recent work from 2025-01

**Acceptance Criteria**:
- [ ] Clear "Current Status" section
- [ ] Feature completion status (complete/partial/not started)
- [ ] Current test status with numbers
- [ ] Recent work summary updated
- [ ] "Next Steps" reflects actual priorities

---

### DOC-001: ~~Create Missing QUICKSTART.md~~ RESOLVED
**Status**: File exists - see DOC-009 for updates needed

---

---

### DOC-002: ~~Create Missing TESTING_GUIDE.md~~ RESOLVED
**Status**: File exists - needs minor updates for new Sprint 4 features

---

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

### A11Y-002: StepCard Keyboard Accessibility
**Type**: Enhancement
**Component**: Dashboard
**File**: `dashboard/src/components/StepCard.tsx`
**Discovered**: 2025-01-08 (Codex Review - Sprint 4)

**Description**: The StepCard component has accessibility issues that affect keyboard-only users and screen reader users.

**Issues Identified**:
1. **Clickable div without keyboard semantics** (Line 44)
   - The entire card is a clickable `<div>` with `onClick`
   - No `role="button"`, `tabIndex`, or `onKeyDown` for Enter/Space
   - Keyboard users cannot activate the card without reaching the "Edit Labels" button

2. **Drag handle is non-semantic div** (Line 82)
   - The drag handle is a `<div>` with no `role` or `aria-label`
   - Keyboard dragging story unclear with dnd-kit

**Recommended Fix**:
1. For clickable card:
   - Add `role="button"`, `tabIndex={0}`, and `onKeyDown` handler for Enter/Space
   - OR wrap card content in a `<button>` element with proper styling

2. For drag handle:
   - Make it a `<button>` with `aria-label="Reorder step"`
   - Ensure dnd-kit keyboard dragging still works

**Acceptance Criteria**:
- [ ] Card is keyboard-navigable and activatable
- [ ] Drag handle has proper ARIA labeling
- [ ] Screen reader announces card purpose
- [ ] Keyboard dragging works with dnd-kit
- [ ] Build and tests pass

**Related**: A11Y-001 (icon buttons - completed in Sprint 4)

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

## P2 - Medium Priority (Copilot Review Additions)

### BUG-005: Handle Whitespace Screenshot URLs in AI Service
**Type**: Bug
**Component**: Backend
**File**: `backend/app/services/ai.py` (lines 102-104)
**Source**: Copilot Review Issue #6

**Description**: AI service checks for empty screenshot URLs but doesn't handle whitespace-only strings like `"   "`. This could cause fallback bypass and API errors.

**Current Code**:
```python
if not step.screenshot or not step.screenshot.storage_url:
    return self._generate_fallback_label(step, element_meta)
```

**Fix**: Add `.strip()` check:
```python
if not step.screenshot or not step.screenshot.storage_url or not step.screenshot.storage_url.strip():
    return self._generate_fallback_label(step, element_meta)
```

**Acceptance Criteria**:
- [ ] Whitespace-only URLs treated as empty
- [ ] Falls back to template labels correctly
- [ ] Test for whitespace URL handling

---

### FEAT-018: Extension Token Expiration Handling
**Type**: Enhancement
**Component**: Extension
**File**: `extension/src/shared/api.ts` (lines 100-107)
**Source**: Copilot Review Issue #8

**Description**: Extension checks for token presence but not expiration. When token expires mid-session, user gets cryptic 401 error instead of graceful logout.

**Current Behavior**: Token exists but expired → 401 error → confusing UX

**Expected Behavior**: Token expired → Clear auth state → Show "Session expired, please log in again"

**Implementation**:
```typescript
if (requiresAuth) {
  const token = await getToken();
  const tokenExpiry = await getTokenExpiry();

  if (!token) {
    throw new ApiClientError("Not authenticated", 401);
  }

  // Check if token expired or expiring within 1 hour
  if (tokenExpiry && new Date(tokenExpiry) <= new Date(Date.now() + 3600000)) {
    await clearAuthState();
    throw new ApiClientError("Session expired. Please log in again.", 401);
  }

  requestHeaders["Authorization"] = `Bearer ${token}`;
}
```

**Acceptance Criteria**:
- [ ] Token expiration checked before API calls
- [ ] Expired tokens trigger graceful logout
- [ ] User-friendly error message shown
- [ ] Test for token expiration handling

---

## P3 - Low Priority

### BUG-006: Validate Invite Token Length Before Query
**Type**: Bug
**Component**: Backend
**File**: `backend/app/services/auth.py` (lines 69-125)
**Source**: Copilot Review Issue #13

**Description**: Invite token lookup queries database without length validation. Extremely long tokens could waste DB resources.

**Fix**: Add length check (tokens are ~43 chars from `secrets.token_urlsafe(32)`):
```python
if len(signup_data.invite_token) > 100:
    raise HTTPException(status_code=400, detail="Invalid invite token format")
```

**Acceptance Criteria**:
- [ ] Token length validated before DB query
- [ ] Clear error message for invalid tokens

---

### REFACTOR-007: Remove Dead Code _extract_json Method
**Type**: Tech Debt
**Component**: Backend
**File**: `backend/app/services/ai.py` (lines 422-441)
**Source**: Copilot Review Issue #14

**Description**: `_extract_json` static method is never called after refactor to Claude tool calling. Dead code increases maintenance burden.

**Acceptance Criteria**:
- [ ] Method removed
- [ ] Build passes
- [ ] No other code depends on it

---

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

### SECURITY-005: Fix Hardcoded JWT Secret Fallback ✅
**Completed**: 2025-01-07
**Component**: Backend
**File**: `backend/app/utils/jwt.py`

**What was done**:
- Added production check - app fails fast if JWT_SECRET_KEY not set in production
- Added dev warning when using insecure default
- No hardcoded fallback used silently

---

### SECURITY-006: Fix Path Traversal in Screenshots API ✅
**Completed**: 2025-01-07
**Component**: Backend
**File**: `backend/app/api/screenshots.py`

**What was done**:
- Added `.resolve()` to normalize paths
- Added validation that file path stays within screenshots directory
- Path traversal attempts now return 400 Bad Request

---

### SECURITY-004: Add Rate Limiting on Auth Endpoints ✅
**Completed**: 2025-01-07
**Component**: Backend
**Files**: `backend/app/main.py`, `backend/app/api/auth.py`, `backend/app/utils/rate_limit.py`

**What was done**:
- Added slowapi for rate limiting
- Login: 5 attempts per minute per IP
- Signup: 3 attempts per minute per IP
- Returns 429 Too Many Requests with Retry-After header
- Rate limiting disabled during tests via TESTING env var

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
