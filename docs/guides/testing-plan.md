# RBAC Testing Plan

This document outlines the end-to-end testing plan for the Company & User Management System (RBAC) implementation.

## Prerequisites

### Environment Setup
1. Backend running on `http://localhost:8000`
2. Frontend running on `http://localhost:5173`
3. Frontend `.env` file set: `VITE_API_URL=http://localhost:8000`
4. **Restart frontend dev server** after adding `.env` file

### Test Users
| Email | Password | Role | Status |
|-------|----------|------|--------|
| marshallxie16@gmail.com | Test123! | admin | active |
| testmember@dialpad.com | Test123! | editor | active |

To reset test user passwords:
```bash
cd backend && source venv/bin/activate
python3 -c "
from app.db.session import SessionLocal
from app.models.user import User
from app.utils.security import hash_password

db = SessionLocal()
for email in ['marshallxie16@gmail.com', 'testmember@dialpad.com']:
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.password_hash = hash_password('Test123!')
        print(f'Updated password for {email}')
db.commit()
db.close()
"
```

---

## Test Cases

### 1. Authentication Flow

#### 1.1 Admin Login
- [ ] Navigate to `/login`
- [ ] Enter admin credentials (marshallxie16@gmail.com / Test123!)
- [ ] Click "Sign In"
- [ ] **Expected**: Redirects to `/dashboard`
- [ ] **Verify**: Sidebar shows "New Workflow" button (admin can create workflows)
- [ ] **Verify**: User profile shows "Admin" role badge

#### 1.2 Editor Login
- [ ] Logout from admin account
- [ ] Navigate to `/login`
- [ ] Enter editor credentials (testmember@dialpad.com / Test123!)
- [ ] Click "Sign In"
- [ ] **Expected**: Redirects to `/dashboard`
- [ ] **Verify**: Sidebar shows "New Workflow" button (editor can create workflows)
- [ ] **Verify**: User profile shows "Editor" role badge

---

### 2. Team Management (Admin Only)

#### 2.1 View Team Page
- [ ] Login as admin
- [ ] Navigate to `/team`
- [ ] **Expected**: Page loads with team member list
- [ ] **Verify**: All team members displayed with name, email, role, status
- [ ] **Verify**: Admin sees action buttons (Edit Role, Suspend, Remove)

#### 2.2 Change Member Role
- [ ] On Team page, find the editor user (testmember@dialpad.com)
- [ ] Click role dropdown or edit button
- [ ] Change role from "Editor" to "Viewer"
- [ ] **Expected**: Success notification, role updates in list
- [ ] **Verify**: Revert back to "Editor" for further tests

#### 2.3 Suspend User
- [ ] On Team page, find the editor user
- [ ] Click "Suspend" button
- [ ] **Expected**: Confirmation dialog appears
- [ ] Confirm suspension
- [ ] **Expected**: User status changes to "Suspended"
- [ ] **Verify**: Suspended badge appears on user row

#### 2.4 Verify Suspended User Cannot Login
- [ ] Logout from admin
- [ ] Try to login as suspended user (testmember@dialpad.com)
- [ ] **Expected**: Error message "Account suspended" or similar
- [ ] **Verify**: Cannot access dashboard

#### 2.5 Reactivate User
- [ ] Login as admin
- [ ] Navigate to `/team`
- [ ] Find suspended user
- [ ] Click "Reactivate" button
- [ ] **Expected**: User status changes to "Active"
- [ ] **Verify**: User can now login again

#### 2.6 Remove Team Member
- [ ] Create a test user first (or use invite flow)
- [ ] On Team page, find the test user
- [ ] Click "Remove" button
- [ ] **Expected**: Confirmation dialog
- [ ] Confirm removal
- [ ] **Expected**: User removed from list

---

### 3. Invite System

#### 3.1 View Pending Invites (Admin)
- [ ] Login as admin
- [ ] Navigate to `/team`
- [ ] **Expected**: "Pending Invites" section visible (if invites exist)

#### 3.2 Send Email Invite
- [ ] On Team page, find "Invite Member" button
- [ ] Click to open invite modal
- [ ] Enter email: `test-invite@example.com`
- [ ] Select role: "Viewer"
- [ ] Click "Send Invite"
- [ ] **Expected**: Success message, invite appears in pending list
- [ ] **Verify**: Check backend logs for email (in mock mode, logs the invite URL)

#### 3.3 Revoke Invite
- [ ] Find the pending invite in the list
- [ ] Click "Revoke" or delete button
- [ ] **Expected**: Invite removed from pending list

