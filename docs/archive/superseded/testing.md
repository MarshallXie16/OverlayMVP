# Testing Guide

Comprehensive testing guide for the Workflow Automation Platform.

---

## Quick Start Testing

**Estimated Time:** 30-45 minutes for full setup and E2E testing

### Prerequisites
- Python 3.11+ (`python --version`)
- Node.js 18+ (`node --version`)
- Google Chrome (for extension)

### Setup & Run
```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # http://localhost:8000

# Dashboard (new terminal)
cd dashboard
npm install && npm run dev  # http://localhost:3000

# Extension (new terminal)
cd extension
npm install && npm run build
# Load unpacked from chrome://extensions/ → extension/dist/
```

### Verify
1. Backend: http://localhost:8000/docs (Swagger UI)
2. Dashboard: http://localhost:3000 (Login page)
3. Extension: Click icon in Chrome toolbar

---

## Testing Philosophy

- **Test-Driven Development**: Write tests alongside implementation
- **Coverage Goal**: >80% for business logic, >60% overall
- **Pyramid Approach**: Many unit tests, fewer integration tests, minimal E2E tests
- **Fast Feedback**: Tests should run in seconds, not minutes

---

## Testing Stack

### Backend (Python/FastAPI)
- **pytest** - Test framework
- **pytest-asyncio** - Async test support
- **httpx** - API client for integration tests
- **pytest-cov** - Coverage reporting

### Extension (TypeScript)
- **Vitest** - Test framework (Vite-native)
- **JSDOM** - DOM simulation
- **@testing-library** - Component testing utilities

### Dashboard (React)
- **Vitest** - Test framework
- **React Testing Library** - Component testing
- **MSW (Mock Service Worker)** - API mocking

---

## Test Organization

### Backend Tests
```
backend/tests/
├── unit/                      # Unit tests (fast, isolated)
│   ├── test_models.py
│   ├── test_services.py
│   └── test_utils.py
├── integration/               # Integration tests (DB, API)
│   ├── test_auth_api.py
│   ├── test_workflows_api.py
│   └── test_screenshots_api.py
└── conftest.py               # Pytest fixtures
```

**Run backend tests:**
```bash
cd backend
source venv/bin/activate
pytest                        # All tests
pytest tests/unit/           # Unit tests only
pytest tests/integration/    # Integration tests only
pytest --cov=app            # With coverage
```

### Extension Tests
```
extension/src/
├── content/__tests__/         # Content script tests
│   ├── recorder.test.ts
│   ├── widget.test.ts
│   └── utils/
│       └── selectors.test.ts
├── shared/__tests__/          # Shared code tests
│   ├── api.test.ts
│   └── storage.test.ts
└── popup/__tests__/           # Popup UI tests (future)
```

**Run extension tests:**
```bash
cd extension
npm test                      # All tests
npm test -- recorder         # Specific test file
npm test -- --coverage       # With coverage
```

### Dashboard Tests
```
dashboard/src/
├── components/__tests__/      # Component tests
├── hooks/__tests__/           # Hook tests
└── api/__tests__/             # API client tests
```

**Run dashboard tests:**
```bash
cd dashboard
npm test
```

---

## End-to-End Testing

### Scenario 1: User Registration & Login

**Setup:**
```bash
# Ensure backend and dashboard are running
cd backend && uvicorn app.main:app --reload
cd dashboard && npm run dev
```

**Steps:**
1. Navigate to http://localhost:3000
2. Click "Sign up"
3. Fill form:
   - Email: `test@example.com`
   - Password: `Test123!`
   - Company Name: `Test Corp`
4. Click "Create Account"

**Expected:**
- ✅ Redirected to dashboard
- ✅ User appears in database
- ✅ JWT token stored in localStorage

**Verify:**
```bash
# Check database
cd backend
sqlite3 app.db
SELECT * FROM users WHERE email='test@example.com';
SELECT * FROM companies WHERE name='Test Corp';
```

---

### Scenario 2: Workflow Recording

