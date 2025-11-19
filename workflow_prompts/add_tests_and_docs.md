# Testing & Documentation Creation Workflow

You are creating comprehensive tests and documentation for features that may be missing proper coverage. Your goal is to ensure reliability through testing and maintainability through clear documentation.

## Phase 1: Coverage Assessment

### 1.1 Identify Testing Gaps
```bash
# Run coverage report
npm test -- --coverage
pytest --cov --cov-report=term-missing

# Find untested files
find . -name "*.py" -o -name "*.js" | while read f; do
  test_file="${f%.*}.test${f##*.}"
  [ ! -f "$test_file" ] && echo "Missing tests: $f"
done
```

### 1.2 Priority Matrix for Testing
Prioritize testing based on:

| Priority | Criteria | Examples |
|----------|----------|----------|
| P0 | Business-critical, high complexity | Payment processing, auth, data mutations |
| P1 | User-facing, moderate complexity | API endpoints, form validations |
| P2 | Internal utilities, simple logic | Helpers, formatters, converters |
| P3 | UI components, static content | Display components, constants |

### 1.3 Documentation Gaps Analysis
Check for missing documentation:
- [ ] README.md exists and is current
- [ ] API documentation for all endpoints
- [ ] Function/class docstrings for public methods
- [ ] Architecture diagrams for complex systems
- [ ] Configuration documentation
- [ ] Deployment procedures
- [ ] Troubleshooting guides

## Phase 2: Test Planning & Strategy

### 2.1 Test Pyramid Strategy
```
         /\
        /  \        E2E Tests (5-10%)
       /    \       - Critical user journeys
      /──────\      
     /        \     Integration Tests (20-30%)
    /          \    - API endpoints, DB operations
   /────────────\   
  /              \  Unit Tests (60-70%)
 /                \ - Business logic, utilities
/──────────────────\
```

### 2.2 Test Case Design
For each component, identify:

**Unit Test Scenarios**
```javascript
describe('[Component/Function Name]', () => {
  // Happy path
  test('should [expected behavior] when [condition]', () => {})
  
  // Edge cases
  test('should handle empty input', () => {})
  test('should handle null values', () => {})
  test('should handle maximum values', () => {})
  
  // Error cases
  test('should throw error when [invalid condition]', () => {})
  test('should handle timeout gracefully', () => {})
  
  // Business rules
  test('should apply discount when conditions met', () => {})
});
```

**Integration Test Scenarios**
```python
class TestAPIEndpoint:
    # Authentication
    def test_requires_authentication(self)
    def test_validates_permissions(self)
    
    # Valid requests
    def test_successful_creation(self)
    def test_successful_update(self)
    def test_successful_retrieval(self)
    
    # Invalid requests
    def test_invalid_input_returns_400(self)
    def test_not_found_returns_404(self)
    def test_unauthorized_returns_403(self)
    
    # Database integrity
    def test_transaction_rollback_on_error(self)
    def test_concurrent_updates_handled(self)
```

## Phase 3: Test Implementation

### 3.1 Unit Test Template
```javascript
// JavaScript/Jest example
import { functionToTest } from './module';

describe('functionToTest', () => {
  // Setup and teardown
  let testData;
  
  beforeEach(() => {
    testData = { /* test data */ };
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('happy path', () => {
    test('processes valid input correctly', () => {
      // Arrange
      const input = testData.validInput;
      const expected = { /* expected output */ };
      
      // Act
      const result = functionToTest(input);
      
      // Assert
      expect(result).toEqual(expected);
    });
  });
  
  describe('edge cases', () => {
    test.each([
      [null, 'Cannot process null input'],
      [undefined, 'Cannot process undefined input'],
      [{}, 'Cannot process empty object'],
    ])('handles %p by throwing "%s"', (input, errorMessage) => {
      expect(() => functionToTest(input)).toThrow(errorMessage);
    });
  });
  
  describe('error handling', () => {
    test('retries on network failure', async () => {
      // Mock network failure
      const mockFetch = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: 'success' });
      
      const result = await functionToTest(input, { fetch: mockFetch });
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: 'success' });
    });
  });
});
```

