/**
 * Centralized configuration for the dashboard
 * Single source of truth for environment variables and app settings
 */

export const config = {
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:8000",
  appName: "Overlay",
} as const;

// Export individual values for convenience
export const API_URL = config.apiUrl;
