# Sprint 3: Action Detection - Detailed Implementation Plan

**Duration**: 2-3 days
**Dependencies**: Sprint 1 (Foundation), Sprint 2 (UI Layer)
**Status**: COMPLETE
**Created**: 2026-02-01
**Completed**: 2026-02-02

---

## Executive Summary

This sprint extracts and modularizes user action detection from the monolithic `walkthrough.ts` into focused modules. The key challenge is ensuring **exact behavioral parity** with the existing implementation to maintain backwards compatibility.

### Goals
1. Detect user actions (click, input, select, submit) on target elements
2. Validate actions match expected step requirements
3. Block non-target clicks during walkthrough
4. Integrate with state machine and UI layer

### Key Constraints
- Must preserve exact `isClickOnTarget()` logic (child elements, shadow DOM)
- Must preserve input baseline/blur pattern for value change detection
- Must attach submit listeners to forms, not buttons
- Must use same auto-advance delays (60/120/150ms)

---

## Ticket W-013: ActionDetector.ts

### Purpose
Attach event listeners to target elements based on action type, emit detected actions to callback.

### File Location
`extension/src/content/walkthrough/actions/ActionDetector.ts` (~200 lines)

### API Design

```typescript
/**
 * Detected action event emitted by ActionDetector
 */
export interface DetectedAction {
  type: ActionType;
  target: HTMLElement;
  event: Event;           // Original DOM event
  value?: string;         // For inputs/selects - the new value
  timestamp: number;
}

/**
 * Supported action types (matches recording system, minus navigate/clipboard)
 */
export type ActionType = 'click' | 'input_commit' | 'select_change' | 'submit';

/**
 * Listener tracking for cleanup
 */
interface TrackedListener {
  element: Element;
  eventType: string;
  handler: EventListener;
  options?: AddEventListenerOptions;
}

/**
 * ActionDetector - Listens for user actions on target elements
 *
 * @example
 * const detector = new ActionDetector((action) => {
 *   console.log(`Detected ${action.type} on ${action.target.tagName}`);
 * });
 *
 * detector.attach(buttonElement, 'click');
 * // ... user clicks button ...
 * detector.detach();
 */
export class ActionDetector {
  private onActionDetected: (action: DetectedAction) => void;
  private activeListeners: TrackedListener[] = [];
  private inputBaselines: WeakMap<HTMLInputElement | HTMLTextAreaElement, string> = new WeakMap();
  private config: ActionDetectorConfig;

  constructor(
    onActionDetected: (action: DetectedAction) => void,
    config?: ActionDetectorConfig
  );

  /**
   * Attach listeners for a specific action type.
   * Call this when entering WAITING_ACTION state.
   */
  attach(element: HTMLElement, actionType: ActionType): void;

  /**
   * Detach all listeners.
   * Call this when leaving WAITING_ACTION state.
   */
  detach(): void;

  /**
   * Check if listeners are currently attached.
   */
  isAttached(): boolean;
}
```

### Event Listener Matrix

| Action Type | Events | Target | Notes |
|-------------|--------|--------|-------|
| `click` | `click` | element | Use capture=false |
| `input_commit` | `focusin`, `blur` | element | focusin captures baseline, blur emits if changed |
| `select_change` | `change` | element | Works for `<select>` elements |
| `submit` | `submit` | parent form | MUST use `element.closest('form')` |

### Implementation Details

