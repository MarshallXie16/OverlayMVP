/**
 * Settings Layout with nested navigation
 * Provides sidebar navigation for settings sub-pages
 */
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { User, Building, Webhook, Bell } from "lucide-react";

const navItems = [
  { icon: <User size={18} />, label: "Profile", path: "/settings/profile" },
  { icon: <Building size={18} />, label: "Company", path: "/settings/company" },
  {
    icon: <Webhook size={18} />,
    label: "Integrations",
    path: "/settings/integrations",
  },
  {
    icon: <Bell size={18} />,
    label: "Preferences",
    path: "/settings/preferences",
  },
];

export const SettingsLayout: React.FC = () => {
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
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white shadow-sm text-primary-700"
                      : "text-neutral-600 hover:bg-white/50"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Content Area - Renders nested route */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
