# Sprint 1: Security Foundation

**Duration**: 3-4 weeks
**Priority**: P0 - Must complete before any production deployment
**Dependencies**: None - this is the foundation sprint
**Parallel Safe**: No - other sprints should wait for security fixes

---

## Sprint Goal

Fix all critical security vulnerabilities that could expose user data or allow code injection. This sprint is non-negotiable before any beta/production deployment.

---

## Tickets (8 tickets)

| ID | Title | Complexity | Est. Hours |
|----|-------|------------|------------|
| SECURITY-001 | Fix XPath Injection Vulnerability | Medium | 4-6 |
| SECURITY-002 | Fix XSS via innerHTML in Walkthrough | High | 8-12 |
| SECURITY-003 | Fix PostMessage Spoofing Vulnerability | Medium | 4-6 |
| SECURITY-004 | Add Rate Limiting on Auth Endpoints | Medium | 6-8 |
| **SECURITY-005** | **Fix Hardcoded JWT Secret Fallback** | **Low** | **1-2** |
| **SECURITY-006** | **Fix Path Traversal in Screenshots API** | **Medium** | **3-4** |
| **SECURITY-007** | **Fix Extension API Base URL Config** | **Medium** | **2-3** |
| TEST-002 | Add Workflow Service Security Tests | Medium | 6-8 |

**Total Estimated**: 34-49 hours

---

## NEW TICKETS (from Copilot Review)

### SECURITY-005: Fix Hardcoded JWT Secret Fallback

**File**: `backend/app/utils/jwt.py`
**Line**: 15
**Severity**: CRITICAL
**Source**: Copilot Review Issue #2

**Problem**: JWT secret has hardcoded fallback that could be used in production if env var is missing.

**Current Vulnerable Code**:
```python
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
```

**Risk**: If `JWT_SECRET_KEY` is not set in production, tokens are signed with a public secret. Attackers could forge valid JWTs.

**Solution**:
```python
import os
import warnings

SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not SECRET_KEY:
    if os.getenv("ENVIRONMENT", "development") == "production":
        raise RuntimeError("CRITICAL: JWT_SECRET_KEY environment variable must be set in production!")
    warnings.warn(
        "JWT_SECRET_KEY not set - using insecure default. "
        "Set JWT_SECRET_KEY environment variable before deploying.",
        UserWarning
    )
    SECRET_KEY = "dev-secret-key-DO-NOT-USE-IN-PRODUCTION"
```

**Acceptance Criteria**:
- [ ] Application fails fast in production if JWT_SECRET_KEY not set
- [ ] Warning logged in development mode
- [ ] No hardcoded fallback used silently
- [ ] Existing tests still pass
- [ ] Documentation updated about required env vars

---

### SECURITY-006: Fix Path Traversal in Screenshots API

**File**: `backend/app/api/screenshots.py`
**Lines**: 195-202
**Severity**: HIGH
**Source**: Copilot Review Issue #5

**Problem**: File paths constructed from `storage_url` without path traversal validation.

**Current Vulnerable Code**:
```python
if screenshot.storage_url.startswith('/screenshots/'):
    relative_path = screenshot.storage_url[len('/screenshots/'):]
else:
    relative_path = screenshot.storage_url

base_dir = Path(__file__).parent.parent.parent  # backend/
file_path = base_dir / "screenshots" / relative_path
```

**Risk**: Attacker could set `storage_url` to `../../../etc/passwd` and access arbitrary files.

**Solution**:
```python
from pathlib import Path

if screenshot.storage_url.startswith('/screenshots/'):
    relative_path = screenshot.storage_url[len('/screenshots/'):]
else:
    relative_path = screenshot.storage_url

base_dir = Path(__file__).parent.parent.parent  # backend/
screenshots_dir = (base_dir / "screenshots").resolve()
file_path = (screenshots_dir / relative_path).resolve()

# CRITICAL: Validate path stays within screenshots directory
if not str(file_path).startswith(str(screenshots_dir)):
    logger.error(f"Path traversal attempt detected: {relative_path}")
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid screenshot path"
    )

if not file_path.exists():
    raise HTTPException(status_code=404, detail="Screenshot not found")
```

