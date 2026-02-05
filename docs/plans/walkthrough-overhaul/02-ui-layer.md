# Sprint 2: UI Layer

**Duration**: 2-3 days
**Dependencies**: Sprint 1 (Foundation)
**Status**: Not Started
**Last Updated**: 2026-01-30 (incorporated Codex review feedback)

---

## Objective

**KEEP EXISTING UI** - The current walkthrough UI (overlay, spotlight, tooltip, CSS) is good.
This sprint wraps existing UI logic into modular components without visual changes.

Extract and modularize UI rendering logic from walkthrough.ts into focused wrapper modules.
Each module handles one responsibility but reuses the existing rendering code/CSS.

---

## Tickets

### W-006: Create OverlayManager.ts
**Priority**: P0
**Estimate**: 6 hours
**Dependencies**: Sprint 1 complete
**Files to Create**:
- `extension/src/content/walkthrough/ui/OverlayManager.ts` (~250 lines)
- `extension/src/content/walkthrough/ui/index.ts` (~30 lines)

**Acceptance Criteria**:
- [ ] Creates overlay container with proper z-index (999999)
- [ ] Creates SVG backdrop with mask support
- [ ] Manages overlay lifecycle (create/destroy)
- [ ] Handles stale overlay cleanup (BUG-001 fix preserved)
- [ ] Exposes container refs for other UI components

**Key API**:
```typescript
class OverlayManager {
  private container: HTMLDivElement | null = null;
  private backdrop: SVGSVGElement | null = null;

  create(): { container: HTMLDivElement; backdrop: SVGSVGElement };
  destroy(): void;
  isCreated(): boolean;

  getContainer(): HTMLDivElement | null;
  getBackdrop(): SVGSVGElement | null;
}
```

**DOM Structure**:
```html
<div id="walkthrough-overlay" role="dialog" aria-modal="true">
  <svg class="walkthrough-backdrop">
    <defs>
      <mask id="spotlight-mask">
        <rect fill="white" width="100%" height="100%"/>
        <rect id="spotlight-cutout" fill="black" rx="8"/>
      </mask>
    </defs>
    <rect class="walkthrough-backdrop-fill" mask="url(#spotlight-mask)"/>
  </svg>
  <!-- Tooltip inserted here by TooltipRenderer -->
</div>
```

---

### W-007: Create SpotlightRenderer.ts
**Priority**: P0
**Estimate**: 4 hours
**Dependencies**: W-006
**Files to Create**:
- `extension/src/content/walkthrough/ui/SpotlightRenderer.ts` (~150 lines)

**Acceptance Criteria**:
- [ ] Positions spotlight cutout around target element
- [ ] Handles 8px padding around element
- [ ] Updates on scroll/resize (debounced 100ms)
- [ ] Validates element has non-zero dimensions
- [ ] Hides spotlight when no element (width/height = 0)
- [ ] Cleanup removes event listeners

**Key API**:
```typescript
class SpotlightRenderer {
  private spotlightRect: SVGRectElement | null = null;
  private currentElement: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  initialize(backdrop: SVGSVGElement): void;
  highlight(element: HTMLElement): void;
  hide(): void;
  destroy(): void;

  private updatePosition(): void;
  private setupScrollListener(): void;
  private setupResizeObserver(): void;
}
```

---

### W-008: Create TooltipRenderer.ts
**Priority**: P0
**Estimate**: 6 hours
**Dependencies**: W-006
**Files to Create**:
- `extension/src/content/walkthrough/ui/TooltipRenderer.ts` (~200 lines)

**Acceptance Criteria**:
- [ ] Renders tooltip with step info (field_label, instruction)
- [ ] Smart positioning (below/above/left/right of element)
- [ ] Event delegation for buttons (Next, Back, Skip, Exit)
- [ ] Draggable header functionality preserved
- [ ] XSS prevention (escapeHtml for user content)
- [ ] Updates content without full re-render

**Key API**:
```typescript
interface TooltipContent {
  stepNumber: number;
  totalSteps: number;
  fieldLabel: string;
  instruction: string;
  canGoBack: boolean;
  canSkip: boolean;
  showError?: string;
}

class TooltipRenderer {
  private tooltip: HTMLDivElement | null = null;
  private onAction: (action: 'next' | 'back' | 'skip' | 'exit') => void;

  initialize(container: HTMLDivElement, onAction: TooltipActionHandler): void;
  render(content: TooltipContent): void;
  position(targetElement: HTMLElement): void;
  showError(message: string): void;
  hideError(): void;
  setButtonsEnabled(enabled: boolean): void;
  destroy(): void;

  private calculatePosition(target: HTMLElement): { top: number; left: number };
  private setupDragHandlers(): void;
}
```

**Positioning Algorithm**:
1. Try below target (preferred)
2. Try above target
3. Try right of target
4. Try left of target
5. Fallback: bottom-right corner

---

### W-009: Create ProgressIndicator.ts
**Priority**: P1
**Estimate**: 2 hours
**Dependencies**: W-008
**Files to Create**:
- `extension/src/content/walkthrough/ui/ProgressIndicator.ts` (~80 lines)

**Acceptance Criteria**:
- [ ] Renders progress bar in tooltip header
- [ ] Updates width based on currentStep/totalSteps
- [ ] Smooth animation on progress change
- [ ] Shows step count text (e.g., "Step 3 of 8")

