# User Stories - Workflow Automation Platform

## Story Template

Each story follows this format:

```
As a [user type]
I want to [action]
So that [benefit]

Acceptance Criteria:
- [ ] Specific testable requirement
- [ ] Another requirement
- [ ] Edge case handled
```

---

## Epic 1: Authentication & Onboarding

### Story 1.1: Company Signup

**As a** new admin user  
**I want to** sign up and create a company account  
**So that** I can start creating workflows for my team  

**Acceptance Criteria:**
- [x] Can access signup page at `/signup`
- [x] Form requires: email, password, name, company name
- [x] Email validation (format check)
- [x] Password requirements shown (8+ chars, 1 number)
- [x] On submit, creates company and user record in database
- [x] Returns JWT token and redirects to dashboard
- [x] Invite token generated for company
- [x] Error message shown if email already exists
- [x] Form has loading state during submission

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

---

### Story 1.2: Team Member Invite

**As an** admin user
**I want to** invite team members to my company
**So that** they can use workflows I create

**Acceptance Criteria:**
- [x] Can access Settings → Company page (TeamView exists at /team)
- [x] Invite link displayed with "Copy" button (UI exists, uses mock token)
- [x] Clicking copy shows success toast notification
- [x] Invite link format: `https://app.com/invite/{invite_token}` (InvitePage implemented)
- [x] Pasting link in new browser shows signup form (E2E tested - working)
- [x] New user auto-assigned to correct company (backend supports this)
- [x] New user defaults to "Regular" role (backend supports this)
- [ ] Company admin can see list of all team members (TeamView uses mock data)

**Priority:** P0 (Must-have for MVP)
**Status:** ⏳ MOSTLY COMPLETE - Flow works E2E, TeamView needs real API integration

---

### Story 1.3: Extension Installation

**As a** user
**I want to** install the Chrome extension
**So that** I can record and use workflows

**Acceptance Criteria:**
- [x] After signup, modal prompts to install extension
- [ ] "Install Extension" button opens Chrome Web Store (placeholder for MVP - extension not published yet)
- [x] Can skip installation ("I'll do this later")
- [x] Extension appears in Chrome toolbar when installed
- [x] Clicking extension icon shows login prompt (if not logged in)
- [x] After login, extension shows "Ready to record" state
- [x] User can access extension from any web page

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ MOSTLY COMPLETE - Install modal works, Chrome Web Store link placeholder (extension not published)

---

## Epic 2: Workflow Recording

### Story 2.1: Start Recording

**As an** admin user  
**I want to** start recording a workflow  
**So that** I can capture the steps I perform  

**Acceptance Criteria:**
- [x] Dashboard has prominent "Create Workflow" button
- [x] Clicking opens modal with form fields:
  - Workflow name (required)
  - Description (optional)
  - Starting URL (pre-filled with current tab, editable)
- [x] "Start Recording" button is disabled if name is empty
- [x] Clicking "Start Recording" activates extension
- [x] Extension shows floating recording widget
- [x] Widget displays: "🔴 Recording... 0 steps"
- [x] Widget has "Stop" and "Pause" buttons
- [x] User can continue browsing/working normally

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

---

### Story 2.2: Capture User Actions

**As an** admin user  
**I want to** have my clicks and inputs automatically captured  
**So that** I don't have to manually document each step  

**Acceptance Criteria:**
- [x] Extension captures clicks on buttons, links, inputs
- [x] Extension captures text input on blur (not per keystroke)
- [x] Extension captures dropdown selections
- [x] Extension captures form submissions
- [x] Extension captures page navigation
- [x] Step counter increments for each captured action
- [x] Brief visual feedback on captured element (flash)
- [x] Noise filtered out (e.g., clicks on non-interactive elements)
- [x] Screenshots captured for each step (debounced 300ms)
- [x] Steps buffered locally in extension storage

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

**Technical Note:** Implemented "meaningful interaction" filter with EventDeduplicator (100ms buffering, priority-based selection).

---

### Story 2.3: Stop Recording & Async Upload

**As an** admin user  
**I want to** stop recording and continue working immediately  
**So that** the workflow is saved without blocking me  

**Acceptance Criteria:**
- [x] Clicking "Stop Recording" ends capture immediately
- [x] User can navigate away from the page right away
- [x] Extension shows brief "Upload started" toast notification
- [x] Upload happens asynchronously in the background:
  - Screenshots uploaded to S3 in batches
  - Workflow data sent to backend API
  - Backend queues AI labeling job
