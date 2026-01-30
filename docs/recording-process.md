# Recording Process - Technical Documentation

**Last Updated**: 2026-01-24

This document provides comprehensive technical documentation for the workflow recording system, covering event capture, deduplication, screenshot management, multi-page support, and AI labelling.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Event Capture](#3-event-capture)
4. [Action Types](#4-action-types)
5. [Event Deduplication](#5-event-deduplication)
6. [Screenshot Capture](#6-screenshot-capture)
7. [Multi-Page Recording](#7-multi-page-recording)
8. [AI Labelling Pipeline](#8-ai-labelling-pipeline)
9. [Step Data Structure](#9-step-data-structure)
10. [Known Limitations](#10-known-limitations)
11. [Troubleshooting](#11-troubleshooting)
12. [File Locations](#12-file-locations)

---

## 1. Overview

The recording system captures user interactions on web pages and converts them into replayable workflow steps. It uses semantic event deduplication to record user **intent** rather than raw DOM events.

**Key Capabilities:**
- Records clicks, text input, form submissions, clipboard actions, and navigation
- Captures screenshots with highlighted interacted elements
- Supports multi-page recording across different origins
- AI-powered labelling for step descriptions

**Performance Achievement:** Reduced a typical login workflow from 13 DOM events to 4 semantic steps (69% reduction).

---

## 2. Architecture

### High-Level Flow

```
User Action
    ↓
DOM Events (click, blur, change, submit, copy, paste, beforeunload)
    ↓
Content Script Recorder
    ↓
EventDeduplicator (15ms buffer)
    ↓
Group & Prioritize Events
    ↓
Record Step → Background Worker
    ↓
Session Storage (chrome.storage.session)
    ↓
Screenshot Capture (IndexedDB)
    ↓
Backend API Upload
    ↓
AI Labelling (Claude Haiku)
```

### Component Responsibilities

| Component | Location | Purpose |
|-----------|----------|---------|
| Recorder | `extension/src/content/recorder.ts` | Event listeners, step creation |
| EventDeduplicator | `extension/src/content/utils/event-deduplicator.ts` | Event grouping and priority |
| Filters | `extension/src/content/utils/filters.ts` | Interaction validation |
| Widget | `extension/src/content/widget.ts` | Recording UI overlay |
| RecordingSession | `extension/src/background/recordingSession.ts` | Session state management |
| ScreenshotStore | `extension/src/background/screenshotStore.ts` | IndexedDB screenshot storage |
| Messaging | `extension/src/background/messaging.ts` | Message routing |
| AI Service | `backend/app/services/ai.py` | Claude Vision labelling |

---

## 3. Event Capture

### Listened Events

The recorder attaches listeners in the **capture phase** (third parameter `true`) to intercept events before page handlers:

```typescript
document.addEventListener("focus", handleFocus, true);
document.addEventListener("click", handleClick, true);
document.addEventListener("blur", handleBlur, true);
document.addEventListener("keydown", handleKeydown, true);
document.addEventListener("change", handleChange, true);
document.addEventListener("submit", handleSubmit, true);
window.addEventListener("beforeunload", handleNavigation, true);
document.addEventListener("copy", handleClipboard, true);
document.addEventListener("cut", handleClipboard, true);
document.addEventListener("paste", handleClipboard, true);
```

### Event Processing Flow

1. **Event Fired** → Event handler receives DOM event
2. **Filtering** → `isInteractionMeaningful()` validates:
   - Element is interactive (button, input, link, etc.)
   - Not on recording widget
   - Not body/html element
   - Not right/middle click
3. **Deduplication** → Event added to `EventDeduplicator` buffer
4. **Flush** → After 15ms (or immediately for navigation), best event selected
5. **Recording** → `recordInteraction()` creates step data
6. **Screenshot** → Element highlighted, screenshot captured

---

## 4. Action Types

The system recognizes these atomic action types:

| Action Type | Trigger | Priority | Description |
|-------------|---------|----------|-------------|
| `submit` | Form submit event | 100 | Form submission |
| `navigate` | beforeunload (no prior events) | 100 | Address bar navigation |
| `change` | Change event on checkbox/radio | 80 | Checkbox/radio toggle |
| `select_change` | Change event on select | 80 | Dropdown selection |
| `copy` | Clipboard copy event | 75 | Text copied |
| `cut` | Clipboard cut event | 75 | Text cut |
| `paste` | Clipboard paste event | 75 | Text pasted |
| `input_commit` | Blur with value change | 60 | Text input finalized |
| `click` | Click on button/link | 40 | Button/link click |

### Action Type Determination

The action type is determined by `getActionType()` in `filters.ts`:

```typescript
function getActionType(event: Event, element: Element): string {
  if (event.type === "submit") return "submit";
  if (event.type === "change") {
    if (element instanceof HTMLSelectElement) return "select_change";
    return "change"; // checkbox/radio
  }
  if (event.type === "blur" || event.type === "keydown") {
    if (element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement) {
      return "input_commit";
    }
  }
  if (event.type === "copy") return "copy";
  if (event.type === "cut") return "cut";
  if (event.type === "paste") return "paste";
  return "click";
}
```

### What Constitutes an "Atomic Step"?

An atomic step represents a **single semantic user action**:

1. **Text Input** → Captured on `blur` (when user leaves field) or `Enter` keydown
2. **Click** → Single click on interactive element (button, link, non-checkbox input)
3. **Selection** → Choosing an option from dropdown
4. **Toggle** → Checking/unchecking checkbox or radio
5. **Form Submit** → Explicit form submission (suppresses submit button click)
6. **Clipboard** → Copy, cut, or paste action
7. **Navigation** → Address bar navigation (only when no prior click triggered it)

**Key Principle**: One user intent = one step. Multiple DOM events for the same intent are deduplicated.

---

## 5. Event Deduplication

### The Problem

A single user action can trigger multiple DOM events:

| User Action | Events Fired |
|-------------|--------------|
| Click checkbox label | click(label), click(input), change(input) |
| Click submit button | click(button), submit(form) |
| Tab through empty field | focus(input), blur(input) |
| Fill autofill field | focus, input, blur (multiple times) |

Without deduplication, a 4-step login workflow records 13+ events.

### The Solution: EventDeduplicator

**Buffer Window**: Events are buffered for **15ms** (reduced from 100ms to handle fast navigation).

**Priority-Based Selection**: When multiple related events buffer, the highest priority wins:

```typescript
const EVENT_PRIORITY = {
  submit: 100,      // Form submission
  navigate: 100,    // Address bar navigation
  change: 80,       // Checkbox/radio toggle
  select_change: 80,// Dropdown selection
  copy: 75,         // Clipboard copy
  cut: 75,          // Clipboard cut
  paste: 75,        // Clipboard paste
  input_commit: 60, // Text input commit
  click: 40,        // Button/link click
};
```

### Suppression Rules

Events are proactively suppressed before buffering:

| Scenario | Suppressed Event | Reason |
|----------|------------------|--------|
| Click on checkbox/radio | click | Wait for change event |
| Click on label (for checkbox) | click | Wait for input change |
| Click on text input | click | Wait for blur with value |
| Click on submit button (in form) | click | Wait for form submit |
| Blur without value change | blur | No meaningful action |

### Grouping Logic

Related events are grouped for deduplication:

1. **Same element** → Always grouped
2. **Label + associated input** → Grouped (via `for` attribute or containment)
3. **Submit button + parent form** → Grouped

### Example Flow

**User Action**: Check "Remember me" checkbox

```
1. click on <label for="remember"> (priority: 40)
   → SUPPRESSED (waiting for input change)

2. click on <input type="checkbox"> (priority: 40)
   → SUPPRESSED (waiting for change event)

3. change on <input> (priority: 80)
   → BUFFERED

[After 15ms buffer]
   → Flush: Only change event recorded
   → Result: 1 step (input_commit on checkbox)
```

---

## 6. Screenshot Capture

### Capture Mechanism

Screenshots use Chrome's `tabs.captureVisibleTab()` API:

```typescript
// From screenshot.ts
const dataUrl = await chrome.tabs.captureVisibleTab({
  format: "jpeg",
  quality: 90,
});
```

**Location**: `extension/src/background/screenshot.ts`

### Element Highlighting

**Before capture**, the interacted element is highlighted:

```typescript
// From recorder.ts
function addHighlightForScreenshot(element: HTMLElement): () => void {
  const prevOutline = element.style.outline;
  const prevOutlineOffset = element.style.outlineOffset;

  // Green outline - visible in screenshots
  element.style.outline = "3px solid #22c55e";
  element.style.outlineOffset = "2px";

  return () => {
    element.style.outline = prevOutline;
    element.style.outlineOffset = prevOutlineOffset;
  };
}
```

**Flow**:
1. Add highlight to element
2. Wait one animation frame (`requestAnimationFrame`)
3. Capture screenshot (highlight visible)
4. Remove highlight

### Storage Strategy

Screenshots are stored in **IndexedDB** (not `chrome.storage.session`) due to size limits:

- `chrome.storage.session` has ~1MB total limit
- Each screenshot is 300-500KB base64
- IndexedDB has no practical size limit

**Location**: `extension/src/background/screenshotStore.ts`

### NAVIGATE Step Screenshots

For navigation events (address bar), the screenshot is captured **after navigation completes**:

1. Content script records NAVIGATE step (no screenshot)
2. Background stores `pendingNavigateScreenshotStepNumber`
3. `webNavigation.onCompleted` fires
4. Background captures destination page screenshot
5. Screenshot associated with the NAVIGATE step

This ensures the screenshot shows the **destination page**, not the departing page.

---

## 7. Multi-Page Recording

### Challenge

IndexedDB is **origin-scoped** - recording state is lost when navigating cross-origin.

### Solution: chrome.storage.session

Recording session state is stored in `chrome.storage.session`:

```typescript
interface RecordingSessionState {
  sessionId: string;
  workflowName: string;
  startingUrl: string;
  primaryTabId: number;
  currentStepNumber: number;
  status: "active" | "paused";
  steps: StepCreate[];
  startedAt: number;
  lastActivityAt: number;
  expiresAt: number;  // 30 minute timeout
  elapsedSeconds: number;
  isPaused: boolean;
  navigationInProgress: boolean;
  pendingNavigateScreenshotStepNumber: number | null;
}
```

### Session Flow

1. **Start Recording** → `startRecordingSession()` creates session in storage
2. **Record Step** → Content script sends `RECORDING_ADD_STEP` to background
3. **Background Assigns Step Number** → Avoids race conditions across navigations
4. **Navigation** → Content script records beforeunload, page unloads
5. **New Page Loads** → Content script calls `RECORDING_GET_STATE`
6. **Session Restored** → Event listeners re-attached, widget shown
7. **Stop Recording** → Session data used for upload

### Step Number Assignment

**Critical**: Step numbers are assigned by the **background service**, not the content script.

```typescript
// Content script sends step with placeholder
const step: StepCreate = {
  step_number: -1,  // Placeholder
  ...
};
const assignedStepNumber = await addStep(step);

// Background assigns atomically
const assignedStepNumber = session.currentStepNumber + 1;
```

This prevents race conditions when multiple events fire during navigation.

---

## 8. AI Labelling Pipeline

### Trigger

After workflow creation, call `POST /api/workflows/{id}/start-processing`:

```python
# Triggers Celery task
label_workflow_steps.delay(workflow_id)
```

### AI Service

**Location**: `backend/app/services/ai.py`

**Model**: Claude Haiku (`claude-haiku-4-5-20251001`) with vision capability

### Data Sent to AI

```python
prompt = f"""Analyze this screenshot and element to generate clear workflow labels.

PAGE CONTEXT:
- URL: {page_url}
- Title: {page_title}
- Visual region: {visual_region}
- Section heading: {closest_heading}

ELEMENT DETAILS:
- Tag: {tag}
- Type: {elem_type}
- ARIA role: {role}
- ARIA label: {aria_label}
- Label text: {label_text}
- Placeholder: {placeholder}
- Element text: {text_content}
- Nearby text: {nearby_text}
- Position: {position}

ACTION: {action_type}
Input value: {input_value}

INSTRUCTIONS:
1. The element should be highlighted with a green outline in the screenshot
2. Use the page title and URL to understand the application context
3. Generate a short, descriptive field label (max 5 words)
4. Generate a clear, action-oriented instruction (1-2 sentences)
"""
```

### AI Response

Claude returns structured JSON via tool calling:

```json
{
  "field_label": "Email Address",
  "instruction": "Enter your work email address to sign in",
  "confidence": 85
}
```

### Fallback Labels

If AI fails, template-based labels are generated:

```python
def _generate_fallback_label(step, element_meta):
    verbs = {
        "click": "Click",
        "input_commit": "Enter",
        "select_change": "Select",
        "submit": "Submit",
        "navigate": "Navigate to",
    }
    label = (
        element_meta.get("label_text") or
        element_meta.get("placeholder") or
        element_meta.get("name") or
        "Field"
    )
    verb = verbs.get(step.action_type, "Complete")
    return {
        "field_label": label,
        "instruction": f"{verb} {label.lower()}",
        "ai_confidence": 0.0,
        "ai_model": "fallback_template",
    }
```

---

## 9. Step Data Structure

### StepCreate (Frontend → Backend)

```typescript
interface StepCreate {
  step_number: number;          // Sequential, assigned by background
  timestamp: string | null;     // ISO 8601 datetime
  action_type: ActionType;      // click, input_commit, etc.
  selectors: {
    id?: string;
    classes?: string[];
    xpath?: string;
    css?: string;
    data_testid?: string;
  };
  element_meta: {
    tag_name: string;
    type?: string;
    text?: string;
    label_text?: string;
    placeholder?: string;
    role?: string;
    aria_label?: string;
    bounding_box?: { x, y, width, height };
    visualRegion?: string;      // header, main, footer, sidebar
    nearbyLandmarks?: object;
  };
  page_context: {
    url: string;
    title: string;
    viewport: { width, height };
    scroll: { x, y };
    user_agent: string;
  };
  action_data?: {
    input_value?: string;
    selected_option?: string;
    clipboard_preview?: string;
  } | null;
  dom_context?: object | null;
  screenshot_id?: number | null;
}
```

### StepResponse (Backend → Frontend)

Extends StepCreate with AI-generated fields:

```typescript
interface StepResponse extends StepCreate {
  id: number;
  workflow_id: number;

  // AI-generated labels
  field_label: string | null;
  instruction: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_generated_at: string | null;

  // Admin edits
  label_edited: boolean;
  instruction_edited: boolean;
  edited_by: number | null;
  edited_at: string | null;

  // Auto-healing
  healed_selectors: object | null;
  healed_at: string | null;
  healing_confidence: number | null;

  created_at: string;
}
```

---

## 10. Known Limitations

### Buffer Delay (15ms)

- **Impact**: 15ms lag between user action and step counter update
- **Tradeoff**: Reduced from 100ms for navigation timing, but still causes slight delay
- **Workaround**: None; necessary for deduplication

### Screenshot Rate Limit

- **Impact**: Chrome limits `captureVisibleTab()` to ~2/second
- **Symptoms**: Missing screenshots on rapid interactions
- **Workaround**: Rate limiting logic prevents failures; some screenshots may be skipped

### Cursor Not Captured

- **Impact**: Chrome's screenshot API does not capture the OS cursor
- **Status**: Lower priority enhancement
- **Potential Fix**: Canvas overlay with tracked mouse position (not implemented)

### Address Bar Navigation

- **Impact**: When user types URL in address bar:
  - If typed in a field first → Both `input_commit` and `navigate` may record
  - Navigate priority (100) may win over input_commit (60)
- **Current Behavior**: Navigate step captured with destination screenshot
- **Known Issue**: page_context.url shows departing page, not target URL

### Complex Editors (Google Docs, Notion)

- **Impact**: Rich text editors fire non-standard events
- **Symptoms**: May record multiple clipboard events for single action
- **Mitigation**: Clipboard events now route through deduplicator

### Autofill Detection

- **Impact**: Browser autofill creates multiple events
- **Current Strategy**: Only record blur when value changed from focus
- **Edge Cases**: Some autofill scenarios may still create extra events

---

## 11. Troubleshooting

### Too Many Steps Recorded

**Symptoms**: Simple workflow records excessive steps

**Diagnosis**:
1. Open Chrome DevTools Console
2. Look for `[EventDeduplicator] Buffered ...` logs
3. Check if suppression rules are triggering

**Common Causes**:
- Buffer too short (was set below 15ms)
- New element type not covered by suppression rules
- Complex editor firing custom events

### Too Few Steps / Missing Steps

**Symptoms**: Actions not being recorded

**Diagnosis**:
1. Check if element is interactive (`isInteractionMeaningful`)
2. Verify event listeners are attached (recording started)
3. Look for errors in console

**Common Causes**:
- Element filtered as non-interactive
- Recording not started/restored after navigation
- Value change detection returning false

### Missing Screenshots After Navigation

**Symptoms**: Steps 1-4 have screenshots, steps 5+ don't

**Diagnosis**:
1. Check service worker console for `[RecordingSession]` logs
2. Verify `webNavigation.onCompleted` fires
3. Check if session cache was invalidated

**Common Causes**:
- Session cache stale after cross-origin navigation
- `pendingNavigateScreenshotStepNumber` not set
- Screenshot capture failing on new origin

### Widget Not Showing After Navigation

**Symptoms**: Recording active but widget invisible on new page

**Diagnosis**:
1. Check console for `[ContentRecorder] Restoring recording` log
2. Verify `RECORDING_GET_STATE` returns valid session
3. Check if content script loaded on new page

**Common Causes**:
- Content script not injected (check manifest permissions)
- Session expired (30 minute timeout)
- `shouldRestore` condition not met

### AI Labels Poor Quality

**Symptoms**: AI-generated labels don't match actual element

**Diagnosis**:
1. Check if screenshot has green highlight
2. Review element_meta sent to AI
3. Check AI confidence score

**Common Causes**:
- Screenshot captured before highlight (fixed in Phase 1a)
- Limited metadata in prompt (enhanced in Phase 1b)
- Element visually unclear in screenshot

---

## 12. File Locations

### Extension (TypeScript)

```
extension/src/content/
├── recorder.ts              # Main event handlers, step recording
├── widget.ts                # Recording UI overlay
├── walkthrough.ts           # Walkthrough playback (separate feature)
├── utils/
│   ├── event-deduplicator.ts  # 15ms buffer, priority selection
│   ├── filters.ts           # isInteractionMeaningful, getActionType
│   ├── selectors.ts         # CSS/XPath selector extraction
│   └── metadata.ts          # Element metadata extraction
└── storage/
    └── indexeddb.ts         # Local step/screenshot storage (fallback)

extension/src/background/
├── index.ts                 # Service worker entry
├── messaging.ts             # Message routing (RECORDING_* handlers)
├── recordingSession.ts      # Session state in chrome.storage.session
├── screenshotStore.ts       # IndexedDB screenshot storage
└── screenshot.ts            # chrome.tabs.captureVisibleTab

extension/src/shared/
└── types.ts                 # TypeScript interfaces (StepCreate, etc.)
```

### Backend (Python)

```
backend/app/
├── api/
│   └── workflows.py         # REST endpoints, start-processing
├── services/
│   └── ai.py                # AIService, Claude Vision integration
├── tasks/
│   └── ai_labeling.py       # Celery task for async labelling
└── models/
    ├── step.py              # Step SQLAlchemy model
    └── workflow.py          # Workflow model
```

---

## Appendix: Configuration Constants

| Constant | Value | Location | Purpose |
|----------|-------|----------|---------|
| `bufferDelay` | 15ms | event-deduplicator.ts:60 | Deduplication window |
| `RECORDING_SESSION_TIMEOUT_MS` | 30 min | types.ts:449 | Session expiration |
| Screenshot quality | 90 | screenshot.ts | JPEG compression |
| Highlight color | #22c55e | recorder.ts:53 | Green outline |
| AI model | claude-haiku-4-5-20251001 | ai.py:66 | Vision model |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-24 | Added destination screenshot for NAVIGATE steps |
| 2026-01-24 | Added element highlighting before screenshot |
| 2026-01-24 | Enhanced AI prompt with more metadata |
| 2026-01-23 | Fixed duplicate steps regression |
| 2026-01-20 | Added multi-page recording support |
| Earlier | Reduced buffer from 100ms to 15ms |
| Earlier | Added clipboard event support |