**Key API**:
```typescript
class ProgressIndicator {
  private progressBar: HTMLDivElement | null = null;
  private stepText: HTMLSpanElement | null = null;

  initialize(headerElement: HTMLElement): void;
  update(currentStep: number, totalSteps: number): void;
  setComplete(): void;
  destroy(): void;
}
```

---

### W-010: Create ErrorDisplay.ts
**Priority**: P1
**Estimate**: 3 hours
**Dependencies**: W-006
**Files to Create**:
- `extension/src/content/walkthrough/ui/ErrorDisplay.ts` (~100 lines)

**Acceptance Criteria**:
- [ ] Shows element-not-found error modal
- [ ] Shows unrecoverable error modal
- [ ] Provides Skip/Retry/Exit options
- [ ] Centered modal with warning icon
- [ ] Accessible (ARIA attributes)

**Key API**:
```typescript
interface ErrorOptions {
  canSkip: boolean;
  canRetry: boolean;
  stepLabel: string;
}

class ErrorDisplay {
  private modal: HTMLDivElement | null = null;
  private onAction: (action: 'skip' | 'retry' | 'exit') => void;

  initialize(container: HTMLDivElement, onAction: ErrorActionHandler): void;
  showElementNotFound(options: ErrorOptions): void;
  showUnrecoverable(message: string, options: ErrorOptions): void;
  hide(): void;
  destroy(): void;
}
```

---

### W-011: Port Existing CSS
**Priority**: P1
**Estimate**: 2 hours
**Dependencies**: W-006 to W-010
**Files to Modify**:
- `extension/src/content/styles/walkthrough.css` (review and organize)

**Acceptance Criteria**:
- [ ] CSS works with new component structure
- [ ] No visual regressions
- [ ] CSS variables for theming (if not already)
- [ ] Classes properly namespaced (.walkthrough-*)

**CSS Classes to Verify**:
- `.walkthrough-overlay`
- `.walkthrough-backdrop`
- `.walkthrough-tooltip`
- `.walkthrough-tooltip-header`
- `.walkthrough-btn-*`
- `.walkthrough-progress-*`
- `.walkthrough-error-*`

---

### W-012: UI Component Tests
**Priority**: P1
**Estimate**: 6 hours
**Dependencies**: W-006 to W-011
**Files to Create**:
- `extension/src/content/walkthrough/ui/__tests__/OverlayManager.test.ts` (~100 lines)
- `extension/src/content/walkthrough/ui/__tests__/SpotlightRenderer.test.ts` (~80 lines)
- `extension/src/content/walkthrough/ui/__tests__/TooltipRenderer.test.ts` (~120 lines)

**Test Cases**:

**OverlayManager.test.ts**:
- [ ] Creates overlay with correct structure
- [ ] Destroys overlay and cleans up DOM
- [ ] Handles stale overlay cleanup
- [ ] Returns null when not created

**SpotlightRenderer.test.ts**:
- [ ] Positions spotlight around element
- [ ] Updates on scroll (debounced)
- [ ] Hides when no element
- [ ] Cleans up listeners on destroy

**TooltipRenderer.test.ts**:
- [ ] Renders step content correctly
- [ ] Positions in preferred locations
- [ ] Falls back when no space
- [ ] Escapes HTML in content
- [ ] Button events dispatch actions

---

## Files Changed Summary

| Action | Path | Est. Lines |
|--------|------|------------|
| Create | `extension/src/content/walkthrough/ui/index.ts` | ~30 |
| Create | `extension/src/content/walkthrough/ui/OverlayManager.ts` | ~250 |
| Create | `extension/src/content/walkthrough/ui/SpotlightRenderer.ts` | ~150 |
| Create | `extension/src/content/walkthrough/ui/TooltipRenderer.ts` | ~200 |
| Create | `extension/src/content/walkthrough/ui/ProgressIndicator.ts` | ~80 |
| Create | `extension/src/content/walkthrough/ui/ErrorDisplay.ts` | ~100 |
| Modify | `extension/src/content/styles/walkthrough.css` | ~50 |
| Create | `extension/src/content/walkthrough/ui/__tests__/OverlayManager.test.ts` | ~100 |
| Create | `extension/src/content/walkthrough/ui/__tests__/SpotlightRenderer.test.ts` | ~80 |
| Create | `extension/src/content/walkthrough/ui/__tests__/TooltipRenderer.test.ts` | ~120 |

**Total New Lines**: ~1,160

---

## Definition of Done

- [ ] All 7 tickets completed
- [ ] Visual parity with existing walkthrough UI
- [ ] All tests pass
- [ ] Build passes
- [ ] Components can be imported and used independently
- [ ] No CSS conflicts with host pages

---

## Integration Notes

After this sprint, WalkthroughController can be updated to use these components:

```typescript
class WalkthroughController {
  private overlayManager = new OverlayManager();
  private spotlightRenderer = new SpotlightRenderer();
  private tooltipRenderer = new TooltipRenderer();
  private errorDisplay = new ErrorDisplay();

  private showStep(step: StepResponse): void {
    const { container, backdrop } = this.overlayManager.create();
    this.spotlightRenderer.initialize(backdrop);
    this.tooltipRenderer.initialize(container, this.handleAction);
    this.errorDisplay.initialize(container, this.handleErrorAction);

    // Find element and highlight
    const element = await findElement(step.selectors);
    this.spotlightRenderer.highlight(element);
    this.tooltipRenderer.render({ ... });
    this.tooltipRenderer.position(element);
  }
}
```