```typescript
// Listener setup for each action type
private setupClickListener(element: HTMLElement): void {
  const handler = (event: MouseEvent) => {
    this.emit({
      type: 'click',
      target: element,
      event,
      timestamp: Date.now(),
    });
  };
  element.addEventListener('click', handler);
  this.track(element, 'click', handler);
}

private setupInputListeners(element: HTMLElement): void {
  // 1. Capture baseline on focusin
  const focusHandler = (event: FocusEvent) => {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      this.inputBaselines.set(input, input.value);
      this.log(`Captured baseline: "${input.value}"`);
    }
  };
  element.addEventListener('focusin', focusHandler);
  this.track(element, 'focusin', focusHandler);

  // 2. Emit on blur if value changed
  const blurHandler = (event: FocusEvent) => {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      return;
    }

    const baseline = this.inputBaselines.get(input) ?? '';
    if (input.value === baseline) {
      this.log('Blur ignored: no value change');
      return;
    }

    this.emit({
      type: 'input_commit',
      target: element,
      event,
      value: input.value,
      timestamp: Date.now(),
    });
  };
  element.addEventListener('blur', blurHandler, true); // Capture phase for nested inputs
  this.track(element, 'blur', blurHandler, { capture: true });
}

private setupSelectListener(element: HTMLElement): void {
  const handler = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    this.emit({
      type: 'select_change',
      target: element,
      event,
      value: select.value,
      timestamp: Date.now(),
    });
  };
  element.addEventListener('change', handler);
  this.track(element, 'change', handler);
}

private setupSubmitListener(element: HTMLElement): void {
  // CRITICAL: Attach to form, not button
  const form = element.closest('form');
  if (!form) {
    this.log('No form found for submit action, skipping listener', 'warn');
    return;
  }

  const handler = (event: SubmitEvent) => {
    this.emit({
      type: 'submit',
      target: element,
      event,
      timestamp: Date.now(),
    });
  };
  form.addEventListener('submit', handler);
  this.track(form, 'submit', handler);
}
```

### Edge Cases to Handle

1. **Input inside shadow DOM**: Listen on the target element, not the shadow host
2. **No form for submit action**: Skip listener, log warning
3. **Multiple focuses without blur**: Only latest baseline is kept (WeakMap behavior)
4. **Element removed from DOM**: Cleanup handled by `detach()` call

### Tests Required (ActionDetector.test.ts)

```typescript
describe('ActionDetector', () => {
  describe('click detection', () => {
    it('should emit on click', async () => { /* ... */ });
    it('should include timestamp in event', async () => { /* ... */ });
  });

  describe('input_commit detection', () => {
    it('should capture baseline on focusin', async () => { /* ... */ });
    it('should emit on blur when value changed', async () => { /* ... */ });
    it('should NOT emit on blur when value unchanged', async () => { /* ... */ });
    it('should include new value in event', async () => { /* ... */ });
  });

  describe('select_change detection', () => {
    it('should emit on change event', async () => { /* ... */ });
    it('should include selected value', async () => { /* ... */ });
  });

  describe('submit detection', () => {
    it('should attach listener to parent form', async () => { /* ... */ });
    it('should skip if no parent form', async () => { /* ... */ });
    it('should emit submit event', async () => { /* ... */ });
  });

  describe('cleanup', () => {
    it('should remove all listeners on detach', async () => { /* ... */ });
    it('should clear input baselines on detach', async () => { /* ... */ });
  });
});
```

---

## Ticket W-014: ActionValidator.ts

### Purpose
Validate that a detected action matches the expected step requirements.

### File Location
`extension/src/content/walkthrough/actions/ActionValidator.ts` (~150 lines)

### API Design

```typescript
/**
 * Result of action validation
 */
export interface ValidationResult {
  valid: boolean;
  reason?: 'wrong_element' | 'wrong_action' | 'no_value_change' | 'invalid_target';
  retryCount: number;
}

/**
 * ActionValidator - Validates detected actions against expected steps
 *
 * Key responsibilities:
 * - Check if click is on target element or descendant
 * - Check if action type matches expected type
 * - Track retry counts per step
 */
export class ActionValidator {
  private retryCount: Map<number, number> = new Map();

  /**
   * Validate a detected action against expected step.
   */
  validate(
    action: DetectedAction,
    expectedElement: HTMLElement,
    expectedActionType: ActionType,
    stepIndex: number
  ): ValidationResult;

  /**
   * Get retry count for a step.
   */
  getRetryCount(stepIndex: number): number;

  /**
   * Reset retry count for a specific step.
   */
  resetRetryCount(stepIndex: number): void;

  /**
   * Reset all retry counts (e.g., when starting new walkthrough).
   */
  resetAllRetryCounts(): void;
}
```