- [x] Dashboard shows workflow in "Processing" state
- [x] Processing indicator: "⏳ Processing... AI is generating labels"
- [x] User can create new workflows while previous one processes
- [x] When processing completes, workflow status updates to "Draft"
- [ ] Notification shown: "Workflow 'X' is ready for review"
- [ ] On upload error, workflow marked as "Upload Failed" with retry button
- [x] Local storage cleared only after successful upload
- [x] If upload fails, can retry without re-recording

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ MOSTLY COMPLETE - Missing error UI and completion notification

**Technical Note:** Implemented with Celery + Redis background jobs and exponential backoff retry.

---

## Epic 3: AI-Powered Review & Editing

### Story 3.1: View AI-Generated Labels

**As an** admin user  
**I want to** see AI-generated labels for each step  
**So that** I can quickly understand what was captured  

**Acceptance Criteria:**
- [x] Review page shows grid of all steps
- [x] Each step card displays:
  - Step number
  - Screenshot thumbnail (200x150px)
  - AI-generated field label
  - AI-generated instruction
  - Confidence indicator (✓ high, ⚠️ medium, ❌ low)
  - Action type and value entered
- [x] Steps display in order (1, 2, 3...)
- [x] Page has loading state while AI processes
- [x] Polling or WebSocket updates when AI completes
- [x] If AI fails for a step, shows template-based label
- [x] Low-confidence steps highlighted for review

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

**Backlog Items:**
- Screenshot with annotation dots directly overlayed (showing where interaction occurred)
- Clicking on annotation dot highlights and scrolls to that step card

---

### Story 3.2: Edit Step Labels

**As an** admin user  
**I want to** edit AI-generated labels  
**So that** I can correct mistakes or add context  

**Acceptance Criteria:**
- [x] Each step has an "Edit" button
- [x] Clicking opens modal with:
  - Full-size screenshot
  - Editable field label (text input, 100 char max)
  - Editable instruction (textarea, 500 char max)
  - Technical details (read-only, for debugging)
- [x] Can save changes or cancel
- [x] Edited steps marked visually (e.g., "Edited by you")
- [x] Changes saved to database immediately
- [x] Can edit same step multiple times
- [x] Validation: Label and instruction can't be empty

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

**Backlog Items:**
- Click on annotation dot on screenshot to open edit modal for that specific interaction
- Multiple annotations per step (for steps with multiple interactions)

---

### Story 3.3: Delete Unwanted Steps

**As an** admin user  
**I want to** delete steps I accidentally recorded  
**So that** the workflow only shows relevant actions  

**Acceptance Criteria:**
- [x] Each step has a "Delete" button
- [ ] Clicking shows confirmation modal
- [ ] Confirmation message: "Delete step X? Remaining steps will be renumbered."
- [x] On confirm, step deleted from database
- [x] Remaining steps renumbered (3, 4, 5 → 2, 3, 4)
- [x] UI updates immediately (no page reload)
- [ ] Cannot delete if only 1 step remains

**Priority:** P1 (Should-have for MVP)
**Status:** ✅ MOSTLY COMPLETE - Missing confirmation modal and last-step guard

**Backlog Items:**
- Undo deletion (keep deleted step in memory for current session)
- Batch delete (select multiple steps and delete at once)

---

### Story 3.4: Save Workflow

**As an** admin user  
**I want to** save the reviewed workflow  
**So that** my team can start using it  

**Acceptance Criteria:**
- [x] Review page has "Save Workflow" button
- [x] Button disabled if any step has empty label/instruction
- [x] Clicking changes workflow status from "draft" to "active"
- [x] Success notification shown
- [x] Redirects to dashboard after save
- [x] Workflow now visible to all team members
- [x] Can edit workflow again later (goes back to review page)

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

---

## Epic 4: Walkthrough Mode

### Story 4.1: Discover Workflows

**As a** regular user  
**I want to** browse available workflows  
**So that** I can find the one I need  

**Acceptance Criteria:**
- [x] Dashboard shows workflow library
- [x] Workflows displayed as cards with:
  - Name and description
  - Creator name and avatar
  - Last updated date
  - Step count
  - Health status (✓ Healthy, ⚠️ Needs Review, ❌ Broken)
- [x] Clicking card opens detail view
- [x] Empty state shown if no workflows exist

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

**Backlog Items:**
- Search workflows by name or description (full-text search)
- Filter by: status (healthy/broken), creator, tags, date range
- Tags system: Add tags to workflows, filter by tags
- Sort by: name, date created, date updated, most used

---

### Story 4.2: Start Walkthrough

**As a** regular user  
**I want to** launch a workflow walkthrough  
**So that** I can be guided through the process  

