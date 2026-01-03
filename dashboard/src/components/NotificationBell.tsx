/**
 * NotificationBell Component
 * Displays notification icon with unread count badge and dropdown
 */

import { useState, useEffect, useRef } from "react";
import { Bell, X, Check, AlertTriangle, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import type { NotificationResponse, NotificationType } from "@/api/types";

// Notification type to icon mapping
const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case "workflow_broken":
      return <X size={16} className="text-red-500" />;
    case "workflow_healed":
      return <Check size={16} className="text-green-500" />;
    case "low_confidence":
      return <AlertTriangle size={16} className="text-amber-500" />;
    case "high_failure_rate":
      return <Activity size={16} className="text-orange-500" />;
    default:
      return <Bell size={16} className="text-blue-500" />;
  }
};

// Severity to background color mapping
const getSeverityBg = (severity: string): string => {
  switch (severity) {
    case "error":
      return "bg-red-50 border-red-100";
    case "warning":
      return "bg-amber-50 border-amber-100";
    default:
      return "bg-blue-50 border-blue-100";
  }
};

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResponse[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getNotifications({ limit: 10 });
      setNotifications(response.notifications);
      setUnreadCount(response.unread_count);
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchNotifications();
    // Poll every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle notification click
  const handleNotificationClick = async (
    notification: NotificationResponse,
  ) => {
    // Mark as read
    if (!notification.read) {
      try {
        await apiClient.markNotificationRead(notification.id);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true } : n,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }

    // Navigate to action URL if present
    if (notification.action_url) {
      navigate(notification.action_url);
      setIsOpen(false);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await apiClient.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-neutral-500 hover:text-neutral-700 hover:bg-white/60 transition-colors"
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-neutral-200/60 overflow-hidden z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-neutral-200/60 flex justify-between items-center bg-neutral-50/50">
            <h3 className="font-semibold text-neutral-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full text-left p-4 hover:bg-neutral-50 transition-colors ${
                      !notification.read ? "bg-primary-50/30" : ""
                    }`}
                  >
                    <div className="flex gap-3">
                      <div
                        className={`p-2 rounded-lg ${getSeverityBg(notification.severity)} shrink-0`}
                      >
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm ${notification.read ? "text-neutral-700" : "text-neutral-900 font-medium"}`}
                          >
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-primary-500 rounded-full shrink-0 mt-1.5"></span>
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-xs text-neutral-400 mt-1">
                          {formatRelativeTime(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-neutral-200/60 bg-neutral-50/50">
              <button
                onClick={() => {
                  navigate("/health");
                  setIsOpen(false);
                }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium w-full text-center"
              >
                View System Health →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
