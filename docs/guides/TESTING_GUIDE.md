# Testing Guide

This guide covers testing procedures for the Workflow Automation Platform.

## Table of Contents

1. [Test Organization](#test-organization)
2. [Running Tests](#running-tests)
3. [End-to-End Testing Scenarios](#end-to-end-testing-scenarios)
4. [Manual Testing Checklist](#manual-testing-checklist)
5. [Test Data and Fixtures](#test-data-and-fixtures)

---

## Test Organization

### Backend Tests (`backend/tests/`)

```
backend/tests/
├── unit/                    # Focused unit/security tests
│   ├── test_jwt.py
│   ├── test_permissions.py
│   └── test_security.py
├── integration/             # API endpoint integration tests
│   ├── test_auth_api.py
│   ├── test_company_api.py
│   └── test_invites_api.py
├── test_ai_service.py       # AI service behavior tests
├── test_steps_api.py        # Step API behavior tests
└── conftest.py              # Shared fixtures
```

### Extension Tests (`extension/src/**/__tests__/`)

```
extension/src/
├── content/__tests__/
│   ├── feedback.test.ts      # Feedback overlay tests
│   ├── widget.test.ts        # Widget component tests
│   ├── walkthrough.test.ts   # Walkthrough mode tests
│   └── utils/
│       ├── selectors.test.ts
│       └── elementFinder.test.ts
├── shared/__tests__/
│   ├── api.test.ts           # API client tests
│   └── storage.test.ts       # Storage utility tests
└── content/healing/__tests__/
    ├── autoHealer.test.ts    # Auto-healing tests
    ├── textSimilarity.test.ts
    ├── positionSimilarity.test.ts
    ├── attributeMatch.test.ts
    └── candidateFinder.test.ts
```

### Dashboard Tests (`dashboard/src/**/*.test.ts`)

```
dashboard/src/
├── utils/
│   ├── permissions.test.ts
│   ├── validation.test.ts
│   ├── workflowHealth.test.ts
│   └── (additional utility tests)
└── components/
    └── (component tests as needed)
```

---

## Running Tests

### Backend Tests

```bash
cd backend

# Run all tests
./venv/bin/python -m pytest

# Run with verbose output
./venv/bin/python -m pytest -v

# Run specific test file
./venv/bin/python -m pytest tests/integration/test_auth_api.py

# Run tests matching pattern
./venv/bin/python -m pytest -k "test_login"

# Run with coverage
./venv/bin/python -m pytest --cov=app --cov-report=html

# Run only unit tests
./venv/bin/python -m pytest tests/unit/

# Run only integration tests
./venv/bin/python -m pytest tests/integration/
```

### Live External API Tests (Opt-In)

`backend/tests/test_anthropic_api.py` makes real network calls to Anthropic and is disabled by default.

```bash
cd backend
RUN_LIVE_ANTHROPIC_TESTS=1 ./venv/bin/python -m pytest tests/test_anthropic_api.py -v
```

### Extension Tests

```bash
cd extension

# Run all tests
npm test

# Run in watch mode (re-runs on file changes)
npm test -- --watch

# Run specific test file
npm test -- src/content/__tests__/walkthrough.test.ts

# Run with coverage report
npm test -- --coverage

# Run tests matching pattern
npm test -- -t "should find element"
```

### Dashboard Tests

```bash
cd dashboard

# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### All Tests (CI Pipeline)

```bash
# From project root
cd backend && ./venv/bin/python -m pytest && cd ..
cd extension && npm test && cd ..
cd dashboard && npm test && cd ..
```

---

## End-to-End Testing Scenarios

### Scenario 1: Complete Recording Flow

**Preconditions:**
- All services running (backend, dashboard, Celery, extension loaded)
- User logged into dashboard

**Steps:**

1. **Start Recording**
   - Click extension icon
   - Click "Start Recording"
   - Verify recording indicator appears

2. **Perform Actions**
   - Navigate to test website (e.g., https://example.com)
   - Click a button or link
   - Type text into an input field
   - Submit a form

3. **Stop Recording**
   - Click extension icon
   - Click "Stop Recording"
   - Verify "Saving..." indicator

4. **Verify Upload**
   - Open dashboard
   - New workflow should appear in list
   - Status should be "processing"

5. **Verify AI Labeling**
   - Wait for Celery to process (check worker logs)
   - Refresh dashboard
   - Status should change to "draft" or "active"
   - Click workflow to view steps
   - Each step should have AI-generated label and instruction

**Expected Results:**
- [ ] Recording captures all actions
- [ ] Screenshots attached to each step
- [ ] AI generates meaningful labels
- [ ] Workflow appears in dashboard

---

### Scenario 2: Walkthrough Execution

**Preconditions:**
- Recorded workflow with "active" status
- Extension loaded

**Steps:**

1. **Start Walkthrough**
   - Click extension icon
   - Select workflow from list
   - Click "Start Walkthrough"

2. **Follow Steps**
   - Verify overlay highlights correct element
   - Verify instruction text is clear
   - Complete the action
   - Click "Next" or wait for auto-advance

3. **Complete Walkthrough**
   - Follow all steps
   - Verify completion message

**Expected Results:**
- [ ] Each step highlights correct element
- [ ] Instructions match recorded actions
- [ ] Navigation (next/back/skip) works
- [ ] Completion tracked in dashboard

---

### Scenario 3: Auto-Healing (Element Changed)

**Preconditions:**
- Recorded workflow on a website
- Website has changed (element moved or renamed)

**Steps:**

1. **Trigger Healing**
   - Start walkthrough
   - When original selector fails, observe healing attempt

2. **Verify Healing**
   - Watch for healing indicator
   - Check if alternative element is found
   - Verify the healed element is correct

3. **Check Logs**
   - Review browser console for healing logs
   - Check backend for healing API calls

**Expected Results:**
- [ ] Healing triggers when element not found
- [ ] Candidate elements are scored
- [ ] AI validation called for uncertain cases
- [ ] Correct element identified

---

### Scenario 4: Multi-Tenant Isolation

**Preconditions:**
- Two user accounts in different companies

**Steps:**

1. **Create Workflow with User A**
   - Log in as User A (Company 1)
   - Record a workflow

2. **Attempt Access with User B**
   - Log in as User B (Company 2)
   - Try to access User A's workflow via API:
     ```bash
     curl -H "Authorization: Bearer $USER_B_TOKEN" \
       http://localhost:8000/api/workflows/{workflow_id}
     ```

3. **Verify Isolation**
   - Should receive 404 Not Found
   - No data leakage

**Expected Results:**
- [ ] User B cannot see User A's workflows
- [ ] API returns 404 (not 403) to prevent enumeration
- [ ] Dashboard only shows own company's data

---

### Scenario 5: Step Management

**Preconditions:**
- Existing workflow with multiple steps

**Steps:**

1. **Edit Step Labels**
   - Open workflow in dashboard
   - Click edit on a step
   - Change field label and instruction
   - Save changes

2. **Reorder Steps**
   - Drag a step to new position
   - Verify order updates

3. **Delete Step**
   - Delete a step (not the last one)
   - Verify remaining steps renumber correctly

**Expected Results:**
- [ ] Labels can be edited
- [ ] Edit tracking (edited_by, edited_at) recorded
- [ ] Steps can be reordered via drag-and-drop
- [ ] Deleting a step renumbers remaining steps

---

## Manual Testing Checklist

### Authentication

- [ ] Signup with new company works
- [ ] Signup with invite token joins existing company
- [ ] Login returns valid JWT token
- [ ] Expired token rejected with 401
- [ ] Invalid token rejected with 401
- [ ] Password validation enforced (min 8 chars)

### Recording

- [ ] Extension popup shows login state correctly
- [ ] Start/Stop recording buttons work
- [ ] Click events captured with correct element info
- [ ] Input events captured (but values may be masked)
- [ ] Page navigation captured
- [ ] Screenshots taken at each step
- [ ] Recording indicator visible during recording

### Dashboard

- [ ] Workflow list loads and paginates
- [ ] Workflow detail shows all steps
- [ ] Step screenshots load correctly
- [ ] Edit step modal works
- [ ] Delete workflow works (with confirmation)
- [ ] Health status badges accurate

### Walkthrough

- [ ] Overlay appears on correct element
- [ ] Instruction panel readable
- [ ] Next/Back/Skip navigation works
- [ ] Escape key exits walkthrough
- [ ] Progress indicator accurate
- [ ] Completion logged to backend

### Auto-Healing

- [ ] Fallback selectors tried when primary fails
- [ ] AI validation called for uncertain matches
- [ ] Healing events logged
- [ ] Healed selectors saved for future use

---

## Test Data and Fixtures

### Backend Fixtures (`backend/tests/conftest.py`)

```python
@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash=hash_password("password123"),
        name="Test User",
        company_id=1,
        role="admin"
    )
    db_session.add(user)
    db_session.commit()
    return user

@pytest.fixture
def auth_headers(test_user):
    """Get authorization headers with valid token."""
    token = create_access_token({
        "user_id": test_user.id,
        "company_id": test_user.company_id,
        "role": test_user.role,
        "email": test_user.email
    })
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def test_workflow(db_session, test_user):
    """Create a test workflow with steps."""
    workflow = Workflow(
        company_id=test_user.company_id,
        created_by=test_user.id,
        name="Test Workflow",
        starting_url="https://example.com"
    )
    db_session.add(workflow)
    db_session.commit()
    return workflow
```

### Extension Test Utilities

```typescript
// Mock Chrome APIs
vi.mock('webextension-polyfill', () => ({
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() }
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined)
    }
  }
}));