### Core Validation Logic

```typescript
/**
 * Check if event occurred on target element or descendant.
 * Preserves exact behavior from walkthrough.ts:1765-1788
 */
export function isClickOnTarget(event: Event, targetElement: HTMLElement): boolean {
  const eventTarget = event.target as HTMLElement;

  // 1. Direct match
  if (eventTarget === targetElement) {
    return true;
  }

  // 2. Contains check (handles icons inside buttons, etc.)
  if (targetElement.contains(eventTarget)) {
    return true;
  }

  // 3. Shadow DOM support via composedPath
  if (event.composedPath) {
    const path = event.composedPath();
    return path.includes(targetElement);
  }

  return false;
}

/**
 * Full validation with reason tracking
 */
validate(
  action: DetectedAction,
  expectedElement: HTMLElement,
  expectedActionType: ActionType,
  stepIndex: number
): ValidationResult {
  // 1. Check action type matches
  if (action.type !== expectedActionType) {
    this.incrementRetry(stepIndex);
    return {
      valid: false,
      reason: 'wrong_action',
      retryCount: this.getRetryCount(stepIndex),
    };
  }

  // 2. Check element target (using event from action)
  if (!isClickOnTarget(action.event, expectedElement)) {
    this.incrementRetry(stepIndex);
    return {
      valid: false,
      reason: 'wrong_element',
      retryCount: this.getRetryCount(stepIndex),
    };
  }

  // 3. For input_commit, value change is already validated by detector
  // (detector only emits if value changed)

  // Valid action - reset retry count for this step
  this.resetRetryCount(stepIndex);
  return {
    valid: true,
    retryCount: 0,
  };
}
```

### Export `isClickOnTarget` for Reuse

The `isClickOnTarget` function should be exported for use by `ClickInterceptor` as well.

### Tests Required (ActionValidator.test.ts)

```typescript
describe('ActionValidator', () => {
  describe('isClickOnTarget', () => {
    it('should return true for direct click on target', () => { /* ... */ });
    it('should return true for click on child element', () => { /* ... */ });
    it('should return true for click inside nested elements', () => { /* ... */ });
    it('should return false for click on sibling element', () => { /* ... */ });
    it('should use composedPath for shadow DOM clicks', () => { /* ... */ });
  });

  describe('validate', () => {
    it('should return valid for correct action on target', () => { /* ... */ });
    it('should return wrong_element for click on wrong element', () => { /* ... */ });
    it('should return wrong_action for mismatched action type', () => { /* ... */ });
    it('should increment retry count on invalid action', () => { /* ... */ });
    it('should reset retry count on valid action', () => { /* ... */ });
  });

  describe('retry counting', () => {
    it('should track retries per step index', () => { /* ... */ });
    it('should reset individual step retry count', () => { /* ... */ });
    it('should reset all retry counts', () => { /* ... */ });
  });
});
```

---

## Ticket W-015: ClickInterceptor.ts

### Purpose
Block clicks outside target element during walkthrough to prevent accidental navigation or state changes.

### File Location
`extension/src/content/walkthrough/actions/ClickInterceptor.ts` (~120 lines)

### API Design

```typescript
export interface ClickInterceptorConfig {
  /** Enable debug logging */
  debug?: boolean;
  /** Callback when click is blocked */
  onBlocked?: (element: HTMLElement) => void;
}

/**
 * ClickInterceptor - Blocks clicks outside target during walkthrough
 *
 * Uses capture phase to intercept clicks before they bubble.
 * Allows clicks on: target element, tooltip, overlay container.
 */
export class ClickInterceptor {
  private isActive: boolean = false;
  private targetElement: HTMLElement | null = null;
  private allowedElements: Set<HTMLElement> = new Set();
  private clickHandler: ((event: MouseEvent) => void) | null = null;
  private config: ClickInterceptorConfig;

  constructor(config?: ClickInterceptorConfig);

  /**
   * Activate interception for a target element.
   * @param targetElement - The element user should interact with
   * @param additionalAllowed - Additional elements to allow (tooltip, overlay)
   */
  activate(targetElement: HTMLElement, additionalAllowed?: HTMLElement[]): void;

  /**
   * Deactivate interception.
   */
  deactivate(): void;

  /**
   * Check if interception is currently active.
   */
  isIntercepting(): boolean;

  /**
   * Add an element to the allowlist while active.
   */
  addAllowedElement(element: HTMLElement): void;
}
```