### 3.2 Integration Test Template
```python
# Python/pytest example
import pytest
from unittest.mock import patch, MagicMock
from app import create_app
from models import User, db

@pytest.fixture
def client():
    app = create_app('testing')
    with app.test_client() as client:
        with app.app_context():
            db.create_all()
            yield client
            db.drop_all()

@pytest.fixture
def auth_headers(client):
    # Create test user and get auth token
    user = User(email='test@example.com')
    token = user.generate_auth_token()
    return {'Authorization': f'Bearer {token}'}

class TestUserAPI:
    def test_create_user_success(self, client):
        # Arrange
        payload = {
            'email': 'new@example.com',
            'name': 'Test User'
        }
        
        # Act
        response = client.post('/api/users', 
                              json=payload,
                              content_type='application/json')
        
        # Assert
        assert response.status_code == 201
        data = response.get_json()
        assert data['email'] == payload['email']
        assert 'id' in data
        assert 'password' not in data  # Security check
    
    def test_create_duplicate_user_fails(self, client):
        # Setup - create first user
        User(email='existing@example.com').save()
        
        # Attempt to create duplicate
        payload = {'email': 'existing@example.com'}
        response = client.post('/api/users', json=payload)
        
        assert response.status_code == 409
        assert 'already exists' in response.get_json()['error']
    
    @patch('external_service.validate_email')
    def test_external_service_failure_handled(self, mock_validate, client):
        # Mock external service failure
        mock_validate.side_effect = Exception('Service unavailable')
        
        response = client.post('/api/users', 
                              json={'email': 'test@example.com'})
        
        assert response.status_code == 503
        assert 'temporarily unavailable' in response.get_json()['error']
```

### 3.3 Test Data Management

**Test Fixtures**
```javascript
// fixtures/users.js
export const validUser = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  role: 'user'
};

export const adminUser = {
  ...validUser,
  id: 2,
  email: 'admin@example.com',
  role: 'admin'
};

// fixtures/products.js
export const testProducts = [
  { id: 1, name: 'Product 1', price: 99.99 },
  { id: 2, name: 'Product 2', price: 149.99 }
];
```

**Test Factories**
```python
# factories.py
import factory
from models import User, Product

class UserFactory(factory.Factory):
    class Meta:
        model = User
    
    email = factory.Sequence(lambda n: f'user{n}@example.com')
    name = factory.Faker('name')
    created_at = factory.Faker('date_time')

class ProductFactory(factory.Factory):
    class Meta:
        model = Product
    
    name = factory.Faker('product_name')
    price = factory.Faker('pydecimal', left_digits=3, right_digits=2)
    inventory = factory.Faker('random_int', min=0, max=100)
```

## Phase 4: Documentation Creation

### 4.1 API Documentation Template
```markdown
# API Documentation

## [Endpoint Name]

### `[METHOD] /api/[path]`

**Description**: [What this endpoint does]

**Authentication**: Required/Optional/None

**Permissions**: [Required roles/scopes]

### Request

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer token |
| Content-Type | Yes | application/json |

**Path Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | integer | Yes | Resource ID |

**Body**:
```json
{
  "field1": "string",
  "field2": 123,
  "field3": {
    "nested": "object"
  }
}
```

**Validation Rules**:
- `field1`: Required, 3-50 characters
- `field2`: Optional, positive integer
- `field3.nested`: Required if field3 provided

### Response

**Success Response** (200 OK):
```json
{
  "id": 123,
  "field1": "value",
  "created_at": "2024-01-01T00:00:00Z"
}
```

**Error Responses**:

| Status | Code | Description |
|--------|------|-------------|
| 400 | INVALID_INPUT | Validation failed |
| 401 | UNAUTHORIZED | Missing/invalid token |
| 403 | FORBIDDEN | Insufficient permissions |
| 404 | NOT_FOUND | Resource not found |
| 429 | RATE_LIMITED | Too many requests |

### Examples

**cURL**:
```bash
curl -X POST https://api.example.com/api/resource \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"field1": "value"}'
```

**JavaScript**:
```javascript
const response = await fetch('/api/resource', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ field1: 'value' })
});
```
```

### 4.2 Component Documentation Template
```markdown
# [Component Name]

## Overview
[Brief description of what this component does and why it exists]

## Architecture
[Diagram or description of how component fits in system]

## Usage

### Basic Example
```javascript
import Component from './Component';

// Simple usage
<Component prop1="value" />
```

### Advanced Example
```javascript
// With all options
<Component 
  prop1="value"
  prop2={handler}
  prop3={{ nested: 'config' }}
  onEvent={handleEvent}
>
  {children}
