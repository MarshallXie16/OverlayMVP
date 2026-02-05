# Walkthrough System Architecture

## Overview

The walkthrough system guides users through recorded workflows with step-by-step instructions and element highlighting. This document covers the **new state machine-based architecture** (Sprint 1+).

---

## Feature Flag

The new system runs in parallel with the legacy implementation. Toggle with:

```typescript
import { setFeatureFlag } from '@/shared/featureFlags';

// Enable new system
await setFeatureFlag('WALKTHROUGH_USE_NEW_SYSTEM', true);

// Check current setting
import { useNewWalkthroughSystem } from '@/shared/featureFlags';
const useNew = await useNewWalkthroughSystem();
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND (Service Worker)                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    SessionManager                            │   │
│  │   - SINGLE SOURCE OF TRUTH                                   │   │
│  │   - Owns WalkthroughStateMachine                            │   │
│  │   - Persists to chrome.storage.session                      │   │
│  │   - Broadcasts state changes                                 │   │
│  │   - Serialized dispatch queue (prevents races)              │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                            │                                        │
│                   dispatch(event)                                   │
│                            │                                        │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │               WalkthroughStateMachine                        │   │
│  │   - Pure transition functions                                │   │
│  │   - Transition table with guards                            │   │
│  │   - Serializable state                                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ Navigation (Sprint 4)        │  │ Tab Management (Sprint 4)   │ │
│  │  - NavigationWatcher         │  │  - TabManager               │ │
│  │    (chrome.webNavigation)    │  │    (chrome.tabs.onRemoved)  │ │
│  │  - StepRouter                │  │  - Primary tab tracking     │ │
│  │    (NEXT/PREV/JUMP)          │  │  - Session end on close     │ │
│  └──────────────────────────────┘  └─────────────────────────────┘ │
│                                                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                    WALKTHROUGH_STATE_CHANGED
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CONTENT SCRIPT (Per Tab)                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                WalkthroughController                         │   │
│  │   - Receives state broadcasts                                │   │
│  │   - Renders UI based on state (via WalkthroughUI)           │   │
│  │   - Detects user actions (via ActionDetector)               │   │
│  │   - Reports element status                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ UI Layer (Sprint 2)          │  │ Actions Layer (Sprint 3)    │ │
│  │  - OverlayManager            │  │  - ActionDetector           │ │
│  │  - SpotlightRenderer         │  │  - ActionValidator          │ │
│  │  - TooltipRenderer           │  │  - ClickInterceptor         │ │
│  │  - WalkthroughUI (facade)    │  │  - isClickOnTarget()        │ │
│  └──────────────────────────────┘  └─────────────────────────────┘ │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Navigation Handler (Sprint 4)                                │   │
│  │  - NavigationHandler (SPA detection via popstate/hashchange)│   │
│  │  - TAB_READY handshake on page load                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State Machine

### States

| State | Description |
|-------|-------------|
| `IDLE` | No active walkthrough |
| `INITIALIZING` | Loading workflow from API |
| `SHOWING_STEP` | Displaying current step, finding element |
| `WAITING_ACTION` | Element found, waiting for user action |
| `HEALING` | Element not found, attempting auto-heal |
| `TRANSITIONING` | Moving between steps |
| `NAVIGATING` | Page navigation in progress |
| `ERROR` | Unrecoverable error (with retry/skip options) |
| `COMPLETED` | Workflow finished |

### State Diagram

```
IDLE ──START──> INITIALIZING
                    │
        DATA_LOADED │ INIT_FAILED
                    ▼         ▼
              SHOWING_STEP   ERROR
                    │
     ELEMENT_FOUND  │  ELEMENT_NOT_FOUND
          ▼         │         ▼
    WAITING_ACTION  │      HEALING
          │         │         │
  ACTION_DETECTED   │   HEAL_SUCCESS / HEAL_FAILED
          ▼         │         │
    TRANSITIONING <─┴─────────┘
          │
   NEXT_STEP (has more)  │  NEXT_STEP (no more)
          ▼                       ▼
    SHOWING_STEP              COMPLETED
