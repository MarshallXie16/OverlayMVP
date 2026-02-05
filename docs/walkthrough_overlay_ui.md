# Walkthrough Overlay UI Architecture

**EXT-002: Overlay UI Foundation**
**Epic 4, Story 4.2-4.3: Start Walkthrough & Complete Steps**

---

## Overview

The Walkthrough Overlay UI provides visual guidance for users completing workflows. It consists of:
1. **Backdrop**: Semi-transparent dark overlay covering the entire page
2. **Spotlight**: Highlighted area around target element (cutout in backdrop)
3. **Tooltip**: Floating card with instructions, positioned near target element
4. **Controls**: Navigation buttons (Next, Back, Exit) and progress indicator

---

## Design Goals

1. **Non-Intrusive**: Dim the page without blocking interaction with target element
2. **Clear Focus**: User's attention naturally drawn to highlighted element
3. **Accessible**: High contrast, large text, keyboard navigation support
4. **Performant**: Smooth animations, no jank, minimal DOM manipulation
5. **Responsive**: Works on all screen sizes, repositions intelligently

---

## Component Hierarchy

```
WalkthroughOverlay (main coordinator)
├── Backdrop (dark semi-transparent overlay with cutout)
├── Tooltip (instruction card)
│   ├── Header (progress indicator, close button)
│   ├── Content (instruction text, field label)
│   └── Footer (navigation buttons)
└── HighlightBorder (optional: animated border around target)
```

---

## Technical Architecture

### DOM Structure

```html
<div id="walkthrough-overlay" class="walkthrough-overlay">
  <!-- Backdrop with SVG mask for spotlight -->
  <div class="walkthrough-backdrop">
    <svg class="walkthrough-spotlight-mask">
      <defs>
        <mask id="spotlight-mask">
          <rect fill="white" width="100%" height="100%" />
          <rect fill="black" x="..." y="..." width="..." height="..." rx="8" />
        </mask>
      </defs>
      <rect fill="rgba(0,0,0,0.7)" width="100%" height="100%" mask="url(#spotlight-mask)" />
    </svg>
  </div>

  <!-- Tooltip positioned near target element -->
  <div class="walkthrough-tooltip" style="top: ...; left: ...;">
    <div class="walkthrough-tooltip-header">
      <div class="walkthrough-progress">Step 1 of 5</div>
      <button class="walkthrough-close-btn">×</button>
    </div>
    <div class="walkthrough-tooltip-content">
      <p class="walkthrough-field-label">Email Address</p>
      <p class="walkthrough-instruction">Enter your work email address</p>
    </div>
    <div class="walkthrough-tooltip-footer">
      <button class="walkthrough-btn-back">← Back</button>
      <button class="walkthrough-btn-next">Next →</button>
      <button class="walkthrough-btn-exit">Exit</button>
    </div>
  </div>

  <!-- Optional: Animated highlight border -->
  <div class="walkthrough-highlight-border" style="top: ...; left: ...; width: ...; height: ...;"></div>
</div>
```

### CSS Strategy

**Load via manifest.json** (see lessons in `lessons.md`):
```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/walkthrough.js"],
      "css": ["styles/walkthrough.css"]
    }
  ]
}
```

**Key CSS Classes**:
- `.walkthrough-overlay`: Full-screen fixed container (z-index: 10000)
- `.walkthrough-backdrop`: Full-screen, pointer-events: none (allows clicks through to target)
- `.walkthrough-tooltip`: Floating card, pointer-events: auto
- `.walkthrough-spotlight-mask`: SVG mask with cutout for target element

---

## Positioning Logic

### Tooltip Positioning

**Priority Order** (avoid covering target element):
1. **Below & Centered**: If space below target >= 250px
2. **Above & Centered**: If space above target >= 250px
3. **Right Side**: If space to right >= 350px
4. **Left Side**: If space to left >= 350px
5. **Fallback**: Bottom-right corner of viewport

**Algorithm**:
```typescript
function calculateTooltipPosition(
  targetRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number
): { top: number; left: number; placement: Placement } {
  const padding = 16; // Gap between target and tooltip
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Try below first
  if (targetRect.bottom + padding + tooltipHeight < viewportHeight) {
    return {
      top: targetRect.bottom + padding,
      left: Math.max(padding, Math.min(
        targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        viewportWidth - tooltipWidth - padding
      )),
      placement: 'bottom',
    };
  }

  // Try above
  if (targetRect.top - padding - tooltipHeight > 0) {
    return {
      top: targetRect.top - padding - tooltipHeight,
      left: Math.max(padding, Math.min(
        targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        viewportWidth - tooltipWidth - padding
      )),
      placement: 'top',
    };
  }

  // Try right/left or fallback...
  // (similar logic)
}
```

### Spotlight Positioning

**Expand target rect slightly** for breathing room:
```typescript
function calculateSpotlightRect(targetRect: DOMRect): SpotlightRect {
  const padding = 8; // px to expand around element
  return {
    x: targetRect.left - padding,
    y: targetRect.top - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2,
    borderRadius: 8,
  };
}
```

---

## State Management

### Overlay State

```typescript
interface OverlayState {
  isVisible: boolean;
  currentStep: StepResponse;
  targetElement: HTMLElement;
  tooltipPosition: { top: number; left: number; placement: Placement };
  spotlightRect: SpotlightRect;
  isAnimating: boolean;
}
```

### Lifecycle

```
initializeWalkthrough()
  ↓
createOverlay()
  ↓
showStep(stepIndex)
  ↓ (user clicks Next)
hideStep()
  ↓
showStep(stepIndex + 1)
  ↓ (repeat until complete)
destroyOverlay()
```

---

## Interaction Patterns

### Auto-Advance Detection (EXT-004)

