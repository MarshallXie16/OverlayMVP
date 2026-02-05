# Action Detection & Auto-Advance Design

**EXT-004: Step Progression & Action Detection**
**Epic 4, Story 4.3: Complete Walkthrough Steps**

---

## Overview

Action detection monitors user interactions during a walkthrough and automatically advances to the next step when the correct action is performed on the target element.

---

## Goals

1. **Auto-Advance**: Automatically move to next step when user performs correct action
2. **Validation**: Verify action matches expected step (correct element + correct action type)
3. **Feedback**: Provide immediate feedback on incorrect actions (handled in EXT-005)
4. **Clean Separation**: Keep detection logic separate from overlay UI

---

## Action Types

From `StepResponse.action_type`:
- **click**: User clicks/taps an element (button, link, checkbox, etc.)
- **input_commit**: User types in input field and commits (focusout/enter)
- **select_change**: User selects option from dropdown
- **submit**: User submits form
- **copy**: User copies selected text (Ctrl/Cmd+C or context menu)
- **navigate**: Page navigation (usually automatic, not user-triggered)

---

## Detection Strategy

### Event Listener Registration

When showing a step, register appropriate event listeners based on `action_type`:

| Action Type | Events to Listen | Validation |
|-------------|------------------|------------|
| `click` | `click` | Target element matches |
| `input_commit` | `focusout`, `keydown (Enter)` | Target element + value changed |
| `select_change` | `change` | Target element + value changed |
| `submit` | `submit` | Form element matches |
| `copy` | `copy` | Target element + copied text matches (clipboard preview) |
| `navigate` | (Background) `URL_CHANGED` | Auto-complete when URL matches expected destination |

### Validation Logic

```typescript
function validateAction(
  event: Event,
  step: StepResponse,
  targetElement: HTMLElement
): boolean {
  const eventTarget = event.target as HTMLElement;

  // 1. Check if event target matches expected target element
  if (eventTarget !== targetElement) {
    return false;
  }

  // 2. Check if action type matches
  switch (step.action_type) {
    case 'click':
      return event.type === 'click';
    
    case 'input_commit':
      return (event.type === 'focusout' || event.type === 'keydown') && 
             hasValueChanged(eventTarget);
    
    case 'select_change':
      return event.type === 'change' && 
             eventTarget instanceof HTMLSelectElement;
    
    case 'submit':
      return event.type === 'submit';
    
    case 'copy':
      return event.type === 'copy' &&
             copiedTextMatchesPreview(event);

    default:
      return false;
  }
}
```

---

## Implementation Plan

### 1. Add Event Listener Management

```typescript
// Track active listeners for cleanup
let activeListeners: Array<{
  element: HTMLElement | Document;
  event: string;
  handler: EventListener;
}> = [];

function attachActionListeners(
  step: StepResponse,
  targetElement: HTMLElement
): void {
  // Clear previous listeners
  removeActionListeners();

  // Determine which events to listen for
  const events = getEventsForActionType(step.action_type);

  // Attach listeners
  events.forEach(eventType => {
    const handler = (event: Event) => {
      handleAction(event, step, targetElement);
    };

    const listenOn = eventType === 'submit' 
      ? targetElement.closest('form') || document 
      : targetElement;

    listenOn.addEventListener(eventType, handler);
    activeListeners.push({ element: listenOn, event: eventType, handler });
  });
}

function removeActionListeners(): void {
  activeListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
  });
  activeListeners = [];
}
```

### 2. Handle Action Detection

```typescript
function handleAction(
  event: Event,
  step: StepResponse,
  targetElement: HTMLElement
): void {
  // Validate action
  if (!validateAction(event, step, targetElement)) {
    console.log('[Walkthrough] Action did not match expected step');
    // TODO EXT-005: Show error feedback
    return;
  }

  console.log('[Walkthrough] Correct action detected! Auto-advancing...');

  // Flash feedback on element
  flashElement(targetElement, 'success');

  // Auto-advance after short delay (let animation play)
  setTimeout(() => {
    handleNext();
  }, 500);
}
```