**Test Cases**:
```python
def test_path_traversal_blocked():
    """Path traversal attempts should be rejected"""
    # Attempt to access file outside screenshots dir
    response = client.get("/api/screenshots/image/1")
    # After setting storage_url to "../../../etc/passwd"
    assert response.status_code == 400

def test_valid_screenshot_path():
    """Valid screenshot paths should work"""
    # Normal screenshot access should still work
    response = client.get("/api/screenshots/image/1")
    assert response.status_code == 200
```

**Acceptance Criteria**:
- [ ] Path traversal validation added using `.resolve()`
- [ ] Paths outside screenshots dir rejected with 400
- [ ] Normal screenshot access still works
- [ ] Tests for path traversal attempts
- [ ] Error logged but not exposed to user

---

### SECURITY-007: Fix Extension API Base URL Configuration

**File**: `extension/src/shared/api.ts`
**Lines**: 30-35
**Severity**: HIGH
**Source**: Copilot Review Issue #12

**Problem**: Extension uses `process.env.API_BASE_URL` which doesn't work in Chrome extension runtime.

**Current Broken Code**:
```typescript
const API_CONFIG = {
  baseUrl: process.env.API_BASE_URL || "http://localhost:8000",
  // ...
};
```

**Risk**: In production builds, `process.env.API_BASE_URL` is undefined, so extension always uses localhost - breaking all API calls.

**Solution Option 1 (Vite Define)**:

Update `extension/vite.config.ts`:
```typescript
define: {
  "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
  "process.env.API_BASE_URL": JSON.stringify(process.env.API_BASE_URL || "http://localhost:8000"),
},
```

**Solution Option 2 (Use import.meta.env - Recommended)**:

Update `extension/src/shared/api.ts`:
```typescript
const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
};
```

And update `extension/vite.config.ts` to ensure env vars are passed:
```typescript
// No additional config needed - Vite automatically exposes VITE_* vars
```

Create `extension/.env.example`:
```env
VITE_API_URL=http://localhost:8000
```

**Acceptance Criteria**:
- [ ] API base URL configurable via environment variable
- [ ] Works correctly in both development and production builds
- [ ] Extension can connect to production API when built for release
- [ ] `.env.example` documents required variables
- [ ] Build and test to verify API calls work

---

## Ticket Details

### SECURITY-001: Fix XPath Injection Vulnerability

**File**: `extension/src/content/healing/candidateFinder.ts`
**Lines**: 212-223

**Problem**: User text is directly interpolated into XPath queries without sanitization.

**Current Vulnerable Code**:
```typescript
// Lines 212-223
const xpath = options.exact
  ? `//*[normalize-space(text())="${text}"]`  // No escaping!
  : `//*[contains(normalize-space(text()), "${normalizedText}")]`;
```

**Risk**: If `text` contains `"]` or other XPath control characters, it can break out of the string and inject arbitrary XPath expressions.

**Solution**:
1. Create XPath sanitization function that escapes quotes and special chars
2. Use XPath variable binding if available, or escape approach
3. Add unit tests for malicious inputs

**Implementation**:
```typescript
// Create this utility function
function escapeXPathString(str: string): string {
  // If string contains both quotes, use concat()
  if (str.includes("'") && str.includes('"')) {
    const parts = str.split("'");
    return `concat('${parts.join("', \"'\", '")}')`;
  }
  // If contains double quotes, wrap in single quotes
  if (str.includes('"')) {
    return `'${str}'`;
  }
  // Default: wrap in double quotes
  return `"${str}"`;
}

// Then use it:
const escapedText = escapeXPathString(text);
const xpath = options.exact
  ? `//*[normalize-space(text())=${escapedText}]`
  : `//*[contains(normalize-space(text()), ${escapedText})]`;
