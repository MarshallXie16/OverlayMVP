# Refactoring & Bug Fixing Workflow

You are systematically debugging issues and refactoring code for improved quality. Your approach should be methodical, thorough, and focused on root cause resolution rather than symptom treatment.

## Phase 1: Bug Triage & Investigation

### 1.1 Bug Report Analysis
Parse the bug report for:
```markdown
## Bug Report Checklist
- [ ] **Description**: What's happening vs what should happen
- [ ] **Reproduction Steps**: Exact steps to trigger
- [ ] **Environment**: Browser/OS/Version details
- [ ] **Frequency**: Always/Sometimes/Rarely
- [ ] **Impact**: Number of users affected
- [ ] **Workaround**: Temporary solution if any
- [ ] **Evidence**: Screenshots, logs, error messages
```

### 1.2 Severity Classification
| Priority | Criteria | Examples | Response Time |
|----------|----------|----------|---------------|
| P0 | Production down, data loss | Payment failure, auth broken | Immediate |
| P1 | Major feature broken | Core functionality unusable | Same day |
| P2 | Minor feature broken | Non-critical path affected | 2-3 days |
| P3 | Cosmetic, edge case | UI misalignment, rare scenario | Next sprint |

### 1.3 Initial Investigation
```bash
# Check recent changes that might be related
git log --since="2 days ago" --grep="[related feature]"
git diff HEAD~5..HEAD -- [suspected file]

# Search for error in codebase
grep -r "error message" --include="*.js" --include="*.py"

# Check if issue exists in other environments
# Test in: development, staging, production
```

### 1.4 Reproduction Strategy
1. **Isolate the problem**:
   - Can you reproduce locally?
   - Does it happen in all browsers/environments?
   - Is it user-specific or universal?

2. **Minimize reproduction**:
   - Remove unnecessary steps
   - Identify minimal trigger conditions
   - Create automated test to reproduce

3. **Document findings**:
```markdown
## Reproduction Confirmed
**Environment**: Local/Docker/Production
**Frequency**: 100% reproducible
**Minimal Steps**:
1. [Step 1]
2. [Step 2]
**Expected**: [What should happen]
**Actual**: [What happens]
**Root Cause Hypothesis**: [Initial theory]
```

## Phase 2: Root Cause Analysis

### 2.1 Systematic Debugging Approach

**Binary Search Method**:
```python
def investigate_issue():
    """
    1. Identify working version and broken version
    2. Binary search through commits
    3. Isolate the exact change
    """
    # Find last known good commit
    git bisect start
    git bisect bad HEAD
    git bisect good [last-known-good-commit]
    
    # Git will checkout commits to test
    # Mark each as good or bad until found
```

**Layer-by-Layer Analysis**:
```
UI Layer → API Layer → Business Logic → Data Layer
   ↓           ↓              ↓              ↓
Check:      Check:         Check:        Check:
- Events    - Request      - Logic       - Queries
- State     - Response     - Validation  - Schema
- Render    - Status       - Transform   - Index
```

### 2.2 Debugging Tools & Techniques

**Logging Enhancement**:
```javascript
// Temporary debug logging
function debugOperation(data) {
    console.group('Debug: Operation Start');
    console.log('Input:', JSON.stringify(data, null, 2));
    console.log('Timestamp:', new Date().toISOString());
    console.trace('Call Stack');
    
    try {
        const result = performOperation(data);
        console.log('Success:', result);
        return result;
    } catch (error) {
        console.error('Error:', error);
        console.log('State at error:', getCurrentState());
        throw error;
    } finally {
        console.groupEnd();
    }
}
```

**State Inspection**:
```python
# Python debugging
import pdb
import json
import traceback

def debug_issue(data):
    print(f"=== DEBUG START ===")
    print(f"Input: {json.dumps(data, indent=2)}")
    
    # Set breakpoint
    pdb.set_trace()
    
    try:
        result = process_data(data)
        print(f"Result: {result}")
        return result
    except Exception as e:
        print(f"Error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        # Inspect variables at error point
        import inspect
        frame = inspect.currentframe()
        print(f"Local vars: {frame.f_locals}")
        raise
```

### 2.3 Common Bug Patterns

**Race Conditions**:
```javascript
// Problem: Async operations completing out of order
// Solution: Proper synchronization
async function fixRaceCondition() {
    // Bad: Results may be out of order
    // results.push(await operation());
    
    // Good: Ensure order
    const results = await Promise.all(
        items.map(item => operation(item))
    );
}
```

