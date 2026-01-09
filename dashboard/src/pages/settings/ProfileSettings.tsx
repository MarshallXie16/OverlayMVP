/**
 * Profile Settings Page
 * Manage user profile information and security (password change)
 */
import React, { useState } from "react";
import {
  Camera,
  Lock,
  Mail,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/auth";
import { generateAvatarUrl } from "@/utils/typeMappers";
import { showToast } from "@/utils/toast";
import { apiClient } from "@/api/client";

export const ProfileSettings: React.FC = () => {
  const { user, checkAuth } = useAuthStore();
  const [userName, setUserName] = useState(user?.name || "");
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const avatarUrl = generateAvatarUrl(user?.name || "User");

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserName(e.target.value);
    setHasChanges(e.target.value !== user?.name);
  };

  const handleSaveProfile = async () => {
    if (!userName.trim() || !hasChanges) return;

    setIsSaving(true);
    try {
      await apiClient.updateProfile({ name: userName.trim() });
      // Refresh user data in store
      await checkAuth();
      setHasChanges(false);
      showToast.success("Profile updated successfully");
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to update profile",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const validatePassword = (): boolean => {
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return false;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      setPasswordError("Password must contain at least one letter");
      return false;
    }
    if (!/\d/.test(newPassword)) {
      setPasswordError("Password must contain at least one number");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return false;
    }
    return true;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePassword()) return;

    setIsChangingPassword(true);
    setPasswordError(null);

    try {
      await apiClient.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      showToast.success(
        "Password changed successfully. Redirecting to login...",
      );

      // Logout after password change for security
      setTimeout(() => {
        apiClient.logout();
        window.location.href = "/login";
      }, 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to change password";
      setPasswordError(message);
      showToast.error(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  const resetPasswordForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setShowCurrentPassword(false);
    setShowNewPassword(false);
  };

  return (
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
              alt={userName || "User"}
              className="w-28 h-28 rounded-full border-4 border-white shadow-lg object-cover"
            />
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
              <Camera className="text-white" size={24} />
            </div>
          </div>
          <div className="text-center sm:text-left pt-2">
            <h3 className="font-bold text-2xl text-neutral-900">
              {user?.name || "User"}
            </h3>
            <p className="text-neutral-500 mb-4">
              {user?.role || "User"} - {user?.company_name || "Company"}{" "}
              Workspace
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
              onChange={handleNameChange}
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
            <p className="text-xs text-neutral-500 mt-1">
              Email cannot be changed
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-end">
          <Button
            onClick={handleSaveProfile}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>

      {/* Security Card */}
      <div className="glass-card p-8 rounded-2xl border border-white/60">
        <h2 className="text-xl font-bold text-neutral-900 mb-6">Security</h2>

        {!showPasswordForm ? (
          <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors">
            <div className="flex items-center gap-4">
              <div className="bg-neutral-100 p-3 rounded-xl">
                <Lock size={20} className="text-neutral-600" />
              </div>
              <div>
                <p className="font-bold text-neutral-900 text-sm">Password</p>
                <p className="text-xs text-neutral-500">
                  Change your account password
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPasswordForm(true)}
            >
              Change Password
            </Button>
          </div>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle size={16} />
                {passwordError}
              </div>
            )}

            <div className="form-group">
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Current Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  size={18}
                />
                <input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label={
                    showCurrentPassword ? "Hide password" : "Show password"
                  }
                >
                  {showCurrentPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  size={18}
                />
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label={
                    showNewPassword ? "Hide password" : "Show password"
                  }
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Must be at least 8 characters with one letter and one number
              </p>
            </div>

            <div className="form-group">
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  size={18}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={
                  isChangingPassword ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {isChangingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Changing Password...
                  </>
                ) : (
                  "Change Password"
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={resetPasswordForm}
                disabled={isChangingPassword}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
