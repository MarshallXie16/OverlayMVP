# Sprint 5: Team & Settings

**Duration**: 3-4 weeks
**Focus**: Complete team management and profile settings functionality
**Prerequisites**: Sprint 4 (UX Polish) completed

---

## Sprint Goal

Make the Settings page fully functional. Currently, TeamView uses mock data and there's no profile editing. This sprint wires team management to real backend data and adds profile editing capabilities.

---

## Tickets (5 items)

### 1. FEAT-013: Complete Settings Page - Team Management

**Priority**: P1 (High)
**Component**: Dashboard
**Estimated Effort**: 3-4 days

#### Current State

TeamView page exists at `/team` but:
- Shows invite link with copy button (works)
- Team member list uses MOCK DATA from `@/data/mockData`
- Remove member functionality not wired to backend
- Backend APIs already exist

#### Backend APIs Available

```
GET /api/companies/me/members - List team members
DELETE /api/companies/me/members/{user_id} - Remove member (admin only)
```

#### Implementation

**Step 1: Add API Client Methods**

File: `dashboard/src/api/client.ts`

```typescript
export const teamApi = {
  getMembers: () => apiClient.get('/api/companies/me/members'),

  removeMember: (userId: string) =>
    apiClient.delete(`/api/companies/me/members/${userId}`),

  updateMemberRole: (userId: string, role: 'admin' | 'member') =>
    apiClient.patch(`/api/companies/me/members/${userId}/role`, { role }),
};
```

**Step 2: Create Team Member Types**

File: `dashboard/src/types/team.ts`

```typescript
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  joined_at: string;
  avatar_url?: string;
}
```

**Step 3: Update TeamView Component**

File: `dashboard/src/pages/TeamView.tsx`

```typescript
import { useState, useEffect } from 'react';
import { teamApi } from '@/api/client';
import { showToast } from '@/utils/toast';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Copy, UserMinus, Shield, User } from 'lucide-react';
import type { TeamMember } from '@/types/team';

export function TeamView() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const currentUser = useAuthStore(state => state.user);
  const inviteLink = `${window.location.origin}/join/${currentUser?.company?.invite_code}`;

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    try {
      setLoading(true);
      const res = await teamApi.getMembers();
      setMembers(res.data.members);
    } catch (err) {
      setError('Failed to load team members');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast.success('Invite link copied to clipboard');
    } catch {
      showToast.error('Failed to copy link');
    }
  }

  async function handleRemoveMember() {
    if (!removingMember) return;

    setIsRemoving(true);
    try {
      await teamApi.removeMember(removingMember.id);
      setMembers(prev => prev.filter(m => m.id !== removingMember.id));
      showToast.success(`${removingMember.name} has been removed from the team`);
      setRemovingMember(null);
    } catch (err: any) {
      showToast.error(err.response?.data?.message || 'Failed to remove team member');
    } finally {
      setIsRemoving(false);
    }
  }

  if (loading) return <TeamViewSkeleton />;
  if (error) return <ErrorState message={error} onRetry={fetchMembers} />;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Team Settings</h1>

      {/* Invite Section */}
      <section className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Invite Team Members</h2>
        <p className="text-sm text-gray-600 mb-3">
          Share this link to invite people to your team
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={inviteLink}
            readOnly
            className="flex-1 px-3 py-2 border rounded-lg bg-white text-sm"
          />
          <button
            onClick={copyInviteLink}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
        </div>
      </section>

      {/* Team Members List */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          Team Members ({members.length})
        </h2>

        {members.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No team members yet. Share the invite link above to add members.
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(member => (
              <TeamMemberRow
                key={member.id}
                member={member}
                isCurrentUser={member.id === currentUser?.id}
                canRemove={currentUser?.role === 'admin' && member.id !== currentUser?.id}
                onRemove={() => setRemovingMember(member)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Remove Confirmation Modal */}
      <ConfirmModal
        isOpen={!!removingMember}
        title="Remove Team Member"
        message={`Are you sure you want to remove ${removingMember?.name} from the team? They will lose access to all workflows.`}
        confirmLabel="Remove Member"
        confirmVariant="danger"
        onConfirm={handleRemoveMember}
        onCancel={() => setRemovingMember(null)}
        loading={isRemoving}
      />
    </div>
  );
}

function TeamMemberRow({
  member,
  isCurrentUser,
  canRemove,
  onRemove,
}: {
  member: TeamMember;
  isCurrentUser: boolean;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-white border rounded-lg">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
          {member.avatar_url ? (
            <img src={member.avatar_url} alt="" className="w-full h-full rounded-full" />
          ) : (
            <span className="text-gray-600 font-medium">
              {member.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{member.name}</span>
            {isCurrentUser && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                You
              </span>
            )}
          </div>
          <div className="text-sm text-gray-500">{member.email}</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 text-sm">
          {member.role === 'admin' ? (
            <>
              <Shield className="w-4 h-4 text-purple-600" />
              <span className="text-purple-600">Admin</span>
            </>
          ) : (
            <>
              <User className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Member</span>
            </>
          )}
        </div>

        <div className="text-sm text-gray-400">
          Joined {new Date(member.joined_at).toLocaleDateString()}
        </div>

        {canRemove && (
          <button
            onClick={onRemove}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            aria-label={`Remove ${member.name} from team`}
          >
            <UserMinus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function TeamViewSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
      <div className="h-32 bg-gray-100 rounded-lg mb-8" />
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
```

