# Manual Testing Guide - Chrome Extension

This guide provides step-by-step instructions for manually testing the Chrome extension's recording and playback functionality.

## Prerequisites

1. Build the extension:
```bash
cd /home/user/OverlayMVP/extension
npm run build
```

2. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension/dist/` folder

3. Backend API must be running:
```bash
cd /home/user/OverlayMVP/backend
source venv/bin/activate
uvicorn app.main:app --reload
```

## Test Suite 1: Authentication (FE-004)

### Test 1.1: Login Flow
1. Click the extension icon in Chrome toolbar
2. Popup should open (400px × 600px)
3. Verify UI shows:
   - "Workflow Recorder" title
   - Email input field
   - Password input field
   - "Sign In" button

4. Enter valid credentials:
   - Email: (from backend signup)
   - Password: (min 8 chars, letter + number)

5. Click "Sign In"
6. Verify:
   - Loading spinner appears on button
   - Button disabled during loading
   - On success: UI changes to authenticated view

### Test 1.2: Authentication Errors
1. Enter invalid email format (e.g., "notanemail")
2. Verify: Error message appears
3. Enter valid email but wrong password
4. Click "Sign In"
5. Verify: API error message displayed
6. Check DevTools console for error details

### Test 1.3: Token Persistence
1. Log in successfully
2. Close popup (click outside or close manually)
3. Reopen popup by clicking extension icon
4. Verify: Still logged in (shows authenticated view, not login form)
5. Restart browser
6. Open popup
7. Verify: Still logged in (token persists across sessions)

### Test 1.4: Logout
1. When logged in, click "Logout" button
2. Verify: Returns to login screen
3. Reopen popup
4. Verify: Must log in again

---

## Test Suite 2: Background Service Worker (FE-003)

### Test 2.1: Service Worker Initialization
1. Open Chrome DevTools > Console
2. Filter by "Background" or open background page
3. Navigate to: `chrome://extensions/` > Extension details > "Inspect views: background page"
4. Verify console logs:
   - "🚀 Workflow Recorder: Background service worker loaded"
   - "Extension installed" or "Extension updated"

### Test 2.2: Message Passing
1. With DevTools open on background page
2. Open popup
3. Verify: Messages logged in background console
4. Click "Start Recording" (when implemented)
5. Verify: START_RECORDING message received