### Implementation Details

```typescript
activate(targetElement: HTMLElement, additionalAllowed: HTMLElement[] = []): void {
  if (this.isActive) {
    this.deactivate();
  }

  this.targetElement = targetElement;
  this.allowedElements.clear();
  additionalAllowed.forEach(el => this.allowedElements.add(el));

  this.clickHandler = this.handleClick.bind(this);
  // CRITICAL: Use capture phase for early interception
  document.addEventListener('click', this.clickHandler, true);

  this.isActive = true;
  this.log('Activated');
}

private handleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (!target) return;

  // Check if click is on allowed element
  if (this.isAllowed(target)) {
    this.log(`Allowed click on ${target.tagName}`);
    return;
  }

  // Block the click
  event.preventDefault();
  event.stopPropagation();

  this.log(`Blocked click on ${target.tagName}`);

  // Visual feedback
  this.pulseTarget();

  // Notify callback
  if (this.config.onBlocked) {
    this.config.onBlocked(target);
  }
}

private isAllowed(element: HTMLElement): boolean {
  // 1. Target element or its descendants
  if (this.targetElement?.contains(element)) {
    return true;
  }

  // 2. Check allowed elements (tooltip, overlay)
  for (const allowed of this.allowedElements) {
    if (allowed.contains(element)) {
      return true;
    }
  }

  return false;
}

private pulseTarget(): void {
  if (!this.targetElement) return;

  // Add pulse animation class
  this.targetElement.classList.add('walkthrough-pulse');
  setTimeout(() => {
    this.targetElement?.classList.remove('walkthrough-pulse');
  }, 300);
}
```

### CSS for Pulse Effect

Add to `extension/src/content/styles/walkthrough.css`:

```css
.walkthrough-pulse {
  animation: walkthrough-pulse 0.3s ease-out;
}

@keyframes walkthrough-pulse {
  0% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.8); }
  100% { box-shadow: 0 0 0 8px rgba(14, 165, 233, 0); }
}
```

### Tests Required (ClickInterceptor.test.ts)

```typescript
describe('ClickInterceptor', () => {
  describe('activation', () => {
    it('should block clicks when activated', () => { /* ... */ });
    it('should allow clicks when deactivated', () => { /* ... */ });
    it('should replace previous target on reactivation', () => { /* ... */ });
  });

  describe('allowed elements', () => {
    it('should allow clicks on target element', () => { /* ... */ });
    it('should allow clicks on target descendants', () => { /* ... */ });
    it('should allow clicks on additional allowed elements', () => { /* ... */ });
    it('should allow clicks on allowed element descendants', () => { /* ... */ });
    it('should dynamically add allowed elements', () => { /* ... */ });
  });

  describe('blocking', () => {
    it('should prevent default on blocked click', () => { /* ... */ });
    it('should stop propagation on blocked click', () => { /* ... */ });
    it('should call onBlocked callback', () => { /* ... */ });
    it('should add pulse class to target', () => { /* ... */ });
  });
});
```

---

## Ticket W-016: Controller Integration

### Purpose
Integrate action detection modules with WalkthroughController and state machine.

### Files to Modify
- `extension/src/content/walkthrough/WalkthroughController.ts` (~+150 lines)
- `extension/src/content/walkthrough/ui/WalkthroughUI.ts` (~+20 lines for flash effects)

### Controller Changes