#### Files to Modify
- `dashboard/src/api/client.ts` - Add team API methods
- `dashboard/src/types/team.ts` - Create (new file)
- `dashboard/src/pages/TeamView.tsx` - Replace mock data with API calls

#### Acceptance Criteria
- [ ] Team member list shows real data from API
- [ ] Each member shows: name, email, role, join date
- [ ] Current user shows "You" badge
- [ ] Admin sees "Remove" button (not on self)
- [ ] Confirmation modal before removal
- [ ] Success/error toasts (not alerts)
- [ ] Loading skeleton during fetch
- [ ] Empty state if no team members
- [ ] Mock data imports removed

---

### 2. FEAT-014: Profile Settings Page

**Priority**: P1 (High)
**Component**: Dashboard + Backend
**Estimated Effort**: 3-4 days

#### Current State

- No profile editing page exists
- User name set at signup, never changeable
- Password change not implemented

#### Implementation

**Step 1: Create Backend Endpoints**

File: `backend/app/api/users.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/users", tags=["users"])

class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)
    confirm_password: str

@router.get("/me")
async def get_profile(
    current_user: User = Depends(get_current_user)
):
    """Get current user's profile."""
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "company": {
            "id": str(current_user.company_id),
            "name": current_user.company.name,
        } if current_user.company else None,
        "created_at": current_user.created_at.isoformat(),
    }

@router.patch("/me")
async def update_profile(
    data: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update current user's profile."""
    current_user.name = data.name
    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "user": {
            "id": str(current_user.id),
            "name": current_user.name,
            "email": current_user.email,
        }
    }

@router.post("/me/change-password")
async def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Change current user's password."""
    # Verify current password
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_PASSWORD",
                "message": "Current password is incorrect"
            }
        )

    # Verify new passwords match
    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PASSWORD_MISMATCH",
                "message": "New passwords do not match"
            }
        )

    # Verify new password is different
    if data.current_password == data.new_password:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "SAME_PASSWORD",
                "message": "New password must be different from current password"
            }
        )

    # Update password
    current_user.hashed_password = hash_password(data.new_password)
    db.commit()

    return {"success": True, "message": "Password changed successfully"}
```

**Step 2: Create Profile Settings Page**

