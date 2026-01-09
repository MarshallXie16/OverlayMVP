/**
 * Integration Settings Page
 * Manage API keys, webhooks, and Slack integration
 */
import React, { useState, useEffect } from "react";
import { Key, Webhook, Loader2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/utils/toast";
import { apiClient } from "@/api/client";
import type { SlackSettingsResponse, NotificationType } from "@/api/types";

export const IntegrationSettings: React.FC = () => {
  // Slack integration state
  const [slackSettings, setSlackSettings] =
    useState<SlackSettingsResponse | null>(null);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackNotifyOn, setSlackNotifyOn] = useState<NotificationType[]>([
    "workflow_broken",
    "high_failure_rate",
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSlackSettings();
  }, []);

  const fetchSlackSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const settings = await apiClient.getSlackSettings();
      setSlackSettings(settings);
      setSlackEnabled(settings.enabled);
      setSlackNotifyOn(settings.notify_on);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load Slack settings",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSlackSettings = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const settings = await apiClient.updateSlackSettings({
        webhook_url: slackWebhookUrl || undefined,
        enabled: slackEnabled,
        notify_on: slackNotifyOn,
      });
      setSlackSettings(settings);
      setSlackWebhookUrl("");
      setSuccess("Slack settings saved successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save Slack settings",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestSlackWebhook = async () => {
    setIsTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await apiClient.testSlackWebhook();
      if (result.success) {
        setSuccess("Test message sent successfully! Check your Slack channel.");
      } else {
        setError(result.message || "Test failed");
      }
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send test message",
      );
    } finally {
      setIsTesting(false);
    }
  };

  const toggleSlackNotifyOn = (notificationType: NotificationType) => {
    setSlackNotifyOn((prev) =>
      prev.includes(notificationType)
        ? prev.filter((t) => t !== notificationType)
        : [...prev, notificationType],
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* API & Integrations Card */}
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
                  <h3 className="font-bold text-neutral-900">API Keys</h3>
                  <p className="text-xs text-neutral-500">
                    Access Overlay programmatically
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => showToast.info("Coming soon")}>
                Create New Key
              </Button>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 font-mono text-xs text-neutral-500 flex justify-between items-center">
              <span>pk_live_59...x829</span>
              <button
                onClick={() => showToast.info("Coming soon")}
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
                  <h3 className="font-bold text-neutral-900">Webhooks</h3>
                  <p className="text-xs text-neutral-500">
                    Receive real-time event updates
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => showToast.info("Coming soon")}
              >
                Manage
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Slack Integration Card */}
      <div className="glass-card p-8 rounded-2xl border border-white/60">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-[#4A154B] p-2.5 rounded-lg text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
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

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
            <span className="ml-2 text-neutral-600">
              Loading Slack settings...
            </span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Error/Success Messages */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                <Check size={16} />
                {success}
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
              <Button onClick={handleSaveSlackSettings} disabled={isSaving}>
                {isSaving ? (
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
                  disabled={isTesting}
                >
                  {isTesting ? (
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
  );
};
