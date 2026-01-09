# Sprint 2: Test Stability

**Duration**: 3-4 weeks
**Priority**: P1 - Required for confident development
**Dependencies**: None (can run parallel to Sprint 1)
**Parallel Safe**: Yes

---

## Sprint Goal

Fix all failing tests and add critical test coverage for the walkthrough feature. A green test suite enables confident refactoring and feature development.

---

## Tickets (5 tickets)

| ID | Title | Complexity | Est. Hours |
|----|-------|------------|------------|
| TEST-FIX-001 | Fix Failing Backend Tests (14 failures) | Medium | 8-12 |
| TEST-FIX-002 | Fix Failing Extension Tests (37 failures) | Medium | 8-12 |
| TEST-001 | Add Walkthrough Tests (Critical Gap) | High | 16-24 |
| TEST-003 | Test Healing Factor Algorithms | Medium | 8-12 |
| TEST-004 | Add Healing API Integration Tests | Low | 4-6 |

**Total Estimated**: 44-66 hours

---

## Current Test Status

```
Backend:  327 total, ~313 pass, ~14 fail, ~5 errors
Extension: 410 total, 373 pass, 37 fail
Dashboard: 41 total, 41 pass, 0 fail
```

---

## Ticket Details

### TEST-FIX-001: Fix Failing Backend Tests (14 failures)

**Known Failing Areas**:
- `test_ai_service.py` - 5 failures (AI mock/initialization issues)
- `test_auth_api.py` - Auth E2E flow failure
- `test_screenshots_api.py` - 4 failures (unauthorized access, URL generation)
- `test_workflows_api.py` - 3 failures (status assertions, update validation)
- `test_jwt.py` - Token uniqueness test failure
- `test_health_logging.py` - 5 errors (fixture/setup issues)

**Investigation Steps**:

1. **Run tests with verbose output**:
```bash
cd backend
source venv/bin/activate
pytest --tb=long -v 2>&1 | tee test_output.txt
```

2. **Categorize failures**:
   - Mock issues (test setup problem)
   - Real bugs (code problem)
   - Flaky tests (timing/order problem)

**Common Fix Patterns**:

**Pattern A: Mock not configured correctly**
```python
# Problem: AI service not mocked
@pytest.fixture
def mock_ai_service(mocker):
    mock = mocker.patch('app.services.ai.AIService')
    mock.return_value.generate_labels.return_value = {
        'field_label': 'Test Label',
        'instruction': 'Test instruction',
        'confidence': 0.9
    }
    return mock
```

**Pattern B: Database session not isolated**
```python
# Problem: Tests share state
@pytest.fixture(autouse=True)
def reset_db(db_session):
    yield
    db_session.rollback()
```

**Pattern C: Missing fixtures**
```python
# Problem: test_health_logging.py references missing fixture
# Check backend/tests/conftest.py for required fixtures
```

**Files to Investigate**:
- `backend/tests/conftest.py` - Shared fixtures
- `backend/tests/test_ai_service.py` - AI mocking
- `backend/tests/integration/test_auth_api.py` - Auth flow
- `backend/tests/integration/test_screenshots_api.py` - Screenshot tests
- `backend/tests/integration/test_workflows_api.py` - Workflow tests

**Debugging Specific Failures**:

```bash
# Run single test with debugging
pytest backend/tests/test_ai_service.py -v --tb=long -x

# Run with print statements visible
pytest backend/tests/test_ai_service.py -v -s

# Check if order-dependent
pytest backend/tests/ --random-order
```

**Acceptance Criteria**:
- [ ] All 14 failing tests pass
- [ ] All 5 errors resolved
- [ ] `pytest backend/tests/` shows 100% pass
- [ ] No test marked as `@pytest.mark.skip` unless documented

---

### TEST-FIX-002: Fix Failing Extension Tests (37 failures)

**Known Failing Areas**:
- `positionSimilarity.test.ts` - Soft veto logic failures
- `autoHealer.test.ts` - Integration test failures
- `scorer.test.ts` - Scoring algorithm failures

**Root Cause Analysis**:

The failures appear related to position distance thresholds and soft veto logic. Check recent changes to scoring algorithms.