**Setup:**
1. Login to dashboard (http://localhost:3000)
2. Extension loaded in Chrome
3. Navigate to http://localhost:3000/login (test page)

**Steps:**
1. Click extension icon → "Start Recording"
2. Enter workflow name: "Test Login"
3. Click "Start"
4. On page:
   - Fill email
   - Fill password
   - Check "Remember me"
   - Click "Sign in"
5. Click "Stop" in recording widget

**Expected:**
- ✅ Widget shows step count incrementing
- ✅ Success message: "Workflow uploaded successfully"
- ✅ Workflow appears in dashboard
- ✅ ~4 steps recorded (not 13)

**Verify:**
```bash
# Check database
sqlite3 backend/app.db
SELECT id, name, step_count FROM workflows ORDER BY id DESC LIMIT 1;
SELECT step_number, action_type FROM steps WHERE workflow_id = (SELECT MAX(id) FROM workflows);
```

**Expected step types:**
```
1 | input_commit  # Email
2 | input_commit  # Password
3 | click         # Checkbox (from change event)
4 | submit        # Form
```

---

### Scenario 3: View Workflow Details

**Steps:**
1. Navigate to dashboard (http://localhost:3000/dashboard)
2. Click on "Test Login" workflow
3. View workflow details page

**Expected:**
- ✅ Workflow name displayed
- ✅ Step count correct
- ✅ Steps listed in order
- ✅ Screenshots visible (if captured)
- ✅ Selectors and metadata shown

---

## Unit Testing Examples

### Backend: Testing Workflow Service

```python
# backend/tests/unit/test_workflow_service.py
import pytest
from app.services.workflow import create_workflow
from app.schemas.workflow import CreateWorkflowRequest, StepCreate

@pytest.mark.asyncio
async def test_create_workflow_validates_steps(db_session, test_user):
    """Should reject workflow with no steps."""
    request = CreateWorkflowRequest(
        name="Empty Workflow",
        starting_url="http://example.com",
        steps=[]  # Empty!
    )
    
    with pytest.raises(ValueError, match="at least one step"):
        await create_workflow(db_session, test_user.id, request)
```

### Extension: Testing Event Deduplicator

```typescript
// extension/src/content/__tests__/event-deduplicator.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EventDeduplicator } from '../utils/event-deduplicator';

describe('EventDeduplicator', () => {
  it('should suppress checkbox label click', () => {
    const deduplicator = new EventDeduplicator();
    const recorded: any[] = [];
    
    const label = document.createElement('label');
    label.setAttribute('for', 'test-checkbox');
    
    const clickEvent = new MouseEvent('click');
    
    // Should not record (waits for change event)
    deduplicator.addEvent(clickEvent, label, 'click', (e, el) => {
      recorded.push({ type: e.type, element: el });
    });
    
    // Wait for buffer
    await new Promise(resolve => setTimeout(resolve, 150));
    
    expect(recorded.length).toBe(0);  // Suppressed
  });
});
```

---

## Integration Testing Best Practices

### 1. Use Test Fixtures
```python
# backend/tests/conftest.py
@pytest.fixture
async def test_workflow(db_session, test_user):
    """Create a test workflow."""
    workflow = Workflow(
        name="Test Workflow",
        user_id=test_user.id,
        starting_url="http://example.com"
    )
    db_session.add(workflow)
    await db_session.commit()
    return workflow
```

### 2. Clean Up After Tests
```python
@pytest.fixture(autouse=True)
async def cleanup_db(db_session):
    """Clean up database after each test."""
    yield
    await db_session.rollback()
```

### 3. Mock External Services
```typescript
// Mock Anthropic API
vi.mock('@/api/anthropic', () => ({
  labelStep: vi.fn().mockResolvedValue({
    label: 'Click Login Button',
    confidence: 0.95
  })
}));
```

---

## Troubleshooting

### Backend Tests Fail

**Issue:** `ModuleNotFoundError: No module named 'app'`  
**Fix:** Ensure virtual environment is activated and dependencies installed
```bash
source venv/bin/activate
pip install -r requirements.txt
```

**Issue:** Database errors  
**Fix:** Reset test database
```bash
rm app.db
alembic upgrade head
```

### Extension Tests Fail

**Issue:** `Cannot find module '@/...'`  
**Fix:** Check `vite.config.ts` alias configuration
```typescript
resolve: {
  alias: {
    '@': resolve(__dirname, 'src'),
  },
}
```

**Issue:** DOM not available  
**Fix:** Ensure vitest config has jsdom environment
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

### E2E Tests Fail

**Issue:** Extension not loading  
**Fix:** Rebuild and reload
```bash
cd extension
npm run build
# Then reload in chrome://extensions/
```

**Issue:** Backend 404 errors  
**Fix:** Ensure backend is running on correct port
```bash
uvicorn app.main:app --reload --port 8000
```

**Issue:** CORS errors  
**Fix:** Check backend CORS configuration in `app/main.py`

---

## Test Coverage Goals

### Current Coverage (Sprint 1)
- Backend: ~70% (54 tests)
- Extension: ~60% (12 tests)
- Dashboard: ~40% (8 tests)

### Target Coverage (Sprint 2)
- Backend: >80%
- Extension: >70%
- Dashboard: >60%

### Running Coverage Reports

**Backend:**
```bash
cd backend
pytest --cov=app --cov-report=html
open htmlcov/index.html
```

**Extension:**
```bash
cd extension
npm test -- --coverage
open coverage/index.html
```

---

## Continuous Integration (Future)

### GitHub Actions Workflow
```yaml
name: Tests
on: [push, pull_request]
jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      - run: cd backend && pip install -r requirements.txt
      - run: cd backend && pytest --cov
  
  extension-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd extension && npm install
      - run: cd extension && npm test
```

---

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Chrome Extension Testing](https://developer.chrome.com/docs/extensions/mv3/tut_testing/)