**Acceptance Criteria:**
- [x] Workflow detail page has "Start Walkthrough" button
- [x] Clicking opens starting URL in current tab
- [x] Extension activates automatically
- [x] Shows overlay UI with:
  - Progress indicator (Step 1 of 5)
  - Current instruction
  - "Next" button
  - "Exit" button
- [x] Spotlight highlights the target element
- [x] Rest of page darkened with backdrop
- [x] Tooltip positioned near target element

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

---

### Story 4.3: Complete Walkthrough Steps

**As a** regular user  
**I want to** be guided step-by-step through the workflow  
**So that** I can complete it without errors  

**Acceptance Criteria:**
- [x] Each step shows:
  - Instruction text (e.g., "Enter invoice number")
  - Field label (e.g., "Invoice Number")
  - Expected action type
- [x] Spotlight moves to next element automatically
- [x] User performs action (click, type, select)
- [x] On correct action, advances to next step
- [x] Progress bar updates
- [x] Can go back to previous step
- [x] Can exit walkthrough anytime (confirmation modal)
- [x] Final step shows "✓ Workflow Complete!" message
- [x] Success logged to backend

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE

**Backlog Items (UX Improvements):**
- Auto-scroll to target element if offscreen
- Smart tooltip repositioning (avoid covering target or going offscreen)
- Keyboard shortcuts (N for next, B for back, Esc to exit)
- Confetti animation on completion
- "Need help?" button that shows screenshot from recording

---

### Story 4.4: Validation & Error Feedback

**As a** regular user  
**I want to** know if I made a mistake  
**So that** I can correct it before proceeding  

**Acceptance Criteria:**
- [x] If user clicks wrong element, show error:
  - "That's not quite right. Please click on: [Field Label]"
  - Spotlight stays on correct element
  - Can retry immediately
- [ ] If user enters wrong format (e.g., date), show warning:
  - "This field expects: MM/DD/YYYY"
  - Can correct without losing progress
- [x] If user tries to skip required field:
  - "Please complete this step before continuing"
  - "Next" button disabled until action taken
- [ ] Maximum 3 retries per step before offering:
  - "Skip this step" (marks step as incomplete)
  - "Report issue" (sends error to admin)

**Priority:** P0 (Must-have for MVP)
**Status:** ⏳ PARTIAL - Basic validation works, format validation and retry limits not implemented

---

## Epic 5: Auto-Healing & Health Monitoring

### Story 5.1: Auto-Heal Element Detection

**As a** regular user  
**I want to** workflows to work even if the UI changed  
**So that** I'm not blocked by outdated workflows  

**Acceptance Criteria:**
- [x] When element not found by primary selectors:
  - Try all backup selectors (CSS, XPath, data-testid)
  - If still not found, initiate auto-healing
- [x] Auto-healing algorithm:
  - Scan DOM for elements matching tag/role
  - Score candidates by: role (30), text (30), position (20), attributes (20)
  - Filter: score >30, same tag/role, limit to top 10
  - If multiple candidates with score >70: Use AI to pick best match
  - AI receives: original screenshot, current screenshot, candidate metadata
  - AI returns: best match ID + confidence score (0-1)
  - Combine scores: 50% deterministic + 50% AI = final score
- [x] Based on final score:
  - ≥0.80: Accept, update selectors, continue seamlessly
  - 0.60-0.80: Use for current session, flag as "Needs Review"
  - <0.60: Mark as broken, show error to user, alert admin
- [x] Healing event logged to health_logs
- [x] User sees seamless experience (no interruption) for successful healing

**Priority:** P0 (Must-have for MVP)
**Status:** ✅ COMPLETE (Sprint 4)

**Implementation Note:** Implemented with modular scoring system in `extension/src/content/healing/`:
- 5 scoring factors with veto power
- AI validation via POST /api/healing/validate
- 44 tests for false positive prevention

---

### Story 5.2: Alert Admin When Workflow Breaks

**As an** admin user  
**I want to** be notified when a workflow breaks  
**So that** I can fix it before more users are affected  

**Acceptance Criteria:**
- [x] When workflow fails auto-healing 3 times, admin alert triggered (via consecutive_failures in DB)
- [ ] **MVP: In-app notification:**
  - Red badge on dashboard bell icon
  - Notification panel shows:
    - Message: "Workflow 'X' failed for 3 users"
    - Timestamp
    - Link to workflow health page
  - Notification marked as read when clicked
  - Notification persists until admin dismisses it
- [x] Workflow status automatically changed to "Broken" (via health service with min sample guard)
- [x] Broken workflows highlighted in dashboard (red border + warning icon)
- [x] Health logs record failure details for debugging