// Create mock step
function createMockStep(overrides = {}): Step {
  return {
    id: 1,
    workflow_id: 1,
    step_number: 1,
    action_type: 'click',
    selectors: { primary: '#button' },
    element_meta: { tagName: 'button', text: 'Click me' },
    page_context: { url: 'https://example.com', title: 'Test' },
    field_label: 'Submit Button',
    instruction: 'Click the submit button',
    ...overrides
  };
}
```

### Sample API Requests

```bash
# Create workflow
curl -X POST http://localhost:8000/api/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Workflow",
    "starting_url": "https://example.com",
    "steps": [{
      "step_number": 1,
      "timestamp": 1000,
      "action_type": "click",
      "selectors": {"primary": "#button"},
      "element_meta": {"tagName": "button", "text": "Click"},
      "page_context": {"url": "https://example.com", "title": "Test"}
    }]
  }'

# Upload screenshot
curl -X POST http://localhost:8000/api/screenshots \
  -H "Authorization: Bearer $TOKEN" \
  -F "workflow_id=1" \
  -F "image=@screenshot.png"

# Get workflow
curl http://localhost:8000/api/workflows/1 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Debugging Tips

### Backend Debugging

```python
# Add to test file for debugging
import logging
logging.basicConfig(level=logging.DEBUG)

# Print SQL queries
import sqlalchemy
sqlalchemy.engine.echo = True
```

### Extension Debugging

```typescript
// Enable verbose logging
console.log('[Walkthrough]', 'Step:', step);
console.log('[Healing]', 'Candidates:', candidates);

// Chrome DevTools
// 1. Go to chrome://extensions
// 2. Click "Inspect views: service worker"
// 3. Check Console for background logs
```

### Common Issues

1. **Tests fail with "401 Unauthorized"**
   - Check that `auth_headers` fixture is being used
   - Verify JWT_SECRET_KEY is set in test environment

2. **Extension tests hang**
   - Mock all Chrome APIs before importing modules
   - Use `vi.useFakeTimers()` for timeout-based code

3. **Database tests interfere with each other**
   - Ensure each test uses fresh database/transaction
   - Use `db_session.rollback()` in teardown

4. **Celery tasks don't run in tests**
   - Mock Celery tasks or use `CELERY_TASK_ALWAYS_EAGER=True`