**Test Output Pattern**:
```
FAIL  src/content/healing/factors/__tests__/positionSimilarity.test.ts
  > should apply soft veto for large position changes
    AssertionError: expected 0.58 to be less than 0.5
```

**Investigation Steps**:

1. **Run failing tests only**:
```bash
cd extension
npm test -- --run --reporter=verbose 2>&1 | grep -A5 "FAIL"
```

2. **Check threshold constants**:
```typescript
// extension/src/content/healing/factors/positionSimilarity.ts
// Look for DISTANCE_THRESHOLD, SOFT_VETO_THRESHOLD, etc.
```

3. **Compare expected vs actual values**:
   - Tests expect score < 0.5 when distance > threshold
   - Actual code returns 0.58
   - Either test expectation or algorithm is wrong

**Fix Approach Options**:

**Option A: Fix the algorithm** (if tests reflect correct behavior)
```typescript
// If distance > 200px should score < 0.5
if (distance > LARGE_DISTANCE_THRESHOLD) {
  return Math.max(0, 0.5 - (distance - LARGE_DISTANCE_THRESHOLD) / 1000);
}
```

**Option B: Update test expectations** (if algorithm is correct)
```typescript
// If 0.58 is acceptable for 300px distance
expect(score).toBeLessThan(0.7);  // Relaxed threshold
```

**Option C: Document and skip** (if intentional change)
```typescript
it.skip('should apply soft veto for large position changes', () => {
  // TODO: Behavior intentionally changed in Sprint 3
  // See: https://github.com/your-repo/issues/123
});
```

**Files to Investigate**:
- `extension/src/content/healing/factors/positionSimilarity.ts`
- `extension/src/content/healing/factors/__tests__/positionSimilarity.test.ts`
- `extension/src/content/healing/scorer.ts`
- `extension/src/content/healing/__tests__/scorer.test.ts`
- `extension/src/content/healing/autoHealer.ts`
- `extension/src/content/healing/__tests__/autoHealer.test.ts`

**Verification Commands**:
```bash
cd extension

# Run all tests
npm test -- --run

# Run specific test file
npm test -- --run src/content/healing/factors/__tests__/positionSimilarity.test.ts

# Run with coverage
npm test -- --run --coverage
```

**Acceptance Criteria**:
- [ ] All 37 failing tests pass
- [ ] `npm test -- --run` shows 410/410 pass
- [ ] No tests skipped without documented reason
- [ ] Position similarity logic verified manually

---

### TEST-001: Add Walkthrough Tests (Critical Gap)

**File**: `extension/src/content/walkthrough.ts` (1571 lines)
**New File**: `extension/src/content/__tests__/walkthrough.test.ts`

**Problem**: The largest, most critical file has ZERO tests.

**Why Critical**:
- User-facing feature (walkthroughs)
- Complex DOM manipulation
- Event listener management (memory leak risk)
- State machine logic (step navigation)
- Integration with healing system

**Test Categories to Add**:

#### 1. Initialization Tests
```typescript
describe('Walkthrough Initialization', () => {
  it('should create overlay elements when started', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);

    expect(document.querySelector('.walkthrough-overlay')).toBeTruthy();
    expect(document.querySelector('.walkthrough-tooltip')).toBeTruthy();
  });

  it('should set initial step to 0', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);

    expect(getCurrentStepIndex()).toBe(0);
  });

  it('should highlight first step element', () => {
    const workflow = createMockWorkflow(3);
    document.body.innerHTML = '<button id="step1">Click me</button>';

    startWalkthrough(workflow);

    const element = document.getElementById('step1');
    expect(element?.classList.contains('walkthrough-highlight')).toBe(true);
  });

  it('should throw if workflow has no steps', () => {
    const emptyWorkflow = { steps: [] };

    expect(() => startWalkthrough(emptyWorkflow)).toThrow();
  });
});
```

#### 2. Navigation Tests
```typescript
describe('Step Navigation', () => {
  it('should advance to next step when Next clicked', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);

    clickNextButton();

    expect(getCurrentStepIndex()).toBe(1);
  });

  it('should go back when Back clicked', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);
    goToStep(2);

    clickBackButton();

    expect(getCurrentStepIndex()).toBe(1);
  });

  it('should not go back on first step', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);

    clickBackButton();

    expect(getCurrentStepIndex()).toBe(0);
  });

  it('should show completion on last step', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);
    goToStep(2);

    clickNextButton();

    expect(document.querySelector('.walkthrough-complete')).toBeTruthy();
  });
});
```