```

**Test Cases to Add**:
```typescript
describe('XPath injection prevention', () => {
  it('should escape double quotes', () => {
    const text = 'Click "here"';
    // Should not break XPath
  });

  it('should escape single quotes', () => {
    const text = "It's a test";
    // Should not break XPath
  });

  it('should handle XPath injection attempts', () => {
    const malicious = '"] | //*[@class="secret';
    // Should treat as literal text, not XPath
  });
});
```

**Acceptance Criteria**:
- [ ] `escapeXPathString()` utility function created
- [ ] All XPath queries use escaped text
- [ ] Unit tests for quote escaping
- [ ] Unit tests for injection attempts
- [ ] Manual verification with malicious inputs

---

### SECURITY-002: Fix XSS via innerHTML in Walkthrough

**File**: `extension/src/content/walkthrough.ts`
**Lines**: 507, 828, 976, 1078

**Problem**: Admin-controlled labels and instructions are injected via `innerHTML` without sanitization.

**Vulnerable Locations**:

1. **Line 507** - Healing confirmation overlay:
```typescript
confirmOverlay.innerHTML = `
  <div class="healing-confirm-content">
    <h3>Element Location Changed</h3>
    <p>The "${step.field_label}" field appears to have moved.</p>  // UNSAFE
    ...
  </div>
`;
```

2. **Line 828** - Main tooltip:
```typescript
tooltipElement.innerHTML = `
  <div class="tooltip-header">
    <span class="step-indicator">Step ${currentStepIndex + 1} of ${steps.length}</span>
  </div>
  <div class="tooltip-body">
    <p class="field-label">${step.field_label}</p>  // UNSAFE
    <p class="instruction">${step.instruction}</p>   // UNSAFE
  </div>
  ...
`;
```

3. **Line 976** - Error state tooltip
4. **Line 1078** - Completion state tooltip

**Risk**: If admin enters `<script>alert('xss')</script>` as a label, it executes on every user's browser during walkthrough.

**Solution Options**:

**Option A: Use textContent (Recommended for simple text)**
```typescript
// Create elements programmatically
const labelEl = document.createElement('p');
labelEl.className = 'field-label';
labelEl.textContent = step.field_label;  // Safe - no HTML parsing

const instructionEl = document.createElement('p');
instructionEl.className = 'instruction';
instructionEl.textContent = step.instruction;  // Safe
```

**Option B: Use DOMPurify (If HTML formatting needed)**
```typescript
import DOMPurify from 'dompurify';

// Sanitize before injection
const safeLabel = DOMPurify.sanitize(step.field_label);
const safeInstruction = DOMPurify.sanitize(step.instruction);

tooltipElement.innerHTML = `
  <p class="field-label">${safeLabel}</p>
  <p class="instruction">${safeInstruction}</p>
`;
```

**Option C: HTML entity encoding**
```typescript
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

**Recommended Approach**: Option A (textContent) for user-provided text, keep innerHTML only for static HTML structure.

**Refactored Pattern**:
```typescript
function createTooltipElement(step: Step, currentIndex: number, total: number): HTMLElement {
  const tooltip = document.createElement('div');
  tooltip.className = 'walkthrough-tooltip';

  // Static structure is fine with innerHTML
  tooltip.innerHTML = `
    <div class="tooltip-header">
      <span class="step-indicator"></span>
    </div>
    <div class="tooltip-body">
      <p class="field-label"></p>
      <p class="instruction"></p>
    </div>
    <div class="tooltip-actions">
      <button class="btn-back">Back</button>
      <button class="btn-next">Next</button>
    </div>
  `;

  // Dynamic content uses textContent (safe)
  tooltip.querySelector('.step-indicator')!.textContent = `Step ${currentIndex + 1} of ${total}`;
  tooltip.querySelector('.field-label')!.textContent = step.field_label;
  tooltip.querySelector('.instruction')!.textContent = step.instruction;

  return tooltip;
}
```

**Files to Modify**:
- `extension/src/content/walkthrough.ts` - Main file with vulnerabilities
- May want to create `extension/src/content/utils/sanitize.ts` for reusable functions

**Test Cases**:
```typescript
describe('XSS prevention in walkthrough', () => {
  it('should not execute script tags in field_label', () => {
    const step = { field_label: '<script>window.xssTest=true</script>' };
    // Render tooltip
    expect(window.xssTest).toBeUndefined();
  });

  it('should not execute event handlers in instruction', () => {
    const step = { instruction: '<img src=x onerror="window.xssTest=true">' };
    // Render tooltip
    expect(window.xssTest).toBeUndefined();
  });

  it('should display HTML entities as text', () => {
    const step = { field_label: '<b>Bold</b>' };
    // Should show literal "<b>Bold</b>" not bold text
  });
});
```

**Acceptance Criteria**:
- [ ] All 4 innerHTML locations refactored
- [ ] User-provided text uses textContent or sanitization
- [ ] Static HTML structure separated from dynamic content
- [ ] XSS test cases added
- [ ] Visual verification that tooltip still looks correct
- [ ] No TypeScript errors after refactor