```

### Transitions

All transitions defined in `StateMachine.ts` with optional guards:

```typescript
const TRANSITIONS = [
  { from: '*', event: 'EXIT', to: 'IDLE' },
  { from: 'IDLE', event: 'START', to: 'INITIALIZING' },
  { from: 'SHOWING_STEP', event: 'ELEMENT_FOUND', to: 'WAITING_ACTION' },
  // ... etc
];
```

---

## Message Protocol

Reduced from 12+ message types to 6 (plus command subtypes):

| Message | Direction | Purpose |
|---------|-----------|---------|
| `WALKTHROUGH_COMMAND` | Content → Background | User actions (START, NEXT, PREV, EXIT, REPORT_ACTION) |
| `WALKTHROUGH_STATE_CHANGED` | Background → Content | State broadcasts |
| `WALKTHROUGH_TAB_READY` | Content → Background | Content script handshake |
| `WALKTHROUGH_ELEMENT_STATUS` | Content → Background | Element found/not found |
| `WALKTHROUGH_HEALING_RESULT` | Content → Background | Healing outcome |
| `WALKTHROUGH_EXECUTION_LOG` | Content → Background | Analytics/debugging |

### REPORT_ACTION Command (Sprint 3)

Used by content script to report detected user actions:

```typescript
REPORT_ACTION: {
  stepIndex: number;
  actionType: string;  // 'click' | 'input_commit' | 'select_change' | 'submit'
  valid: boolean;
  reason?: 'wrong_element' | 'wrong_action' | 'no_value_change' | 'invalid_target';
}
```

---

## File Structure

```
extension/src/
├── shared/walkthrough/           # Shared types (both contexts)
│   ├── index.ts                  # Public exports
│   ├── constants.ts              # Timeouts, retry limits
│   ├── WalkthroughState.ts       # State interface, helpers
│   ├── events.ts                 # Event type definitions
│   ├── messages.ts               # Message protocol (includes REPORT_ACTION)
│   └── StateMachine.ts           # Transition logic
│
├── background/walkthrough/       # Background service worker
│   ├── index.ts                  # Entry point
│   ├── SessionManager.ts         # Single source of truth
│   ├── NavigationWatcher.ts      # webNavigation event handler (Sprint 4)
│   ├── StepRouter.ts             # Step navigation logic (Sprint 4)
│   ├── TabManager.ts             # Tab lifecycle management (Sprint 4)
│   ├── messageHandlers.ts        # Message routing
│   └── __tests__/                # Background component tests
│
└── content/walkthrough/          # Content script
    ├── index.ts                  # Entry point
    ├── types.ts                  # Content-specific types
    ├── WalkthroughController.ts  # Main controller (action detection integrated)
    │
    ├── ui/                       # UI Layer (Sprint 2)
    │   ├── index.ts              # Public exports
    │   ├── WalkthroughUI.ts      # UI facade/coordinator
    │   ├── OverlayManager.ts     # Container + SVG backdrop
    │   ├── SpotlightRenderer.ts  # Element highlighting
    │   ├── TooltipRenderer.ts    # Step/error/completion modes
    │   └── __tests__/            # UI component tests
    │
    ├── actions/                  # Action Detection (Sprint 3)
    │   ├── index.ts              # Public exports + isClickOnTarget
    │   ├── ActionDetector.ts     # Event listener management
    │   ├── ActionValidator.ts    # Action validation logic
    │   ├── ClickInterceptor.ts   # Session-scoped click blocking
    │   └── __tests__/            # Action component tests (53 tests)
    │
    ├── navigation/               # Navigation Handling (Sprint 4)
    │   ├── index.ts              # Public exports
    │   ├── NavigationHandler.ts  # SPA navigation, TAB_READY handshake
    │   └── __tests__/            # Navigation component tests
    │
    └── messaging/                # Messaging Bridges (Sprint 5)
        ├── index.ts              # Public exports
        ├── BackgroundBridge.ts   # Background communication with retry
        ├── DashboardBridge.ts    # Dashboard postMessage handling
        └── __tests__/            # Messaging component tests (46 tests)