```typescript
import { ActionDetector, type DetectedAction, type ActionType } from './actions';
import { ActionValidator, type ValidationResult } from './actions';
import { ClickInterceptor } from './actions';
import {
  ADVANCE_DELAY_CLICK,
  ADVANCE_DELAY_SELECT,
  ADVANCE_DELAY_INPUT,
  ADVANCE_DELAY_DEFAULT,
  MAX_ACTION_RETRIES,
} from '../../shared/walkthrough';

export class WalkthroughController {
  // Existing properties...

  // New action detection instances
  private actionDetector: ActionDetector | null = null;
  private actionValidator: ActionValidator | null = null;
  private clickInterceptor: ClickInterceptor | null = null;
  private currentTargetElement: HTMLElement | null = null;

  // Existing constructor...

  /**
   * Initialize action detection modules
   */
  private initializeActionDetection(): void {
    this.actionValidator = new ActionValidator();

    this.actionDetector = new ActionDetector(
      this.onActionDetected.bind(this),
      { debug: this.config.debug }
    );

    this.clickInterceptor = new ClickInterceptor({
      debug: this.config.debug,
      onBlocked: this.onClickBlocked.bind(this),
    });
  }

  /**
   * Handle state change to WAITING_ACTION
   */
  private setupActionListeners(): void {
    if (!this.currentState || !this.currentTargetElement) {
      this.log('Cannot setup action listeners: missing state or element', 'error');
      return;
    }

    const step = this.currentState.steps[this.currentState.currentStepIndex];
    const actionType = step.action_type as ActionType;

    // Attach action detector
    this.actionDetector?.attach(this.currentTargetElement, actionType);

    // Activate click interception
    const overlayContainer = this.ui?.getOverlayContainer();
    const tooltipElement = this.ui?.getTooltipElement();
    const allowed = [overlayContainer, tooltipElement].filter(Boolean) as HTMLElement[];

    this.clickInterceptor?.activate(this.currentTargetElement, allowed);

    this.log(`Action listeners setup for ${actionType}`);
  }

  /**
   * Clean up action listeners (on step change or exit)
   */
  private teardownActionListeners(): void {
    this.actionDetector?.detach();
    this.clickInterceptor?.deactivate();
    this.log('Action listeners torn down');
  }

  /**
   * Handle detected action from ActionDetector
   */
  private onActionDetected(action: DetectedAction): void {
    if (!this.currentState || !this.currentTargetElement) return;

    const step = this.currentState.steps[this.currentState.currentStepIndex];
    const expectedActionType = step.action_type as ActionType;

    // Validate the action
    const result = this.actionValidator?.validate(
      action,
      this.currentTargetElement,
      expectedActionType,
      this.currentState.currentStepIndex
    );

    if (!result) return;

    if (result.valid) {
      this.handleValidAction(action);
    } else {
      this.handleInvalidAction(action, result);
    }
  }

  /**
   * Handle valid action - flash success and advance
   */
  private handleValidAction(action: DetectedAction): void {
    this.log(`Valid action: ${action.type}`);

    // Visual feedback
    this.flashSuccess(action.target);

    // Teardown current listeners
    this.teardownActionListeners();

    // Delay based on action type, then advance
    const delay = this.getAdvanceDelay(action.type);
    setTimeout(() => {
      this.sendCommand('NEXT', {});
    }, delay);
  }

  /**
   * Handle invalid action - flash error, show retry hint
   */
  private handleInvalidAction(action: DetectedAction, result: ValidationResult): void {
    this.log(`Invalid action: ${result.reason}, retry ${result.retryCount}/${MAX_ACTION_RETRIES}`);

    // Visual feedback
    this.flashError(action.target);

    // Check if max retries exceeded
    if (result.retryCount >= MAX_ACTION_RETRIES) {
      this.log('Max retries exceeded, showing skip option');
      // Dispatch ACTION_INVALID with high retry count - state machine will handle
      this.sendCommand('RETRY', { reason: result.reason });
    }
  }

  /**
   * Handle blocked click from ClickInterceptor
   */
  private onClickBlocked(element: HTMLElement): void {
    this.log(`Click blocked on ${element.tagName}`);
    // Could show a warning toast here
    // For now, pulse effect is handled by interceptor
  }

  /**
   * Get auto-advance delay based on action type
   */
  private getAdvanceDelay(actionType: ActionType): number {
    switch (actionType) {
      case 'click':
      case 'submit':
        return ADVANCE_DELAY_CLICK;
      case 'select_change':
        return ADVANCE_DELAY_SELECT;
      case 'input_commit':
        return ADVANCE_DELAY_INPUT;
      default:
        return ADVANCE_DELAY_DEFAULT;
    }
  }

  /**
   * Flash success effect on element
   */
  private flashSuccess(element: HTMLElement): void {
    element.classList.add('walkthrough-flash-success');
    setTimeout(() => {
      element.classList.remove('walkthrough-flash-success');
    }, 250);
  }

  /**
   * Flash error effect on element
   */
  private flashError(element: HTMLElement): void {
    element.classList.add('walkthrough-flash-error');
    setTimeout(() => {
      element.classList.remove('walkthrough-flash-error');
    }, 400);
  }

  // Update handleMachineState to call new methods
  private handleMachineState(
    state: WalkthroughMachineState,
    previousState: WalkthroughMachineState | null,
  ): void {
    // ... existing switch cases ...

    // When entering WAITING_ACTION
    case 'WAITING_ACTION':
      this.setupActionListeners();
      break;

    // When leaving WAITING_ACTION for any reason
    if (previousState === 'WAITING_ACTION' && state !== 'WAITING_ACTION') {
      this.teardownActionListeners();
    }
  }

  // Update destroy to clean up action detection
  destroy(): void {
    // ... existing cleanup ...
    this.teardownActionListeners();
    this.actionDetector = null;
    this.actionValidator = null;
    this.clickInterceptor = null;
  }
}
```

