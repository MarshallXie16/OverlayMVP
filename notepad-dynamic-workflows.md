# Notepad: Dynamic Workflows Feature Investigation

## Task
Design an AI-agent-powered "dynamic workflow" system that guides users through web tasks based on natural language input (e.g., "submit an expense report for printer ink from Walmart for $56.99") without requiring a pre-recorded workflow.

## Key Requirements
- User enters natural language description of what they want to do
- AI agent guides them through the process using walkthrough overlay UI
- Reuses existing walkthrough mechanisms where possible
- Separate from explicit/recorded workflows (for now)
- Future: can reference semantically similar recorded workflows

## Progress
- [x] Explore walkthrough state machine & controller
- [x] Explore walkthrough UI (overlay, tooltip, spotlight)
- [x] Explore action detection & validation
- [x] Explore background orchestration (SessionManager, StepRouter)
- [x] Explore element finder mechanisms
- [x] Explore AI service (backend)
- [x] Explore extension-dashboard communication
- [x] Draft proposal
- [ ] Review with user ← CURRENT
- [ ] Finalize proposal after discussion
- [ ] Begin implementation (Phase 1)

## User Design Decisions (2026-02-05)
- **Auto-fill**: Guide + Auto-fill — AI pre-fills known values, user confirms/edits
- **Entry point**: Extension popup textbox
- **Starting point**: User already on target website
- **Automation model**: Hybrid — auto-execute high-confidence simple actions, guide on ambiguous
- **Proposal file**: `.claude/plans/eventual-mixing-hellman.md`

## Reviews Completed (2026-02-05)
1. **Colleague review** — 6 issues raised, all addressed in plan revision
2. **Codex (GPT-5.2) review** — Assessment: "needs revision". 8 critical, 5 warning, 1 suggestion

### Key Changes from Reviews:
- **Element-index protocol** instead of raw selectors (Codex recommendation — eliminates selector injection)
- **Sliding window** for conversation context (capped ~1,300 tokens/turn regardless of step count)
- **Page context is ephemeral** — NOT stored in extension state (too large)
- **Navigation moved to Phase 1** (MVP is broken without it)
- **Loop detection** added (same-context hash + same-action detector)
- **Entity confirmation step** before first AI action
- **Deterministic safety gates** for auto-execute (never auto-submit, pattern blocklist)
- **CONFIRMING_ENTITIES** state added to FSM
- **Backend `default=list`/`default=dict`** (not `[]`/`{}` — mutable default bug)
- **Non-interactive status text** included in page capture (success banners, headings)
- **Dynamic tooltip buttons**: "I did it" / "That's wrong" / "Skip" / "Exit" (not Back/Next)
- **Session concurrency guard** — only one guided session at a time
- **No XPath** in dynamic steps (P0 injection vulnerability)

---

## Key Findings from Investigation

### 1. Current Walkthrough Architecture (Reusable Components)

**State Machine** (`extension/src/shared/walkthrough/StateMachine.ts`):
- 8 states: IDLE → INITIALIZING → SHOWING_STEP ↔ WAITING_ACTION → TRANSITIONING → COMPLETED (+ HEALING, NAVIGATING, ERROR)
- 23 event types trigger transitions
- Guards enforce business logic (retry limits, step bounds, URL matching)
- Pure FSM — transitions are functions, no side effects

**SessionManager** (`extension/src/background/walkthrough/SessionManager.ts`):
- Single source of truth for walkthrough state
- Persists to chrome.storage.session (survives SW restart)
- Dispatch queue serializes all events (prevents race conditions)
- Broadcasts state changes to all tabs
- 30-min inactivity timeout

**StepRouter** (`extension/src/background/walkthrough/StepRouter.ts`):
- Decides if step requires page navigation (URL comparison)
- Handles cross-page jumps (dispatch JUMP_TO_STEP before navigating)
- URL matching: origin + normalized pathname, ignores query/hash

**NavigationWatcher** (`extension/src/background/walkthrough/NavigationWatcher.ts`):
- Produces URL_CHANGED and PAGE_LOADED events
- Uses chrome.alarms for timeouts (survives SW restart)
- 30-second navigation timeout

**WalkthroughController** (`extension/src/content/walkthrough/WalkthroughController.ts`, 1261 lines):
- Listens to state broadcasts from background
- Renders UI based on state (overlay, spotlight, tooltip)
- Manages element finding, action detection, healing
- Uses renderId for async cancellation safety

**UI Components** (`extension/src/content/walkthrough/ui/`):
- WalkthroughUI.ts — facade coordinating subcomponents
- OverlayManager.ts — creates overlay container DOM
- SpotlightRenderer.ts — CSS box-shadow spotlight around target element
- TooltipRenderer.ts — instruction tooltip with nav buttons, modes: step/error/completion/navigate_step/healing

**Action System** (`extension/src/content/walkthrough/actions/`):
- ActionDetector.ts — listens for click, input_commit, select_change, submit, copy
- ActionValidator.ts — validates action against expected step (element match, action type match, value change)
- ClickInterceptor.ts — session-scoped click blocking

**Element Finder** (`extension/src/content/utils/elementFinder.ts`):
- Priority: primary → CSS → XPath → stable attrs → text matching
- MutationObserver + polling with 5s timeout
- isInteractable() checks: dimensions, disabled, visibility

### 2. Data Structures

