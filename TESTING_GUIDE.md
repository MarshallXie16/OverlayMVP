# Workflow Automation Platform - Testing Guide

This guide will walk you through setting up and testing all Sprint 1 features from scratch.

**Estimated Time**: 30-45 minutes for full setup and testing

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Backend Setup](#backend-setup)
3. [Dashboard Setup](#dashboard-setup)
4. [Extension Setup](#extension-setup)
5. [End-to-End Testing](#end-to-end-testing)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Python 3.11+** (check: `python --version`)
- **Node.js 18+** (check: `node --version`)
- **npm** (check: `npm --version`)
- **Google Chrome** (for extension testing)

### Clone and Navigate

```bash
cd /path/to/OverlayMVP
```

---

## Backend Setup

### Step 1: Create Python Virtual Environment

```bash
cd backend
python -m venv venv
```

### Step 2: Activate Virtual Environment

**On Linux/Mac**:
```bash
source venv/bin/activate
```

**On Windows**:
```bash
venv\Scripts\activate
```

You should see `(venv)` in your terminal prompt.

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

**Expected output**: Installation of FastAPI, SQLAlchemy, etc.

### Step 4: Set Up Environment Variables

Create `.env` file in the `backend/` directory:

```bash
cat > .env << 'EOF'
DATABASE_URL=sqlite:///./app.db
JWT_SECRET_KEY=your-secret-key-change-in-production
ANTHROPIC_API_KEY=your-anthropic-api-key-here
AWS_ACCESS_KEY_ID=not-needed-for-mvp
AWS_SECRET_ACCESS_KEY=not-needed-for-mvp
S3_BUCKET_NAME=not-needed-for-mvp
REDIS_URL=redis://localhost:6379
EOF
```

**Note**: For MVP testing, the AWS and Redis credentials aren't needed yet.

### Step 5: Initialize Database

```bash
# Run migrations to create tables
alembic upgrade head
```

**Expected output**:
```
INFO  [alembic.runtime.migration] Running upgrade -> xxxxx, initial migration
```

**What this does**: Creates SQLite database (`app.db`) with all tables (companies, users, workflows, steps, screenshots, etc.)

### Step 6: Start Backend Server

```bash
uvicorn app.main:app --reload
```

**Expected output**:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### Step 7: Verify Backend is Running

Open browser and go to: **http://localhost:8000/docs**

**What you should see**:
- FastAPI interactive documentation (Swagger UI)
- List of endpoints organized by tags:
  - **auth**: `/api/auth/signup`, `/api/auth/login`
  - **workflows**: `/api/workflows`, `/api/workflows/{id}`
  - **health**: `/health`

**Quick test**: Click on `/health` → "Try it out" → "Execute"

**Expected response**:
```json
{
  "status": "healthy"
}
```

✅ **Backend is ready!** Keep this terminal running.

---

## Dashboard Setup

Open a **new terminal** (keep backend running in the first one).

### Step 1: Navigate to Dashboard

```bash
cd dashboard
```

### Step 2: Install Dependencies

```bash
npm install
```

**Expected output**: Installation of React, React Router, Zustand, Tailwind CSS, etc.

**Time**: ~30 seconds

### Step 3: Start Dashboard Dev Server

```bash
npm run dev
```

**Expected output**:
```
VITE v5.4.21  ready in 292 ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

### Step 4: Verify Dashboard Loads

Open browser and go to: **http://localhost:3000**

**What you should see**:
- Redirects to `/login`
- Clean login page with:
  - "Sign in to your account" heading
  - Email field
  - Password field
  - "Remember me" checkbox
  - "Sign in" button (blue)
  - Link to "create a new account"

**Visual Check**:
- Page should be styled with Tailwind CSS
- Blue primary color (#3b82f6)
- Responsive centered form

✅ **Dashboard is ready!** Keep this terminal running.

---

## Extension Setup

Open a **new terminal** (keep backend and dashboard running).

### Step 1: Navigate to Extension

```bash
cd extension
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Build Extension

```bash
npm run build
```

**Expected output**:
```
vite v5.0.8 building for production...
✓ built in 2.34s
```

**What this creates**: `dist/` folder with:
- `manifest.json`
- `background.js` (service worker)
- `content.js` (content script)
- `popup.html` and `popup.js`

### Step 4: Load Extension in Chrome

1. **Open Chrome**
2. **Go to**: `chrome://extensions/`
3. **Enable "Developer mode"** (toggle in top-right corner)
4. **Click "Load unpacked"**
5. **Select folder**: Navigate to `OverlayMVP/extension/dist`
6. **Click "Select"**

**What you should see**:
- Extension card appears with:
  - Name: "Workflow Recorder"
  - Description: "Record and replay interactive workflows"
  - Version: 0.1.0
  - ID: Random Chrome extension ID
  - Status: Enabled

### Step 5: Verify Extension Loaded

1. **Click the Extensions icon** (puzzle piece) in Chrome toolbar
2. **Find "Workflow Recorder"**
3. **Pin it** (click the pin icon so it's always visible)

**Expected**: Extension icon appears in Chrome toolbar

### Step 6: Test Extension Popup

1. **Click the Workflow Recorder icon** in toolbar

**What you should see**:
- Popup opens (300px width)
- Login form with:
  - "Sign in to your account" heading
  - Email field
  - Password field
  - "Sign in" button
- Clean, styled interface

✅ **Extension is ready!**

---

## End-to-End Testing

Now let's test the complete workflow from signup to recording.

### Test 1: User Signup (Dashboard)

**Steps**:
1. Go to **http://localhost:3000** (should show login page)
2. Click **"create a new account"** link
3. Fill out the signup form:
   - **Full Name**: `Test User`
   - **Email**: `test@example.com`
   - **Password**: `password123`
   - **Confirm Password**: `password123`
   - **Company Name**: `Test Company` ← **REQUIRED** (creates your company)
   - **Invite Token**: (leave empty)
4. Click **"Create account"**

**What you should see**:
1. Button changes to "Creating account..." with spinner
2. After 1-2 seconds, redirects to `/dashboard`
3. Dashboard shows:
   - Navbar with "Workflow Platform" logo
   - Your name "Test User" in top-right
   - Company name "Test Company" next to it
   - "Logout" button
   - Main content: "No workflows yet" message
   - Empty state with document icon

**Backend logs** (in backend terminal):
```
INFO: 127.0.0.1:xxxxx - "POST /api/auth/signup HTTP/1.1" 200 OK
```

**What happened**:
- User created in database
- Company created (or joined if using invite)
- JWT token generated
- Token saved to localStorage
- User data cached

✅ **Test passed if you see the dashboard!**

---

### Test 2: User Login (Extension)

**Steps**:
1. **Click the extension icon** in Chrome toolbar
2. **Fill in login form**:
   - **Email**: `test@example.com`
   - **Password**: `password123`
3. **Click "Sign in"**

**What you should see**:
1. Button changes to "Signing in..." with spinner
2. After 1-2 seconds, popup changes to show:
   - Header: "Workflow Recorder" with user name
   - "Not Recording" status
   - "Start Recording" button (blue)
   - "Your Workflows" section (empty)
   - "Logout" button

**Backend logs**:
```
INFO: 127.0.0.1:xxxxx - "POST /api/auth/login HTTP/1.1" 200 OK
```

✅ **Test passed if you see the recording controls!**

---

### Test 3: Record a Workflow

**Steps**:

#### 3.1: Navigate to a Test Website

1. **Open a new tab** in Chrome
2. **Go to**: `https://example.com` (simple test site)

#### 3.2: Start Recording

1. **Click the extension icon**
2. **Click "Start Recording"**
3. **Enter workflow name**: `Test Example.com`
4. **Click "Start"** (or press Enter)

**What you should see**:
1. Popup shows "Recording" status (red)
2. Red pulsing dot indicator
3. "Stop Recording" button
4. Current URL shown

**Backend logs**:
```
INFO: 127.0.0.1:xxxxx - "POST /api/workflows HTTP/1.1" 201 Created
```

#### 3.3: Perform Actions

Now interact with the page to record steps:

1. **Click on "More information..."** link
2. **Wait for page to load**
3. **Click "Example Domain"** heading (if clickable)
4. **Click the back button**

**What's happening behind the scenes**:
- Content script captures each interaction
- Extracts element selectors (ID, CSS, XPath)
- Captures element metadata (tag, text, position)
- Records page context (URL, title, viewport)
- Stores steps in IndexedDB

#### 3.4: Stop Recording

1. **Click the extension icon**
2. **Click "Stop Recording"**

**What you should see**:
1. Button changes to "Stopping..." with spinner
2. After 2-3 seconds, status changes to "Not Recording"
3. Popup shows success or error message
4. "Your Workflows" section updates (may need refresh)

**Backend logs**:
```
INFO: 127.0.0.1:xxxxx - "POST /api/workflows/{id}/steps HTTP/1.1" 201 Created
INFO: 127.0.0.1:xxxxx - "PUT /api/workflows/{id} HTTP/1.1" 200 OK
```

**What happened**:
- Steps retrieved from IndexedDB
- Steps uploaded to backend
- Workflow status updated to "processing"
- IndexedDB cleared for next recording

✅ **Test passed if recording stopped without errors!**

---

### Test 4: View Workflow in Dashboard

**Steps**:
1. **Go back to dashboard**: `http://localhost:3000/dashboard`
2. **Click "Refresh"** button (if workflow not visible)

**What you should see**:

**Workflow List Card**:
- Name: "Test Example.com"
- Status badge: "processing" (blue)
- Steps: X steps (number of interactions you made)
- Runs: 0 runs
- Timestamp: "just now" or "1m ago"

**Click on the workflow**:

**Workflow Detail Page**:
- Header with workflow name
- "Back to workflows" button
- "Delete" button (red, top-right)

**Workflow Information Section**:
- Status: processing
- Starting URL: https://example.com
- Total Steps: X
- Total Uses: 0
- Success Rate: 0%

**Workflow Steps Section**:
- Numbered list of steps (1, 2, 3...)
- Each step shows:
  - Action type (click, navigate, etc.)
  - Element tag (a, h1, button, etc.)
  - Element text (if any)
  - Page URL

**Example step**:
```
Step 1: click
<a> - "More information..."
https://example.com
```

✅ **Test passed if you see your recorded workflow!**

---

### Test 5: Delete Workflow

**Steps**:
1. On workflow detail page, **click "Delete"** button
2. **Confirm** the browser alert

**What you should see**:
1. Redirects back to `/dashboard`
2. Workflow list is empty again
3. "No workflows yet" message appears

**Backend logs**:
```
INFO: 127.0.0.1:xxxxx - "DELETE /api/workflows/{id} HTTP/1.1" 204 No Content
```

✅ **Test passed if workflow is deleted!**

---

### Test 6: Logout and Login (Dashboard)

**Steps**:
1. **Click "Logout"** button in navbar
2. **Verify redirect** to `/login`
3. **Log in again** with same credentials

**What you should see**:
- After logout: Login page appears, no user data in navbar
- After login: Redirects to dashboard, user data appears in navbar

**What's being tested**:
- Token cleared from localStorage
- Protected routes redirect to login
- Auth state management works

✅ **Test passed if logout/login flow works!**

---

## Verification Checklist

After completing all tests, verify:

### Backend (Terminal 1)
- [ ] Server running without errors
- [ ] Logs show API requests (POST /api/auth/signup, etc.)
- [ ] Database file exists: `backend/app.db`

### Dashboard (Terminal 2)
- [ ] Dev server running on port 3000
- [ ] No console errors in browser DevTools
- [ ] Tailwind styles applied correctly

### Extension
- [ ] Loaded in Chrome without errors
- [ ] Popup opens when icon clicked
- [ ] Login works
- [ ] Recording controls appear

### Database Check (Optional)

Inspect the database to see your data:

```bash
cd backend
sqlite3 app.db

# List tables
.tables

# View your user
SELECT * FROM users;

# View your workflow
SELECT * FROM workflows;

# View workflow steps
SELECT * FROM steps;

# Exit
.quit
```

---

## Expected Behavior Summary

### Successful Signup
✅ User created in database
✅ Company created
✅ JWT token generated
✅ Redirect to dashboard
✅ User info shown in navbar

### Successful Recording
✅ Start recording: Status changes to "Recording"
✅ Interactions captured: Clicks, navigation
✅ Stop recording: Steps uploaded to backend
✅ Workflow appears in dashboard
✅ Steps visible in detail view

### Authentication Flow
✅ Login required for protected routes
✅ Token stored in localStorage
✅ Token sent with API requests
✅ Logout clears token
✅ Expired tokens handled gracefully

---

## Troubleshooting

### Issue: Backend won't start

**Error**: `ModuleNotFoundError: No module named 'fastapi'`

**Solution**:
```bash
# Make sure virtual environment is activated
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Reinstall dependencies
pip install -r requirements.txt
```

---

### Issue: Dashboard shows "Failed to load workflows"

**Check**:
1. Backend running on port 8000? → Go to http://localhost:8000/docs
2. Logged in? → Check browser DevTools → Application → Local Storage → `auth_token`
3. CORS errors? → Check backend terminal for error logs

**Solution**: Restart backend server

---

### Issue: Extension popup shows blank screen

**Check**:
1. Extension loaded? → Go to `chrome://extensions/`
2. Build successful? → Check `extension/dist/` folder exists
3. Console errors? → Right-click extension icon → "Inspect popup" → Check Console tab

**Solution**:
```bash
cd extension
npm run build
# Then reload extension in chrome://extensions/
```

---

### Issue: Recording doesn't capture clicks

**Check**:
1. Content script loaded? → Open DevTools on the page → Console → Look for "Content script loaded" or similar
2. Page is HTTP/HTTPS? → Content scripts don't work on chrome:// pages

**Solution**: Try recording on a different website (http://example.com, https://github.com, etc.)

---

### Issue: Extension login shows "Login failed"

**Possible causes**:
1. Wrong credentials
2. Backend not running
3. User doesn't exist yet (signup first)

**Solution**:
1. Check backend logs for error details
2. Try creating account from dashboard first
3. Verify backend is running: http://localhost:8000/docs

---

### Issue: TypeScript errors when building

**Error**: `Cannot find module '@/api/types'`

**Solution**:
```bash
# Make sure dependencies are installed
npm install

# Clear cache and rebuild
rm -rf dist/
npm run build
```

---

## Testing Different Scenarios

### Test Complex Interactions

Try recording on sites with:
- **Forms**: Fill inputs, select dropdowns
- **Dynamic content**: Sites with JavaScript interactions
- **Multiple pages**: Navigate between pages
- **Buttons**: Various button types

**Good test sites**:
- `https://example.com` - Simple, stable
- `https://www.wikipedia.org` - Search, navigation
- `https://github.com` - Forms, buttons, links

### Test Edge Cases

1. **Start recording but don't interact** → Stop immediately
   - Should create workflow with 0 steps

2. **Record very long workflow** (50+ steps)
   - Should handle large payloads

3. **Close browser during recording**
   - Reopen → Extension should detect interrupted recording

4. **Login with wrong password**
   - Should show error message

5. **Try accessing `/dashboard` without login**
   - Should redirect to `/login`

---

## Performance Checks

### Extension
- Popup should open in < 500ms
- Login should complete in < 2s
- Recording should start instantly
- Stop recording should complete in < 5s

### Dashboard
- Page load should be < 1s
- Login should complete in < 2s
- Workflow list should load in < 1s

### Backend
- API responses should be < 200ms
- Database queries should be < 50ms

---

## Next Steps After Testing

Once everything is working:

1. **Explore the API docs**: http://localhost:8000/docs
2. **Try the interactive API**: Test endpoints directly in Swagger UI
3. **Inspect the code**: Look at implementation details
4. **Read the documentation**:
   - `extension/README.md`
   - `dashboard/README.md`
   - `backend/README.md` (if exists)

---

## Clean Up (When Done)

To stop all services:

1. **Backend**: Press `Ctrl+C` in backend terminal
2. **Dashboard**: Press `Ctrl+C` in dashboard terminal
3. **Extension**: Go to `chrome://extensions/` → Toggle off or Remove

To restart later, just repeat the startup steps:
```bash
# Terminal 1
cd backend && source venv/bin/activate && uvicorn app.main:app --reload

# Terminal 2
cd dashboard && npm run dev

# Extension: Just enable it in Chrome
```

---

## Success Criteria

You'll know everything is working when:

✅ You can create an account
✅ You can log into both dashboard and extension
✅ You can record a workflow with multiple steps
✅ The workflow appears in the dashboard
✅ You can view workflow details and steps
✅ You can delete a workflow
✅ You can log out and log back in
✅ No console errors in browser
✅ No errors in backend logs

---

## Getting Help

If you encounter issues not covered here:

1. **Check browser console**: Right-click → Inspect → Console tab
2. **Check backend logs**: Look at the terminal running uvicorn
3. **Check extension logs**: Right-click extension icon → "Inspect popup"
4. **Review the code**: Check the relevant component files
5. **Check documentation**: README files in each directory

---

## Summary

**What You've Tested**:
- ✅ Complete user authentication flow
- ✅ Workflow recording with Chrome extension
- ✅ Step capture and upload
- ✅ Dashboard workflow viewing
- ✅ End-to-end data flow (Extension → Backend → Dashboard)

**What's Working**:
- ✅ Backend API with 15+ endpoints
- ✅ SQLite database with multi-tenant design
- ✅ Chrome extension with content scripts
- ✅ React dashboard with routing
- ✅ JWT authentication
- ✅ Real-time recording capture

**Ready for Sprint 2**:
The foundation is solid and tested. Sprint 2 can build on this with AI labeling, walkthrough mode, and enhanced features.

Happy testing! 🚀