**Priority:** P0 (Must-have for MVP)
**Status:** ⏳ PARTIAL - Backend logging and status works, notification UI not implemented

**Backlog Items:**
- Email notification to admin:
  - Subject: "Action Required: Workflow 'X' is broken"
  - Details: Step number, error type, last successful run
  - Link to repair workflow
- Slack/Teams integration for real-time alerts
- Configurable alert thresholds (e.g., fail after 5 times instead of 3)
- Weekly health summary emails

---

### Story 5.3: View Workflow Health (BACKLOG)

**As an** admin user  
**I want to** see health metrics for my workflows  
**So that** I can proactively fix issues  

**Acceptance Criteria:**
- [ ] Each workflow has a "View Health" link
- [ ] Health page shows:
  - Overall success rate (last 7 days, last 30 days)
  - Total runs count
  - Recent logs (last 10 executions):
    - Date/time
    - User who ran it
    - Status (success, healed, failed)
    - Execution time
- [ ] Broken steps highlighted:
  - Step number and label
  - Failure count
  - Last failure timestamp
- [ ] Screenshot comparison (if applicable):
  - "When you recorded" vs "Current page state"
  - Differences highlighted
- [ ] "Fix Workflow" button for broken workflows

**Priority:** Backlog (Post-MVP)

**Rationale:** Basic health status (healthy/broken) is shown on dashboard. Detailed health analytics are valuable but not essential for MVP validation.

---

### Story 5.4: Repair Broken Workflow (BACKLOG)

**As an** admin user  
**I want to** quickly fix broken workflows  
**So that** my team can use them again  

**Acceptance Criteria:**
- [ ] "Fix Workflow" button launches repair mode
- [ ] Extension opens starting URL
- [ ] Shows all steps in sidebar
- [ ] Broken step highlighted in red
- [ ] Overlay instruction: "Step 3 was broken. Click on the new location of: [Field Label]"
- [ ] Admin clicks new element
- [ ] System captures new selectors and metadata
- [ ] Confirmation: "✓ Step 3 repaired"
- [ ] Can test remaining steps (optional)
- [ ] "Save Repairs" updates workflow in database
- [ ] Workflow status changes to "Healthy"
- [ ] Notification sent: "Workflow 'X' repaired and ready to use"
- [ ] Health logs updated

**Priority:** Backlog (Post-MVP)

**Rationale:** Admin can re-record broken workflow as workaround. Dedicated repair UI is nice-to-have but not essential for MVP.

---

## Epic 6: Settings & Account Management

### Story 6.1: View Company Settings

**As an** admin user  
**I want to** manage company settings  
**So that** I can configure preferences and view team members  

**Acceptance Criteria:**
- [ ] Settings accessible from navbar → avatar dropdown → "Settings"
- [ ] Settings page has tabs: Profile, Company, Preferences
- [ ] Company tab shows:
  - Company name (editable)
  - Invite link with copy button
  - List of team members (name, email, role)
  - Option to remove team members (admin only)
- [ ] Can update company name (saves on blur or Enter)
- [ ] Removing team member shows confirmation
- [ ] Only admins can access Company settings
- [ ] Regular users see "Contact admin to manage company"

**Priority:** P1 (Should-have for MVP)

---

### Story 6.2: Update Profile

**As a** user  
**I want to** update my profile information  
**So that** my name and details are correct  

**Acceptance Criteria:**
- [ ] Profile tab shows:
  - Name (editable)
  - Email (read-only, or editable with confirmation)
  - Avatar upload (optional, can be placeholder)
  - Change password button
- [ ] Can update name (saves immediately)
- [ ] Change password shows modal with:
  - Current password (required)
  - New password (required, 8+ chars)
  - Confirm new password
- [ ] Password update requires correct current password
- [ ] Success message on password change
- [ ] Logged out after password change (security)

**Priority:** P2 (Nice-to-have for MVP)

---

## Epic 7: Error Handling & Edge Cases

### Story 7.1: Handle Extension Errors Gracefully

**As a** user  
**I want to** see helpful error messages when something goes wrong  
**So that** I know what to do next  

**Acceptance Criteria:**
- [ ] If extension crashes during recording:
  - Show error modal: "Recording stopped unexpectedly"
  - Offer to restart or save partial recording
  - Partial steps saved to local storage
- [ ] If API call fails during upload:
  - Show error: "Upload failed. Check your connection."
  - Retry button available
  - Steps not lost (kept in local storage)
- [ ] If walkthrough element not found (after auto-healing fails):
  - Show error: "This workflow appears to be broken"
  - Offer to report issue or exit
  - Admin notified automatically