#### 3. Cleanup Tests (Memory Leaks)
```typescript
describe('Cleanup and Memory Management', () => {
  it('should remove all elements on exit', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);

    exitWalkthrough();

    expect(document.querySelector('.walkthrough-overlay')).toBeNull();
    expect(document.querySelector('.walkthrough-tooltip')).toBeNull();
  });

  it('should remove event listeners on exit', () => {
    const workflow = createMockWorkflow(3);
    startWalkthrough(workflow);

    const listenerCount = getEventListenerCount(document);
    exitWalkthrough();

    expect(getEventListenerCount(document)).toBeLessThan(listenerCount);
  });

  it('should not leak memory on repeated start/stop', () => {
    for (let i = 0; i < 10; i++) {
      startWalkthrough(createMockWorkflow(3));
      exitWalkthrough();
    }

    expect(document.querySelectorAll('.walkthrough-overlay').length).toBe(0);
  });
});
```

#### 4. Error Handling Tests
```typescript
describe('Error Handling', () => {
  it('should handle missing target element gracefully', () => {
    const workflow = createMockWorkflow(3);
    // Don't add the target element to DOM

    expect(() => startWalkthrough(workflow)).not.toThrow();
    expect(document.querySelector('.walkthrough-error')).toBeTruthy();
  });

  it('should continue if one step fails', () => {
    const workflow = createMockWorkflow(3);
    // Second step's element is missing

    startWalkthrough(workflow);
    clickNextButton(); // Try to go to missing element

    // Should show error but allow skip
    expect(document.querySelector('.btn-skip')).toBeTruthy();
  });
});
```

#### 5. Element Finding Integration
```typescript
describe('Element Finding', () => {
  it('should use primary selector first', () => {
    document.body.innerHTML = '<button id="test-btn">Click</button>';
    const step = {
      selectors: { primary: '#test-btn' }
    };

    const element = findStepElement(step);

    expect(element?.id).toBe('test-btn');
  });

  it('should fallback to CSS selector', () => {
    document.body.innerHTML = '<button class="submit-btn">Submit</button>';
    const step = {
      selectors: {
        primary: '#nonexistent',
        css: '.submit-btn'
      }
    };

    const element = findStepElement(step);

    expect(element?.className).toBe('submit-btn');
  });
});
```

**Test Utilities to Create**:
```typescript
// extension/src/content/__tests__/walkthrough.utils.ts
export function createMockWorkflow(stepCount: number): Workflow {
  return {
    id: 1,
    name: 'Test Workflow',
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: i + 1,
      step_number: i + 1,
      field_label: `Step ${i + 1}`,
      instruction: `Do step ${i + 1}`,
      action_type: 'click',
      selectors: { primary: `#step${i + 1}` }
    }))
  };
}

export function clickNextButton(): void {
  const btn = document.querySelector('.btn-next') as HTMLButtonElement;
  btn?.click();
}