```

---

## Key Design Decisions

### 1. Single Source of Truth in Background

**Why:** Content scripts are destroyed on navigation. Background service worker persists.

**How:**
- `SessionManager` owns all state
- Uses `chrome.storage.session` for persistence across service worker restarts
- Content scripts receive read-only state via broadcasts

### 2. Explicit State Machine

**Why:** Eliminates race conditions and undefined states from the legacy implementation.

**How:**
- Transition table defines all valid state changes
- Guards prevent invalid transitions
- Pure functions make state changes predictable

### 3. Event-Driven Navigation

**Why:** Multi-page workflows need reliable page transition handling.

**How:**
- `chrome.webNavigation` events trigger state transitions
- No timing hacks or arbitrary delays
- Content script re-injection handled by background

### 4. Reduced Message Protocol

**Why:** Legacy system had 12+ message types, causing complexity and bugs.

**How:**
- 6 message types cover all use cases
- Commands are structured with typed payloads
- State broadcasts replace query-response patterns

---

## Session Lifecycle

```
1. User clicks "Play Workflow" in dashboard
2. Dashboard sends postMessage to content script
3. Content script sends WALKTHROUGH_COMMAND (START) to background
4. SessionManager:
   - Creates new session (dispatch START event)
   - Fetches workflow from API
   - Transitions to SHOWING_STEP
   - Broadcasts state to all tabs
5. Content script:
   - Receives state broadcast
   - Finds target element
   - Reports ELEMENT_STATUS
   - Renders overlay/tooltip
6. User performs action
7. Content script:
   - Validates action matches step
   - Sends ELEMENT_STATUS (action detected)
8. SessionManager:
   - Marks step complete
   - Transitions to next step or COMPLETED
   - Broadcasts new state
9. Repeat 5-8 until complete
```

---

## Error Handling

### Element Not Found → Healing

```
SHOWING_STEP ──ELEMENT_NOT_FOUND──> HEALING
                                      │
              HEAL_SUCCESS ───────────┼───> WAITING_ACTION
              HEAL_FAILED  ───────────┼───> ERROR
```

### Error Recovery Options

From ERROR state:
- `RETRY` → Go back to SHOWING_STEP
- `SKIP_STEP` → Move to next step (TRANSITIONING)
- `EXIT` → End session (IDLE)

### Session Timeout

- Sessions expire after 30 minutes of inactivity
- `expiresAt` updated on every state change
- Timer in background triggers EXIT on timeout

---

## Multi-Tab Support

- Primary tab tracked in `state.tabs.primaryTabId`
- All participating tabs in `state.tabs.activeTabIds`
- New tabs (from target="_blank") auto-added via `webNavigation.onCreatedNavigationTarget`
- Tab close removes from session; primary tab close ends session

---

## Integration with Recording System

The walkthrough system is **independent** of recording:
- Recording uses `recorder.ts` + `recordingSession.ts`
- Walkthrough uses `walkthrough/` modules
- Both share: `featureFlags.ts`, message routing in `messaging.ts`
- No direct imports between systems

---

## Testing

Unit tests across multiple directories:

```bash
# State machine tests
npm test -- src/shared/walkthrough/

# UI component tests
npm test -- src/content/walkthrough/ui/