- [ ] Network issues shown clearly:
  - "No internet connection"
  - Auto-retry when connection restored

**Priority:** P1 (Should-have for MVP)

---

### Story 7.2: Handle Dynamic Content

**As a** user following a walkthrough  
**I want to** have the system wait for elements to load  
**So that** I can complete workflows with AJAX/dynamic content  

**Acceptance Criteria:**
- [ ] System waits up to 5 seconds for element to appear
- [ ] Shows "Waiting for element to load..." message if delayed
- [ ] If element appears, continues normally
- [ ] If timeout (5s), treats as element not found
- [ ] Works with SPAs (React, Vue, Angular apps)
- [ ] Detects when element is behind modal/overlay
- [ ] Instructs user: "Close any open modals to continue"

**Priority:** P1 (Should-have for MVP)

---

## Story Prioritization Summary

### P0 (Must-Have for MVP) - 13 stories
1. All authentication & onboarding (3 stories)
2. Core recording flow (3 stories) - includes async upload
3. AI review and editing (2 stories) - view labels, edit labels
4. Walkthrough mode (4 stories) - discover, start, complete, validation
5. Auto-healing and alerts (2 stories) - auto-heal, in-app notifications

### P1 (Should-Have for MVP) - 4 stories
1. Delete unwanted steps (3.3)
2. Company settings (6.1)
3. Extension error handling (7.1)
4. Dynamic content handling (7.2)

### P2 (Nice-to-Have for MVP) - 1 story
1. Profile updates (6.2) - partial implementation OK

### Backlog (Post-MVP) - 2 stories + feature enhancements
1. View workflow health (5.3)
2. Repair broken workflow (5.4)
3. **Feature enhancements noted in stories:**
   - Screenshot annotation dots (3.1)
   - Click annotation to edit (3.2)
   - Undo deletion (3.3)
   - Search/filter/tags system (4.1)
   - UX improvements for walkthrough (4.3)
   - Email notifications (5.2)

**Total MVP Stories: 18 (13 P0 + 4 P1 + 1 P2)**

---

## Acceptance Testing Checklist

Before marking a story as "Done", verify:

- [ ] **Functionality:** Feature works as described in all acceptance criteria
- [ ] **Edge Cases:** Tested error scenarios and edge cases
- [ ] **UI/UX:** Visual design matches design system
- [ ] **Performance:** <2s for user-facing operations, async operations don't block UI
- [ ] **Accessibility:** Keyboard navigation works, basic screen reader support
- [ ] **Cross-Browser:** Tested in Chrome (primary) - other browsers post-MVP
- [ ] **Security:** No XSS, CSRF, or injection vulnerabilities
- [ ] **Data Validation:** All inputs validated on client and server
- [ ] **Error Handling:** Graceful degradation, helpful error messages
- [ ] **Multi-tenancy:** Data properly isolated by company_id

---

## Demo Script (For Testing)

**Goal:** Complete a full user journey to validate all core P0 stories.

**Setup:** Clean database, fresh browser, extension installed.

**Script:**

**Part 1: Admin Flow**
1. Sign up as admin ("sarah@testcompany.com")
2. Install extension (skip if already installed)
3. Click "Create Workflow"
4. Enter: "Submit Expense Report", description, starting URL
5. Start recording
6. Perform 5-step workflow on demo app
7. Stop recording (verify can navigate away immediately)
8. Check dashboard - workflow shows "Processing" status
9. Wait for processing to complete (~30 seconds)
10. Review AI labels (edit 1 label to test editing)
11. Delete 1 step (test deletion and renumbering)
12. Save workflow (verify status changes to "Active")

**Part 2: Regular User Flow**
13. Copy invite link from Settings
14. Open in incognito browser
15. Sign up as regular user ("alex@testcompany.com")
16. See workflow in library
17. Click "Start Walkthrough"
18. Complete walkthrough successfully (all 4 remaining steps)
19. Verify completion message and success logging

**Part 3: Auto-Healing & Health**
20. (As admin) Make minor UI change on test app
21. (As regular user) Run walkthrough again
22. Verify auto-healing works seamlessly
23. (As admin) Check dashboard - workflow still shows "Healthy"
24. Make breaking UI change (remove/rename critical element)
25. (As regular user) Run walkthrough 3 times - should fail each time
26. (As admin) Verify notification appears on dashboard
27. Verify workflow status changed to "Broken"

**Success Criteria:** 
- All steps complete without critical errors
- User experience smooth and intuitive
- Auto-healing works in >70% of minor UI changes
- Alerts trigger correctly for broken workflows

---

**End of User Stories**
