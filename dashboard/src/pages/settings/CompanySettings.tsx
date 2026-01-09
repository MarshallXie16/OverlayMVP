/**
 * Company Settings Page
 * Manage company details, invite link, and team members
 */
import React, { useState, useEffect } from "react";
import {
  Building,
  Copy,
  Check,
  Users,
  Trash2,
  Loader2,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth";
import { generateAvatarUrl } from "@/utils/typeMappers";
import { showToast } from "@/utils/toast";
import { apiClient } from "@/api/client";
import type { CompanyResponse, TeamMemberResponse } from "@/api/types";

export const CompanySettings: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  // Company data state
  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [members, setMembers] = useState<TeamMemberResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [isUpdatingCompany, setIsUpdatingCompany] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);

  useEffect(() => {
    fetchCompanyData();
  }, []);

  const fetchCompanyData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [companyData, membersData] = await Promise.all([
        apiClient.getCompany(),
        apiClient.getTeamMembers(),
      ]);
      setCompany(companyData);
      setMembers(membersData);
      setCompanyName(companyData.name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load company data",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCompanyName = async () => {
    if (!companyName.trim()) return;
    setIsUpdatingCompany(true);
    try {
      const updated = await apiClient.updateCompany({ name: companyName });
      setCompany(updated);
      showToast.success("Company name updated");
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to update company",
      );
    } finally {
      setIsUpdatingCompany(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!company) return;
    const inviteLink = `${window.location.origin}/invite/${company.invite_token}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast.success("Invite link copied to clipboard");
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = inviteLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    setRemovingMemberId(memberId);
    try {
      await apiClient.removeTeamMember(memberId);
      setMembers(members.filter((m) => m.id !== memberId));
      if (company) {
        setCompany({ ...company, member_count: company.member_count - 1 });
      }
      showToast.success("Team member removed");
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to remove member",
      );
    } finally {
      setRemovingMemberId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="glass-card p-12 rounded-2xl border border-white/60 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
        <span className="ml-3 text-neutral-600">Loading company data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 rounded-2xl border border-red-200 bg-red-50">
        <div className="flex items-center gap-3 text-red-700">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={fetchCompanyData}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Company Details */}
      <div className="glass-card p-8 rounded-2xl border border-white/60">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">
              Workspace Details
            </h2>
            <p className="text-sm text-neutral-500">
              Manage your company identity and settings.
            </p>
          </div>
          {isAdmin && (
            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold border border-purple-200 uppercase tracking-wide">
              Admin
            </span>
          )}
        </div>

        <div className="form-group mb-8 max-w-md">
          <label className="block text-sm font-semibold text-neutral-700 mb-1">
            Company Name
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Building
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                size={18}
              />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!isAdmin}
                className={`w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50 ${!isAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
              />
            </div>
            {isAdmin && (
              <Button
                onClick={handleUpdateCompanyName}
                disabled={isUpdatingCompany || companyName === company?.name}
              >
                {isUpdatingCompany ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Update"
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Invite Link Section */}
        <div className="form-group mb-8">
          <label className="block text-sm font-semibold text-neutral-700 mb-1">
            Team Invite Link
          </label>
          <p className="text-xs text-neutral-500 mb-2">
            Share this link with teammates to invite them to your workspace.
          </p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <LinkIcon
                className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                size={18}
              />
              <input
                type="text"
                value={
                  company
                    ? `${window.location.origin}/invite/${company.invite_token}`
                    : ""
                }
                readOnly
                className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl bg-neutral-50 text-neutral-600 font-mono text-sm"
              />
            </div>
            <Button
              variant="secondary"
              onClick={handleCopyInviteLink}
              className="flex items-center gap-2"
            >
              {copied ? (
                <>
                  <Check size={16} className="text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy size={16} />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="bg-neutral-50 rounded-xl p-6 border border-neutral-200">
          <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-4">
            Usage
          </h4>
          <div className="flex items-center gap-4">
            <div className="bg-primary-100 p-3 rounded-xl">
              <Users size={20} className="text-primary-600" />
            </div>
            <div>
              <p className="font-bold text-neutral-900">
                {company?.member_count || 0} Team Member
                {company?.member_count !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-neutral-500">
                Active in this workspace
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="glass-card p-8 rounded-2xl border border-white/60">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Team Members</h2>
            <p className="text-sm text-neutral-500">
              {members.length} member
              {members.length !== 1 ? "s" : ""} in your workspace
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors"
            >
              <div className="flex items-center gap-4">
                <img
                  src={generateAvatarUrl(member.name || member.email)}
                  alt={member.name || member.email}
                  className="w-10 h-10 rounded-full border-2 border-white shadow"
                />
                <div>
                  <p className="font-bold text-neutral-900 text-sm">
                    {member.name || "No name"}
                    {member.id === user?.id && (
                      <span className="ml-2 text-xs text-neutral-500">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    member.role === "admin"
                      ? "bg-purple-100 text-purple-700 border border-purple-200"
                      : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                  }`}
                >
                  {member.role}
                </span>
                {isAdmin && member.id !== user?.id && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={removingMemberId === member.id}
                    className="text-red-600 hover:bg-red-50 hover:border-red-200"
                    aria-label={`Remove ${member.name || member.email} from team`}
                  >
                    {removingMemberId === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