**State Mutations**:
```javascript
// Problem: Directly mutating state
// Solution: Immutable updates
function fixStateMutation(state, newItem) {
    // Bad: state.items.push(newItem)
    
    // Good: Create new state
    return {
        ...state,
        items: [...state.items, newItem]
    };
}
```

**Memory Leaks**:
```javascript
// Problem: Event listeners not cleaned up
// Solution: Proper cleanup
class Component {
    constructor() {
        this.handler = this.handleEvent.bind(this);
    }
    
    mount() {
        document.addEventListener('click', this.handler);
    }
    
    unmount() {
        // Critical: Remove listener
        document.removeEventListener('click', this.handler);
    }
}
```

## Phase 3: Fix Implementation

### 3.1 Fix Strategy Decision
Choose approach based on:

| Strategy | When to Use | Example |
|----------|-------------|---------|
| **Hotfix** | P0 issues, production critical | Minimal change to stop bleeding |
| **Proper Fix** | P1-P2 issues, time available | Address root cause thoroughly |
| **Workaround** | P3 issues, complex proper fix | Document temporary solution |
| **Refactor** | Multiple related issues | Redesign problematic component |

### 3.2 Fix Development Process

**1. Write Failing Test First**:
```javascript
// Regression test ensuring bug doesn't return
test('should handle edge case that caused bug #123', () => {
    // Reproduce exact conditions that caused bug
    const bugConditions = {
        data: null,
        user: { permissions: [] }
    };
    
    // This should fail before fix
    expect(() => buggyFunction(bugConditions)).not.toThrow();
    expect(buggyFunction(bugConditions)).toBe(expectedResult);
});
```

**2. Implement Minimal Fix**:
```python
def apply_fix(data):
    """Fix for bug #123: Handle null data gracefully"""
    # Add defensive check
    if data is None:
        logger.warning("Received null data, using defaults")
        data = get_default_data()
    
    # Original logic continues...
    return process_data(data)
```

