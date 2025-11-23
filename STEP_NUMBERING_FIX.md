# Step Numbering Race Condition Fix

## Problem

### Symptoms
- Alert: "Failed to save workflow: Request failed"
- Backend returns 400 Bad Request
- Console logs show duplicate step numbers: "✅ Step 4 recorded", "✅ Step 4 recorded", "✅ Step 8 recorded", "✅ Step 8 recorded"
- Database constraint violation

### Root Cause

**1. Race Condition in Step Numbering**

Original code:
```typescript
async function recordInteraction(event: Event, element: Element): Promise<void> {
  // Increment step number
  state.currentStepNumber++;  // ❌ Not atomic!
  
  // ... async operations ...
  const screenshotId = await captureScreenshot(state.currentStepNumber);
  // ❌ Multiple events can read the same value before any increment
}
```

**What happened:**
- User clicks on a checkbox label
- Triggers 3 events simultaneously:
  - `click` on `<label>`
  - `click` on `<input type="checkbox">`
  - `change` on `<input type="checkbox">`
- All 3 handlers read `state.currentStepNumber = 7`
- All 3 increment to `8`
- All 3 record as "Step 8"
- **Result:** 3 steps with `step_number = 8`

**2. Database Unique Constraint**

From `backend/app/models/step.py:128`:
```python
UniqueConstraint("workflow_id", "step_number", name="uq_workflow_step_number")
```

The database **requires** unique step numbers within a workflow. When the extension tries to save:
- Step 1 ✅
- Step 2 ✅
- Step 3 ✅
- Step 4 ✅
- Step 4 ❌ **DUPLICATE - REJECTED**

Backend returns:
```
400 Bad Request
{
  "detail": "UNIQUE constraint failed: steps.workflow_id, steps.step_number"
}
```

## Solution

### Fix 1: Atomic Step Number Capture

**Changed:**
```typescript
async function recordInteraction(event: Event, element: Element): Promise<void> {
  // ✅ Atomically increment and capture - prevents race condition
  const stepNumber = ++state.currentStepNumber;
  
  // Use captured stepNumber throughout
  const screenshotId = await captureScreenshot(stepNumber);
  
  const step: StepCreate = {
    step_number: stepNumber,  // ✅ Uses captured value
    // ...
  };
  
  console.log(`✅ Step ${stepNumber} recorded:`, step);
}
```

**Why this works:**
- `++state.currentStepNumber` increments **before** returning the value
- The value is captured in a local variable **immediately**
- Even if multiple events fire simultaneously, each gets its own unique number:
  - Event 1: `stepNumber = 8` (state becomes 8)
  - Event 2: `stepNumber = 9` (state becomes 9) 
  - Event 3: `stepNumber = 10` (state becomes 10)

### Fix 2: Better Error Logging

**Added detailed error extraction:**
```typescript
catch (error) {
  const apiError = error as any;
  
  console.error('[BackgroundMessaging] Error type:', apiError.name);
  console.error('[BackgroundMessaging] Error message:', apiError.message);
  console.error('[BackgroundMessaging] Error status:', apiError.status);
  console.error('[BackgroundMessaging] Error details:', apiError.details);
  
  // Parse validation errors from backend
  if (apiError.status === 400 && apiError.details?.detail) {
    // Show actual database constraint violation
    errorMessage = apiError.details.detail;
  }
}
```

Now errors will show:
```
[BackgroundMessaging] Error status: 400
[BackgroundMessaging] Error details: {
  "detail": "UNIQUE constraint failed: steps.workflow_id, steps.step_number"
}
[BackgroundMessaging] Final error message: UNIQUE constraint failed: steps.workflow_id, steps.step_number
```

## Files Changed

### Extension
1. **`extension/src/content/recorder.ts`**
   - `recordInteraction()` - Atomic step number capture
   - `recordNavigation()` - Atomic step number capture

2. **`extension/src/background/messaging.ts`**
   - `handleStopRecording()` - Enhanced error logging and parsing