---

### SECURITY-003: Fix PostMessage Spoofing Vulnerability

**File**: `extension/src/content/walkthrough.ts`
**Lines**: 1534-1561

**Problem**: The walkthrough listens for `window.postMessage` but only checks `data.source`, not `event.origin`.

**Vulnerable Code**:
```typescript
// Line 1534
window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data;

  // Line 1541 - Only checks data.source, not event.origin!
  if (data.source !== "overlay-dashboard") return;

  if (data.type === "START_WALKTHROUGH") {
    // Attacker can trigger this from any malicious page
    startWalkthrough(data.workflow);
  }
});
```

**Risk**: Any webpage can send a postMessage with `source: "overlay-dashboard"` and trigger walkthrough with crafted data.

**Solution**:
```typescript
// Define allowed origins
const ALLOWED_ORIGINS = [
  'http://localhost:3000',      // Development
  'https://app.yourproduct.com' // Production
];

// Get from environment or config
const DASHBOARD_ORIGIN = process.env.DASHBOARD_URL || 'http://localhost:3000';

window.addEventListener("message", (event: MessageEvent) => {
  // Validate origin FIRST
  if (!ALLOWED_ORIGINS.includes(event.origin)) {
    console.warn(`Blocked message from untrusted origin: ${event.origin}`);
    return;
  }

  const data = event.data;

  // Still check source as secondary validation
  if (data.source !== "overlay-dashboard") return;

  if (data.type === "START_WALKTHROUGH") {
    startWalkthrough(data.workflow);
  }
});
```

**Alternative: Use chrome.runtime.sendMessage**:
If possible, switch from postMessage to Chrome's native messaging which is inherently secure:

```typescript
// In dashboard (if using extension bridge)
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: "START_WALKTHROUGH",
  workflow: workflowData
});

// In extension background script
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // sender.url is verified by Chrome
  if (message.type === "START_WALKTHROUGH") {
    // Forward to content script
  }
});
```

**Files to Modify**:
- `extension/src/content/walkthrough.ts` - Add origin validation
- `extension/src/shared/config.ts` - Define allowed origins (create if needed)
- `dashboard/src/utils/extensionBridge.ts` - Ensure origin is set correctly

**Configuration**:
```typescript
// extension/src/shared/config.ts
export const CONFIG = {
  ALLOWED_DASHBOARD_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5173',  // Vite default
    // Add production URL when deployed
  ],

  isDashboardOrigin(origin: string): boolean {
    return this.ALLOWED_DASHBOARD_ORIGINS.includes(origin);
  }
};
```

**Test Cases**:
```typescript
describe('postMessage origin validation', () => {
  it('should accept messages from allowed origins', () => {
    const event = new MessageEvent('message', {
      origin: 'http://localhost:3000',
      data: { source: 'overlay-dashboard', type: 'START_WALKTHROUGH' }
    });
    // Should process
  });

  it('should reject messages from unknown origins', () => {
    const event = new MessageEvent('message', {
      origin: 'https://evil.com',
      data: { source: 'overlay-dashboard', type: 'START_WALKTHROUGH' }
    });
    // Should be blocked
  });

  it('should reject messages even with correct source from wrong origin', () => {
    // Attacker knows to set source but can't spoof origin
  });
});
```

**Acceptance Criteria**:
- [ ] Origin validation added before processing any postMessage
- [ ] Allowed origins configurable (dev/prod)
- [ ] Warning logged for blocked messages
- [ ] Tests for origin validation
- [ ] Dashboard still works with walkthrough

---

### SECURITY-004: Add Rate Limiting on Auth Endpoints

**Files**:
- `backend/app/api/auth.py` (Lines 17, 61 - signup/login endpoints)
- `backend/app/main.py` (Add middleware)
- `backend/requirements.txt` (Add slowapi)

**Problem**: No rate limiting on `/api/auth/login` and `/api/auth/signup` allows brute force attacks.

**Solution**: Use `slowapi` (FastAPI-compatible rate limiting library)

**Step 1: Install slowapi**
```bash
pip install slowapi
# Add to requirements.txt
```

