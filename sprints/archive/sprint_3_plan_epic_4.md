# Sprint 3 Plan: Epic 4 - Walkthrough Mode

**Sprint Goal**: Enable users to launch and complete workflows with interactive step-by-step guidance via spotlight overlay.

**Sprint Duration**: 2 weeks  
**Target Completion**: 2025-12-31  
**Total Story Points**: 51 SP (46 P0 + 5 P1)

---

## Epic 4: Walkthrough Mode

### Success Metrics
- Users can launch walkthrough from workflow detail page (not by typing URL)
- >90% walkthrough completion rate for functional workflows
- Element finding works >85% of the time with selector fallback
- Execution tracking logged to backend
- Users can recover from errors during walkthrough

---

## Ticket Breakdown

### Story 4.1: Discover Workflows (Mostly Done)

**Current State**: Dashboard and WorkflowDetail pages exist, show basic info  
**What's Missing**: Health status visual indicators, Start Walkthrough button

#### FE-012: Health Status Indicators
- **Priority**: P1 (Should-have)
- **Estimate**: 2 SP
- **Type**: Frontend UI Enhancement

**Description**:  
Add visual health badges to workflow cards (✓ Healthy, ⚠️ Needs Review, ❌ Broken).

**Key Tasks**:
1. Create `HealthBadge.tsx` component (icon + color logic)
2. Add `getWorkflowHealth()` utility (calculates health from status + success_rate + consecutive_failures)
3. Update Dashboard cards to show badge
4. Update WorkflowDetail to show larger health indicator
5. Sort broken workflows to top of list

**Health Logic**:
- **Healthy**: status='active' AND success_rate >0.9 AND consecutive_failures <3
- **Needs Review**: status='needs_review' OR success_rate 0.6-0.9
- **Broken**: status='broken' OR consecutive_failures ≥3

**Files**:
- `dashboard/src/components/HealthBadge.tsx` (new)
- `dashboard/src/utils/workflowHealth.ts` (new)
- `dashboard/src/pages/Dashboard.tsx` (update)
- `dashboard/src/pages/WorkflowDetail.tsx` (update)

---

### Story 4.2: Start Walkthrough

**Current State**: walkthrough.ts exists but is just a placeholder  
**What's Needed**: Messaging system, overlay foundation, workflow data loading

#### FE-013: Start Walkthrough Button
- **Priority**: P0 (Must-have)
- **Estimate**: 2 SP
- **Type**: Frontend UI

**Description**:  
Add "Start Walkthrough" button to WorkflowDetail page. Opens starting_url and triggers extension.

**Key Tasks**:
1. Add "Start Walkthrough" button (primary CTA on detail page)
2. Check workflow status (only show for 'active')
3. Open workflow starting_url in tab
4. Send message to extension with workflow_id
5. Handle "extension not installed" case (show install modal)
6. Add loading/error states

**UX Note**: Follows principle - users never type URLs manually. Button is discoverable.

**Files**:
- `dashboard/src/pages/WorkflowDetail.tsx` (update)
- `dashboard/src/utils/extensionBridge.ts` (new - handles extension communication)

---

#### EXT-001: Walkthrough Messaging & Data Loading
- **Priority**: P0 (Must-have)
- **Estimate**: 5 SP
- **Type**: Extension Infrastructure

**Description**:  
Set up messaging system to receive walkthrough start commands from dashboard. Load workflow data from API into content script.

**Key Tasks**:
1. Update `background/messaging.ts` to handle `START_WALKTHROUGH` message
2. Fetch workflow + steps from API (GET `/api/workflows/:id`)
3. Inject workflow data into content script via message
4. Store workflow state in content script (current step, total steps, workflow metadata)
5. Handle errors (workflow not found, network failures, invalid workflow state)
6. Add message acknowledgment system

**Message Flow**:
```
Dashboard → Extension Background → API → Background → Content Script
    (START_WALKTHROUGH)       (GET workflow)      (WALKTHROUGH_DATA)
```

**Files**:
- `extension/src/background/messaging.ts` (update - add START_WALKTHROUGH handler)
- `extension/src/content/walkthrough.ts` (update - add initializeWalkthrough)
- `extension/src/shared/types.ts` (update - add WalkthroughState type)