#### 3.4 Signup with Invite Token
- [ ] Create a new invite (note the token from backend logs if mock mode)
- [ ] Navigate to `/signup?invite=<token>`
- [ ] Fill in signup form (name, password)
- [ ] **Expected**: Account created with invited role
- [ ] **Verify**: Invite marked as "accepted" in database

---

### 4. Permission Guards (UI Visibility)

#### 4.1 Admin Permissions
Login as admin and verify:
- [ ] Sidebar: "New Workflow" button visible
- [ ] Team page: All management actions visible
- [ ] Settings: Company settings editable
- [ ] Workflows: Can create, edit, delete workflows

#### 4.2 Editor Permissions
Login as editor and verify:
- [ ] Sidebar: "New Workflow" button visible
- [ ] Team page: Can view members, but NO management actions
- [ ] Team page: No "Invite Member" button
- [ ] Team page: No role/status change dropdowns
- [ ] Workflows: Can create, edit, delete workflows

#### 4.3 Viewer Permissions (if viewer user exists)
Login as viewer and verify:
- [ ] Sidebar: "New Workflow" button NOT visible
- [ ] Team page: Can view members only
- [ ] Workflows: Can view and run, but NOT create/edit/delete

---

### 5. Last Admin Protection

#### 5.1 Cannot Demote Last Admin
- [ ] Login as the only admin
- [ ] Navigate to `/team`
- [ ] Try to change own role to "Editor"
- [ ] **Expected**: Error message "Cannot demote the last admin"

#### 5.2 Cannot Suspend Last Admin
- [ ] Try to suspend own account
- [ ] **Expected**: Error message "Cannot suspend the last admin"

---

### 6. Workflow RBAC

#### 6.1 Viewer Cannot Create Workflow
- [ ] Login as viewer (or change editor to viewer temporarily)
- [ ] Try to access workflow creation
- [ ] **Expected**: Button hidden or 403 error if API called directly

#### 6.2 Viewer Cannot Edit Workflow
- [ ] Navigate to a workflow detail page
- [ ] **Expected**: Edit button hidden
- [ ] If accessed via URL, API returns 403

#### 6.3 Viewer Can Run Workflow
- [ ] Navigate to workflow detail
- [ ] Click "Run" or "Start Walkthrough"
- [ ] **Expected**: Walkthrough starts successfully

---

## API Testing (Optional - Backend Verification)

These can be run via curl or Postman to verify backend independently:

```bash
# Login as admin
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"marshallxie16@gmail.com","password":"Test123!"}' \
  | jq -r '.access_token')

# Get team members
curl -s http://localhost:8000/api/companies/me/members \
  -H "Authorization: Bearer $TOKEN" | jq

# Update member role (replace USER_ID)
curl -s -X PATCH http://localhost:8000/api/companies/me/members/2/role \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"viewer"}' | jq

# Suspend user (replace USER_ID)
curl -s -X PATCH http://localhost:8000/api/companies/me/members/2/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"suspended"}' | jq

# Create invite
curl -s -X POST http://localhost:8000/api/invites/me/invites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"viewer"}' | jq

# List invites
curl -s http://localhost:8000/api/invites/me/invites \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Test Results

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 Admin Login | | |
| 1.2 Editor Login | | |
| 2.1 View Team Page | | |
| 2.2 Change Member Role | | |
| 2.3 Suspend User | | |
| 2.4 Suspended Login Blocked | | |
| 2.5 Reactivate User | | |
| 2.6 Remove Member | | |
| 3.1 View Pending Invites | | |
| 3.2 Send Email Invite | | |
| 3.3 Revoke Invite | | |
| 3.4 Signup with Invite | | |
| 4.1 Admin Permissions | | |
| 4.2 Editor Permissions | | |
| 4.3 Viewer Permissions | | |
| 5.1 Cannot Demote Last Admin | | |
| 5.2 Cannot Suspend Last Admin | | |
| 6.1 Viewer Cannot Create | | |
| 6.2 Viewer Cannot Edit | | |
| 6.3 Viewer Can Run | | |

---

## Known Issues / Notes

1. **Frontend port configuration**: Ensure `.env` file exists in `dashboard/` with `VITE_API_URL=http://localhost:8000` and restart the dev server after creating it.

2. **Email mock mode**: By default, emails are not sent. Check backend logs for invite URLs when testing invite flow.

3. **Test data reset**: If tests modify user roles/status, remember to restore original state for subsequent test runs.
