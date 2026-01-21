/**
 * API Client for Dashboard
 * Handles authentication, requests, and error handling
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type {
  LoginRequest,
  SignupRequest,
  TokenResponse,
  UserResponse,
  UpdateProfileRequest,
  ChangePasswordRequest,
  ChangePasswordResponse,
  WorkflowListResponse,
  WorkflowResponse,
  SlackSettingsRequest,
  SlackSettingsResponse,
  SlackTestResponse,
} from "./types";
import { API_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/config";

class ApiClient {
  private baseUrl: string;
  private supabase: SupabaseClient;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
    
    // Initialize Supabase client
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error(
        "Supabase configuration missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables."
      );
    }
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  /**
   * Get auth token from localStorage
   */
  private getToken(): string | null {
    const token = localStorage.getItem("auth_token");
    if (!token) return null;

    // Check token expiration
    const expiry = localStorage.getItem("auth_token_expiry");
    if (expiry && new Date(expiry) <= new Date()) {
      this.clearToken();
      return null;
    }

    return token;
  }

  /**
   * Store auth token in localStorage
   */
  private setToken(
    token: string,
    expiresIn: number = 7 * 24 * 60 * 60 * 1000,
  ): void {
    localStorage.setItem("auth_token", token);
    const expiry = new Date(Date.now() + expiresIn);
    localStorage.setItem("auth_token_expiry", expiry.toISOString());
  }

  /**
   * Clear auth token from localStorage
   */
  private clearToken(): void {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_token_expiry");
    localStorage.removeItem("user_data");
  }

  /**
   * Make HTTP request with error handling and retries
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Merge existing headers first (so they take precedence)
    if (options.headers) {
      const existingHeaders = new Headers(options.headers);
      existingHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    }

    // Add auth token if available (only if Authorization not already set)
    if (!headers["Authorization"]) {
      const token = this.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    const config: RequestInit = {
      ...options,
      headers,
    };

    // Retry logic for network errors (not for 4xx client errors)
    const maxRetries = 3;
    const delays = [1000, 2000, 4000]; // Exponential backoff

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, config);

        // Handle HTTP errors
        if (!response.ok) {
          let errorMessage = "An unknown error occurred";

          try {
            const errorData = await response.json();

            // FastAPI HTTPException returns { detail: { code, message } }
            if (errorData.detail && typeof errorData.detail === "object") {
              errorMessage =
                errorData.detail.message ||
                errorData.detail.code ||
                errorMessage;
            }
            // Or sometimes just { detail: "error message" }
            else if (errorData.detail && typeof errorData.detail === "string") {
              errorMessage = errorData.detail;
            }
            // Fallback to any message field
            else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // If JSON parsing fails, use default message
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }

          // Don't retry client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            // Clear token if unauthorized
            if (response.status === 401) {
              this.clearToken();
            }
            throw new Error(errorMessage);
          }

          // Retry server errors (5xx)
          if (attempt < maxRetries - 1) {
            await this.delay(delays[attempt]);
            continue;
          }

          throw new Error(errorMessage);
        }

        // Success - check if response has content
        // DELETE requests often return 204 No Content
        if (
          response.status === 204 ||
          response.headers.get("content-length") === "0"
        ) {
          return undefined as T;
        }

        // Check if response is JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          return await response.json();
        }

        // Non-JSON response (shouldn't happen with our API)
        return undefined as T;
      } catch (error) {
        // Network error - retry
        if (attempt < maxRetries - 1 && error instanceof TypeError) {
          await this.delay(delays[attempt]);
          continue;
        }

        // Re-throw if not retryable or last attempt
        throw error;
      }
    }

    throw new Error("Maximum retry attempts reached");
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // AUTH ENDPOINTS
  // ============================================================================

  async signup(data: SignupRequest): Promise<TokenResponse> {
    // Use Supabase Auth for signup
    const { data: authData, error } = await this.supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.name,
        },
      },
    });

    if (error) {
      throw new Error(error.message || "Signup failed");
    }

    if (!authData.session || !authData.user) {
      throw new Error("Signup failed: No session returned");
    }

    // Get user profile from backend using Supabase token
    // The backend will sync the user to your database and return user data
    const userResponse = await this.request<UserResponse>("/api/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });

    // Store Supabase token
    this.setToken(authData.session.access_token);
    localStorage.setItem("user_data", JSON.stringify(userResponse));

    return {
      access_token: authData.session.access_token,
      token_type: "bearer",
      user: userResponse,
    };
  }

  async login(data: LoginRequest): Promise<TokenResponse> {
    // Use Supabase Auth for login
    const { data: authData, error } = await this.supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      throw new Error(error.message || "Login failed");
    }

    if (!authData.session || !authData.user) {
      throw new Error("Login failed: No session returned");
    }

    // Get user profile from backend using Supabase token
    // The backend will validate the Supabase token and return user data
    const userResponse = await this.request<UserResponse>("/api/auth/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });

    // Store Supabase token
    this.setToken(authData.session.access_token);
    localStorage.setItem("user_data", JSON.stringify(userResponse));

    return {
      access_token: authData.session.access_token,
      token_type: "bearer",
      user: userResponse,
    };
  }

  logout(): void {
    // Fire-and-forget sign out from Supabase (avoid making callers async)
    void this.supabase.auth.signOut();
    this.clearToken();
  }

  async getCurrentUser(): Promise<TokenResponse["user"] | null> {
    // Check Supabase session first (Supabase persists sessions in storage).
    // We only call the backend if Supabase confirms the session is valid.
    const {
      data: { session },
    } = await this.supabase.auth.getSession();

    if (!session?.access_token) {
      this.clearToken();
      return null;
    }

    const { data: userData, error: userError } = await this.supabase.auth.getUser(
      session.access_token,
    );

    if (userError || !userData?.user) {
      this.clearToken();
      return null;
    }

    // Update stored token if session exists
    this.setToken(session.access_token);

    // Try to get cached user data first
    const cachedUser = localStorage.getItem("user_data");
    if (cachedUser) {
      try {
        return JSON.parse(cachedUser);
      } catch {
        // Invalid cached data, fetch from server
      }
    }

    // Fetch from backend using Supabase token
    try {
      const userResponse = await this.request<UserResponse>(
        "/api/auth/me",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      localStorage.setItem("user_data", JSON.stringify(userResponse));
      return userResponse;
    } catch {
      this.clearToken();
      return null;
    }
  }

  // ============================================================================
  // USER PROFILE ENDPOINTS
  // ============================================================================

  /**
   * Update current user's profile (display name)
   */
  async updateProfile(data: UpdateProfileRequest): Promise<UserResponse> {
    const { error } = await this.supabase.auth.updateUser({
      data: {
        ...(data.name !== undefined ? { full_name: data.name } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      },
    });

    if (error) throw new Error(error.message || "Profile update failed");

    // Refresh from backend to keep a single canonical shape for the app
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Profile update failed: no session");
    return user;
  }

  /**
   * Change current user's password
   * Requires current password verification
   */
  async changePassword(
    data: ChangePasswordRequest,
  ): Promise<ChangePasswordResponse> {
    // Verify current password by re-authing (Supabase doesn't require this, but UI does)
    const {
      data: { user },
      error: userErr,
    } = await this.supabase.auth.getUser();

    if (userErr || !user?.email) {
      throw new Error("Not authenticated");
    }

    const { error: reauthErr } = await this.supabase.auth.signInWithPassword({
      email: user.email,
      password: data.current_password,
    });
    if (reauthErr) {
      throw new Error("Current password is incorrect");
    }

    const { error } = await this.supabase.auth.updateUser({
      password: data.new_password,
    });
    if (error) throw new Error(error.message || "Failed to change password");

    return { success: true, message: "Password changed successfully." };
  }

  // ============================================================================
  // WORKFLOW ENDPOINTS
  // ============================================================================

  async getWorkflows(
    limit: number = 50,
    offset: number = 0,
  ): Promise<WorkflowListResponse> {
    return this.request<WorkflowListResponse>(
      `/api/workflows?limit=${limit}&offset=${offset}`,
    );
  }

  async getWorkflow(id: string): Promise<WorkflowResponse> {
    return this.request<WorkflowResponse>(`/api/workflows/${id}`);
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request(`/api/workflows/${id}`, {
      method: "DELETE",
    });
  }

  async updateWorkflow(
    id: string,
    data: import("./types").UpdateWorkflowRequest,
  ): Promise<import("./types").WorkflowResponse> {
    return this.request<import("./types").WorkflowResponse>(
      `/api/workflows/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
  }

  // ============================================================================
  // STEP ENDPOINTS
  // ============================================================================

  async getStep(id: number): Promise<import("./types").StepResponse> {
    return this.request<import("./types").StepResponse>(`/api/steps/${id}`);
  }

  async updateStep(
    id: number,
    data: import("./types").UpdateStepRequest,
  ): Promise<import("./types").StepResponse> {
    return this.request<import("./types").StepResponse>(`/api/steps/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteStep(id: number): Promise<void> {
    await this.request<void>(`/api/steps/${id}`, {
      method: "DELETE",
    });
  }

  async reorderSteps(
    workflowId: number,
    stepOrder: number[],
  ): Promise<import("./types").WorkflowResponse> {
    return this.request<import("./types").WorkflowResponse>(
      `/api/workflows/${workflowId}/steps/reorder`,
      {
        method: "PATCH",
        body: JSON.stringify({ step_order: stepOrder }),
      },
    );
  }

  // ============================================================================
  // SLACK INTEGRATION ENDPOINTS
  // ============================================================================

  async getSlackSettings(): Promise<SlackSettingsResponse> {
    return this.request<SlackSettingsResponse>("/api/companies/me/slack");
  }

  async updateSlackSettings(
    settings: SlackSettingsRequest,
  ): Promise<SlackSettingsResponse> {
    return this.request<SlackSettingsResponse>("/api/companies/me/slack", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  }

  async testSlackWebhook(): Promise<SlackTestResponse> {
    return this.request<SlackTestResponse>("/api/companies/me/slack/test", {
      method: "POST",
    });
  }
}

export const apiClient = new ApiClient();