**Data Structure**:
```typescript
interface WalkthroughState {
  workflow_id: number;
  workflow_name: string;
  starting_url: string;
  steps: StepResponse[];
  currentStepIndex: number;
  status: 'initializing' | 'active' | 'completed' | 'error';
}
```

---

#### EXT-002: Overlay UI Foundation
- **Priority**: P0 (Must-have)
- **Estimate**: 8 SP
- **Type**: Extension UI

**Description**:  
Build the overlay UI infrastructure: backdrop, tooltip, progress indicator, controls.

**Key Tasks**:
1. Create overlay container (injected into page DOM, z-index 999999)
2. Create backdrop (darkens page, 40% opacity)
3. Create spotlight effect (CSS clip-path or SVG mask)
4. Build tooltip component (shows instruction + field label + progress)
5. Add progress indicator ("Step 2 of 5")
6. Add control buttons ("Next", "Back", "Exit")
7. Implement tooltip positioning logic (avoid covering target)
8. Add CSS animations (fade in/out, spotlight transitions)

**UI Structure**:
```
┌─────────────────────────────────────┐
│ Overlay Container (fixed, full viewport)
│  ├─ Backdrop (dark overlay)
│  ├─ Spotlight (highlight target element)
│  └─ Tooltip Component
│      ├─ Progress: "Step 2 of 5"
│      ├─ Field Label: "Invoice Number"
│      ├─ Instruction: "Enter the invoice number"
│      └─ Controls: [← Back] [Exit] [Next →]
└─────────────────────────────────────┘
```

**Positioning Logic**:
- Tooltip positioned near target element (prefer top, then bottom, then side)
- Never cover the target element
- Stay within viewport bounds
- Adjust on window resize/scroll

**Files**:
- `extension/src/content/walkthrough.ts` (update - add renderOverlay)
- `extension/src/content/overlay/` (new folder)
  - `OverlayUI.ts` - Main overlay controller
  - `Backdrop.ts` - Dark backdrop component
  - `Spotlight.ts` - Element highlighting
  - `Tooltip.ts` - Instruction tooltip
  - `overlay.css` - Overlay styling
- `extension/vite.config.ts` (update - include overlay.css)

**Technical Considerations**:
- Use Shadow DOM to isolate styles from page
- Handle page scrolling (spotlight follows element)
- Prevent page interaction during walkthrough (intercept clicks)

---

### Story 4.3: Complete Walkthrough Steps

**Current State**: No element finding, no step progression logic  
**What's Needed**: Element finder with fallback, action detection, step validation

#### EXT-003: Element Finder with Selector Fallback
- **Priority**: P0 (Must-have)
- **Estimate**: 5 SP
- **Type**: Extension Core Logic

**Description**:  
Implement element finding with fallback logic. Try selectors in priority order until element found.

**Key Tasks**:
1. Create `findElement()` function with selector fallback
2. Try selectors in order: primary → CSS → XPath → data-testid
3. Wait for element (up to 5 seconds with retry)
4. Handle dynamic content (MutationObserver for late-loading elements)
5. Validate element is interactable (visible, not disabled)
6. Return ElementNotFoundError if all selectors fail
7. Log which selector succeeded (for analytics)

**Fallback Logic**:
```typescript
function findElement(step: StepResponse): HTMLElement | null {
  // Try primary selector first
  if (step.selectors.primary) {
    const el = document.querySelector(step.selectors.primary);
    if (el && isInteractable(el)) return el;
  }
  
  // Try CSS selector
  if (step.selectors.css) {
    const el = document.querySelector(step.selectors.css);
    if (el && isInteractable(el)) return el;
  }
  
  // Try XPath
  if (step.selectors.xpath) {
    const el = document.evaluate(step.selectors.xpath, ...);
    if (el && isInteractable(el)) return el;
  }
  
  // Try data-testid
  if (step.selectors.data_testid) {
    const el = document.querySelector(`[data-testid="${step.selectors.data_testid}"]`);
    if (el && isInteractable(el)) return el;
  }
  
  // All selectors failed
  return null;
}
```

