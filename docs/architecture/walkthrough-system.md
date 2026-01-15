# Walkthrough System Architecture

## Overview

The walkthrough system provides interactive, guided tours through web applications. It overlays visual hints on target elements, intercepts user interactions, and guides users step-by-step through workflows.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WALKTHROUGH SYSTEM FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Dashboard        Background Service          Content Script               │
│   (React)          Worker (index.ts)           (walkthrough.ts)             │
│                                                                              │
│   ┌──────┐        ┌──────────────────┐        ┌──────────────────┐         │
│   │ User │───────▶│ messaging.ts     │───────▶│ startWalkthrough │         │
│   │clicks│        │ handleStartWalk  │        │                  │         │
│   │Start │        │ through()        │        │ ┌──────────────┐ │         │
│   └──────┘        │                  │        │ │ Overlay UI   │ │         │
│                   │ walkthroughSess- │        │ │ - Highlight  │ │         │
│                   │ ion.ts (GAP-001) │        │ │ - Tooltip    │ │         │
│                   │ - startSession() │        │ │ - Progress   │ │         │
│                   │ - updateSession()│        │ └──────────────┘ │         │
│                   │ - getSession()   │        │                  │         │
│                   └──────────────────┘        └──────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Content Script (`walkthrough.ts`)

The main walkthrough controller running in the page context.

**Key Functions:**
- `startWalkthrough(workflow)` - Initialize walkthrough with workflow data
- `advanceStep()` / `previousStep()` - Navigate between steps
- `initializeContentScript()` - Check for active session on page load (GAP-001)
- `restoreWalkthrough(session)` - Restore state from persisted session

**State Machine:**
```
                 ┌───────────┐
                 │   IDLE    │
                 └─────┬─────┘
                       │ startWalkthrough()
                       ▼
                 ┌───────────┐
      ┌─────────│  LOADING  │─────────┐
      │         └─────┬─────┘         │
      │               │               │
      │ error         │ success       │ timeout
      ▼               ▼               ▼
┌───────────┐   ┌───────────┐   ┌───────────┐
│   ERROR   │   │  ACTIVE   │   │  TIMEOUT  │
└───────────┘   └─────┬─────┘   └───────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
         │ complete   │ user_exit  │ error
         ▼            ▼            ▼
   ┌───────────┐ ┌───────────┐ ┌───────────┐
   │ COMPLETED │ │   IDLE    │ │   ERROR   │
   └───────────┘ └───────────┘ └───────────┘
```

### 2. Background Session Manager (`walkthroughSession.ts`)

Persists walkthrough state across page navigations using `chrome.storage.session`.

**Key Types:**
```typescript
interface WalkthroughSessionState {
  sessionId: string;           // Unique session identifier
  workflowId: number;          // Workflow being executed
  steps: StepResponse[];       // All steps in workflow
  totalSteps: number;
  currentStepIndex: number;    // Current progress
  status: 'active' | 'paused' | 'completed' | 'error';
  primaryTabId: number;        // Main tab running walkthrough
  tabIds: number[];            // All tabs in session (GAP-002)
  navigationInProgress: boolean;
  expectedUrl: string | null;
}
```

**Session Lifecycle:**
1. `startSession(workflow, tabId)` - Create new session on walkthrough start
2. `updateSession(changes)` - Sync state changes (step progress, status)
3. `getSessionForTab(tabId)` - Check if tab has active session to restore
4. `endSession(reason)` - Clean up on completion/exit

### 3. Messaging System (`messaging.ts`)

Handles communication between dashboard, background, and content scripts.

**Message Types:**
- `START_WALKTHROUGH` - Begin walkthrough with workflow data
- `WALKTHROUGH_GET_STATE` - Content script requests session state
- `WALKTHROUGH_STATE_UPDATE` - Sync state changes to background
- `WALKTHROUGH_SESSION_END` - Notify tabs that session ended

### 4. Tab Event Listeners (`background/index.ts`)

Monitor browser events for multi-page/multi-tab support.

```typescript
chrome.webNavigation.onBeforeNavigate  // Mark navigation in progress
chrome.webNavigation.onCompleted       // Trigger session restoration
chrome.webNavigation.onCreatedNavigationTarget  // Track new tabs
chrome.tabs.onRemoved                  // Handle tab closure
```

## Multi-Page Workflow Support (GAP-001)

### Problem
Users lose walkthrough progress when navigating to a new page during a workflow.

### Solution
Persist session state in `chrome.storage.session` and restore on page load.

