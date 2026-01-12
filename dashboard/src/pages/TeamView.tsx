/**
 * Team Management View
 * Manage team members, roles, and invitations
 * Connected to real backend API with RBAC
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Copy,
  Check,
  UserPlus,
  Mail,
  Shield,
  MoreVertical,
  Trash2,
  RefreshCw,
  UserCog,
  Ban,
  AlertTriangle,
  X,
  Loader2,
  CheckCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import type {
  TeamMemberResponse,
  CompanyResponse,
  InviteResponse,
  UserRole,
} from "@/api/types";
import { useAuthStore } from "@/store/auth";
import { canManageUsers, getRoleDisplayName } from "@/utils/permissions";
import { showToast } from "@/utils/toast";
import { formatDateInTimezone } from "@/utils/timezone";

export const TeamView: React.FC = () => {
  // State
  const [members, setMembers] = useState<TeamMemberResponse[]>([]);
  const [pendingInvites, setPendingInvites] = useState<InviteResponse[]>([]);
  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<number | null>(null);
  const [memberToSuspend, setMemberToSuspend] = useState<number | null>(null);
  const [editRoleMember, setEditRoleMember] =
    useState<TeamMemberResponse | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<number | null>(null);

  const { user } = useAuthStore();
  const menuRef = useRef<HTMLDivElement>(null);

  // Current user's role for permission checks
  const currentUserRole = (user?.role as UserRole) || "viewer";
  const isCurrentUserAdmin = canManageUsers(currentUserRole);

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [membersData, companyData] = await Promise.all([
        apiClient.getTeamMembers(),
        apiClient.getCompany(),
      ]);
      setMembers(membersData);
      setCompany(companyData);

      // Load pending invites only if admin
      if (isCurrentUserAdmin) {
        try {
          const invitesData = await apiClient.listInvites();
          setPendingInvites(invitesData.invites);
        } catch {
          // Non-critical error, just don't show invites
          setPendingInvites([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team data");
    } finally {
      setIsLoading(false);
    }
  }, [isCurrentUserAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Generate invite link using company's static token
  const inviteLink = company
    ? `${window.location.origin}/signup?invite=${company.invite_token}`
    : "";

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      showToast.success("Invite link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast.error("Failed to copy link. Please copy manually.");
    }
  };

  const toggleMenu = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === id ? null : id);
  };

  // ============================================================================
  // ACTION HANDLERS
  // ============================================================================

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) return;

    setActionLoading(true);
    setActionError(null);
    try {
      const invite = await apiClient.createInvite({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setPendingInvites([invite, ...pendingInvites]);
      setInviteEmail("");
      setInviteRole("viewer");
      setIsInviteModalOpen(false);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to send invite",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeInvite = async (inviteId: number) => {
    setRevokingInviteId(inviteId);
    try {
      await apiClient.revokeInvite(inviteId);
      setPendingInvites(pendingInvites.filter((i) => i.id !== inviteId));
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to revoke invite",
      );
    } finally {
      setRevokingInviteId(null);
    }
  };

  const handleUpdateRole = async (memberId: number, newRole: UserRole) => {
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await apiClient.updateMemberRole(memberId, {
        role: newRole,
      });
      setMembers(members.map((m) => (m.id === memberId ? updated : m)));
      setEditRoleMember(null);
      setActiveMenuId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update role",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspendMember = async () => {
    if (!memberToSuspend) return;

    const member = members.find((m) => m.id === memberToSuspend);
    if (!member) return;

    const newStatus = member.status === "active" ? "suspended" : "active";

    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await apiClient.updateMemberStatus(memberToSuspend, {
        status: newStatus,
      });
      setMembers(members.map((m) => (m.id === memberToSuspend ? updated : m)));
      setMemberToSuspend(null);
      setActiveMenuId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update status",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToDelete) return;

    setActionLoading(true);
    setActionError(null);
    try {
      await apiClient.removeTeamMember(memberToDelete);
      setMembers(members.filter((m) => m.id !== memberToDelete));
      setMemberToDelete(null);
      setActiveMenuId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to remove member",
      );
    } finally {
      setActionLoading(false);
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getRoleBadgeClasses = (role: UserRole) => {
    switch (role) {
      case "admin":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "editor":
        return "bg-blue-50 text-blue-700 border-blue-200";
      default:
        return "bg-neutral-100 text-neutral-600 border-neutral-200";
    }
  };

  const getStatusBadgeClasses = (status: string) => {
    return status === "active"
      ? "bg-green-50 text-green-700 border-green-200"
      : "bg-amber-50 text-amber-700 border-amber-200";
  };

  const formatDate = (dateStr: string) => {
    return formatDateInTimezone(dateStr, user?.timezone);
  };

  const getAvatarUrl = (name: string | null) => {
    const displayName = name || "User";
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`;
  };

  // ============================================================================
  // LOADING / ERROR STATES
  // ============================================================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900 mb-2">
          Failed to load team
        </h3>
        <p className="text-neutral-600 mb-4">{error}</p>
        <Button onClick={loadData}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20 relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            Team Management
          </h1>
          <p className="text-neutral-600">
            Manage your team members, roles, and invitations.
          </p>
        </div>
        {isCurrentUserAdmin && (
          <Button
            icon={<UserPlus size={18} />}
            onClick={() => setIsInviteModalOpen(true)}
          >
            Invite Member
          </Button>
        )}
      </div>

      {/* Invite Section - Show to all, but only admins can create invites */}
      <div className="glass-card rounded-2xl p-8 mb-8 border border-primary-100 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary-100 to-transparent opacity-50 rounded-bl-full pointer-events-none -mr-16 -mt-16"></div>

        <div className="relative z-10">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 shrink-0">
              <Mail size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-neutral-900 mb-1">
                Invite your team
              </h3>
              <p className="text-neutral-600 max-w-xl">
                Share this link with your team members to let them join your
                company workspace. They will automatically be added as Editors.
                {isCurrentUserAdmin &&
                  " Or use the invite button above to send personalized invitations with specific roles."}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
            <div className="flex-1 relative">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="w-full pl-4 pr-4 py-3 rounded-xl border border-neutral-300 bg-white text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm shadow-inner"
              />
            </div>
            <Button
              variant={copied ? "secondary" : "primary"}
              onClick={handleCopyInvite}
              disabled={!inviteLink}
              className={`w-36 justify-center ${copied ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100" : ""}`}
              icon={copied ? <Check size={18} /> : <Copy size={18} />}
            >
              {copied ? "Copied!" : "Copy Link"}
            </Button>
          </div>
        </div>
      </div>

      {/* Pending Invites Section - Admin Only */}
      {isCurrentUserAdmin && pendingInvites.length > 0 && (
        <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-glass overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-neutral-200/60 bg-white/40">
            <h3 className="font-bold text-neutral-900 flex items-center gap-2">
              <Clock size={18} className="text-amber-500" />
              Pending Invites
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs">
                {pendingInvites.length}
              </span>
            </h3>
          </div>
          <div className="p-4 space-y-2">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-white/50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <Mail size={18} className="text-neutral-400" />
                  <div>
                    <p className="font-medium text-neutral-900">
                      {invite.email}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Invited as {getRoleDisplayName(invite.role)} - Expires{" "}
                      {formatDate(invite.expires_at)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRevokeInvite(invite.id)}
                  disabled={revokingInviteId === invite.id}
                >
                  {revokingInviteId === invite.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Revoke"
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members List */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-glass overflow-hidden min-h-[400px]">
        <div className="px-6 py-4 border-b border-neutral-200/60 flex justify-between items-center bg-white/40">
          <h3 className="font-bold text-neutral-900 flex items-center gap-2">
            All Members{" "}
            <span className="bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full text-xs">
              {members.length}
            </span>
          </h3>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="p-2 text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors"
              title="Refresh"
              aria-label="Refresh team members"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-visible">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-neutral-200/60 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Joined</th>
                {isCurrentUserAdmin && (
                  <th className="px-6 py-4 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/60">
              {members.map((member) => (
                <tr
                  key={member.id}
                  className="hover:bg-white/40 transition-colors group relative"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={getAvatarUrl(member.name)}
                        alt={member.name || "User"}
                        className="w-10 h-10 rounded-full border border-white shadow-sm"
                      />
                      <div>
                        <div className="font-semibold text-neutral-900 flex items-center gap-2">
                          {member.name || member.email.split("@")[0]}
                          {member.id === user?.id && (
                            <span className="text-xs text-primary-600">
                              (You)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500">
                          {member.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeClasses(member.role)}`}
                    >
                      {member.role === "admin" && <Shield size={10} />}
                      {getRoleDisplayName(member.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeClasses(member.status)}`}
                    >
                      {member.status === "active" ? (
                        <CheckCircle size={10} />
                      ) : (
                        <Ban size={10} />
                      )}
                      {member.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600">
                    {formatDate(member.created_at)}
                  </td>
                  {isCurrentUserAdmin && (
                    <td className="px-6 py-4 text-right relative">
                      {member.id !== user?.id && (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={(e) => toggleMenu(member.id, e)}
                            className={`p-2 rounded-lg transition-colors ${activeMenuId === member.id ? "bg-primary-50 text-primary-600" : "text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"}`}
                            aria-label="Member actions"
                          >
                            <MoreVertical size={18} />
                          </button>
                        </div>
                      )}

                      {activeMenuId === member.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-6 top-12 w-48 bg-white/95 backdrop-blur-xl rounded-xl shadow-xl border border-neutral-100 z-50 text-left overflow-hidden animate-fade-in origin-top-right"
                        >
                          <div className="py-1">
                            <button
                              onClick={() => setEditRoleMember(member)}
                              className="w-full px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-primary-600 flex items-center gap-2 transition-colors"
                            >
                              <UserCog size={16} /> Edit Role
                            </button>
                            <button
                              onClick={() => setMemberToSuspend(member.id)}
                              className="w-full px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-amber-600 flex items-center gap-2 transition-colors"
                            >
                              <Ban size={16} />
                              {member.status === "active"
                                ? "Suspend User"
                                : "Reactivate User"}
                            </button>
                            <div className="h-px bg-neutral-100 my-1"></div>
                            <button
                              onClick={() => setMemberToDelete(member.id)}
                              className="w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                            >
                              <Trash2 size={16} /> Remove Member
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================================
          MODALS
          ====================================================================== */}

      {/* Invite Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/40"
            onClick={() => setIsInviteModalOpen(false)}
          ></div>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-modal-title"
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in"
          >
            <button
              onClick={() => setIsInviteModalOpen(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 p-1 rounded-full hover:bg-neutral-100 transition-colors"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>

            <h3
              id="invite-modal-title"
              className="text-xl font-bold mb-4 text-neutral-900"
            >
              Invite Team Member
            </h3>

            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {actionError}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-neutral-900"
                >
                  <option value="viewer">
                    Viewer - View and run workflows
                  </option>
                  <option value="editor">
                    Editor - Create and edit workflows
                  </option>
                  <option value="admin">
                    Admin - Full access including team management
                  </option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setIsInviteModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleInviteMember}
                disabled={actionLoading || !inviteEmail.trim()}
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Send Invite"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editRoleMember && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/40"
            onClick={() => setEditRoleMember(null)}
          ></div>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-role-modal-title"
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in"
          >
            <button
              onClick={() => setEditRoleMember(null)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 p-1 rounded-full hover:bg-neutral-100 transition-colors"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>

            <h3
              id="edit-role-modal-title"
              className="text-xl font-bold mb-4 text-neutral-900"
            >
              Change Role
            </h3>
            <p className="text-neutral-600 mb-4">
              Update role for{" "}
              <strong>{editRoleMember.name || editRoleMember.email}</strong>
            </p>

            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {actionError}
              </div>
            )}

            <div className="space-y-2 mb-6">
              {(["viewer", "editor", "admin"] as UserRole[]).map((role) => (
                <button
                  key={role}
                  onClick={() => handleUpdateRole(editRoleMember.id, role)}
                  disabled={actionLoading || role === editRoleMember.role}
                  className={`w-full p-3 text-left rounded-xl border transition-colors ${
                    role === editRoleMember.role
                      ? "border-primary-300 bg-primary-50"
                      : "border-neutral-200 hover:border-primary-200 hover:bg-neutral-50"
                  }`}
                >
                  <div className="font-semibold text-neutral-900">
                    {getRoleDisplayName(role)}
                    {role === editRoleMember.role && (
                      <span className="text-primary-600 ml-2">(Current)</span>
                    )}
                  </div>
                  <div className="text-sm text-neutral-500">
                    {role === "admin" &&
                      "Full access including team management"}
                    {role === "editor" && "Create, edit, and run workflows"}
                    {role === "viewer" && "View and run workflows only"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Suspend Confirmation Modal */}
      {memberToSuspend && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
            onClick={() => setMemberToSuspend(null)}
          ></div>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="suspend-modal-title"
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-neutral-200"
          >
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mb-4 mx-auto">
              <Ban size={24} />
            </div>
            <h3
              id="suspend-modal-title"
              className="text-xl font-bold text-center mb-2 text-neutral-900"
            >
              {members.find((m) => m.id === memberToSuspend)?.status ===
              "active"
                ? "Suspend User?"
                : "Reactivate User?"}
            </h3>
            <p className="text-neutral-500 text-center mb-6 text-sm">
              {members.find((m) => m.id === memberToSuspend)?.status ===
              "active"
                ? "This user will be unable to access the platform until reactivated."
                : "This user will regain access to the platform."}
            </p>
            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
                {actionError}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setMemberToSuspend(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleSuspendMember}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : members.find((m) => m.id === memberToSuspend)?.status ===
                  "active" ? (
                  "Suspend"
                ) : (
                  "Reactivate"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {memberToDelete && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
            onClick={() => setMemberToDelete(null)}
          ></div>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-neutral-200"
          >
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
              <AlertTriangle size={24} />
            </div>
            <h3
              id="delete-modal-title"
              className="text-xl font-bold text-center mb-2 text-neutral-900"
            >
              Remove Member?
            </h3>
            <p className="text-neutral-500 text-center mb-6 text-sm">
              Are you sure you want to remove this user from the workspace? They
              will lose access immediately and their workflows will be
              reassigned to you.
            </p>
            {actionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
                {actionError}
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setMemberToDelete(null)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleRemoveMember}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Remove"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