# Action detection tests
npm test -- src/content/walkthrough/actions/
```

### Coverage Summary

| Area | Tests | Focus |
|------|-------|-------|
| State Machine | 41 | Transitions, guards, session expiry, JUMP_TO_STEP |
| UI Components | 78 | OverlayManager, SpotlightRenderer, TooltipRenderer |
| Action Detection | 53 | ActionDetector, ActionValidator, ClickInterceptor |
| Navigation | 61 | NavigationWatcher, StepRouter, TabManager, NavigationHandler |
| Messaging | 72 | BackgroundBridge, DashboardBridge, E2E integration |
| **Total** | **788** | (includes existing tests) |

### Action Detection Tests

- **ActionDetector**: Event attachment/detachment, input baseline, all action types
- **ActionValidator**: `isClickOnTarget()`, per-action validation rules, retry counting
- **ClickInterceptor**: Enable/disable, target management, click blocking, visual feedback

---

## Sprint Status

| Sprint | Focus | Status |
|--------|-------|--------|
| Sprint 1 | Foundation (State Machine, Session Manager) | COMPLETE |
| Sprint 2 | UI Layer (OverlayManager, SpotlightRenderer, TooltipRenderer) | COMPLETE |
| Sprint 3 | Action Detection (ActionDetector, ActionValidator, ClickInterceptor) | COMPLETE |
| Sprint 4 | Navigation (NavigationWatcher, NavigationHandler, StepRouter, TabManager) | COMPLETE |
| Sprint 5 | Messaging Integration (BackgroundBridge, DashboardBridge) | COMPLETE |
| Sprint 6 | Feature Flag Integration (toggle between systems) | COMPLETE |

---

## Action Detection (Sprint 3 Details)

### Components

| Component | Purpose |
|-----------|---------|
| `ActionDetector` | Attaches event listeners for click/input/select/submit actions |
| `ActionValidator` | Validates detected actions match expected step requirements |
| `ClickInterceptor` | Session-scoped blocking of non-target clicks |
| `isClickOnTarget()` | 3-tier check: direct match → contains() → composedPath() |

### Key Patterns

1. **Input Baseline Tracking**: Baseline set at attach time AND refreshed on focusin (legacy parity)
2. **Session-Scoped Interceptor**: ClickInterceptor enabled at walkthrough start, target updated per step
3. **State Transition Cleanup**: `cleanupActionState()` called when leaving WAITING_ACTION
4. **Timeout Tracking**: `advanceTimeout` tracked and cancelled on destroy to prevent stray commands

### Visual Feedback

CSS animations in `walkthrough.css`:
- `.walkthrough-flash-success` - Green glow on valid action
- `.walkthrough-flash-error` - Red glow on invalid action
- `.walkthrough-pulse` - Teal pulse on blocked click

---

## Navigation (Sprint 4 Details)

Sprint 4 implements event-driven multi-page navigation support, replacing legacy timing hacks with proper state machine transitions.

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `NavigationWatcher` | Background | Listens to `chrome.webNavigation` events, dispatches URL_CHANGED/PAGE_LOADED |
| `StepRouter` | Background | Handles NEXT/PREV/JUMP_TO_STEP, triggers cross-page navigation |
| `TabManager` | Background | Tracks tabs in session, handles tab closure |
| `NavigationHandler` | Content | Monitors SPA navigation (popstate/hashchange), sends TAB_READY |

### Navigation Flow

**Full Page Navigation:**
```
1. User clicks link / StepRouter calls chrome.tabs.update()
2. NavigationWatcher receives onBeforeNavigate
3. Dispatches URL_CHANGED → state machine enters NAVIGATING
4. NavigationWatcher sets chrome.alarms timeout (30s)
5. Page loads, content script sends TAB_READY
6. NavigationWatcher receives onCompleted
7. Dispatches PAGE_LOADED → state machine exits to SHOWING_STEP
8. NavigationWatcher clears timeout alarm
```

**SPA Navigation (client-side routing):**
```
1. App changes route via pushState/replaceState
2. NavigationHandler detects popstate or hashchange
3. Sends SPA_NAVIGATION message to background
4. Background dispatches URL_CHANGED (enters NAVIGATING)
5. Background dispatches PAGE_LOADED immediately (page already loaded)
6. State machine returns to SHOWING_STEP
```

### Key Design Decisions

1. **Single Source of URL_CHANGED**: Only NavigationWatcher (background) dispatches URL_CHANGED for full-page navigations. StepRouter triggers navigation via `chrome.tabs.update()` but doesn't dispatch events directly.

2. **SPA Navigation Handling**: NavigationHandler in content script detects client-side routing and notifies background, which immediately dispatches both URL_CHANGED and PAGE_LOADED since the page is already loaded.

3. **Tab-Correlated PAGE_LOADED**: State machine guards PAGE_LOADED to only accept events from the tab that's navigating (`navigation.tabId === event.tabId`).

4. **chrome.alarms for Timeout**: Service workers can restart, losing in-memory timeouts. Uses `chrome.alarms` for navigation timeout that survives restarts.

5. **Primary Tab Only**: Navigation events only processed for primary tab; other tabs' webNavigation events are ignored.

6. **Session Ends on Primary Tab Close**: When primary tab closes, session ends (no tab promotion in MVP).

7. **Dispatch Queue Serialization**: SessionManager serializes all dispatch() calls to prevent race conditions.

### State Machine Changes

Sprint 4 added/modified these transitions:

| From | Event | To | Notes |
|------|-------|----|----|
| SHOWING_STEP | JUMP_TO_STEP | SHOWING_STEP | Direct jump, no TRANSITIONING |
| WAITING_ACTION | JUMP_TO_STEP | SHOWING_STEP | Direct jump, no TRANSITIONING |
| NAVIGATING | PAGE_LOADED | SHOWING_STEP | Guard: tabId must match |

### URL Matching

StepRouter compares URLs by origin + pathname only:
- Query params are ignored
- Trailing slashes are normalized
- Hash fragments are ignored

```typescript
// These match:
"https://example.com/page" === "https://example.com/page/"
"https://example.com/page?a=1" === "https://example.com/page?b=2"
```

### Testing

Sprint 4 adds 70+ tests:

| Component | Tests | Focus |
|-----------|-------|-------|
| NavigationWatcher | 26 | webNavigation events, timeout handling, SW restart recovery |
| StepRouter | 15 | next/prev/jump, URL matching, cross-page navigation |
| TabManager | 10 | Tab tracking, primary tab closure |
| NavigationHandler | 10 | SPA detection, TAB_READY handshake |
| StateMachine | 5 (added) | JUMP_TO_STEP transitions, PAGE_LOADED guards |

---

## Messaging Integration (Sprint 5 Details)

Sprint 5 creates type-safe messaging bridges between content script, background, and dashboard, replacing direct chrome.runtime calls with structured communication.

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `BackgroundBridge` | Content | Type-safe commands to background, state subscription, retry logic |
| `DashboardBridge` | Content | window.postMessage handling from dashboard, origin validation |

### BackgroundBridge

Provides reliable communication from content script to background service worker:

```typescript
class BackgroundBridge {
  // Send typed commands
  async sendCommand<T extends keyof CommandPayload>(
    command: T, payload: CommandPayload[T]
  ): Promise<CommandResponse>;