### Test 2.3: Screenshot Capture
1. Navigate to any webpage (e.g., https://example.com)
2. Open DevTools console (for background page)
3. Run in console:
```javascript
chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (response) => {
  console.log('Screenshot response:', response);
});
```
4. Verify:
   - Response contains `dataUrl` (base64 image)
   - Response contains `blob`
   - Response has `timestamp`, `tabId`, `url`
   - No errors in console

### Test 2.4: Screenshot on Restricted Pages
1. Navigate to `chrome://extensions/`
2. Try to capture screenshot (same method as 2.3)
3. Verify: Error response about permission denied

### Test 2.5: Recording State Management
1. In background console, run:
```javascript
chrome.runtime.sendMessage({
  type: 'START_RECORDING',
  payload: { name: 'Test Workflow', url: 'https://example.com' }
}, (response) => {
  console.log('Start recording response:', response);
});
```
2. Verify: Response indicates success
3. Check chrome.storage:
```javascript
chrome.storage.local.get('recording_state', (result) => {
  console.log('Recording state:', result.recording_state);
});
```
4. Verify state contains:
   - `isRecording: true`
   - `workflowName: "Test Workflow"`
   - `startingUrl: "https://example.com"`

---

## Test Suite 3: Content Script - Event Recorder (FE-005)

### Test 3.1: Content Script Injection
1. Navigate to https://example.com
2. Open DevTools > Console
3. Verify console log: "📝 Workflow Recorder: Content script (recorder) loaded"
4. Navigate to another page
5. Verify: Content script loads on new page

### Test 3.2: Click Event Capture
**Setup**: Start recording first (Test 2.5 or via popup)

1. Navigate to a test page with buttons (e.g., form page)
2. Click a button
3. Open DevTools > Application > IndexedDB > WorkflowRecorderDB > steps
4. Verify: New step record created with:
   - `step_number: 1`
   - `action_type: "click"`
   - `selectors` object with ID/CSS/XPath
   - `element_meta` with tag_name, bounding_box, etc.
   - `page_context` with URL, title, viewport

### Test 3.3: Input Event Capture
1. With recording active, fill out a form:
   - Type in text input (e.g., "test@email.com")
   - Tab or click outside input (blur event)
2. Check IndexedDB steps
3. Verify: Input commit step created with:
   - `action_type: "input_commit"`
   - `action_data` containing input value

### Test 3.4: Select Change Capture
1. Select an option from dropdown
2. Check IndexedDB
3. Verify: Step with `action_type: "select_change"`

### Test 3.5: Form Submit Capture
1. Click form submit button
2. Check IndexedDB
3. Verify: Step with `action_type: "submit"`

### Test 3.6: Navigation Event Capture
1. Click a link to navigate to new page
2. Check IndexedDB before page unloads
3. Verify: Step with `action_type: "navigate"`

### Test 3.7: Selector Extraction Quality
1. Record clicks on various elements:
   - Button with ID
   - Button without ID
   - Div with role="button"
   - Link with text

2. For each step in IndexedDB, verify `selectors` object contains:
   - `primary`: Most stable selector (ID, data-testid, or null)
   - `css`: CSS selector path
   - `xpath`: XPath string
   - `stable_attrs`: Object with aria-label, role, placeholder, etc.

3. Verify: No dynamic IDs like `:r1:`, `:r2:` in selectors

### Test 3.8: Metadata Extraction
1. Record interaction with complex element:
```html
<button type="button" class="btn btn-primary" aria-label="Submit Form">
  Submit
</button>
```

2. Check IndexedDB step's `element_meta`:
   - `tag_name: "BUTTON"`
   - `type: "button"`
   - `classes: ["btn", "btn-primary"]`
   - `inner_text: "Submit"`
   - `role: null` (or inherited role)
   - `bounding_box: { x, y, width, height }`
   - `parent` object with parent element info

### Test 3.9: Interaction Filtering
1. With recording active, perform these actions:
   - Click on `<body>` element
   - Mouse move over elements
   - Scroll page

2. Check IndexedDB
3. Verify: These actions are NOT recorded (filtered out as meaningless)

### Test 3.10: Performance Impact
1. Navigate to complex web app (e.g., Gmail, Twitter)
2. Start recording
3. Perform 20-30 interactions (clicks, typing, navigation)
4. Monitor Chrome DevTools > Performance
5. Verify:
   - Page remains responsive
   - No significant lag
   - Event handlers execute in <5ms

---

## Test Suite 4: Recording Controls (FE-004)

### Test 4.1: Start Recording from Popup
1. Log in to extension
2. In popup, enter workflow name: "Test Workflow"
3. Click "Start Recording"
4. Verify:
   - Button changes to "Stop Recording"
   - Recording indicator shows (pulsing red dot)
   - Workflow name displayed
   - Button disabled during async operation

### Test 4.2: Stop Recording and Upload
1. With recording active, perform 3-5 interactions on webpage
2. Open popup
3. Click "Stop Recording"
4. Verify:
   - Loading state shown
   - Backend API receives POST /api/workflows request (check Network tab)
   - Workflow created in backend
   - Recording state cleared
   - Button returns to "Start Recording"

### Test 4.3: Workflow List Display
1. After creating 1-3 workflows, reopen popup
2. Verify workflow list shows:
   - Workflow name
   - Status badge (color-coded: active=green, processing=blue, draft=gray)
   - Step count (e.g., "5 steps")
   - Run count (e.g., "0 runs")
   - Relative timestamp (e.g., "2m ago", "1h ago")

3. Click refresh button
4. Verify: List updates with latest data from backend

### Test 4.4: Error Handling
1. Start recording without internet connection
2. Verify: Error message displayed
3. Try to start recording on chrome:// page
4. Verify: Error about restricted page

---

## Test Suite 5: End-to-End Recording Flow

### E2E Test: Complete Workflow Recording
1. **Setup**:
   - Backend running
   - Extension loaded and logged in
   - Test webpage open (e.g., simple form at https://example.com/form)

2. **Start Recording**:
   - Open extension popup
   - Enter workflow name: "Submit Contact Form"
   - Click "Start Recording"
   - Verify: Recording indicator shows

3. **Perform Actions**:
   - Fill "Name" field: "John Doe"
   - Fill "Email" field: "john@example.com"
   - Select "Subject" dropdown: "Question"
   - Fill "Message" textarea: "Test message"
   - Click "Submit" button

4. **Stop Recording**:
   - Open extension popup
   - Click "Stop Recording"
   - Verify: Workflow uploaded successfully

5. **Verify Backend**:
   - Check backend logs for POST /api/workflows
   - Query database:
```bash
sqlite3 backend/app.db "SELECT * FROM workflows WHERE name='Submit Contact Form';"
```
   - Verify: Workflow exists with 5 steps

6. **Verify Frontend**:
   - Reopen extension popup
   - Verify: "Submit Contact Form" appears in workflow list
   - Check status badge color and step count

---

## Test Suite 6: Edge Cases & Error Scenarios

### Test 6.1: Recording on Multiple Tabs
1. Start recording on Tab 1
2. Switch to Tab 2
3. Perform actions on Tab 2
4. Verify: Steps from Tab 2 also recorded (or workflow scoped to single tab - check spec)

### Test 6.2: Recording Interrupted by Browser Restart
1. Start recording
2. Perform 2-3 interactions
3. Close browser completely
4. Reopen browser and extension
5. Check chrome.storage for `recording_state`
6. Verify: State persisted (can resume or notify user)

### Test 6.3: Very Long Recording (Stress Test)
1. Start recording
2. Perform 100+ interactions (use script if needed)
3. Check IndexedDB size
4. Stop recording
5. Verify: All steps uploaded successfully
6. Check for memory leaks in DevTools > Memory

### Test 6.4: Special Characters in Workflow Name
1. Try creating workflow with name: `Test <script>alert('xss')</script>`
2. Verify: Input sanitized, no XSS vulnerability
3. Try name with emojis: "Test Workflow 🎉"
4. Verify: Handled correctly

### Test 6.5: Network Failure During Upload
1. Start recording, perform actions
2. Disconnect internet
3. Click "Stop Recording"
4. Verify:
   - Error message about network failure
   - Steps still in IndexedDB (not lost)
   - Can retry upload when connection restored

---

## Debugging Tips

### View Background Page Logs
```
chrome://extensions/ → Extension Details → Inspect views: background page
```

### View Content Script Logs
Open DevTools on any webpage, filter console by "Workflow Recorder"

### Inspect Chrome Storage
```javascript
// In DevTools console
chrome.storage.local.get(null, (data) => console.log(data));
```

### Inspect IndexedDB
DevTools > Application > IndexedDB > WorkflowRecorderDB > steps

### Check Network Requests
DevTools > Network tab, filter by "workflows" or "screenshots"

### Clear All Extension Data
```javascript
chrome.storage.local.clear();
// Also delete IndexedDB in Application tab
```

---

## Known Issues & Limitations (MVP)

1. **Screenshots**: Capture infrastructure in place but upload not yet integrated
2. **Walkthrough Mode**: Not implemented (FE-006)
3. **Auto-healing**: Not implemented (Sprint 2)
4. **AI Labeling**: Not implemented (Sprint 2)
5. **Multi-tab Recording**: May have edge cases (test and document)
6. **Dynamic Content**: MutationObserver not implemented (static pages work)

---

## Success Criteria

✅ All authentication flows work correctly
✅ Recording captures all interaction types (click, input, select, submit, navigate)
✅ Selectors extracted robustly (ID, CSS, XPath)
✅ Metadata complete (bounding boxes, text, attributes)
✅ Steps buffered in IndexedDB during recording
✅ Workflows uploaded to backend successfully
✅ No console errors during normal operation
✅ Minimal performance impact on host pages
✅ State persists across popup closes and browser restarts

---

## Reporting Issues

When reporting issues, include:
1. Chrome version
2. Extension version
3. Steps to reproduce
4. Console errors (background page + content script)
5. Chrome storage state at time of error
6. IndexedDB contents if relevant
7. Network request/response if backend-related