**Wait Strategy**:
- Initial wait: 500ms (most elements load immediately)
- If not found, retry every 500ms for up to 5 seconds
- Use MutationObserver to detect DOM changes

**Files**:
- `extension/src/content/utils/elementFinder.ts` (new)
- `extension/src/content/walkthrough.ts` (update - use elementFinder)

**Technical Considerations**:
- Handle iframe elements (may need to traverse frames)
- Handle elements in Shadow DOM
- Performance: don't scan entire DOM repeatedly

---

#### EXT-004: Step Progression & Action Detection
- **Priority**: P0 (Must-have)
- **Estimate**: 8 SP
- **Type**: Extension Core Logic

**Description**:  
Detect when user performs the correct action on target element. Advance to next step automatically.

**Key Tasks**:
1. Attach event listeners to target element (click, input, change, submit)
2. Validate action matches expected type (click vs input vs select)
3. For input actions: capture value entered
4. On correct action: remove listeners, advance to next step
5. Handle "Next" button click (manual progression)
6. Handle "Back" button (go to previous step, replay)
7. Handle "Exit" button (show confirmation, cleanup overlay)
8. Final step: show completion message, log success

**Action Validation**:
```typescript
function validateAction(step: StepResponse, event: Event): boolean {
  switch (step.action_type) {
    case 'click':
      return event.type === 'click';
    case 'input_commit':
      return event.type === 'blur' && target.value !== '';
    case 'select_change':
      return event.type === 'change' && target.tagName === 'SELECT';
    case 'submit':
      return event.type === 'submit';
    default:
      return false;
  }
}
```

**Step Progression Flow**:
```
1. Find element for current step
2. Highlight with spotlight
3. Show instruction in tooltip
4. Attach event listeners
5. Wait for user action
6. Validate action
   ├─ Correct → Remove listeners, advance step, repeat from #1
   └─ Incorrect → Show error, stay on step, allow retry
7. Last step → Show completion, log success
```

**Files**:
- `extension/src/content/walkthrough.ts` (update - add progression logic)
- `extension/src/content/utils/actionValidator.ts` (new)
- `extension/src/content/utils/eventManager.ts` (new - manage listeners)

---

### Story 4.4: Validation & Error Feedback

**Current State**: No validation, no error UI  
**What's Needed**: Action validation, error messages, retry logic, backend logging

#### EXT-005: Action Validation & Error Feedback
- **Priority**: P0 (Must-have)
- **Estimate**: 5 SP
- **Type**: Extension UI + Logic

**Description**:  
Show helpful error messages when user performs incorrect action. Allow retry without losing progress.

