# Testing Strategy

Comprehensive testing approach for the Workflow Automation Platform.

---

## Testing Philosophy

- **Test-Driven Development**: Write tests alongside implementation
- **Coverage Goal**: >80% for business logic, >60% overall
- **Pyramid Approach**: Many unit tests, fewer integration tests, minimal E2E tests
- **CI/CD Ready**: Tests should run automatically (post-MVP)

---

## Testing Stack

### Backend (Python/FastAPI)
- **pytest** - Test framework
- **pytest-asyncio** - Async test support
- **httpx** - API client for integration tests
- **pytest-cov** - Coverage reporting
- **factory-boy** - Test data factories (future)

### Frontend (TypeScript/React)
- **Vitest** - Test framework (Vite-native)
- **React Testing Library** - Component testing
- **MSW (Mock Service Worker)** - API mocking
- **Playwright** - E2E testing (future)

---

## Test Organization

### Backend Tests
```
packages/backend/tests/
├── unit/                   # Unit tests (fast, isolated)
│   ├── test_models.py
│   ├── test_services.py
│   └── test_utils.py
├── integration/            # Integration tests (DB, API)
│   ├── test_auth_api.py
│   ├── test_workflows_api.py
│   └── test_screenshots_api.py
└── conftest.py            # Pytest fixtures
```

### Extension Tests
```
packages/extension/tests/
├── unit/
│   ├── recorder.test.ts
│   ├── selectors.test.ts
│   └── api-client.test.ts
└── integration/
    └── recording-flow.test.ts
```

### Dashboard Tests
```
packages/dashboard/tests/
├── unit/
│   ├── components/
│   └── hooks/
└── integration/
    └── auth-flow.test.ts
```

---

## Testing Guidelines by Layer

### Unit Tests
**What to test**:
- Business logic functions
- Data transformations
- Validation logic
- Utility functions
- Selectors and parsers

**What NOT to test**:
- Third-party libraries
- Simple getters/setters
- Pure UI components with no logic

**Example (Backend)**:
```python
# tests/unit/test_services.py
import pytest
from app.services.auth import hash_password, verify_password

def test_password_hashing():
    password = "SecurePass123"
    hashed = hash_password(password)

    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("wrong", hashed) is False
```

**Example (Frontend)**:
```typescript
// tests/unit/selectors.test.ts
import { describe, it, expect } from 'vitest';
import { extractSelectors } from '@/content/utils/selectors';

describe('extractSelectors', () => {
  it('should extract ID selector', () => {
    const element = document.createElement('button');
    element.id = 'submit-btn';

    const selectors = extractSelectors(element);

    expect(selectors.primary).toBe('#submit-btn');
  });
});
```

---

### Integration Tests
**What to test**:
- API endpoints (request → response)
- Database operations
- Authentication flows
- Multi-step workflows

**Backend Integration Test Example**:
```python
# tests/integration/test_auth_api.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_signup_success():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/auth/signup", json={
            "email": "test@example.com",
            "password": "SecurePass123",
            "name": "Test User",
            "company_invite_token": "test-token"
        })

        assert response.status_code == 200
        data = response.json()
        assert "token" in data["data"]
        assert data["data"]["user"]["email"] == "test@example.com"

@pytest.mark.asyncio
async def test_login_invalid_credentials():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post("/api/auth/login", json={
            "email": "test@example.com",
            "password": "WrongPassword"
        })

        assert response.status_code == 401
        assert "error" in response.json()
```

**Frontend Integration Test Example**:
```typescript
// tests/integration/auth-flow.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import LoginPage from '@/pages/Login';

const server = setupServer(
  rest.post('/api/auth/login', (req, res, ctx) => {
    return res(ctx.json({
      data: {
        token: 'test-token',
        user: { email: 'test@example.com' }
      }
    }));
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Login Flow', () => {
  it('should login successfully', async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' }
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' }
    });

    fireEvent.click(screen.getByText('Login'));

    await waitFor(() => {
      expect(localStorage.getItem('token')).toBe('test-token');
    });
  });
});
```

---

