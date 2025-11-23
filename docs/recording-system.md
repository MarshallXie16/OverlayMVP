# Recording System

## Overview

The recording system captures user interactions on web pages and converts them into replayable workflow steps. It uses semantic event deduplication to record user **intent** rather than raw DOM events.

**Key Achievement:** Reduced login workflow from 13 steps → 4 steps (69% reduction)

---

## Architecture

```
User Action
    ↓
DOM Events (click, blur, change, submit)
    ↓
Content Script Recorder
    ↓
EventDeduplicator (100ms buffer)
    ↓
Group & Prioritize Events
    ↓
Record Step (IndexedDB)
    ↓
Background Worker
    ↓
Backend API
```

---

## Core Components

### **1. Recorder** (`extension/src/content/recorder.ts`)

Captures and coordinates user interactions during recording.

**Responsibilities:**
- Listen to DOM events (click, blur, change, submit, focus)
- Filter meaningful interactions
- Delegate to EventDeduplicator for processing
- Manage recording state
- Store steps in IndexedDB
- Upload to backend on stop

**Key Functions:**
- `startRecording()` - Initialize listeners and state
- `stopRecording()` - Flush pending events and upload
- `recordInteraction()` - Create step from event

---

### **2. EventDeduplicator** (`extension/src/content/utils/event-deduplicator.ts`)

Groups and deduplicates DOM events to record semantic actions.

**Problem Solved:**
- Clicking a checkbox label triggers 3 events (label click, input click, change)
- Form submit triggers 2 events (button click, form submit)
- Browser autofill creates noise with multiple blur events

**Solution:**
- Buffer events for 100ms
- Group related events (label + input, button + form)
- Pick highest priority event
- Track input values to detect actual changes

**Event Priority:**
```
submit (100) > change (80) > input_commit (60) > click (40)
```

**Suppression Rules:**
- **Checkbox/Radio:** Record only `change` event (suppress label/input clicks)
- **Form Submit:** Record only `submit` event (suppress button click)
- **Empty Inputs:** Skip blur if no value change
- **Autofill:** Only record fields with value changes

---

### **3. Recording Widget** (`extension/src/content/widget.ts`)

Floating UI shown during recording with stop/pause controls.

**Features:**
- Draggable position
- Step counter
- Stop button
- Pause button (future)

---

### **4. Filters** (`extension/src/content/utils/filters.ts`)

Initial filtering of interactions before deduplication.

**Filters:**
- Only interactive elements (buttons, inputs, links)
- No widget clicks
- No body/html clicks
- No right/middle clicks

---

### **5. Background Messaging** (`extension/src/background/messaging.ts`)

Routes messages between popup, content scripts, and backend.

**Handles:**
- Start/stop recording commands
- Screenshot capture requests
- Workflow upload to backend
- State queries

---

## Event Flow Examples

### **Example 1: Checkbox Interaction**

**User Action:** Click "Remember me" checkbox label

**Events Fired:**
```
1. click on <label for="remember-me">     (priority: 40)
2. click on <input type="checkbox">       (priority: 40)
3. change on <input>                      (priority: 80)
```

**Deduplication:**
- All 3 events buffered within 100ms
- Grouped (related via label `for` attribute)
- Highest priority selected: `change` (80)

**Result:** 1 step recorded (change on checkbox)

---

### **Example 2: Form Submission**

**User Action:** Click "Sign in" button

**Events Fired:**
```
1. click on <button type="submit">        (priority: 40)
2. submit on <form>                       (priority: 100)
```

**Deduplication:**
- Both events buffered
- Grouped (button is child of form)
- Highest priority selected: `submit` (100)

**Result:** 1 step recorded (form submit)

---

### **Example 3: Empty Input Click**

**User Action:** Click input field, then click elsewhere (no typing)

**Events Fired:**
```
1. focus on <input>                       (tracks initial value: "")
2. blur on <input>                        (checks value: "" → no change)
```

**Value Check:**
- `hasInputValueChanged()` returns false
- Blur event suppressed

**Result:** 0 steps recorded

---

## State Management