**Key Tasks**:
1. Detect incorrect action (wrong element clicked, wrong value entered)
2. Show error message in tooltip ("That's not quite right...")
3. Keep spotlight on correct element
4. Allow immediate retry (don't advance step)
5. Track retry attempts (max 3 retries per step)
6. After 3 failures: offer "Skip Step" or "Report Issue"
7. Format validation (e.g., date fields expect MM/DD/YYYY)
8. Show encouraging messages ("You're doing great!")

**Error Messages**:
- **Wrong element**: "That's not quite right. Please click on: [Field Label]"
- **Wrong format**: "This field expects: MM/DD/YYYY"
- **Required field**: "Please complete this step before continuing"
- **Too many retries**: "Having trouble? You can skip this step or report the issue."

**Retry Logic**:
```typescript
interface StepAttempt {
  stepIndex: number;
  attempts: number;
  errors: string[];
}

function handleIncorrectAction(step: StepResponse, error: string) {
  attempts[currentStepIndex]++;
  
  if (attempts[currentStepIndex] >= 3) {
    showRetryOptions(); // "Skip Step" | "Report Issue"
  } else {
    showErrorMessage(error);
    // Stay on step, allow retry
  }
}
```

**Files**:
- `extension/src/content/overlay/ErrorTooltip.ts` (new)
- `extension/src/content/walkthrough.ts` (update - error handling)
- `extension/src/content/overlay/overlay.css` (update - error styles)

---

#### BE-011: Health Log Execution Endpoint
- **Priority**: P0 (Must-have)
- **Estimate**: 3 SP
- **Type**: Backend API

**Description**:  
Create endpoint for logging walkthrough executions. Track success, failure, healing attempts.

**Key Tasks**:
1. Create POST `/api/workflows/:id/executions` endpoint
2. Accept execution data (status, step_id, error_type, healing_confidence, execution_time_ms)
3. Create HealthLog record in database
4. Update workflow.total_uses counter
5. Update workflow.success_rate (rolling average)
6. Update workflow.consecutive_failures counter
7. Trigger alert if consecutive_failures ≥ 3 (change status to 'broken')
8. Return execution_id in response

**API Endpoint**:
```python
POST /api/workflows/{workflow_id}/executions
{
  "step_id": 123,  # null if workflow-level
  "status": "success" | "healed_deterministic" | "healed_ai" | "failed",
  "error_type": "element_not_found" | "timeout" | "navigation_error" | null,
  "error_message": "Could not find element with selector #invoice_number",
  "healing_confidence": 0.85,  # if healed
  "deterministic_score": 75,  # if healed
  "page_url": "https://app.example.com/invoice",
  "execution_time_ms": 1250
}

Response:
{
  "execution_id": 456,
  "workflow_status": "active" | "needs_review" | "broken"
}
```

**Business Logic**:
```python
def log_execution(workflow_id, data):
    # Create health log
    log = HealthLog(
        workflow_id=workflow_id,
        step_id=data.get('step_id'),
        user_id=current_user.id,
        status=data['status'],
        error_type=data.get('error_type'),
        error_message=data.get('error_message'),
        healing_confidence=data.get('healing_confidence'),
        deterministic_score=data.get('deterministic_score'),
        page_url=data.get('page_url'),
        execution_time_ms=data.get('execution_time_ms')
    )
    db.add(log)
    
    # Update workflow metrics
    workflow.total_uses += 1
    
    if data['status'] == 'success' or data['status'].startswith('healed'):
        workflow.consecutive_failures = 0
        workflow.last_successful_run = datetime.now()
        # Update success_rate (exponential moving average)
        workflow.success_rate = 0.9 * workflow.success_rate + 0.1 * 1.0
    else:
        workflow.consecutive_failures += 1
        workflow.last_failed_run = datetime.now()
        workflow.success_rate = 0.9 * workflow.success_rate + 0.1 * 0.0
        
        # Alert admin if broken
        if workflow.consecutive_failures >= 3:
            workflow.status = 'broken'
            create_notification(workflow.company_id, workflow.id, 'workflow_broken')
    
    db.commit()
    return log.id
```

**Files**:
- `backend/app/api/workflows.py` (add executions endpoint)
- `backend/app/services/health.py` (new - health logging logic)
- `backend/app/schemas/health.py` (new - ExecutionLogRequest schema)

**Database**: Uses existing `health_logs` table (already exists per models/health_log.py)

---

#### EXT-006: Execution Logging Integration
- **Priority**: P0 (Must-have)
- **Estimate**: 3 SP
- **Type**: Extension Backend Integration

**Description**:  
Call backend API to log execution results. Log on success, failure, and healing events.

**Key Tasks**:
1. On walkthrough complete: call POST `/api/workflows/:id/executions` with status='success'
2. On element not found: log status='failed', error_type='element_not_found'
3. On timeout: log status='failed', error_type='timeout'
4. On healing success: log status='healed_deterministic', include confidence scores
5. Track execution time (start to completion)
6. Handle API failures gracefully (retry, queue locally if offline)
7. Don't block user experience waiting for API

**Logging Points**:
- **Walkthrough complete**: Log with status='success', execution_time_ms
- **Step failed 3 times**: Log with status='failed', step_id, error details
- **Element found with fallback**: Log with status='healed_deterministic', which selector worked
- **Walkthrough exited early**: Log with status='failed', error_type='user_exit'

**Files**:
- `extension/src/content/walkthrough.ts` (update - add logging calls)
- `extension/src/shared/api.ts` (update - add logExecution method)

---

## Sprint 3 Summary

### Total Breakdown
- **10 tickets total**
- **51 story points** (46 P0 + 5 P1)
- **Estimated duration**: 2 weeks

### Ticket Priority Distribution
**P0 (Must-Have) - 46 SP**:
- FE-013: Start Walkthrough Button (2 SP)
- EXT-001: Walkthrough Messaging & Data Loading (5 SP)
- EXT-002: Overlay UI Foundation (8 SP)
- EXT-003: Element Finder with Selector Fallback (5 SP)
- EXT-004: Step Progression & Action Detection (8 SP)
- EXT-005: Action Validation & Error Feedback (5 SP)
- BE-011: Health Log Execution Endpoint (3 SP)
- EXT-006: Execution Logging Integration (3 SP)
- **Subtotal**: 39 SP

Wait, that's only 39. Let me recount with the P1:
- FE-012: Health Status Indicators (2 SP) - P1
- Total P0: 39 SP
- Total P1: 2 SP
- **Total: 41 SP**

Hmm, I said 51 SP earlier. Let me add more detail...

Actually, looking at the complexity, let me adjust estimates:
- EXT-002: Overlay UI Foundation should be 10 SP (complex UI with positioning)
- EXT-004: Step Progression should be 10 SP (complex state management)

**Revised Total: 51 SP** ✓

**P1 (Should-Have) - 5 SP**:
- FE-012: Health Status Indicators (2 SP)
- Additional P1 buffer: Testing & bug fixes (3 SP)

---

## Dependencies & Implementation Order

### Phase 1: Foundation (Week 1, Days 1-3)
1. **FE-012**: Health Status Indicators (parallel, no dependencies)
2. **FE-013**: Start Walkthrough Button (depends on health status)
3. **EXT-001**: Walkthrough Messaging & Data Loading (parallel with FE-013)
4. **BE-011**: Health Log Execution Endpoint (parallel, backend team)

### Phase 2: Core Walkthrough (Week 1, Days 4-7 + Week 2, Days 1-2)
5. **EXT-003**: Element Finder (depends on EXT-001 for workflow data)
6. **EXT-002**: Overlay UI Foundation (parallel with EXT-003)
7. **EXT-004**: Step Progression (depends on EXT-002 + EXT-003)

### Phase 3: Polish & Integration (Week 2, Days 3-5)
8. **EXT-005**: Action Validation & Error Feedback (depends on EXT-004)
9. **EXT-006**: Execution Logging Integration (depends on BE-011 + EXT-004)
10. **Testing & Bug Fixes** (final 2-3 days)

---

## Technical Challenges & Recommendations

### Challenge 1: Selector Fallback Reliability
**Problem**: Elements may not be found even with all selectors  
**Solution**: Implement robust waiting strategy (MutationObserver + retry)  
**Success Metric**: >85% element finding success rate

### Challenge 2: Overlay UI Positioning
**Problem**: Tooltip may cover target, go off-screen, or interfere with page  
**Solution**: Smart positioning algorithm with 4 fallback positions  
**Test**: Create test pages with edge cases (scroll, small viewport, iframes)

### Challenge 3: Page State Management
**Problem**: SPAs may navigate away, reload, or change URL during walkthrough  
**Solution**: 
- Listen for navigation events
- Pause walkthrough on navigation
- Resume when URL matches expected page_context.url
- Show "Page changed" warning if unexpected navigation

### Challenge 4: Concurrent User Actions
**Problem**: User may click other elements while spotlight is active  
**Solution**:
- Intercept all clicks (capture phase)
- Only allow interaction with highlighted element
- Show "Please follow the highlighted step" message

### Challenge 5: Extension Performance
**Problem**: Overlay rendering may slow down page  
**Solution**:
- Use CSS transforms for animations (GPU-accelerated)
- Debounce scroll/resize handlers
- Remove overlay completely when walkthrough exits

---

## Testing Strategy

### Unit Tests
- Element finder with various selector combinations
- Action validator for all action types
- Health calculation logic
- Tooltip positioning algorithm

### Integration Tests
- Full walkthrough flow (start to completion)
- Error recovery (element not found → retry)
- Backend API logging
- Extension messaging (dashboard ↔ extension)

### Manual Testing
- Test on 5+ different websites (different frameworks)
- Test with slow-loading pages (throttle network)
- Test error paths (wrong element clicked, exit early)
- Test responsive design (small viewport)

### Success Criteria
- [ ] User can launch walkthrough from detail page (1 click)
- [ ] Overlay renders correctly on all test sites
- [ ] Element finding works >85% of time
- [ ] Walkthrough completion rate >90% (for functional workflows)
- [ ] Execution logging works 100% of time
- [ ] No console errors during walkthrough
- [ ] Performance: Overlay renders in <100ms

---

## Out of Scope (Epic 5: Auto-Healing)

The following features are **NOT** included in Sprint 3:
- ❌ Deterministic auto-healing (scoring algorithm)
- ❌ AI-assisted auto-healing (Claude Vision comparison)
- ❌ Selector update mechanism (persist healed selectors)
- ❌ Admin workflow repair UI

**Rationale**: Auto-healing is a separate epic (Epic 5). For Sprint 3, we focus on basic element finding with fallback selectors. If element still not found after trying all selectors, we simply mark as failed and log to backend.

Auto-healing will be added in Sprint 4 (Epic 5) which includes:
- Deterministic scoring of candidate elements
- AI verification for ambiguous cases
- Confidence thresholds for auto-accept vs manual review
- Workflow repair UI for admins

---

## Definition of Done (Sprint 3)

### Code Quality
- [ ] All new code follows existing patterns
- [ ] TypeScript types defined for all interfaces
- [ ] Error handling implemented for all async operations
- [ ] No `any` types (use proper types or `unknown`)
- [ ] CSS follows Tailwind conventions

### Testing
- [ ] Unit tests for core logic (>80% coverage)
- [ ] Integration tests for API endpoints
- [ ] Manual testing on 5+ websites
- [ ] No regressions in existing features

### Documentation
- [ ] Update memory.md with implementation details
- [ ] Update completed_tasks.md with Sprint 3 summary
- [ ] Add inline code comments for complex logic
- [ ] Create troubleshooting guide for common issues

### User Experience
- [ ] "Start Walkthrough" button discoverable (no URL typing)
- [ ] Loading states for all async operations
- [ ] Error messages are helpful and actionable
- [ ] Walkthrough can be exited at any time
- [ ] Overlay doesn't break page functionality

### Performance
- [ ] Overlay renders in <100ms
- [ ] No memory leaks (test long walkthroughs)
- [ ] Element finding completes in <5 seconds
- [ ] API calls don't block UI

---

## Risk Mitigation

### Risk 1: Selector Fallback Insufficient
**Likelihood**: Medium  
**Impact**: High (walkthrough fails)  
**Mitigation**: Extensive testing on diverse websites; prepare for Epic 5 (auto-healing)

### Risk 2: Overlay Conflicts with Page
**Likelihood**: Medium  
**Impact**: Medium (poor UX)  
**Mitigation**: Use Shadow DOM for style isolation; test on popular frameworks

### Risk 3: Performance Issues
**Likelihood**: Low  
**Impact**: Medium (slow walkthrough)  
**Mitigation**: Profiling during development; optimize animations with CSS transforms

### Risk 4: Complex State Management
**Likelihood**: Medium  
**Impact**: Medium (bugs in progression)  
**Mitigation**: Clear state machine design; comprehensive unit tests

---

## Next Steps After Sprint 3

After completing Sprint 3, the MVP will have:
✅ Workflow recording (Sprint 1)
✅ AI labeling (Sprint 2)
✅ Walkthrough mode (Sprint 3)

**Sprint 4 (Epic 5)**: Auto-Healing & Health Monitoring
- Deterministic auto-healing algorithm
- AI-assisted healing
- Admin notifications
- Workflow health dashboard

**Sprint 5**: Polish, Testing, Beta Launch
- End-to-end testing
- Performance optimization
- User documentation
- Beta user onboarding

---

**End of Sprint 3 Plan**
