/**
 * API Client for Dashboard
 * Handles authentication, requests, and error handling
 */

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
  TeamMemberResponse,
  UpdateMemberRoleRequest,
  UpdateMemberStatusRequest,
  InviteCreateRequest,
  InviteResponse,
  InviteListResponse,
  InviteVerifyResponse,
  NotificationListResponse,
  NotificationResponse,
  HealthLogListResponse,
  HealthStatsResponse,
  SlackSettingsRequest,
  SlackSettingsResponse,
  SlackTestResponse,
} from "./types";
import { API_URL } from "@/config";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
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

    // Merge existing headers
    if (options.headers) {
      const existingHeaders = new Headers(options.headers);
      existingHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    }

    // Add auth token if available
    const token = this.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
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
    const response = await this.request<TokenResponse>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });

    this.setToken(response.access_token);
    localStorage.setItem("user_data", JSON.stringify(response.user));

    return response;
  }

  async login(data: LoginRequest): Promise<TokenResponse> {
    const response = await this.request<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });

    this.setToken(response.access_token);
    localStorage.setItem("user_data", JSON.stringify(response.user));

    return response;
  }

  logout(): void {
    this.clearToken();
  }

  async getCurrentUser(): Promise<TokenResponse["user"] | null> {
    const token = this.getToken();
    if (!token) return null;

    // Try to get cached user data first
    const cachedUser = localStorage.getItem("user_data");
    if (cachedUser) {
      try {
        return JSON.parse(cachedUser);
      } catch {
        // Invalid cached data, fetch from server
      }
    }

    // Fetch from server
    try {
      const response = await this.request<{ user: TokenResponse["user"] }>(
        "/api/auth/me",
      );
      localStorage.setItem("user_data", JSON.stringify(response.user));
      return response.user;
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
    const response = await this.request<UserResponse>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });

    // Update cached user data
    localStorage.setItem("user_data", JSON.stringify(response));

    return response;
  }

  /**
   * Change current user's password
   * Requires current password verification
   */
  async changePassword(
    data: ChangePasswordRequest,
  ): Promise<ChangePasswordResponse> {
    return this.request<ChangePasswordResponse>(
      "/api/users/me/change-password",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
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

  async getWorkflow(id: number): Promise<WorkflowResponse> {
    return this.request<WorkflowResponse>(`/api/workflows/${id}`);
  }

  async deleteWorkflow(id: number): Promise<void> {
    await this.request(`/api/workflows/${id}`, {
      method: "DELETE",
    });
  }

  async updateWorkflow(
    id: number,
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
  // COMPANY ENDPOINTS
  // ============================================================================

  async getCompany(): Promise<import("./types").CompanyResponse> {
    return this.request<import("./types").CompanyResponse>("/api/companies/me");
  }

  async updateCompany(
    data: import("./types").UpdateCompanyRequest,
  ): Promise<import("./types").CompanyResponse> {
    return this.request<import("./types").CompanyResponse>(
      "/api/companies/me",
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    );
  }

  async getTeamMembers(): Promise<TeamMemberResponse[]> {
    return this.request<TeamMemberResponse[]>("/api/companies/me/members");
  }

  async removeTeamMember(userId: number): Promise<void> {
    await this.request<void>(`/api/companies/me/members/${userId}`, {
      method: "DELETE",
    });
  }

  async updateMemberRole(
    userId: number,
    data: UpdateMemberRoleRequest,
  ): Promise<TeamMemberResponse> {
    return this.request<TeamMemberResponse>(
      `/api/companies/me/members/${userId}/role`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
  }

  async updateMemberStatus(
    userId: number,
    data: UpdateMemberStatusRequest,
  ): Promise<TeamMemberResponse> {
    return this.request<TeamMemberResponse>(
      `/api/companies/me/members/${userId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      },
    );
  }

  /**
   * Get company name from invite token (public endpoint - no auth required)
   */
  async getInviteInfo(
    token: string,
  ): Promise<import("./types").InviteInfoResponse> {
    return this.request<import("./types").InviteInfoResponse>(
      `/api/companies/invite/${token}`,
    );
  }

  // ============================================================================
  // INVITE ENDPOINTS
  // ============================================================================

  async listInvites(): Promise<InviteListResponse> {
    return this.request<InviteListResponse>("/api/invites/me/invites");
  }

  async createInvite(data: InviteCreateRequest): Promise<InviteResponse> {
    return this.request<InviteResponse>("/api/invites/me/invites", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revokeInvite(inviteId: number): Promise<void> {
    await this.request<void>(`/api/invites/me/invites/${inviteId}`, {
      method: "DELETE",
    });
  }

  async verifyInvite(token: string): Promise<InviteVerifyResponse> {
    return this.request<InviteVerifyResponse>(`/api/invites/verify/${token}`);
  }

  // ============================================================================
  // NOTIFICATION ENDPOINTS
  // ============================================================================

  async getNotifications(params?: {
    read?: boolean;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<NotificationListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.read !== undefined)
      searchParams.set("read", String(params.read));
    if (params?.type) searchParams.set("type", params.type);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));

    const queryString = searchParams.toString();
    return this.request<NotificationListResponse>(
      `/api/notifications${queryString ? `?${queryString}` : ""}`,
    );
  }

  async markNotificationRead(id: number): Promise<NotificationResponse> {
    return this.request<NotificationResponse>(`/api/notifications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    });
  }

  async markAllNotificationsRead(
    notificationIds?: number[],
  ): Promise<{ marked_count: number }> {
    return this.request<{ marked_count: number }>(
      "/api/notifications/mark-all-read",
      {
        method: "POST",
        body: JSON.stringify({ notification_ids: notificationIds }),
      },
    );
  }

  async deleteNotification(id: number): Promise<void> {
    await this.request<void>(`/api/notifications/${id}`, {
      method: "DELETE",
    });
  }

  // ============================================================================
  // HEALTH DASHBOARD ENDPOINTS
  // ============================================================================

  async getHealthLogs(params?: {
    workflow_id?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<HealthLogListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.workflow_id)
      searchParams.set("workflow_id", String(params.workflow_id));
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));

    const queryString = searchParams.toString();
    return this.request<HealthLogListResponse>(
      `/api/health/logs${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getHealthStats(days: number = 7): Promise<HealthStatsResponse> {
    return this.request<HealthStatsResponse>(`/api/health/stats?days=${days}`);
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