  // Report element status
  async reportElementFound(stepIndex: number, tabId: number): Promise<void>;
  async reportElementNotFound(stepIndex: number, tabId: number): Promise<void>;

  // Healing integration
  async reportHealingResult(stepIndex: number, result: HealingResult): Promise<void>;

  // State subscription
  subscribe(listener: (state: WalkthroughState) => void): () => void;
}
```

**Key Features:**
- **Retry Logic**: Exponential backoff (500ms base) for transport errors (service worker restart)
- **Non-Retryable Errors**: Business errors (e.g., "Workflow not found") fail immediately
- **Cancellation**: Pending retries cancelled on session end (IDLE state) or destroy
- **State Subscription**: Listens for WALKTHROUGH_STATE_CHANGED broadcasts

### DashboardBridge

Handles postMessage from the dashboard to start walkthroughs:

```typescript
class DashboardBridge {
  initialize(): void;  // Sets up message listener
  destroy(): void;     // Cleans up

  private isValidOrigin(origin: string): boolean;
  private isValidMessage(data: unknown): boolean;
}
```

**Security Features:**
- **Origin Allowlist**: localhost:3000, 127.0.0.1:3000, configurable production origins
- **Message Validation**: Requires `source: "overlay-dashboard"`, valid message type, numeric workflowId
- **Error Isolation**: Invalid messages silently rejected (no information leakage)

### Healing Integration

WalkthroughController integrates healing with UI feedback:

```
Element not found
     │
     ▼