### 3. Update showCurrentStep Integration

```typescript
async function showCurrentStep(): Promise<void> {
  // ... existing code to find element and update UI ...

  // Attach action detection listeners
  attachActionListeners(currentStep, currentTargetElement);
}
```

### 4. Cleanup on Step Change

```typescript
function handleNext(): void {
  // Remove action listeners before advancing
  removeActionListeners();

  if (advanceStep()) {
    showCurrentStep();
  } else {
    showCompletionMessage();
  }
}

function handleBack(): void {
  // Remove action listeners before going back
  removeActionListeners();

  if (previousStep()) {
    showCurrentStep();
  }
}
```

---

## Edge Cases

### 1. Multiple Elements Match

**Scenario**: User clicks wrong button with same class  
**Solution**: Compare `event.target` with exact `currentTargetElement` reference

### 2. Value Tracking for Inputs

**Scenario**: Need to know if value actually changed  
**Solution**: Store initial value on focus, compare on focusout (bubbling)

```typescript
const inputValues = new WeakMap<HTMLElement, string>();

function trackInputValue(element: HTMLInputElement): void {
  inputValues.set(element, element.value);
}

function hasValueChanged(element: HTMLInputElement): boolean {
  const initialValue = inputValues.get(element) || '';
  return element.value !== initialValue;
}
```

### 3. Form Submit Handling

**Scenario**: Submit event bubbles to form, not button  
**Solution**: Listen on form element, not button

### 4. Navigate Steps

**Scenario**: Page navigation is automatic, no user action to detect  
**Solution**: Don't attach listeners, user must click Next manually

### 5. Event Cleanup on Exit

**Scenario**: User exits walkthrough mid-step  
**Solution**: Call `removeActionListeners()` in `exitWalkthrough()`

---

## User Experience

### Auto-Advance Flow

1. User sees instruction: "Click Submit button"
2. Spotlight highlights Submit button
3. User clicks Submit button
4. ✓ Green flash on button (success feedback)
5. After 500ms, auto-advance to next step
6. New spotlight appears on next element

### Manual Next Flow

1. User sees instruction: "Enter email address"
2. User types email and clicks elsewhere
3. No auto-advance (input_commit requires blur + value change)
4. User clicks "Next" button manually
5. Advances to next step

**Note**: For MVP, we'll implement auto-advance. If unreliable, we can always fall back to manual Next.

---

## Testing Strategy

### Unit Tests

1. **validateAction()**: Test all action types with valid/invalid events
2. **getEventsForActionType()**: Verify correct events returned
3. **hasValueChanged()**: Test with same/different values

### Integration Tests

1. Create mock page with test elements
2. Start walkthrough with test workflow
3. Trigger actions programmatically
4. Verify auto-advance occurs
5. Verify incorrect actions don't advance

### Manual Testing

1. Record workflow with various action types
2. Play back walkthrough
3. Perform correct actions → should auto-advance
4. Perform incorrect actions → should NOT advance
5. Use manual Next button → should work regardless

---

## Success Criteria

- [ ] Event listeners attached when step is shown
- [ ] Click actions auto-advance on correct element
- [ ] Input actions auto-advance on blur + value change
- [ ] Select actions auto-advance on change
- [ ] Submit actions auto-advance on form submit
- [ ] Navigate actions do NOT auto-advance
- [ ] Wrong element clicked does NOT auto-advance
- [ ] Event listeners cleaned up on step change
- [ ] Event listeners cleaned up on exit
- [ ] Success feedback (green flash) shown before advancing
- [ ] Tests pass for all scenarios

---

## Future Enhancements (Backlog)

1. **Retry Logic**: Allow 3 attempts before showing error (EXT-005)
2. **Smart Validation**: Use AI to determine if action was "close enough"
3. **Undo Action**: Allow user to undo last action before auto-advancing
4. **Visual Feedback**: Show checkmark animation on correct action
5. **Audio Feedback**: Optional "ding" sound on successful action

---

**Status**: Ready for implementation  
**Next Steps**: Begin Phase 3 - Implementation