</Component>
```

## Props/Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| prop1 | string | Yes | - | Main identifier |
| prop2 | function | No | noop | Event handler |
| prop3 | object | No | {} | Configuration |

## Methods/API

### `publicMethod(param1, param2)`
**Description**: [What it does]
**Parameters**:
- `param1` (Type): Description
- `param2` (Type): Description
**Returns**: Type - Description
**Throws**: ErrorType - When this happens

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| onLoad | `{ data: Object }` | Fired when data loads |
| onError | `{ error: Error }` | Fired on error |

## State Management
[How component manages state, if applicable]

## Performance Considerations
- [Key performance notes]
- [Optimization strategies]

## Accessibility
- [ARIA labels used]
- [Keyboard navigation]
- [Screen reader support]

## Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Known Issues
- [Issue 1 with workaround]
- [Issue 2 being tracked in TICKET-123]

## Related Components
- [Component A] - Used for X
- [Component B] - Alternative for Y

## Changelog
- v1.2.0 - Added feature X
- v1.1.0 - Fixed bug Y
- v1.0.0 - Initial release
```

### 4.3 README Template
```markdown
# [Project Name]

## Overview
[One paragraph description of what this project does]

## Features
- ✅ Feature 1
- ✅ Feature 2
- 🚧 Feature 3 (in development)
- 📋 Feature 4 (planned)

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 14+

### Installation
```bash
# Clone repository
git clone https://github.com/org/project.git
cd project

# Install dependencies
npm install
pip install -r requirements.txt

# Setup environment
cp .env.example .env
# Edit .env with your values

# Initialize database
npm run db:migrate
npm run db:seed

# Start development server
npm run dev
```

### Running Tests
```bash
# All tests
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Specific file
npm test -- path/to/test.js
```

## Project Structure
```
project/
├── src/              # Source code
│   ├── components/   # UI components
│   ├── services/     # Business logic
│   ├── models/       # Data models
│   └── utils/        # Utilities
├── tests/            # Test files
├── docs/             # Documentation
├── scripts/          # Build/deploy scripts
└── config/           # Configuration
```

## Development

### Code Style
We use [ESLint/Black] for code formatting. Run before committing:
```bash
npm run lint
npm run format
```

### Git Workflow
1. Create feature branch from `main`
2. Make changes
3. Write/update tests
4. Update documentation
5. Create PR with description

### Common Tasks

**Add new dependency**:
```bash
npm install package-name
pip install package-name && pip freeze > requirements.txt
```

**Update database schema**:
```bash
npm run db:generate-migration -- --name migration_name
npm run db:migrate
```

## Deployment

### Staging
```bash
npm run deploy:staging
```

### Production
```bash
npm run deploy:production
```

## Troubleshooting

### Issue: Database connection fails
**Solution**: Check DATABASE_URL in .env

### Issue: Tests fail with timeout
**Solution**: Increase timeout in jest.config.js

### Issue: Build fails
**Solution**: Clear cache with `npm run clean`

## Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md)

## License
[License Type] - See [LICENSE](./LICENSE)

## Support
- Documentation: [Link to docs]
- Issues: [Link to issues]
- Discord: [Link to Discord]
```

## Phase 5: Quality Assurance

### 5.1 Test Quality Checklist
- [ ] Tests run independently (no order dependencies)
- [ ] Tests are deterministic (no random failures)
- [ ] Tests are fast (mock external calls)
- [ ] Tests have clear failure messages
- [ ] Tests cover happy path + edge cases
- [ ] Tests don't test implementation details

### 5.2 Documentation Quality Checklist
- [ ] Examples are runnable
- [ ] All public APIs documented
- [ ] Prerequisites clearly stated
- [ ] Common errors addressed
- [ ] Update date included
- [ ] Contact/support info provided

### 5.3 Maintenance Plan
Create `docs/maintenance.md`:
```markdown
## Test Maintenance
- Review test coverage monthly
- Update tests when requirements change
- Remove obsolete tests
- Refactor test utilities as needed

## Documentation Maintenance
- Review quarterly for accuracy
- Update examples with version changes
- Add FAQ based on support tickets
- Archive outdated documentation
```

## Phase 6: Integration & Validation

### 6.1 Run Full Test Suite
```bash
# Ensure all new tests pass
npm test

# Check coverage improved
npm test -- --coverage

# Run in different environments
NODE_ENV=production npm test
```

### 6.2 Documentation Review
Have someone else:
1. Follow installation instructions
2. Run example code
3. Find specific information
4. Report confusion points

### 6.3 Update Project Files

**testing.md**:
```markdown
## Test Coverage
- Current: X%
- Target: Y%
- Critical paths covered: ✅

## Test Organization
- Unit tests: `tests/unit/`
- Integration tests: `tests/integration/`
- E2E tests: `tests/e2e/`

## Recent Additions
- [Date]: Added tests for [component]
- [Date]: Improved coverage for [module]
```

**memory.md**:
- Testing patterns established
- Documentation standards defined
- Common test utilities created

Remember: Tests are not overhead - they're insurance. Documentation is not an afterthought - it's a feature.