**Step 2: Configure rate limiter in main.py**
```python
# backend/app/main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

**Step 3: Apply to auth endpoints**
```python
# backend/app/api/auth.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/signup")
@limiter.limit("3/minute")  # 3 signups per minute per IP
async def signup(request: Request, user_data: UserCreate, db: Session = Depends(get_db)):
    # ... existing code
    pass

@router.post("/login")
@limiter.limit("5/minute")  # 5 login attempts per minute per IP
async def login(request: Request, credentials: UserLogin, db: Session = Depends(get_db)):
    # ... existing code
    pass
```

**Step 4: Add rate limit headers**
```python
# Response headers for rate limit info
# slowapi adds these automatically:
# X-RateLimit-Limit: 5
# X-RateLimit-Remaining: 3
# X-RateLimit-Reset: 1234567890
```

**Step 5: Handle rate limit exceeded gracefully**
```python
# Custom handler for better error messages
from fastapi.responses import JSONResponse

async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests. Please try again later.",
                "retry_after": exc.detail
            }
        },
        headers={"Retry-After": str(exc.detail)}
    )

app.add_exception_handler(RateLimitExceeded, custom_rate_limit_handler)
```

**Rate Limit Strategy**:
| Endpoint | Limit | Rationale |
|----------|-------|-----------|
| POST /auth/login | 5/minute | Prevent brute force |
| POST /auth/signup | 3/minute | Prevent mass registration |
| POST /auth/forgot-password | 2/minute | Prevent email spam (future) |
| Other endpoints | 100/minute | General abuse prevention |

**Test Cases**:
```python
# backend/tests/test_rate_limiting.py
import pytest
from fastapi.testclient import TestClient