### CSS Flash Effects

Add to `extension/src/content/styles/walkthrough.css`:

```css
/* Success flash (green glow) */
.walkthrough-flash-success {
  animation: walkthrough-flash-success 0.25s ease-out;
}

@keyframes walkthrough-flash-success {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.8); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.4); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

/* Error flash (red glow) */
.walkthrough-flash-error {
  animation: walkthrough-flash-error 0.4s ease-out;
}

@keyframes walkthrough-flash-error {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.8); }
  50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.5); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

/* Click blocked pulse (teal glow) */
.walkthrough-pulse {
  animation: walkthrough-pulse 0.3s ease-out;
}

@keyframes walkthrough-pulse {
  0% { box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.8); }
  100% { box-shadow: 0 0 0 8px rgba(14, 165, 233, 0); }
}
```

### WalkthroughUI Updates

Add getter methods to WalkthroughUI for click interceptor:

```typescript
export class WalkthroughUI {
  // ... existing code ...

  /**
   * Get overlay container element (for click interception allowlist)
   */
  getOverlayContainer(): HTMLElement | null {
    return this.overlayManager.getContainer();
  }

  /**
   * Get tooltip element (for click interception allowlist)
   */
  getTooltipElement(): HTMLElement | null {
    return this.tooltipRenderer?.getElement() ?? null;
  }
}
```

---

## Ticket W-017: Action Detection Tests

### File Locations
- `extension/src/content/walkthrough/actions/__tests__/ActionDetector.test.ts` (~120 lines)
- `extension/src/content/walkthrough/actions/__tests__/ActionValidator.test.ts` (~120 lines)
- `extension/src/content/walkthrough/actions/__tests__/ClickInterceptor.test.ts` (~100 lines)

### Test Approach
- Use jsdom for DOM simulation
- Mock events with proper composedPath for shadow DOM tests
- Test cleanup thoroughly (memory leaks)

### Sample Test Structure

```typescript
// ActionDetector.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActionDetector } from '../ActionDetector';

describe('ActionDetector', () => {
  let container: HTMLElement;
  let detector: ActionDetector;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    onAction = vi.fn();
  });

  afterEach(() => {
    detector?.detach();
    container.remove();
  });

  describe('click detection', () => {
    it('should emit DetectedAction on click', () => {
      const button = document.createElement('button');
      container.appendChild(button);

      detector = new ActionDetector(onAction);
      detector.attach(button, 'click');

      button.click();

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'click',
          target: button,
        })
      );
    });
  });

  // ... more tests ...
});
```

---

