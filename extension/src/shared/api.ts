/**
 * API Client for Workflow Automation Platform
 *
 * Provides type-safe methods for making authenticated requests to the backend API.
 * Automatically handles JWT token injection, error handling, and retries.
 *
 * FE-002: Shared Types & API Client
 */

import type {
  SignupRequest,
  LoginRequest,
  TokenResponse,
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  UpdateWorkflowRequest,
  WorkflowResponse,
  WorkflowListResponse,
  ScreenshotResponse,
  ApiError,
} from './types';
import { getToken, saveToken, clearAuthState } from './storage';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_CONFIG = {
  baseUrl: process.env.API_BASE_URL || 'http://localhost:8000',
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * Parse API error response
 */
async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const error = await response.json();
    return error as ApiError;
  } catch {
    return {
      detail: response.statusText || 'Unknown error',
      status: response.status,
    };
  }
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  isMultipart?: boolean;
}

/**
 * Make HTTP request with automatic auth token injection
 */
async function makeRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    requiresAuth = true,
    isMultipart = false,
  } = options;

  // Build URL
  const url = `${API_CONFIG.baseUrl}${endpoint}`;

  // Build headers
  const requestHeaders: Record<string, string> = { ...headers };

  // Add auth token if required
  if (requiresAuth) {
    const token = await getToken();
    if (!token) {
      throw new ApiClientError('Not authenticated', 401);
    }
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Add Content-Type for JSON (not for multipart)
  if (!isMultipart && body && method !== 'GET') {
    requestHeaders['Content-Type'] = 'application/json';
  }

  // Build request body
  let requestBody: string | FormData | undefined;
  if (body) {
    if (isMultipart) {
      requestBody = body as FormData;
    } else if (method !== 'GET') {
      requestBody = JSON.stringify(body);
    }
  }

  // Make request with retries
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < API_CONFIG.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle error responses
      if (!response.ok) {
        const error = await parseErrorResponse(response);
        const errorMessage =
          typeof error.detail === 'string'
            ? error.detail
            : 'Request failed';

        // Don't retry auth errors
        if (response.status === 401 || response.status === 403) {
          if (response.status === 401) {
            // Clear auth state on 401
            await clearAuthState();
          }
          throw new ApiClientError(errorMessage, response.status, error.detail);
        }

        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new ApiClientError(errorMessage, response.status, error.detail);
        }

        // Retry server errors (5xx) and network errors
        lastError = new ApiClientError(errorMessage, response.status, error.detail);
        await sleep(API_CONFIG.retryDelay * Math.pow(2, attempt));
        continue;
      }

      // Parse response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return (await response.json()) as T;
      }

      // Return empty object for 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.text()) as unknown as T;
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }

      // Network error or timeout - retry
      lastError = error as Error;
      if (attempt < API_CONFIG.maxRetries - 1) {
        await sleep(API_CONFIG.retryDelay * Math.pow(2, attempt));
        continue;
      }
    }
  }

  // All retries failed
  throw new ApiClientError(
    lastError?.message || 'Network request failed',
    undefined,
    lastError
  );
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// API CLIENT
// ============================================================================

export class ApiClient {
  // ==========================================================================
  // AUTHENTICATION
  // ==========================================================================

  /**
   * Sign up a new user
   */
  async signup(request: SignupRequest): Promise<TokenResponse> {
    const response = await makeRequest<TokenResponse>('/api/auth/signup', {
      method: 'POST',
      body: request,
      requiresAuth: false,
    });

    // Save token to storage
    await saveToken(response.access_token, response.user);

    return response;
  }

  /**
   * Log in an existing user
   */
  async login(request: LoginRequest): Promise<TokenResponse> {
    const response = await makeRequest<TokenResponse>('/api/auth/login', {
      method: 'POST',
      body: request,
      requiresAuth: false,
    });

    // Save token to storage
    await saveToken(response.access_token, response.user);

    return response;
  }

  /**
   * Log out current user
   */
  async logout(): Promise<void> {
    await clearAuthState();
  }

  // ==========================================================================
  // WORKFLOWS
  // ==========================================================================

  /**
   * Create a new workflow with steps
   */
  async createWorkflow(
    request: CreateWorkflowRequest
  ): Promise<CreateWorkflowResponse> {
    return makeRequest<CreateWorkflowResponse>('/api/workflows', {
      method: 'POST',
      body: request,
    });
  }

  /**
   * List workflows with pagination
   */
  async listWorkflows(params?: {
    limit?: number;
    offset?: number;
    status?: string;
    tags?: string[];
  }): Promise<WorkflowListResponse> {
    const queryParams = new URLSearchParams();

    if (params?.limit !== undefined) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.offset !== undefined) {
      queryParams.append('offset', params.offset.toString());
    }
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    if (params?.tags && params.tags.length > 0) {
      params.tags.forEach((tag) => queryParams.append('tags', tag));
    }

    const query = queryParams.toString();
    const endpoint = query ? `/api/workflows?${query}` : '/api/workflows';

    return makeRequest<WorkflowListResponse>(endpoint, {
      method: 'GET',
    });
  }

  /**
   * Get a single workflow by ID (includes steps)
   */
  async getWorkflow(workflowId: number): Promise<WorkflowResponse> {
    return makeRequest<WorkflowResponse>(`/api/workflows/${workflowId}`, {
      method: 'GET',
    });
  }

  /**
   * Update workflow metadata
   */
  async updateWorkflow(
    workflowId: number,
    request: UpdateWorkflowRequest
  ): Promise<WorkflowResponse> {
    return makeRequest<WorkflowResponse>(`/api/workflows/${workflowId}`, {
      method: 'PUT',
      body: request,
    });
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: number): Promise<void> {
    return makeRequest<void>(`/api/workflows/${workflowId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================================================
  // SCREENSHOTS
  // ==========================================================================

  /**
   * Upload a screenshot
   */
  async uploadScreenshot(
    imageBlob: Blob,
    workflowId: number,
    stepId?: string
  ): Promise<ScreenshotResponse> {
    const formData = new FormData();
    formData.append('image', imageBlob, 'screenshot.jpg'); // Backend expects 'image', not 'file'
    formData.append('workflow_id', workflowId.toString());
    if (stepId) {
      formData.append('step_id', stepId);
    }

    return makeRequest<ScreenshotResponse>('/api/screenshots', {
      method: 'POST',
      body: formData,
      isMultipart: true,
    });
  }

  // ==========================================================================
  // STEPS
  // ==========================================================================

  /**
   * Link screenshot to step
   * Called after screenshot upload to associate screenshot_id with step
   */
  async linkScreenshotToStep(
    stepId: number,
    screenshotId: number
  ): Promise<void> {
    return makeRequest<void>(`/api/steps/${stepId}/screenshot?screenshot_id=${screenshotId}`, {
      method: 'PATCH',
    });
  }

  /**
   * Start AI processing for workflow
   * Called after all screenshots are uploaded and linked
   */
  async startWorkflowProcessing(workflowId: number): Promise<{
    task_id: string;
    workflow_id: number;
    message: string;
    status: string;
  }> {
    return makeRequest<{
      task_id: string;
      workflow_id: number;
      message: string;
      status: string;
    }>(`/api/workflows/${workflowId}/start-processing`, {
      method: 'POST',
    });
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Check API health
   */
  async healthCheck(): Promise<{ status: string }> {
    return makeRequest<{ status: string }>('/api/health', {
      method: 'GET',
      requiresAuth: false,
    });
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton API client instance
 */
export const apiClient = new ApiClient();

/**
 * Export for testing
 */
export { makeRequest };