Show spinner ("Searching for element...")
     │
     ▼
Run healing algorithm
     │
     ├── Success (≥85% confidence) → Proceed silently
     ├── Success (70-85%) → Show subtle indicator
     ├── Success (60-70%) → Show confirmation dialog
     └── Failed → Show error UI with Retry/Skip options
```

**CSS Classes:**
- `.walkthrough-healing-mode` - Applied during healing
- `.walkthrough-healing-spinner` - Loading indicator
- `.walkthrough-healing-confirmation` - User confirmation dialog

### Message Flow

```
Dashboard                Content Script              Background
   │                          │                          │
   │ postMessage              │                          │
   │ (START_WALKTHROUGH)      │                          │
   │─────────────────────────>│                          │
   │                          │ WALKTHROUGH_COMMAND      │
   │                          │ (START)                  │
   │                          │─────────────────────────>│
   │                          │                          │
   │                          │ WALKTHROUGH_STATE_CHANGED│
   │                          │<─────────────────────────│
   │                          │                          │
   │                          │ WALKTHROUGH_ELEMENT_STATUS
   │                          │─────────────────────────>│
   │                          │                          │
```

### Testing

Sprint 5 adds 72 tests:

| Component | Tests | Focus |
|-----------|-------|-------|
| BackgroundBridge | 23 | Lifecycle, state subscription, retry logic, cancellation |
| DashboardBridge | 23 | Origin validation, message validation, forwarding |
| E2E Integration | 26 | Full workflow scenarios, error recovery, edge cases |

### Feature Flag Gating

New walkthrough components are gated behind `WALKTHROUGH_USE_NEW_SYSTEM`:

```typescript
// In background/index.ts
if (await useNewWalkthroughSystem()) {
  initializeNewWalkthroughSystem();  // SessionManager, NavigationWatcher, etc.
} else {
  initializeLegacySystem();
}
```

This allows gradual rollout and easy rollback during Sprint 6 migration.

---

## Feature Flag Integration (Sprint 6 Details)

Sprint 6 completes the feature flag integration, enabling safe switching between the new and legacy walkthrough systems.

### Feature Flag Locations

The feature flag is checked in **two places** to ensure complete decoupling:

1. **Background Handler** (`messaging.ts:handleStartWalkthrough`)
   - Routes to `handleStartWalkthroughNew()` or `handleStartWalkthroughLegacy()`
   - New system dispatches `START` and `DATA_LOADED` events to SessionManager
   - Legacy system sends `WALKTHROUGH_DATA` message directly to content script

2. **Content Script** (`walkthrough.ts` initialization)
   - Dynamically imports `WalkthroughController` when flag is true
   - Falls back to `initializeWithRetry()` for legacy system

### Toggle via Popup

The popup includes a Developer Settings section with a toggle:

```
┌─────────────────────────────────────────┐
│ Developer Settings                   ▼ │
├─────────────────────────────────────────┤
│ New Walkthrough System           [ON]  │
│ Using state-machine based system        │
│                                         │
│ ⓘ Reload the page after changing to    │
│   apply the new system.                 │
└─────────────────────────────────────────┘
```

### Default Value

The default is `true` (new system) as of Sprint 6 completion:

```typescript
const DEFAULT_FLAGS: FeatureFlags = {
  WALKTHROUGH_USE_NEW_SYSTEM: true,  // New system by default
};
```

Users who explicitly set the flag to `false` will continue using the legacy system.

### Rolling Back

If issues are discovered with the new system:

1. Open the extension popup
2. Expand "Developer Settings"
3. Toggle "New Walkthrough System" off
4. Reload the page

The legacy system will be used immediately without any code changes.

### Legacy Code (Still Present)

The legacy walkthrough code remains in the codebase:
- `extension/src/content/walkthrough.ts` - Legacy content script code
- `extension/src/background/walkthroughSession.ts` - Legacy session manager
- Legacy message handlers in `messaging.ts`

This code will be removed in a future sprint after extended production validation.