**StepResponse** (what the walkthrough displays):
```
- id, workflow_id, step_number
- action_type: click | input_commit | select_change | submit | navigate | copy
- selectors: { primary, css, xpath, data_testid, stable_attrs }
- element_meta: { tag_name, text, ... }
- page_context: { url, title, ... }
- action_data: { target_url?, clipboard_preview? }
- field_label, instruction, ai_confidence (AI-generated)
```

**WalkthroughState** (full session state):
```
- sessionId, machineState, previousState
- workflowId, workflowName, startingUrl
- steps: StepResponse[], totalSteps, currentStepIndex
- completedStepIndexes, stepRetries
- errorInfo, healingInfo, navigation, tabs, timing
```

### 3. AI Service Integration

**Backend AI** (`backend/app/services/ai.py`):
- Model: claude-haiku-4-5-20251001 (vision, fast)
- Tool calling pattern for structured JSON output
- Cost: ~$0.03-0.05 per 6-step workflow
- Fallback to template-based labels on failure
- Tracks input/output tokens and cost

**Healing Validation** (`backend/app/services/healing.py`):
- Model: claude-opus-4-6 (higher accuracy for validation)
- Input sanitization with prompt injection prevention
- Combined score: 60% deterministic + 40% AI confidence
- Thresholds: ≥0.85 accept, ≥0.50 prompt user, <0.50 reject

### 4. Communication Patterns

**Message Protocol** (6 types):
- WALKTHROUGH_COMMAND (content → background)
- WALKTHROUGH_STATE_CHANGED (background → content)
- WALKTHROUGH_TAB_READY, ELEMENT_STATUS, HEALING_RESULT, EXECUTION_LOG

**Dashboard → Extension**: window.postMessage with origin allowlist
**Content ↔ Background**: chrome.runtime.sendMessage with retry + backoff
**Extension → Backend**: REST API with JWT auth, retry on 5xx

### 5. Key Insight: What Can Be Reused vs What's New

**REUSABLE AS-IS:**
- UI components (overlay, spotlight, tooltip rendering)
- Action detection & validation (click, input, select, etc.)
- Click interception
- Element finder (CSS/XPath/text matching)
- Navigation watcher
- Tab management
- Message protocol infrastructure
- Extension API client

**NEEDS ADAPTATION:**
- State machine (currently step-based with fixed step list; dynamic workflows generate steps on-the-fly)
- SessionManager (currently loads all steps upfront; needs to support streaming/incremental steps)
- StepRouter (URL matching assumes known target URLs)
- TooltipRenderer (needs to show AI thinking/reasoning, free-form instructions)

**ENTIRELY NEW:**
- AI agent service (backend) — takes page context + user goal, returns next action
- Page analysis system — captures current DOM state for AI decision-making
- Dynamic step generation loop (observe page → AI decides → show step → user acts → repeat)
- Natural language input UI (textbox in popup or overlay)
- Conversation/context management (AI remembers what's been done so far)

---

## Critical Design Questions for User

1. **Where does the AI run?** Backend (Claude API via our server) vs directly from extension (needs API key in extension)?
2. **Page context capture**: How much DOM/visual context to send to AI? Full DOM? Screenshot? Simplified accessibility tree?
3. **Scope of first version**: Just guidance overlay, or should AI also auto-fill values (e.g., "$56.99" in amount field)?
4. **Error recovery**: What happens when AI gives wrong guidance? User can say "that's wrong" and AI retries?
5. **Session persistence**: Should dynamic workflow sessions persist across page reloads?
6. **Security**: Sending page DOM to backend raises data sensitivity concerns. How to handle?
7. **Cost model**: Claude API calls per step could be expensive. Caching? Model selection?

---

## Key Code References

| Component | File | Lines |
|-----------|------|-------|
| State Machine | `extension/src/shared/walkthrough/StateMachine.ts` | All |
| Events | `extension/src/shared/walkthrough/events.ts` | 19-53 |
| Messages | `extension/src/shared/walkthrough/messages.ts` | 14-105 |
| SessionManager | `extension/src/background/walkthrough/SessionManager.ts` | All |
| StepRouter | `extension/src/background/walkthrough/StepRouter.ts` | All |
| MessageHandlers | `extension/src/background/walkthrough/messageHandlers.ts` | All |
| NavigationWatcher | `extension/src/background/walkthrough/NavigationWatcher.ts` | All |
| WalkthroughController | `extension/src/content/walkthrough/WalkthroughController.ts` | All |
| WalkthroughUI | `extension/src/content/walkthrough/ui/WalkthroughUI.ts` | All |
| TooltipRenderer | `extension/src/content/walkthrough/ui/TooltipRenderer.ts` | All |
| SpotlightRenderer | `extension/src/content/walkthrough/ui/SpotlightRenderer.ts` | All |
| ActionDetector | `extension/src/content/walkthrough/actions/ActionDetector.ts` | All |
| ActionValidator | `extension/src/content/walkthrough/actions/ActionValidator.ts` | All |
| ElementFinder | `extension/src/content/utils/elementFinder.ts` | All |
| AI Service | `backend/app/services/ai.py` | 186-287 |
| Healing Service | `backend/app/services/healing.py` | 26-120 |
| API Client | `extension/src/shared/api.ts` | 82-205 |
| Step Types | `extension/src/shared/types.ts` | 56-232 |
| Recorder | `extension/src/content/recorder.ts` | All |