**3. Verify Fix Completeness**:
- Run the regression test (should pass)
- Run related tests (shouldn't break)
- Test edge cases around the fix
- Test in same environment as bug occurred

### 3.3 Fix Documentation
```markdown
## Bug Fix: [BUG-123]

### Problem
[Clear description of what was broken]

### Root Cause
[Technical explanation of why it broke]

### Solution
[What was changed and why]

### Code Changes
- `file1.js`: Added null check on line 45
- `file2.py`: Fixed race condition in async handler

### Testing
- Added regression test: `test_bug_123.js`
- Verified in: development, staging

### Rollback Plan
If issues arise, revert commit [hash]

### Lessons Learned
[What we learned to prevent similar issues]
```

## Phase 4: Refactoring Process

### 4.1 Refactoring Triggers
Refactor when you see:
- **Code Duplication**: Same logic in 3+ places
- **Long Functions**: >50 lines doing multiple things
- **Deep Nesting**: >3 levels of conditionals
- **God Objects**: Classes doing too much
- **Shotgun Surgery**: One change requires many file edits
- **Feature Envy**: Class using another class's data excessively

### 4.2 Refactoring Catalog

**Extract Function**:
```javascript
// Before: Long function doing multiple things
function processUserData(user) {
    // Validation logic (15 lines)
    if (!user.email) throw new Error();
    if (!user.email.includes('@')) throw new Error();
    // ... more validation
    
    // Transformation logic (20 lines)
    const normalized = {};
    normalized.email = user.email.toLowerCase();
    // ... more transformation
    
    // Save logic (10 lines)
    const result = database.save(normalized);
    // ... error handling
    
    return result;
}

// After: Extracted functions with single responsibilities
function processUserData(user) {
    validateUser(user);
    const normalized = normalizeUserData(user);
    return saveUser(normalized);
}

function validateUser(user) {
    if (!user.email) throw new ValidationError('Email required');
    if (!isValidEmail(user.email)) throw new ValidationError('Invalid email');
}

function normalizeUserData(user) {
    return {
        email: user.email.toLowerCase(),
        // ... other normalizations
    };
}

function saveUser(userData) {
    try {
        return database.save(userData);
    } catch (error) {
        throw new DatabaseError('Failed to save user', error);
    }
}
```

**Extract Class**:
```python
# Before: Class with multiple responsibilities
class Order:
    def __init__(self):
        self.items = []
        self.customer = None
        
    def add_item(self, item):
        self.items.append(item)
    
    def calculate_total(self):
        # Pricing logic
        pass
    
    def apply_discount(self, code):
        # Discount logic
        pass
    
    def send_confirmation_email(self):
        # Email logic
        pass
    
    def process_payment(self):
        # Payment logic
        pass

# After: Separated concerns
class Order:
    def __init__(self):
        self.items = []
        self.pricing = PricingService()
        self.payment = PaymentService()
        
    def add_item(self, item):
        self.items.append(item)
    
    def get_total(self):
        return self.pricing.calculate(self.items)

class PricingService:
    def calculate(self, items):
        # Pricing logic
        pass
    
    def apply_discount(self, total, code):
        # Discount logic
        pass

class PaymentService:
    def process(self, order):
        # Payment logic
        pass

class NotificationService:
    def send_order_confirmation(self, order):
        # Email logic
        pass
```

**Replace Conditionals with Polymorphism**:
```javascript
// Before: Complex conditionals
function calculateShipping(order) {
    if (order.type === 'standard') {
        return order.weight * 0.5;
    } else if (order.type === 'express') {
        return order.weight * 1.0 + 10;
    } else if (order.type === 'overnight') {
        return order.weight * 2.0 + 25;
    }
}

// After: Strategy pattern
class ShippingStrategy {
    static create(type) {
        const strategies = {
            standard: new StandardShipping(),
            express: new ExpressShipping(),
            overnight: new OvernightShipping()
        };
        return strategies[type] || new StandardShipping();
    }
}

class StandardShipping {
    calculate(order) {
        return order.weight * 0.5;
    }
}

class ExpressShipping {
    calculate(order) {
        return order.weight * 1.0 + 10;
    }
}

function calculateShipping(order) {
    const strategy = ShippingStrategy.create(order.type);
    return strategy.calculate(order);
}
```

### 4.3 Refactoring Safety Checklist

**Before Refactoring**:
- [ ] All tests pass
- [ ] Code is committed
- [ ] Understand what code does
- [ ] Have test coverage

**During Refactoring**:
- [ ] Make small, incremental changes
- [ ] Run tests after each change
- [ ] Commit after each successful step
- [ ] Keep functionality identical

**After Refactoring**:
- [ ] All tests still pass
- [ ] No new functionality added
- [ ] Code is cleaner/simpler
- [ ] Document what was refactored

## Phase 5: Performance Optimization

### 5.1 Performance Investigation
```javascript
// Measure before optimizing
console.time('Operation');
performOperation();
console.timeEnd('Operation');

// Profile in detail
const startMemory = process.memoryUsage();
const startTime = performance.now();

performOperation();

const endTime = performance.now();
const endMemory = process.memoryUsage();

console.log({
    duration: endTime - startTime,
    memoryDelta: endMemory.heapUsed - startMemory.heapUsed
});
```

### 5.2 Common Optimizations

**Database Queries**:
```python
# Before: N+1 query problem
users = User.query.all()
for user in users:
    # This triggers a query for each user
    orders = user.orders.all()

# After: Eager loading
users = User.query.options(
    joinedload(User.orders)
).all()
```

**Caching**:
```javascript
// Simple memoization
const memoize = (fn) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) {
            return cache.get(key);
        }
        const result = fn(...args);
        cache.set(key, result);
        return result;
    };
};

const expensiveCalculation = memoize((input) => {
    // Complex computation
    return result;
});
```

## Phase 6: Verification & Documentation

### 6.1 Fix Verification
- [ ] Bug no longer reproducible
- [ ] No new bugs introduced
- [ ] Performance acceptable
- [ ] Tests pass
- [ ] Code reviewed

### 6.2 Update Documentation

**fixed_bugs.md**:
```markdown
## [Date] BUG-123: User data not saving

**Symptom**: Users reported data loss when saving profile
**Root Cause**: Race condition between auto-save and manual save
**Fix Applied**: Added mutex lock to prevent concurrent saves
**Prevention**: Added integration test for concurrent operations
**Time to Resolution**: 4 hours
**Affected Users**: ~150
**Lessons Learned**: Need better concurrency handling in state management
```

**memory.md**:
- Add debugging techniques that worked
- Document problematic patterns found
- Note refactoring patterns applied

### 6.3 Knowledge Sharing
Create a brief for the team:
```markdown
## Bug Postmortem: [BUG-123]

### Timeline
- 10:00 - First report received
- 10:30 - Reproduced locally
- 11:00 - Root cause identified
- 12:00 - Fix deployed to staging
- 14:00 - Fix verified in production

### What Went Wrong
[Technical explanation]

### What Went Right
[Good practices that helped]

### Action Items
1. Add monitoring for [specific metric]
2. Improve error messages in [component]
3. Add defensive checks in [module]

### Prevention Measures
- New linting rule for [pattern]
- Required test for [scenario]
- Code review checklist updated
```

Remember: Every bug is a learning opportunity. Every refactoring makes the codebase better. Focus on systematic improvement, not blame.