export function clickBackButton(): void {
  const btn = document.querySelector('.btn-back') as HTMLButtonElement;
  btn?.click();
}
```

**Coverage Target**: 60%+ for walkthrough.ts

**Acceptance Criteria**:
- [ ] Test file created with 20+ test cases
- [ ] Initialization tests pass
- [ ] Navigation tests pass
- [ ] Cleanup tests pass
- [ ] Error handling tests pass
- [ ] Element finding tests pass
- [ ] Coverage > 60% for walkthrough.ts

---

### TEST-003: Test Healing Factor Algorithms

**Files**:
- `extension/src/content/healing/factors/textSimilarity.ts` (210 lines)
- `extension/src/content/healing/factors/positionSimilarity.ts` (190 lines)
- `extension/src/content/healing/factors/attributeMatch.ts` (264 lines)
- `extension/src/content/healing/candidateFinder.ts` (300 lines)

**Why Test**:
- Core to auto-healing feature
- Complex algorithms (Levenshtein, position math)
- Edge cases easy to miss
- False positives are worse than misses

**Test Cases for Text Similarity**:
```typescript
// extension/src/content/healing/factors/__tests__/textSimilarity.test.ts
describe('textSimilarity', () => {
  describe('Levenshtein distance', () => {
    it('should return 1.0 for identical strings', () => {
      expect(textSimilarity('Submit', 'Submit')).toBe(1.0);
    });

    it('should return 0.0 for completely different strings', () => {
      expect(textSimilarity('abc', 'xyz')).toBe(0.0);
    });

    it('should handle case insensitivity', () => {
      expect(textSimilarity('Submit', 'SUBMIT')).toBeGreaterThan(0.9);
    });

    it('should handle minor typos', () => {
      expect(textSimilarity('Submit', 'Sumbit')).toBeGreaterThan(0.8);
    });

    it('should handle empty strings', () => {
      expect(textSimilarity('', 'test')).toBe(0.0);
      expect(textSimilarity('test', '')).toBe(0.0);
      expect(textSimilarity('', '')).toBe(1.0);
    });

    it('should handle whitespace normalization', () => {
      expect(textSimilarity('  Submit  ', 'Submit')).toBe(1.0);
    });
  });
});
```

**Test Cases for Position Similarity**:
```typescript
describe('positionSimilarity', () => {
  it('should return 1.0 for same position', () => {
    const original = { x: 100, y: 200, width: 50, height: 30 };
    const candidate = { x: 100, y: 200, width: 50, height: 30 };

    expect(positionSimilarity(original, candidate)).toBe(1.0);
  });

  it('should return high score for small movement', () => {
    const original = { x: 100, y: 200, width: 50, height: 30 };
    const candidate = { x: 110, y: 205, width: 50, height: 30 };

    expect(positionSimilarity(original, candidate)).toBeGreaterThan(0.9);
  });

  it('should return low score for large movement', () => {
    const original = { x: 100, y: 200, width: 50, height: 30 };
    const candidate = { x: 500, y: 600, width: 50, height: 30 };

    expect(positionSimilarity(original, candidate)).toBeLessThan(0.3);
  });

  it('should consider size changes', () => {
    const original = { x: 100, y: 200, width: 50, height: 30 };
    const candidate = { x: 100, y: 200, width: 100, height: 60 };

    expect(positionSimilarity(original, candidate)).toBeLessThan(0.8);
  });

  it('should handle missing bounding box', () => {
    expect(positionSimilarity(null, { x: 100, y: 200 })).toBe(0.5);
  });
});
```

**Test Cases for Attribute Match**:
```typescript
describe('attributeMatch', () => {
  describe('ID stability detection', () => {
    it('should accept stable IDs', () => {
      expect(isStableId('submit-button')).toBe(true);
      expect(isStableId('user-email')).toBe(true);
    });

    it('should reject React dynamic IDs', () => {
      expect(isStableId(':r0:')).toBe(false);
      expect(isStableId(':r123:')).toBe(false);
    });

    it('should reject MUI dynamic IDs', () => {
      expect(isStableId('mui-12345')).toBe(false);
    });

    it('should reject UUID-like IDs', () => {
      expect(isStableId('a1b2c3d4-e5f6-7890')).toBe(false);
    });
  });

  describe('attribute scoring', () => {
    it('should score data-testid highly', () => {
      const original = { 'data-testid': 'submit-btn' };
      const candidate = { 'data-testid': 'submit-btn' };

      expect(attributeScore(original, candidate)).toBeGreaterThan(0.9);
    });

    it('should score matching classes', () => {
      const original = { class: 'btn primary large' };
      const candidate = { class: 'btn primary large' };

      expect(attributeScore(original, candidate)).toBeGreaterThan(0.8);
    });
  });
});
```

**Acceptance Criteria**:
- [ ] textSimilarity tests (10+ cases)
- [ ] positionSimilarity tests (10+ cases)
- [ ] attributeMatch tests (10+ cases)
- [ ] ID stability detection tests (10+ cases)
- [ ] Edge cases covered (empty, null, special chars)
- [ ] All tests pass

---

### TEST-004: Add Healing API Integration Tests

**File**: `backend/app/api/healing.py` (133 lines)
**New File**: `backend/tests/integration/test_healing_api.py`

**Endpoint**: `POST /api/healing/validate`

**Test Cases**:
```python
# backend/tests/integration/test_healing_api.py
import pytest
from fastapi.testclient import TestClient