**User performs expected action** → Detect event → Validate → Auto-advance

**Example**: Step says "Click Submit button"
1. User clicks Submit button
2. Content script detects click event
3. Validates: clicked element matches target element
4. Auto-advances to next step (no manual "Next" click needed)

**Fallback**: User can always click "Next" manually

### Keyboard Shortcuts (Backlog)

- **N** or **→**: Next step
- **B** or **←**: Previous step
- **Esc**: Exit walkthrough (with confirmation)
- **?**: Show help (screenshot from recording)

---

## Animation Strategy

### Entrance Animation

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.walkthrough-overlay {
  animation: fadeIn 0.2s ease-out;
}

.walkthrough-tooltip {
  animation: slideUp 0.3s ease-out;
}
```

### Step Transition

When advancing to next step:
1. Fade out current tooltip (150ms)
2. Move spotlight to new target (200ms with easing)
3. Fade in new tooltip (150ms)
4. Total transition: ~500ms

**Avoid jarring transitions** - use CSS transitions for smooth movement.

---

## Accessibility Considerations

1. **Focus Management**: Trap focus within tooltip when active
2. **Aria Labels**: 
   - `role="dialog"` on tooltip
   - `aria-label="Walkthrough guide"` on overlay
   - `aria-describedby` linking instruction text
3. **Keyboard Navigation**: All buttons keyboard-accessible
4. **High Contrast**: Dark backdrop with light tooltip (WCAG AAA)
5. **Screen Reader Announcements**: Announce step changes via `aria-live="polite"`

---

## Performance Optimization

1. **Debounce Scroll/Resize**: Reposition tooltip max once per 100ms
2. **RequestAnimationFrame**: Use for smooth animations
3. **CSS Transforms**: Use `translate3d` for GPU acceleration
4. **Minimize Reflows**: Batch DOM updates, read then write
5. **Lazy Cleanup**: Remove overlay DOM after 500ms fade-out

---

## Error Handling

### Element Not Found

If `findElement()` fails:
1. Show error in tooltip: "Cannot find [Field Label]. This workflow may be outdated."
2. Offer options:
   - "Skip this step" (marks incomplete, continues)
   - "Report issue" (sends to backend, offers to exit)
   - "Try again" (re-runs findElement)

### User Clicks Wrong Element

Detected in EXT-004 (Action Validation):
1. Show warning: "That's not quite right. Please click on: [Field Label]"
2. Keep spotlight on correct element
3. Allow immediate retry

### Page Navigation During Walkthrough

If URL changes unexpectedly:
1. Check if navigation was expected (step action_type='navigate')
2. If unexpected: Pause walkthrough, show modal:
   - "You've navigated away from the workflow. Do you want to continue or exit?"
3. If expected: Move to next step

---

## Integration Points

### With Element Finder (EXT-003)

```typescript
// When showing step, find element first
const result = await findElement(currentStep);
if (!result) {
  handleElementNotFound(currentStep);
  return;
}

// Position overlay around found element
updateOverlay(result.element);
```

### With Walkthrough State (EXT-001)

```typescript
// Overlay reads from walkthrough state
const state = getWalkthroughState();
if (!state) return;

const currentStep = state.steps[state.currentStepIndex];
showStep(currentStep);
```

### With Health Logging (BE-011)

When walkthrough completes or fails:
```typescript
await apiClient.logExecution(workflowId, {
  status: 'success',
  execution_time_ms: endTime - startTime,
  page_url: window.location.href,
});
```

---

## Testing Strategy

### Unit Tests

1. **calculateTooltipPosition()**: Test all placement scenarios
2. **calculateSpotlightRect()**: Verify padding applied correctly
3. **State transitions**: Test step advancement logic

### Integration Tests

1. Create mock page with test elements
2. Initialize walkthrough with test workflow
3. Verify overlay renders correctly
4. Test navigation (Next, Back, Exit)
5. Test responsive positioning

### Manual Testing Checklist

- [ ] Overlay renders on all major browsers (Chrome, Firefox, Edge)
- [ ] Tooltip positions correctly for elements at: top, bottom, left, right, center of viewport
- [ ] Spotlight cutout matches target element precisely
- [ ] Animations smooth (60fps)
- [ ] Keyboard navigation works
- [ ] Exit confirmation modal appears
- [ ] Works on mobile viewport sizes

---

## Future Enhancements (Backlog)

1. **Smart Scrolling**: Auto-scroll to bring target element into view if off-screen
2. **Screenshot Comparison**: Show "before" screenshot on hover over "?" button
3. **Step Thumbnails**: Mini timeline showing all steps, click to jump
4. **Dark Mode Support**: Detect system preference, adjust colors
5. **Custom Themes**: Allow admins to configure colors/branding
6. **Video Playback**: Show original recording video alongside walkthrough

---

## Implementation Plan (EXT-002)

### Phase 1: Core Overlay (This PR)
- [x] Create walkthrough.css with base styles
- [x] Implement createOverlay() and destroyOverlay()
- [x] Implement spotlight with SVG mask
- [x] Implement tooltip with positioning logic
- [x] Add basic controls (Next, Back, Exit)
- [x] Add progress indicator

### Phase 2: Integration (EXT-004)
- [ ] Connect to element finder
- [ ] Implement step progression
- [ ] Add action detection and validation
- [ ] Add auto-advance on correct action

### Phase 3: Error Handling (EXT-005)
- [ ] Element not found error UI
- [ ] Wrong action warning UI
- [ ] Page navigation handling

### Phase 4: Polish (Future)
- [ ] Smooth animations and transitions
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements
- [ ] Mobile optimizations

---

**Status**: Ready for implementation
**Next Steps**: Begin Phase 1 implementation