### **Recorder State:**
```typescript
{
  isRecording: boolean           // Recording active?
  currentStepNumber: number      // Atomic counter (avoids race conditions)
  startingUrl: string           // Initial page URL
  debouncer: InputDebouncer     // Legacy (now uses deduplicator)
  deduplicator: EventDeduplicator  // Event grouping
}
```

### **Step Data:**
```typescript
{
  step_number: number           // Unique, sequential
  timestamp: string | null      // ISO timestamp
  action_type: string          // click, input_commit, select_change, submit, navigate
  selectors: object            // CSS/XPath/ID selectors
  element_meta: object         // Tag, text, attributes
  page_context: object         // URL, title, viewport
  action_data: object | null   // Input values, select options
  dom_context: object | null   // Surrounding DOM
  screenshot_id: number | null // Reference to screenshot
}
```

---

## Recent Fixes

### **Fix 1: Step Numbering Race Condition**

**Problem:** Multiple events reading same step number → duplicates → database constraint violation

**Solution:** Atomic increment and capture
```typescript
// Before (buggy)
state.currentStepNumber++;
const step = { step_number: state.currentStepNumber };

// After (fixed)
const stepNumber = ++state.currentStepNumber;  // Atomic
const step = { step_number: stepNumber };
```

---

### **Fix 2: Event Deduplication**

**Problem:** Too many redundant steps (13 for simple login)

**Solution:** EventDeduplicator with 100ms buffering and priority-based selection

**Impact:** 69% reduction in recorded steps

---

### **Fix 3: CSS Loading**

**Problem:** Content script not loading due to CSS imports in TypeScript

**Solution:** Move all CSS to `manifest.json` content_scripts

---

## Testing

### **Manual Test (Login Workflow):**

1. Navigate to `http://localhost:3000/login`
2. Start recording
3. Fill email
4. Fill password
5. Check "Remember me"
6. Click "Sign in"
7. Stop recording

**Expected:** 4 steps (not 13)
- Step 1: input_commit on email
- Step 2: input_commit on password
- Step 3: click on checkbox (from change event)
- Step 4: submit on form

### **Verification:**
```bash
# Check database
sqlite3 backend/workflow_db.db
SELECT step_number, action_type FROM steps 
WHERE workflow_id = (SELECT MAX(id) FROM workflows);

# Should show: 1, 2, 3, 4 with no duplicates
```

---

## Configuration

### **Buffer Delay:**
```typescript
// In event-deduplicator.ts
private readonly bufferDelay = 100;  // ms
```

**Tradeoffs:**
- Lower (50ms): More responsive, less deduplication
- Higher (200ms): More deduplication, feels sluggish

**Recommended:** 100ms balances both

---

## Known Limitations

1. **Screenshot Rate Limit:** Chrome limits captures to 2/second (may fail on rapid interactions)
2. **Buffer Delay:** 100ms lag between action and step counter update
3. **Custom Events:** Non-standard DOM events may not deduplicate properly
4. **Autofill Detection:** Best effort, may still record multiple blur events

---

## Future Enhancements

- Adaptive buffer delay based on event rate
- Pattern recognition for common workflows
- Visual feedback for buffering state
- Step preview before recording
- ML-based event classification

---

## File Locations

```
extension/src/content/
  ├── recorder.ts              # Main recorder
  ├── widget.ts               # Recording UI
  ├── feedback.ts             # Visual feedback
  ├── utils/
  │   ├── event-deduplicator.ts  # Event grouping
  │   ├── filters.ts          # Interaction filtering
  │   ├── selectors.ts        # Selector extraction
  │   └── metadata.ts         # Metadata extraction
  └── storage/
      └── indexeddb.ts        # Local storage

extension/src/background/
  ├── index.ts                # Service worker entry
  ├── messaging.ts            # Message routing
  └── state.ts                # Recording state

extension/src/popup/
  └── store/
      └── recordingStore.ts   # UI state management
```

---

## Troubleshooting

### **Too many steps recorded:**
- Check for `[EventDeduplicator] Buffered ...` logs
- Verify suppression rules working
- Ensure grouping logic correct

### **Too few steps recorded:**
- Check event listeners attached
- Verify flush on stop
- Check value change detection

### **Steps missing on stop:**
- Ensure `forceFlush()` called
- 150ms wait built into `stopRecording()`
- Check for errors in console

---

## Resources

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Event Capturing](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
