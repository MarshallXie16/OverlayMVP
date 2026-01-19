/**
 * Centralized configuration for the dashboard
 * Single source of truth for environment variables and app settings
 */

export const config = {
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:8000",
  appName: "Overlay",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
} as const;

// Export individual values for convenience
export const API_URL = config.apiUrl;
export const SUPABASE_URL = config.supabaseUrl;
export const SUPABASE_ANON_KEY = config.supabaseAnonKey;