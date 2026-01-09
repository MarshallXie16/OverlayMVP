/**
 * Preferences Settings Page
 * Manage notification preferences and interface settings
 */
import React from "react";
import { Globe, Moon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/utils/toast";

export const PreferencesSettings: React.FC = () => {
  return (
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
                  <span className="text-neutral-500 text-xs">{item.desc}</span>
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
              onClick={() => showToast.info("Coming soon")}
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
  );
};
