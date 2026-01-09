/**
 * Toast Notification Utilities
 * Wrapper around react-hot-toast with consistent styling
 */

import toast from "react-hot-toast";

export const showToast = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) =>
    toast(message, {
      icon: "⚠️",
      style: {
        background: "#F59E0B",
        color: "#fff",
      },
    }),
  info: (message: string) =>
    toast(message, {
      icon: "ℹ️",
    }),
  loading: (message: string) => toast.loading(message),
  dismiss: (toastId?: string) => toast.dismiss(toastId),
  promise: <T>(
    promise: Promise<T>,
    messages: { loading: string; success: string; error: string },
  ) => toast.promise(promise, messages),
};
