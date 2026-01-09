import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Home,
  Users,
  PlayCircle,
  Activity,
  Settings,
  Plus,
  LogOut,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { generateAvatarUrl } from "@/utils/typeMappers";
import type { UserRole } from "@/api/types";
import { canCreateWorkflow, getRoleDisplayName } from "@/utils/permissions";
import { NotificationBell } from "@/components/NotificationBell";

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  // Permission check for workflow creation
  const userRole = (user?.role as UserRole) || "viewer";
  const showCreateWorkflow = canCreateWorkflow(userRole);

  const navItems = [
    { icon: <Home size={20} />, label: "Dashboard", path: "/dashboard" },
    { icon: <Users size={20} />, label: "Team", path: "/team" },
    { icon: <PlayCircle size={20} />, label: "Library", path: "/library" },
    { icon: <Activity size={20} />, label: "Health", path: "/health" },
    { icon: <Settings size={20} />, label: "Settings", path: "/settings" },
  ];

  const getCurrentView = (): string => {
    const path = location.pathname;
    if (path.startsWith("/workflows")) return "dashboard";
    const item = navItems.find((item) => path === item.path);
    return item?.path.replace("/", "") || "dashboard";
  };

  const currentView = getCurrentView();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const avatarUrl = user ? generateAvatarUrl(user.name) : "";

  return (
    <div className="w-64 h-screen fixed left-0 top-0 flex flex-col glass-panel border-r border-white/40 z-20">
      {/* Logo Area */}
      <div className="p-6 flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-xl shadow-lg transform rotate-3">
          F
        </div>
        <span className="font-bold text-lg text-neutral-900 tracking-tight">
          FlowGuide
        </span>
      </div>

      {/* Action Button - Only show for editors and admins */}
      {showCreateWorkflow && (
        <div className="px-6 mb-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="w-full py-3 px-4 bg-gradient-to-r from-accent-500 to-accent-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            <span>New Workflow</span>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = currentView === item.path.replace("/", "");
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-primary-50/80 text-primary-700 font-medium shadow-sm border border-primary-100"
                  : "text-neutral-600 hover:bg-white/50 hover:text-neutral-900"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Profile Section */}
      <div className="p-4 border-t border-neutral-200/50">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/60 transition-colors text-left group flex-1 min-w-0"
          >
            <div className="w-10 h-10 rounded-full bg-neutral-200 overflow-hidden border-2 border-white shadow-sm group-hover:border-primary-200 transition-colors flex-shrink-0">
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt={user?.name || "User"}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors truncate">
                {user?.name || "User"}
              </span>
              <span className="text-xs text-neutral-500 truncate">
                {getRoleDisplayName(userRole)} •{" "}
                {user?.company_name || "Company"}
              </span>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-neutral-500 hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
