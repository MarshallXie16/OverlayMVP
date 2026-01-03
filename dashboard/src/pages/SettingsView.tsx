/**
 * Settings View
 * Manage user profile, workspace configuration, and preferences
 */

import { useState, useEffect } from "react";
import {
  User as UserIcon,
  Building,
  Bell,
  Camera,
  Lock,
  Mail,
  Globe,
  Moon,
  Key,
  Webhook,
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
import { apiClient } from "@/api/client";
import type {
  CompanyResponse,
  TeamMemberResponse,
  SlackSettingsResponse,
  NotificationType,
} from "@/api/types";

export const SettingsView: React.FC = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<
    "profile" | "company" | "preferences" | "integrations"
  >("profile");
  const [userName, setUserName] = useState(user?.name || "User");
  const [companyName, setCompanyName] = useState(
    user?.company_name || "My Company",
  );

  // Company tab state
  const [company, setCompany] = useState<CompanyResponse | null>(null);
  const [members, setMembers] = useState<TeamMemberResponse[]>([]);
  const [isLoadingCompany, setIsLoadingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null);
  const [isUpdatingCompany, setIsUpdatingCompany] = useState(false);

  // Slack integration state
  const [slackSettings, setSlackSettings] =
    useState<SlackSettingsResponse | null>(null);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackNotifyOn, setSlackNotifyOn] = useState<NotificationType[]>([
    "workflow_broken",
    "high_failure_rate",
  ]);
  const [isLoadingSlack, setIsLoadingSlack] = useState(false);
  const [isSavingSlack, setIsSavingSlack] = useState(false);
  const [isTestingSlack, setIsTestingSlack] = useState(false);
  const [slackError, setSlackError] = useState<string | null>(null);
  const [slackSuccess, setSlackSuccess] = useState<string | null>(null);

  // Fetch company data when switching to company tab
  useEffect(() => {
    if (activeTab === "company" && !company) {
      fetchCompanyData();
    }
  }, [activeTab]);

  // Fetch Slack settings when switching to integrations tab
  useEffect(() => {
    if (activeTab === "integrations" && !slackSettings) {
      fetchSlackSettings();
    }
  }, [activeTab]);

  const fetchCompanyData = async () => {
    setIsLoadingCompany(true);
    setCompanyError(null);
    try {
      const [companyData, membersData] = await Promise.all([
        apiClient.getCompany(),
        apiClient.getTeamMembers(),
      ]);
      setCompany(companyData);
      setMembers(membersData);
      setCompanyName(companyData.name);
    } catch (err) {
      setCompanyError(
        err instanceof Error ? err.message : "Failed to load company data",
      );
    } finally {
      setIsLoadingCompany(false);
    }
  };

  const handleUpdateCompanyName = async () => {
    if (!companyName.trim()) return;
    setIsUpdatingCompany(true);
    try {
      const updated = await apiClient.updateCompany({ name: companyName });
      setCompany(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update company");
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
      // Update member count
      if (company) {
        setCompany({ ...company, member_count: company.member_count - 1 });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleSave = () => {
    alert("Coming soon: Settings will be saved in a future update.");
  };

  // Slack integration handlers
  const fetchSlackSettings = async () => {
    setIsLoadingSlack(true);
    setSlackError(null);
    try {
      const settings = await apiClient.getSlackSettings();
      setSlackSettings(settings);
      setSlackEnabled(settings.enabled);
      setSlackNotifyOn(settings.notify_on);
      // Don't expose the actual webhook URL - just show if it's configured
    } catch (err) {
      setSlackError(
        err instanceof Error ? err.message : "Failed to load Slack settings",
      );
    } finally {
      setIsLoadingSlack(false);
    }
  };

  const handleSaveSlackSettings = async () => {
    setIsSavingSlack(true);
    setSlackError(null);
    setSlackSuccess(null);
    try {
      const settings = await apiClient.updateSlackSettings({
        webhook_url: slackWebhookUrl || undefined,
        enabled: slackEnabled,
        notify_on: slackNotifyOn,
      });
      setSlackSettings(settings);
      setSlackWebhookUrl(""); // Clear the input after saving
      setSlackSuccess("Slack settings saved successfully!");
      setTimeout(() => setSlackSuccess(null), 3000);
    } catch (err) {
      setSlackError(
        err instanceof Error ? err.message : "Failed to save Slack settings",
      );
    } finally {
      setIsSavingSlack(false);
    }
  };

  const handleTestSlackWebhook = async () => {
    setIsTestingSlack(true);
    setSlackError(null);
    setSlackSuccess(null);
    try {
      const result = await apiClient.testSlackWebhook();
      if (result.success) {
        setSlackSuccess(
          "Test message sent successfully! Check your Slack channel.",
        );
      } else {
        setSlackError(result.message || "Test failed");
      }
      setTimeout(() => setSlackSuccess(null), 5000);
    } catch (err) {
      setSlackError(
        err instanceof Error ? err.message : "Failed to send test message",
      );
    } finally {
      setIsTestingSlack(false);
    }
  };

  const toggleSlackNotifyOn = (notificationType: NotificationType) => {
    setSlackNotifyOn((prev) =>
      prev.includes(notificationType)
        ? prev.filter((t) => t !== notificationType)
        : [...prev, notificationType],
    );
  };

  const avatarUrl = generateAvatarUrl(user?.name || "User");
  const isAdmin = user?.role === "admin";

  return (
    <div className="animate-fade-in pb-20 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">
          Account Settings
        </h1>
        <p className="text-neutral-600">
          Manage your profile, workspace configuration, and preferences.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Settings Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-glass overflow-hidden p-2 sticky top-24">
            <button
              onClick={() => setActiveTab("profile")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "profile" ? "bg-white shadow-sm text-primary-700" : "text-neutral-600 hover:bg-white/50"}`}
            >
              <UserIcon size={18} /> Profile
            </button>
            <button
              onClick={() => setActiveTab("company")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "company" ? "bg-white shadow-sm text-primary-700" : "text-neutral-600 hover:bg-white/50"}`}
            >
              <Building size={18} /> Company
            </button>
            <button
              onClick={() => setActiveTab("integrations")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "integrations" ? "bg-white shadow-sm text-primary-700" : "text-neutral-600 hover:bg-white/50"}`}
            >
              <Webhook size={18} /> Integrations
            </button>
            <button
              onClick={() => setActiveTab("preferences")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === "preferences" ? "bg-white shadow-sm text-primary-700" : "text-neutral-600 hover:bg-white/50"}`}
            >
              <Bell size={18} /> Preferences
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === "profile" && (
            <div className="space-y-6 animate-fade-in">
              {/* Profile Card */}
              <div className="glass-card p-8 rounded-2xl border border-white/60 relative overflow-hidden">
                <h2 className="text-xl font-bold text-neutral-900 mb-8">
                  Public Profile
                </h2>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 mb-8">
                  <div className="relative group cursor-pointer">
                    <img
                      src={avatarUrl}
                      alt={userName}
                      className="w-28 h-28 rounded-full border-4 border-white shadow-lg object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
                      <Camera className="text-white" size={24} />
                    </div>
                  </div>
                  <div className="text-center sm:text-left pt-2">
                    <h3 className="font-bold text-2xl text-neutral-900">
                      {userName}
                    </h3>
                    <p className="text-neutral-500 mb-4">
                      {user?.role || "User"} - {companyName} Workspace
                    </p>
                  </div>
                </div>

                <div className="grid gap-6 max-w-2xl">
                  <div className="form-group">
                    <label className="block text-sm font-semibold text-neutral-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50 transition-all"
                    />
                  </div>
                  <div className="form-group">
                    <label className="block text-sm font-semibold text-neutral-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                        size={18}
                      />
                      <input
                        type="email"
                        value={user?.email || "user@company.com"}
                        readOnly
                        className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl bg-neutral-50 text-neutral-500 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-end">
                  <Button onClick={handleSave}>Save Changes</Button>
                </div>
              </div>

              {/* Security Card */}
              <div className="glass-card p-8 rounded-2xl border border-white/60">
                <h2 className="text-xl font-bold text-neutral-900 mb-6">
                  Security
                </h2>
                <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="bg-neutral-100 p-3 rounded-xl">
                      <Lock size={20} className="text-neutral-600" />
                    </div>
                    <div>
                      <p className="font-bold text-neutral-900 text-sm">
                        Password
                      </p>
                      <p className="text-xs text-neutral-500">
                        Last changed 3 months ago
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => alert("Coming soon")}
                  >
                    Update
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "company" && (
            <div className="space-y-6 animate-fade-in">
              {isLoadingCompany ? (
                <div className="glass-card p-12 rounded-2xl border border-white/60 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                  <span className="ml-3 text-neutral-600">
                    Loading company data...
                  </span>
                </div>
              ) : companyError ? (
                <div className="glass-card p-8 rounded-2xl border border-red-200 bg-red-50">
                  <div className="flex items-center gap-3 text-red-700">
                    <AlertCircle size={20} />
                    <span>{companyError}</span>
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
              ) : (
                <>
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
                            disabled={isUpdatingCompany}
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
                        Share this link with teammates to invite them to your
                        workspace.
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
                        <h2 className="text-xl font-bold text-neutral-900">
                          Team Members
                        </h2>
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
                              src={generateAvatarUrl(
                                member.name || member.email,
                              )}
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
                              <p className="text-xs text-neutral-500">
                                {member.email}
                              </p>
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
                </>
              )}
            </div>
          )}

          {activeTab === "integrations" && (
            <div className="space-y-6 animate-fade-in">
              <div className="glass-card p-8 rounded-2xl border border-white/60">
                <h2 className="text-xl font-bold text-neutral-900 mb-6">
                  API & Integrations
                </h2>

                <div className="space-y-6">
                  <div className="border border-neutral-200 rounded-xl p-5 bg-white/50">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-neutral-900 p-2.5 rounded-lg text-white">
                          <Key size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-neutral-900">
                            API Keys
                          </h3>
                          <p className="text-xs text-neutral-500">
                            Access Overlay programmatically
                          </p>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => alert("Coming soon")}>
                        Create New Key
                      </Button>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 font-mono text-xs text-neutral-500 flex justify-between items-center">
                      <span>pk_live_59...x829</span>
                      <button
                        onClick={() => alert("Coming soon")}
                        className="text-primary-600 font-bold hover:underline"
                      >
                        Reveal
                      </button>
                    </div>
                  </div>

                  <div className="border border-neutral-200 rounded-xl p-5 bg-white/50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-600 p-2.5 rounded-lg text-white">
                          <Webhook size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-neutral-900">
                            Webhooks
                          </h3>
                          <p className="text-xs text-neutral-500">
                            Receive real-time event updates
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => alert("Coming soon")}
                      >
                        Manage
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Slack Integration */}
              <div className="glass-card p-8 rounded-2xl border border-white/60">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-[#4A154B] p-2.5 rounded-lg text-white">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900">
                      Slack Integration
                    </h2>
                    <p className="text-sm text-neutral-500">
                      Receive workflow alerts directly in your Slack workspace
                    </p>
                  </div>
                </div>

                {isLoadingSlack ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                    <span className="ml-2 text-neutral-600">
                      Loading Slack settings...
                    </span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Error/Success Messages */}
                    {slackError && (
                      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        <AlertCircle size={16} />
                        {slackError}
                      </div>
                    )}
                    {slackSuccess && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                        <Check size={16} />
                        {slackSuccess}
                      </div>
                    )}

                    {/* Enable/Disable Toggle */}
                    <div className="flex items-center justify-between py-3 border-b border-neutral-100">
                      <div>
                        <span className="text-neutral-900 font-medium block">
                          Enable Slack Notifications
                        </span>
                        <span className="text-neutral-500 text-xs">
                          Send alerts to your Slack channel when workflows need
                          attention
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={slackEnabled}
                          onChange={(e) => setSlackEnabled(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                      </label>
                    </div>

                    {/* Webhook URL Input */}
                    <div className="form-group">
                      <label className="block text-sm font-semibold text-neutral-700 mb-1">
                        Incoming Webhook URL
                      </label>
                      <p className="text-xs text-neutral-500 mb-2">
                        Create a webhook in your Slack workspace:{" "}
                        <a
                          href="https://api.slack.com/messaging/webhooks"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          Learn how →
                        </a>
                      </p>
                      <input
                        type="url"
                        value={slackWebhookUrl}
                        onChange={(e) => setSlackWebhookUrl(e.target.value)}
                        placeholder={
                          slackSettings?.webhook_configured
                            ? "Webhook configured (enter new URL to update)"
                            : "https://hooks.slack.com/services/..."
                        }
                        className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50 font-mono text-sm"
                      />
                      {slackSettings?.webhook_configured && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <Check size={12} />
                          Webhook URL is configured
                        </p>
                      )}
                    </div>

                    {/* Notification Types */}
                    <div>
                      <label className="block text-sm font-semibold text-neutral-700 mb-3">
                        Notify On
                      </label>
                      <div className="space-y-3">
                        {[
                          {
                            type: "workflow_broken" as NotificationType,
                            label: "Workflow Broken",
                            desc: "When a workflow fails and needs attention",
                          },
                          {
                            type: "workflow_healed" as NotificationType,
                            label: "Workflow Healed",
                            desc: "When a broken workflow is automatically repaired",
                          },
                          {
                            type: "low_confidence" as NotificationType,
                            label: "Low Confidence Match",
                            desc: "When auto-healing has low confidence in a fix",
                          },
                          {
                            type: "high_failure_rate" as NotificationType,
                            label: "High Failure Rate",
                            desc: "When a workflow has an unusually high failure rate",
                          },
                        ].map((item) => (
                          <label
                            key={item.type}
                            className="flex items-center gap-3 p-3 bg-white/50 rounded-lg border border-neutral-200 hover:border-neutral-300 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={slackNotifyOn.includes(item.type)}
                              onChange={() => toggleSlackNotifyOn(item.type)}
                              className="w-4 h-4 text-primary-600 bg-white border-neutral-300 rounded focus:ring-primary-500"
                            />
                            <div>
                              <span className="text-neutral-900 font-medium text-sm block">
                                {item.label}
                              </span>
                              <span className="text-neutral-500 text-xs">
                                {item.desc}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-4 border-t border-neutral-100">
                      <Button
                        onClick={handleSaveSlackSettings}
                        disabled={isSavingSlack}
                      >
                        {isSavingSlack ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          "Save Settings"
                        )}
                      </Button>
                      {slackSettings?.webhook_configured && (
                        <Button
                          variant="secondary"
                          onClick={handleTestSlackWebhook}
                          disabled={isTestingSlack}
                        >
                          {isTestingSlack ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Sending...
                            </>
                          ) : (
                            "Send Test Message"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "preferences" && (
            <div className="glass-card p-8 rounded-2xl border border-white/60 animate-fade-in">
              <h2 className="text-xl font-bold text-neutral-900 mb-6">
                Application Preferences
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-4">
                    Notifications
                  </h3>
                  <div className="space-y-4">
                    {[
                      {
                        label: "Workflow failures",
                        desc: "Get notified when a workflow breaks",
                        default: true,
                      },
                      {
                        label: "Weekly health reports",
                        desc: "Summary of team activity",
                        default: true,
                      },
                      {
                        label: "New team member joins",
                        desc: "When someone accepts an invite",
                        default: false,
                      },
                      {
                        label: "Product updates",
                        desc: "New features and improvements",
                        default: false,
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0"
                      >
                        <div>
                          <span className="text-neutral-900 font-medium block">
                            {item.label}
                          </span>
                          <span className="text-neutral-500 text-xs">
                            {item.desc}
                          </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            defaultChecked={item.default}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-4">
                    Interface
                  </h3>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-neutral-100 p-2 rounded-lg">
                        <Globe size={18} className="text-neutral-600" />
                      </div>
                      <div>
                        <span className="text-neutral-900 font-medium block">
                          Timezone
                        </span>
                        <span className="text-neutral-500 text-xs">
                          Auto-detect (UTC-08:00)
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => alert("Coming soon")}
                    >
                      Edit
                    </Button>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-neutral-100 p-2 rounded-lg">
                        <Moon size={18} className="text-neutral-600" />
                      </div>
                      <div>
                        <span className="text-neutral-900 font-medium block">
                          Theme
                        </span>
                        <span className="text-neutral-500 text-xs">
                          Light mode active
                        </span>
                      </div>
                    </div>
                    <select className="bg-white border border-neutral-200 text-sm rounded-lg p-2 outline-none focus:ring-2 focus:ring-primary-500">
                      <option>Light</option>
                      <option>Dark</option>
                      <option>System</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