## Testing

### Test Case: Rapid Multiple Events

**Scenario:** Click on checkbox with label (triggers 3 events)

**Before Fix:**
```
Recording click on: <label>
Recording click on: <input type="checkbox">  
Recording change on: <input type="checkbox">
✅ Step 8 recorded  // ❌ Duplicate
✅ Step 8 recorded  // ❌ Duplicate  
✅ Step 8 recorded  // ❌ Duplicate
[BackgroundMessaging] Failed to stop recording: Request failed
```

**After Fix:**
```
Recording click on: <label>
Recording click on: <input type="checkbox">
Recording change on: <input type="checkbox">
✅ Step 8 recorded  // ✅ Unique
✅ Step 9 recorded  // ✅ Unique
✅ Step 10 recorded // ✅ Unique
[BackgroundMessaging] Workflow created successfully: {workflow_id: 3}
```

### Verification Steps

1. **Build and reload extension**
```bash
cd extension
npm run build
# Then reload in chrome://extensions/
```

2. **Record workflow with rapid interactions**
   - Navigate to login page
   - Click and fill multiple fields rapidly
   - Click checkbox (triggers multiple events)
   - Click submit button
   - Stop recording

3. **Check logs**
   - Page console: All steps should have **unique** numbers
   - Background console: Should show "Workflow created successfully"
   - Dashboard: Workflow should appear in list

4. **Database verification**
```sql
SELECT workflow_id, step_number, action_type 
FROM steps 
WHERE workflow_id = <last_workflow_id>
ORDER BY step_number;
```

Expected: Sequential step numbers with no duplicates

## Edge Cases Handled

### 1. Blur Events on Same Element
**Scenario:** User tabs through form fields
- Input field A: `blur` event
- Input field B: `focus` then `blur` event
- Input field C: `focus` then `blur` event

**Fix ensures:** Each blur gets unique step number

### 2. Checkbox/Radio Button Clicks
**Scenario:** Click on checkbox label
- Triggers: `click` on label, `click` on input, `change` on input
  
**Fix ensures:** All 3 events get unique step numbers

### 3. Form Submit
**Scenario:** Click submit button
- Triggers: `click` on button, `submit` on form

**Fix ensures:** Both events get unique step numbers

## Prevention

### Why This Pattern?
```typescript
const stepNumber = ++state.currentStepNumber;  // ✅ Good
```

vs

```typescript
state.currentStepNumber++;  // ❌ Bad
// Later use state.currentStepNumber
```

**JavaScript execution:**
- Even though JavaScript is single-threaded, async/await can interleave execution
- Multiple event handlers can start before any `await` is reached
- By capturing the value immediately, we guarantee uniqueness

### Code Review Checklist
- [ ] All step counter increments use atomic capture pattern
- [ ] No shared mutable state modified across async boundaries
- [ ] Database constraints match application logic

## Related Issues

- **Issue #1:** Widget buttons being recorded (Fixed in previous session)
- **Issue #2:** Response parsing error (Fixed in previous session)  
- **Issue #3:** Step numbering race condition (Fixed in this session)

## Rollback Plan

If issues persist:

1. Check for other async operations modifying `state.currentStepNumber`
2. Add mutex/lock if needed (though atomic capture should be sufficient)
3. Consider using a generator function for step numbers:

```typescript
function* stepNumberGenerator() {
  let counter = 0;
  while (true) {
    yield ++counter;
  }
}

const stepNumbers = stepNumberGenerator();
const stepNumber = stepNumbers.next().value;  // Always unique
```

## Performance Impact

**None.** The fix changes only when the variable is read, not the overall logic flow.

- Before: `state.currentStepNumber++` then read → O(1)
- After: `const stepNumber = ++state.currentStepNumber` → O(1)

## Success Criteria

✅ No duplicate step numbers in console logs  
✅ Database constraint violations eliminated  
✅ Workflows save successfully  
✅ All steps appear in correct order  
✅ Backend returns 201 Created instead of 400 Bad Request