```
Page 1                    Background                   Page 2
   │                         │                            │
   │ User clicks link        │                            │
   │─────────────────────────▶│                            │
   │                         │ handleNavigationStart()    │
   │                         │ Save state to storage      │
   │                         │                            │
   │ Page unloads            │                            │
   │                         │                            │
   │                         │ onCompleted event          │
   │                         │◀────────────────────────────│
   │                         │                            │
   │                         │ Send session to restore    │
   │                         │───────────────────────────▶│
   │                         │                            │
   │                         │ restoreWalkthrough()       │
   │                         │◀────────────────────────────│
```

### State Restoration
When a page loads, the content script:
1. Calls `initializeContentScript()`
2. Requests session state from background
3. If active session exists, calls `restoreWalkthrough(session)`
4. Rebuilds overlay and jumps to current step

## Multi-Tab Workflow Support (GAP-002)

### Problem
Some workflows span multiple browser tabs (OAuth, popups, new windows).

### Solution
Track all tabs participating in a session via `tabIds` array.

**Key Behaviors:**
- New tabs opened during walkthrough are automatically added
- Session continues when primary tab closes (promotes another tab)
- All tabs receive session end notifications

## Security Considerations

### XPath Injection Prevention (SECURITY-001)

Text-based element search uses XPath queries with user-controlled text.

**Vulnerable Pattern:**
```typescript
// BAD: Direct string interpolation
const xpath = `//*[text()="${userText}"]`;
```

**Safe Pattern:**
```typescript
// GOOD: Use escapeXPathString() from sanitize.ts
import { escapeXPathString } from '../utils/sanitize';
const escaped = escapeXPathString(userText);  // Returns quoted/escaped string
const xpath = `//*[text()=${escaped}]`;       // No additional quotes needed
```

**Escape Logic:**
- No quotes in text → wrap in single quotes: `'hello'`
- Single quotes in text → wrap in double quotes: `"it's"`
- Both quote types → use `concat()`: `concat('it', "'", 's "quoted"')`

### HTML Injection Prevention (SECURITY-002)

User-controlled text displayed in overlay UI must be escaped.

```typescript
import { escapeHtml } from '../utils/sanitize';
tooltip.innerHTML = escapeHtml(step.instruction);
```

## Visual Components

### Overlay Structure
```
┌─────────────────────────────────────────────────────────────┐
│ Page Content                                                │
│                                                             │
│   ┌─────────────────────────────┐                          │
│   │ Target Element              │◀─── Highlight Overlay    │
│   │  (pulsing border)           │                          │
│   └─────────────────────────────┘                          │
│            │                                                │
│            │                                                │
│            ▼                                                │
│   ┌─────────────────────────────┐                          │
│   │ Tooltip                     │                          │
│   │ ┌───────────────────────┐   │                          │
│   │ │ Click the Submit btn  │   │                          │
│   │ └───────────────────────┘   │                          │
│   │ [◀ Back]     [Next ▶]       │                          │
│   └─────────────────────────────┘                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Progress Bar: Step 2 of 5  ████████░░░░░░░░  40%           │
└─────────────────────────────────────────────────────────────┘
```

### Click Interception
Non-target clicks are intercepted with visual feedback:
1. Click is blocked (`preventDefault()`)
2. Target element pulses to draw attention
3. Toast notification appears: "Please interact with the highlighted element"

## File Reference

| Component | File | Purpose |
|-----------|------|---------|
| Main Controller | `content/walkthrough.ts` | Core walkthrough logic |
| Session Manager | `background/walkthroughSession.ts` | Session persistence |
| Message Handlers | `background/messaging.ts` | IPC handling |
| Tab Listeners | `background/index.ts` | Browser events |
| Types | `shared/types.ts` | TypeScript interfaces |
| Sanitization | `content/utils/sanitize.ts` | Security utilities |
| Element Finder | `content/utils/elementFinder.ts` | DOM element location |
| Auto-Healing | `content/healing/` | Element recovery |

## Auto-Healing System

When the recorded element isn't found (selector changed), the auto-healing system attempts recovery:

1. **Score candidates** - Find similar elements using multiple strategies
2. **Apply scoring** - Weight by selector similarity, text match, position, etc.
3. **Validate with AI** - Confirm best candidate with LLM if available
4. **Use healing result** - Proceed with healed element or show manual fallback

See `docs/architecture/auto-healing.md` for detailed healing algorithm documentation.

## Configuration

Key constants in `shared/types.ts`:
- `WALKTHROUGH_SESSION_STORAGE_KEY` - Storage key for session state
- `WALKTHROUGH_SESSION_TIMEOUT_MS` - Session expiration (30 minutes default)

Manifest permissions required:
- `storage` - For session persistence
- `tabs` - For tab tracking
- `webNavigation` - For page navigation events
- `scripting` - For content script injection