## Files Created/Modified Summary

| Action | Path | Est. Lines |
|--------|------|------------|
| Create | `extension/src/content/walkthrough/actions/index.ts` | ~30 |
| Create | `extension/src/content/walkthrough/actions/ActionDetector.ts` | ~200 |
| Create | `extension/src/content/walkthrough/actions/ActionValidator.ts` | ~150 |
| Create | `extension/src/content/walkthrough/actions/ClickInterceptor.ts` | ~120 |
| Modify | `extension/src/content/walkthrough/WalkthroughController.ts` | ~+150 |
| Modify | `extension/src/content/walkthrough/ui/WalkthroughUI.ts` | ~+20 |
| Modify | `extension/src/content/styles/walkthrough.css` | ~+30 |
| Create | `extension/src/content/walkthrough/actions/__tests__/ActionDetector.test.ts` | ~120 |
| Create | `extension/src/content/walkthrough/actions/__tests__/ActionValidator.test.ts` | ~120 |
| Create | `extension/src/content/walkthrough/actions/__tests__/ClickInterceptor.test.ts` | ~100 |

**Total New Lines**: ~1,040

---

## Implementation Order

1. **W-013: ActionDetector.ts** (Day 1 morning)
   - Core detection logic
   - Tests for all action types

2. **W-014: ActionValidator.ts** (Day 1 afternoon)
   - `isClickOnTarget` with shadow DOM support
   - Retry counting
   - Tests

3. **W-015: ClickInterceptor.ts** (Day 2 morning)
   - Capture phase interception
   - Allowlist management
   - Visual feedback
   - Tests

4. **W-016: Controller Integration** (Day 2 afternoon)
   - Wire up all modules
   - State machine integration
   - CSS flash effects

5. **W-017: Integration Tests** (Day 3)
   - End-to-end action flow tests
   - Edge case coverage
   - Build verification

---

## Backwards Compatibility Checklist

- [ ] `isClickOnTarget()` matches existing behavior exactly
- [ ] Input baseline/blur pattern preserved
- [ ] Submit listener attached to form, not button
- [ ] Auto-advance delays match (60/120/150ms)
- [ ] Click interception uses capture phase
- [ ] Visual feedback matches (pulse, flash effects)

---

## Definition of Done

- [x] All 5 tickets completed
- [x] All action types detected correctly
- [x] Validation matches existing behavior
- [x] Click interceptor blocks non-target clicks
- [x] All tests pass (existing + new: 651 total, 53 new action tests)
- [x] Build passes
- [x] Codex review passed (3 critical issues found and fixed)
- [x] Feature flag allows rollback

---

## Completion Summary

**Completed**: 2026-02-02

### Final Line Counts

| Component | Actual Lines |
|-----------|-------------|
| `ActionDetector.ts` | ~320 |
| `ActionValidator.ts` | ~355 |
| `ClickInterceptor.ts` | ~230 |
| `actions/index.ts` | ~40 |
| Controller integration | ~+200 |
| CSS animations | ~+40 |
| Tests (3 files) | ~400 |

**Total**: ~1,585 lines (vs ~1,040 estimated)

### Key Implementation Notes

1. **Input Baseline**: Set at attach time AND refreshed on focusin (legacy parity)
2. **Blur Phase**: Uses bubble phase (not capture) to match legacy
3. **Select Validation Quirk**: Accepts event.target OR targetElement as `<select>`
4. **ClickInterceptor**: Session-scoped - enabled at init, target updated per step
5. **REPORT_ACTION**: New message command for content → background reporting
6. **State Cleanup**: `cleanupActionState()` called when leaving WAITING_ACTION
7. **Timeout Tracking**: `advanceTimeout` tracked and cancelled on destroy

### Codex Review Findings (All Fixed)

| Issue | Fix |
|-------|-----|
| No cleanup when leaving WAITING_ACTION | Added `cleanupActionState()` |
| setTimeout not cancelled on destroy | Track `advanceTimeout`, cancel in destroy() |
| Stale listeners on rapid transitions | Cleanup in `handleMachineState()` |