### E2E Tests (Future)
**What to test**:
- Critical user journeys
- Full workflow: record → label → walkthrough
- Cross-browser compatibility
- Extension installation and permissions

**When to add**: After Sprint 2-3, when core features stable

---

## Test Data Management

### Backend Fixtures (pytest)
```python
# tests/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base import Base
from app.models import Company, User

@pytest.fixture
def db_session():
    """Create test database session."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    yield session

    session.close()
    Base.metadata.drop_all(engine)

@pytest.fixture
def test_company(db_session):
    """Create test company."""
    company = Company(
        name="Test Corp",
        invite_token="test-token-123"
    )
    db_session.add(company)
    db_session.commit()
    return company

@pytest.fixture
def test_user(db_session, test_company):
    """Create test user."""
    user = User(
        company_id=test_company.id,
        email="test@example.com",
        password_hash="hashed_password",
        role="admin"
    )
    db_session.add(user)
    db_session.commit()
    return user
```

---

## Running Tests

### Backend Tests
```bash
cd packages/backend
source venv/bin/activate

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_auth.py

# Run specific test
pytest tests/unit/test_auth.py::test_password_hashing

# View coverage report
open htmlcov/index.html
```

### Frontend Tests
```bash
cd packages/extension  # or packages/dashboard

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test -- selectors.test.ts
```

---

## Coverage Targets

### By Component
- **Business Logic**: >80% coverage (critical)
- **API Endpoints**: >70% coverage
- **Utilities**: >80% coverage
- **UI Components**: >60% coverage (focus on logic, not styling)
- **Integration Flows**: >50% coverage

### Overall
- **Sprint 1 Target**: >60% overall
- **Sprint 3 Target**: >70% overall
- **Production Target**: >75% overall

---

## Testing Checklist for New Features

Before marking a ticket as complete:
- [ ] Unit tests written for business logic
- [ ] Integration tests for API endpoints (if applicable)
- [ ] Edge cases covered (null, empty, invalid inputs)
- [ ] Error cases tested (400, 401, 404, 500)
- [ ] All tests passing locally
- [ ] Coverage maintained or improved
- [ ] No console errors/warnings in tests

---

## Continuous Integration (Future)

When implementing CI/CD:
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      - run: cd packages/backend && pip install -r requirements.txt
      - run: cd packages/backend && pytest --cov

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: cd packages/extension && npm test
      - run: cd packages/dashboard && npm test
```

---

## Debugging Failed Tests

### Backend
```bash
# Run with verbose output
pytest -v

# Run with print statements
pytest -s

# Run with debugger
pytest --pdb

# Run last failed tests
pytest --lf
```

### Frontend
```bash
# Run with UI (Vitest)
npm run test:ui

# Debug specific test
npm test -- --reporter=verbose selectors.test.ts
```

---

## Mocking Strategy

### Backend Mocks
- **Database**: Use in-memory SQLite for tests
- **External APIs**: Mock with pytest-mock or responses library
- **S3**: Mock boto3 calls with moto library
- **Redis**: Use fakeredis library

### Frontend Mocks
- **API Calls**: Use MSW (Mock Service Worker)
- **Chrome APIs**: Create mock chrome object
- **IndexedDB**: Use fake-indexeddb library

**Example Mock (Extension)**:
```typescript
// tests/mocks/chrome.ts
export const mockChrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    }
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    }
  },
  tabs: {
    captureVisibleTab: vi.fn(),
  }
};

// In test setup
globalThis.chrome = mockChrome as any;
```

---

## Performance Testing (Future)

When optimizing:
- Load testing: Use Locust or K6 for API endpoints
- Frontend performance: Use Lighthouse CI
- Memory profiling: Chrome DevTools for extension
- Database query analysis: SQLAlchemy query profiling

---

## Security Testing (Future)

- SQL injection tests (should be blocked by SQLAlchemy)
- XSS tests (should be blocked by React escaping)
- Authentication bypass attempts
- CSRF protection validation
- Rate limiting tests

---

## Test Maintenance

- Review and update tests when requirements change
- Remove obsolete tests
- Keep test data realistic but minimal
- Document complex test scenarios
- Refactor tests alongside production code