class TestHealingAPI:

    def test_healing_validate_success(self, client, auth_headers):
        """Should validate healing candidate successfully"""
        response = client.post(
            "/api/healing/validate",
            headers=auth_headers,
            json={
                "workflow_id": 1,
                "step_id": 1,
                "original_screenshot_id": 1,
                "candidates": [
                    {
                        "element_id": "btn-1",
                        "deterministic_score": 0.75,
                        "bounding_box": {"x": 100, "y": 200, "width": 50, "height": 30},
                        "text_content": "Submit",
                        "attributes": {"class": "btn primary"}
                    }
                ]
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert "best_match" in data
        assert "confidence" in data

    def test_healing_validate_no_candidates(self, client, auth_headers):
        """Should return error for empty candidates"""
        response = client.post(
            "/api/healing/validate",
            headers=auth_headers,
            json={
                "workflow_id": 1,
                "step_id": 1,
                "candidates": []
            }
        )

        assert response.status_code == 400

    def test_healing_validate_unauthorized(self, client):
        """Should reject unauthenticated requests"""
        response = client.post(
            "/api/healing/validate",
            json={"workflow_id": 1, "candidates": []}
        )

        assert response.status_code == 401

    def test_healing_fallback_without_ai(self, client, auth_headers, mocker):
        """Should use deterministic scoring when AI unavailable"""
        # Mock AI service to fail
        mocker.patch(
            'app.services.ai.AIService.validate_candidate',
            side_effect=Exception("AI unavailable")
        )

        response = client.post(
            "/api/healing/validate",
            headers=auth_headers,
            json={
                "workflow_id": 1,
                "step_id": 1,
                "candidates": [{"deterministic_score": 0.8}]
            }
        )

        # Should still succeed with deterministic fallback
        assert response.status_code == 200
        data = response.json()
        assert data["method"] == "deterministic"

    def test_healing_logs_result(self, client, auth_headers, db_session):
        """Should log healing event to health_logs"""
        response = client.post(
            "/api/healing/validate",
            headers=auth_headers,
            json={
                "workflow_id": 1,
                "step_id": 1,
                "candidates": [{"deterministic_score": 0.9}]
            }
        )

        # Check log was created
        from app.models.health_log import HealthLog
        log = db_session.query(HealthLog).filter_by(
            workflow_id=1,
            status="healed_deterministic"
        ).first()

        assert log is not None
```

**Acceptance Criteria**:
- [ ] Success case tested
- [ ] Empty candidates error tested
- [ ] Auth required tested
- [ ] AI fallback tested
- [ ] Health logging tested
- [ ] All tests pass

---

## Pre-Sprint Checklist

Before starting:

- [ ] Run current tests to establish baseline
- [ ] Note exact failure counts:
  - Backend: ___ pass, ___ fail
  - Extension: ___ pass, ___ fail
- [ ] Git branch: `git checkout -b sprint-2-test-stability`
- [ ] Environment setup verified

---

## Test Commands Reference

```bash
# Backend
cd backend && source venv/bin/activate
pytest                              # All tests
pytest -v                           # Verbose
pytest --tb=long                    # Long tracebacks
pytest -x                           # Stop on first failure
pytest tests/unit/                  # Unit tests only
pytest tests/integration/           # Integration only
pytest --cov=app --cov-report=html  # With coverage

# Extension
cd extension
npm test -- --run                   # All tests
npm test -- --run -t "walkthrough"  # Filter by name
npm test -- --run --coverage        # With coverage
npm test -- --watch                 # Watch mode

# Dashboard
cd dashboard
npm test -- --run                   # All tests
```

---

## Definition of Done

1. [ ] Backend: 327/327 tests pass (0 failures)
2. [ ] Extension: 410/410 tests pass (0 failures)
3. [ ] New walkthrough tests: 20+ test cases
4. [ ] New healing tests: 30+ test cases
5. [ ] Coverage improved (document before/after)
6. [ ] No tests skipped without documented reason
7. [ ] All builds pass
8. [ ] Changes committed