File: `dashboard/src/pages/ProfileSettings.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { showToast } from '@/utils/toast';
import { useAuthStore } from '@/store/authStore';
import { User, Lock, LogOut } from 'lucide-react';

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  company: { id: string; name: string } | null;
  created_at: string;
}

export function ProfileSettings() {
  const navigate = useNavigate();
  const logout = useAuthStore(state => state.logout);

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form state
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Password form state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const res = await apiClient.get('/api/users/me');
      setProfile(res.data);
      setName(res.data.name);
    } catch (err) {
      showToast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === profile?.name) return;

    setSavingName(true);
    try {
      await apiClient.patch('/api/users/me', { name: name.trim() });
      setProfile(prev => prev ? { ...prev, name: name.trim() } : null);
      showToast.success('Profile updated');
    } catch (err) {
      showToast.error('Failed to update profile');
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();

    // Client-side validation
    if (newPassword.length < 8) {
      showToast.error('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast.error('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await apiClient.post('/api/users/me/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      showToast.success('Password changed. Please log in again.');

      // Logout after password change
      logout();
      navigate('/login');
    } catch (err: any) {
      const message = err.response?.data?.detail?.message || 'Failed to change password';
      showToast.error(message);
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) return <ProfileSkeleton />;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>

      {/* Profile Info Section */}
      <section className="mb-8 p-6 bg-white border rounded-lg">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <User className="w-5 h-5" />
          Profile Information
        </h2>

        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Email cannot be changed
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              minLength={1}
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <input
              type="text"
              value={profile?.role === 'admin' ? 'Administrator' : 'Team Member'}
              disabled
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company
            </label>
            <input
              type="text"
              value={profile?.company?.name || 'No company'}
              disabled
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={savingName || !name.trim() || name === profile?.name}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingName ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </section>

      {/* Password Section */}
      <section className="mb-8 p-6 bg-white border rounded-lg">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Password
        </h2>

        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Change Password
          </button>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
                minLength={8}
              />
              <p className="text-xs text-gray-500 mt-1">
                Must be at least 8 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingPassword}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPassword ? 'Changing...' : 'Change Password'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Danger Zone */}
      <section className="p-6 bg-white border border-red-200 rounded-lg">
        <h2 className="text-lg font-semibold mb-4 text-red-600">Danger Zone</h2>
        <button
          onClick={() => {
            logout();
            navigate('/login');
          }}
          className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </section>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-2xl mx-auto p-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48 mb-6" />
      <div className="h-64 bg-gray-100 rounded-lg mb-8" />
      <div className="h-40 bg-gray-100 rounded-lg" />
    </div>
  );
}
```

**Step 3: Add Route**

File: `dashboard/src/App.tsx` or `dashboard/src/routes.tsx`

```typescript
import { ProfileSettings } from '@/pages/ProfileSettings';

// Add to routes
<Route path="/settings/profile" element={<ProfileSettings />} />
```

**Step 4: Add Navigation Link**

Add link to profile settings in the settings page or user menu.

#### Files to Create/Modify
- `backend/app/api/users.py` - Add profile endpoints
- `backend/app/main.py` - Register users router
- `dashboard/src/pages/ProfileSettings.tsx` - Create new page
- `dashboard/src/App.tsx` - Add route
- `dashboard/src/components/Layout.tsx` - Add nav link

#### Acceptance Criteria
- [ ] `GET /api/users/me` returns user profile
- [ ] `PATCH /api/users/me` updates display name
- [ ] `POST /api/users/me/change-password` changes password
- [ ] Profile page accessible from settings/navbar
- [ ] Shows current user info (name, email, role, company)
- [ ] Can edit display name
- [ ] Can change password with current password verification
- [ ] Password validation (8+ chars, match confirmation)
- [ ] Success/error feedback with toasts
- [ ] Logout after password change

---

### 3. FEAT-004: Settings Navigation Structure

**Priority**: P2 (Medium)
**Component**: Dashboard
**Estimated Effort**: 1 day

#### Purpose

Create a proper settings page structure with tabs/navigation for Team, Profile, and future settings sections.

#### Implementation

File: `dashboard/src/pages/Settings.tsx`

```typescript
import { NavLink, Outlet } from 'react-router-dom';
import { Users, User, Bell, Shield } from 'lucide-react';

const settingsNavItems = [
  { path: '/settings/profile', label: 'Profile', icon: User },
  { path: '/settings/team', label: 'Team', icon: Users },
  { path: '/settings/notifications', label: 'Notifications', icon: Bell, disabled: true },
  { path: '/settings/security', label: 'Security', icon: Shield, disabled: true },
];

export function Settings() {
  return (
    <div className="flex min-h-screen">
      {/* Settings Sidebar */}
      <aside className="w-64 border-r bg-gray-50 p-4">
        <h2 className="text-lg font-semibold mb-4">Settings</h2>
        <nav className="space-y-1">
          {settingsNavItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  item.disabled
                    ? 'text-gray-400 cursor-not-allowed'
                    : isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
              onClick={e => item.disabled && e.preventDefault()}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
              {item.disabled && (
                <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded">Soon</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Settings Content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
```

**Update Routes**:

```typescript
<Route path="/settings" element={<Settings />}>
  <Route index element={<Navigate to="/settings/profile" replace />} />
  <Route path="profile" element={<ProfileSettings />} />
  <Route path="team" element={<TeamView />} />
</Route>
```

#### Acceptance Criteria
- [ ] Settings page with sidebar navigation
- [ ] Profile and Team as active tabs
- [ ] Notifications and Security shown as "Coming Soon"
- [ ] Default redirects to Profile
- [ ] Proper active state styling