def test_login_rate_limit():
    """Should block after 5 failed login attempts"""
    for i in range(5):
        response = client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword"
        })

    # 6th attempt should be blocked
    response = client.post("/api/auth/login", json={
        "email": "test@example.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 429
    assert "RATE_LIMIT_EXCEEDED" in response.text

def test_rate_limit_headers():
    """Should include rate limit headers in response"""
    response = client.post("/api/auth/login", json={...})
    assert "X-RateLimit-Limit" in response.headers
    assert "X-RateLimit-Remaining" in response.headers
```

**Acceptance Criteria**:
- [ ] slowapi installed and configured
- [ ] Login limited to 5 attempts/minute/IP
- [ ] Signup limited to 3 attempts/minute/IP
- [ ] 429 response with clear error message
- [ ] Retry-After header included
- [ ] Tests for rate limiting behavior
- [ ] Doesn't break legitimate usage

---

### TEST-002: Add Workflow Service Security Tests

**File**: `backend/app/services/workflow.py`
**New File**: `backend/tests/unit/test_workflow_security.py`

**Problem**: Multi-tenant isolation is critical but untested. A bug could expose one company's workflows to another.

**What to Test**:

1. **Company isolation**: User can only access their company's workflows
2. **Null company_id handling**: Edge case that could bypass filters
3. **SQL injection prevention**: Parameterized queries work correctly

**Test Cases**:
```python
# backend/tests/unit/test_workflow_security.py
import pytest
from app.services.workflow import WorkflowService
from app.models.workflow import Workflow

class TestWorkflowSecurity:

    def test_user_cannot_access_other_company_workflow(self, db_session):
        """Users should only see workflows from their own company"""
        # Setup: Create workflows for two different companies
        company_a = create_company("Company A")
        company_b = create_company("Company B")

        user_a = create_user(company_id=company_a.id)
        user_b = create_user(company_id=company_b.id)

        workflow_a = create_workflow(company_id=company_a.id, name="Secret A")
        workflow_b = create_workflow(company_id=company_b.id, name="Secret B")

        # Test: User A should not see Company B's workflow
        service = WorkflowService(db_session)

        # Get workflow by ID (should fail for wrong company)
        result = service.get_workflow(workflow_b.id, company_id=company_a.id)
        assert result is None, "User should not access other company's workflow"

        # List workflows (should only show own company)
        workflows = service.list_workflows(company_id=company_a.id)
        workflow_ids = [w.id for w in workflows]
        assert workflow_b.id not in workflow_ids
        assert workflow_a.id in workflow_ids

    def test_null_company_id_rejected(self, db_session):
        """Null company_id should not return all workflows"""
        # Create workflows
        workflow = create_workflow(company_id=1, name="Test")

        service = WorkflowService(db_session)

        # Attempt with null company_id
        with pytest.raises(ValueError):
            service.list_workflows(company_id=None)

    def test_negative_company_id_rejected(self, db_session):
        """Negative company_id should be rejected"""
        service = WorkflowService(db_session)

        with pytest.raises(ValueError):
            service.list_workflows(company_id=-1)

    def test_update_workflow_company_isolation(self, db_session):
        """Cannot update workflow belonging to different company"""
        company_a = create_company("Company A")
        company_b = create_company("Company B")

        workflow_b = create_workflow(company_id=company_b.id)

        service = WorkflowService(db_session)

        # Company A tries to update Company B's workflow
        with pytest.raises(PermissionError):
            service.update_workflow(
                workflow_id=workflow_b.id,
                company_id=company_a.id,  # Wrong company
                data={"name": "Hacked!"}
            )

    def test_delete_workflow_company_isolation(self, db_session):
        """Cannot delete workflow belonging to different company"""
        company_a = create_company("Company A")
        company_b = create_company("Company B")

        workflow_b = create_workflow(company_id=company_b.id)

        service = WorkflowService(db_session)

        # Company A tries to delete Company B's workflow
        with pytest.raises(PermissionError):
            service.delete_workflow(
                workflow_id=workflow_b.id,
                company_id=company_a.id
            )

        # Verify workflow still exists
        workflow = db_session.query(Workflow).get(workflow_b.id)
        assert workflow is not None

    def test_sql_injection_in_workflow_name_search(self, db_session):
        """SQL injection attempts should be safely parameterized"""
        service = WorkflowService(db_session)

        # Attempt SQL injection in search
        malicious_name = "'; DROP TABLE workflows; --"

        # Should not crash or delete table
        results = service.search_workflows(
            company_id=1,
            query=malicious_name
        )

        # Verify table still exists
        count = db_session.query(Workflow).count()
        assert count >= 0  # Table exists
```

**Files to Create/Modify**:
- Create: `backend/tests/unit/test_workflow_security.py`
- May need: `backend/tests/fixtures.py` - Test data helpers

**Acceptance Criteria**:
- [ ] Cross-company access tests written
- [ ] Null/invalid company_id tests written
- [ ] CRUD operation isolation tests written
- [ ] SQL injection tests written
- [ ] All tests pass
- [ ] Code coverage for security-critical paths > 90%

---

## Pre-Sprint Checklist

Before starting this sprint, verify:

- [ ] Backend virtual environment active: `source backend/venv/bin/activate`
- [ ] All dependencies installed: `pip install -r requirements.txt`
- [ ] Extension builds: `cd extension && npm run build`
- [ ] Baseline test run: note current pass/fail counts
- [ ] Git branch created: `git checkout -b sprint-1-security`

---

## Definition of Done

The sprint is complete when:

1. [ ] All 5 tickets implemented and tested
2. [ ] No new security vulnerabilities introduced (verify with security checklist)
3. [ ] All existing tests still pass (no regressions)
4. [ ] New tests written for each security fix
5. [ ] Extension builds without errors
6. [ ] Backend starts without errors
7. [ ] Manual verification of each fix
8. [ ] Code reviewed (self-review minimum)
9. [ ] Documentation updated if needed
10. [ ] Changes committed with clear messages

---

## Testing Commands

```bash
# Backend tests
cd backend
source venv/bin/activate
pytest tests/unit/test_workflow_security.py -v  # New security tests
pytest tests/ -v  # All tests

# Extension tests
cd extension
npm test -- --run

# Build verification
cd extension && npm run build
cd backend && python -c "from app.main import app; print('OK')"
```

---

## Rollback Plan

If issues are found after deployment:

1. **XPath fix breaks healing**: Revert `candidateFinder.ts` changes
2. **innerHTML fix breaks UI**: Check CSS classes weren't removed
3. **Rate limiting too aggressive**: Increase limits or disable temporarily
4. **Origin validation breaks dashboard**: Add missing origin to allowed list

---

## Notes for Implementer

1. **Test in isolation first**: Each fix should work independently
2. **Watch for regressions**: Security fixes often break legitimate functionality
3. **Document edge cases**: Note any assumptions made about input data
4. **Consider backwards compatibility**: Old data shouldn't break new code
5. **Error messages**: Don't reveal security details to users (e.g., don't say "rate limited", say "too many requests")