---

### 4. Backend: Company Members Endpoint Verification

**Priority**: P1 (High)
**Component**: Backend
**Estimated Effort**: 1 day

#### Purpose

Verify and fix the company members endpoint if needed. The backend should already have this, but needs verification.

#### Verification Checklist

File: `backend/app/api/companies.py`

```python
# Verify these endpoints exist and work:

@router.get("/me/members")
async def list_company_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all members of current user's company."""
    members = db.query(User).filter(
        User.company_id == current_user.company_id,
        User.deleted_at.is_(None)  # Soft delete check if applicable
    ).all()

    return {
        "members": [
            {
                "id": str(m.id),
                "name": m.name,
                "email": m.email,
                "role": m.role,
                "joined_at": m.created_at.isoformat(),
            }
            for m in members
        ]
    }

@router.delete("/me/members/{user_id}")
async def remove_company_member(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a member from the company (admin only)."""
    # Check if current user is admin
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Only admins can remove team members"
        )

    # Check if trying to remove self
    if str(current_user.id) == user_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot remove yourself from the team"
        )

    # Find the member
    member = db.query(User).filter(
        User.id == user_id,
        User.company_id == current_user.company_id
    ).first()

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # Remove from company (or soft delete)
    member.company_id = None  # Or use soft delete
    db.commit()

    return {"success": True}
```

#### Tests to Add

File: `backend/tests/integration/test_company_members.py`

```python
def test_list_company_members(client, auth_headers, test_company):
    response = client.get("/api/companies/me/members", headers=auth_headers)
    assert response.status_code == 200
    assert "members" in response.json()

def test_remove_member_as_admin(client, admin_auth_headers, test_member):
    response = client.delete(
        f"/api/companies/me/members/{test_member.id}",
        headers=admin_auth_headers
    )
    assert response.status_code == 200

def test_remove_member_as_non_admin_fails(client, member_auth_headers, test_member):
    response = client.delete(
        f"/api/companies/me/members/{test_member.id}",
        headers=member_auth_headers
    )
    assert response.status_code == 403

def test_cannot_remove_self(client, admin_auth_headers, admin_user):
    response = client.delete(
        f"/api/companies/me/members/{admin_user.id}",
        headers=admin_auth_headers
    )
    assert response.status_code == 400
```

#### Acceptance Criteria
- [ ] `GET /api/companies/me/members` returns list of members
- [ ] `DELETE /api/companies/me/members/{id}` removes member (admin only)
- [ ] Non-admins get 403 on delete
- [ ] Cannot delete self
- [ ] Tests pass

---

### 5. Integration: Settings Navigation from Layout

**Priority**: P2 (Medium)
**Component**: Dashboard
**Estimated Effort**: 0.5 days

#### Purpose

Add settings link to main navigation/user menu.

#### Implementation

File: `dashboard/src/components/Layout.tsx`

Add settings link to user dropdown menu:

```typescript
import { Settings, LogOut } from 'lucide-react';

// In user dropdown menu:
<Link
  to="/settings"
  className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100"
>
  <Settings className="w-4 h-4" />
  Settings
</Link>
```

#### Acceptance Criteria
- [ ] Settings link in user menu
- [ ] Navigates to /settings/profile
- [ ] Works from any page

---

## Sprint Execution Checklist

### Before Starting
- [ ] Sprint 4 (UX Polish) completed
- [ ] All tests passing
- [ ] Toast notifications working
- [ ] ConfirmModal component available

### During Sprint
- [ ] Update sprint.md with daily progress
- [ ] Commit after each ticket
- [ ] Test API endpoints with curl before frontend integration

### Before Completing
- [ ] All acceptance criteria met
- [ ] All tests passing
- [ ] Mock data completely removed from TeamView
- [ ] Manual testing of all settings flows
- [ ] Password change → logout flow works

---

## API Endpoint Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/users/me` | Get current user profile |
| PATCH | `/api/users/me` | Update profile (name) |
| POST | `/api/users/me/change-password` | Change password |
| GET | `/api/companies/me/members` | List team members |
| DELETE | `/api/companies/me/members/{id}` | Remove member |

---

## Completion Criteria

Sprint is complete when:
1. Team members list shows real data (not mock)
2. Admin can remove team members with confirmation
3. Profile page shows user info
4. User can change display name
5. User can change password (logs out after)
6. Settings navigation structure works
7. All tests pass
8. Manual testing confirms all features
