/**
 * Tests for API Client
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApiClient, ApiClientError } from './api';
import { saveToken, clearAuthState } from './storage';
import { mockFetch, resetChromeStorage } from '../test/setup';
import type {
  TokenResponse,
  UserResponse,
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  WorkflowListResponse,
  WorkflowResponse,
} from './types';

describe('ApiClient', () => {
  let client: ApiClient;

  const mockUser: UserResponse = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin',
    company_id: 1,
    company_name: 'Test Company',
    created_at: '2025-11-20T00:00:00Z',
    last_login_at: null,
  };

  beforeEach(() => {
    client = new ApiClient();
    resetChromeStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    describe('signup', () => {
      it('should sign up a new user', async () => {
        const response: TokenResponse = {
          access_token: 'test-token',
          token_type: 'bearer',
          user: mockUser,
        };

        mockFetch(response);

        const result = await client.signup({
          email: 'test@example.com',
          password: 'Password123',
          name: 'Test User',
          company_name: 'Test Company',
        });

        expect(result).toEqual(response);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/auth/signup'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          })
        );

        // Verify token was saved
        const { getToken } = await import('./storage');
        const savedToken = await getToken();
        expect(savedToken).toBe('test-token');
      });

      it('should handle signup errors', async () => {
        mockFetch(
          { detail: 'Email already exists' },
          { ok: false, status: 400 }
        );

        await expect(
          client.signup({
            email: 'test@example.com',
            password: 'Password123',
            name: 'Test User',
          })
        ).rejects.toThrow(ApiClientError);
      });
    });

    describe('login', () => {
      it('should log in a user', async () => {
        const response: TokenResponse = {
          access_token: 'test-token',
          token_type: 'bearer',
          user: mockUser,
        };

        mockFetch(response);

        const result = await client.login({
          email: 'test@example.com',
          password: 'Password123',
        });

        expect(result).toEqual(response);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/auth/login'),
          expect.objectContaining({
            method: 'POST',
          })
        );

        // Verify token was saved
        const { getToken } = await import('./storage');
        const savedToken = await getToken();
        expect(savedToken).toBe('test-token');
      });

      it('should handle invalid credentials', async () => {
        mockFetch(
          { detail: 'Invalid email or password' },
          { ok: false, status: 401 }
        );

        await expect(
          client.login({
            email: 'test@example.com',
            password: 'WrongPassword',
          })
        ).rejects.toThrow(ApiClientError);
      });
    });

    describe('logout', () => {
      it('should clear auth state', async () => {
        await saveToken('test-token', mockUser);

        await client.logout();

        const { getToken } = await import('./storage');
        const token = await getToken();
        expect(token).toBeNull();
      });
    });
  });

  describe('Workflows', () => {
    beforeEach(async () => {
      // Set up authenticated state
      await saveToken('test-token', mockUser);
    });

    describe('createWorkflow', () => {
      it('should create a new workflow', async () => {
        const request: CreateWorkflowRequest = {
          name: 'Test Workflow',
          description: 'Test description',
          starting_url: 'https://example.com',
          tags: ['test'],
          steps: [
            {
              step_number: 1,
              action_type: 'click',
              selectors: { primary: '#button' },
              element_meta: { tag_name: 'BUTTON' },
              page_context: { url: 'https://example.com' },
            },
          ],
        };

        const response: CreateWorkflowResponse = {
          workflow_id: 123,
          status: 'processing',
        };

        mockFetch(response);

        const result = await client.createWorkflow(request);

        expect(result).toEqual(response);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/workflows'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
              'Content-Type': 'application/json',
            }),
          })
        );
      });

      it('should reject request if not authenticated', async () => {
        await clearAuthState();

        const request: CreateWorkflowRequest = {
          name: 'Test Workflow',
          starting_url: 'https://example.com',
          steps: [],
        };

        await expect(client.createWorkflow(request)).rejects.toThrow(
          'Not authenticated'
        );
      });
    });

    describe('listWorkflows', () => {
      it('should list workflows', async () => {
        const response: WorkflowListResponse = {
          total: 1,
          limit: 10,
          offset: 0,
          workflows: [
            {
              id: 123,
              company_id: 1,
              created_by: 1,
              name: 'Test Workflow',
              description: null,
              starting_url: 'https://example.com',
              tags: ['test'],
              status: 'active',
              success_rate: 0.95,
              total_uses: 10,
              consecutive_failures: 0,
              created_at: '2025-11-20T00:00:00Z',
              updated_at: '2025-11-20T00:00:00Z',
              last_successful_run: null,
              last_failed_run: null,
              step_count: 5,
            },
          ],
        };

        mockFetch(response);

        const result = await client.listWorkflows({ limit: 10, offset: 0 });

        expect(result).toEqual(response);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/workflows?limit=10&offset=0'),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          })
        );
      });

      it('should list workflows with filters', async () => {
        const response: WorkflowListResponse = {
          total: 1,
          limit: 10,
          offset: 0,
          workflows: [],
        };

        mockFetch(response);

        await client.listWorkflows({
          status: 'active',
          tags: ['finance', 'hr'],
        });

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringMatching(/status=active/),
          expect.any(Object)
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringMatching(/tags=finance/),
          expect.any(Object)
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringMatching(/tags=hr/),
          expect.any(Object)
        );
      });
    });

    describe('getWorkflow', () => {
      it('should get a single workflow', async () => {
        const response: WorkflowResponse = {
          id: 123,
          company_id: 1,
          created_by: 1,
          name: 'Test Workflow',
          description: 'Test description',
          starting_url: 'https://example.com',
          tags: ['test'],
          status: 'active',
          success_rate: 0.95,
          total_uses: 10,
          consecutive_failures: 0,
          created_at: '2025-11-20T00:00:00Z',
          updated_at: '2025-11-20T00:00:00Z',
          last_successful_run: null,
          last_failed_run: null,
          steps: [],
          step_count: 5,
        };

        mockFetch(response);

        const result = await client.getWorkflow(123);

        expect(result).toEqual(response);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/workflows/123'),
          expect.objectContaining({
            method: 'GET',
          })
        );
      });

      it('should handle 404 for non-existent workflow', async () => {
        mockFetch({ detail: 'Workflow not found' }, { ok: false, status: 404 });

        await expect(client.getWorkflow(999)).rejects.toThrow(ApiClientError);
      });
    });

    describe('updateWorkflow', () => {
      it('should update workflow metadata', async () => {
        const response: WorkflowResponse = {
          id: 123,
          company_id: 1,
          created_by: 1,
          name: 'Updated Workflow',
          description: 'Updated description',
          starting_url: 'https://example.com',
          tags: ['updated'],
          status: 'active',
          success_rate: 0.95,
          total_uses: 10,
          consecutive_failures: 0,
          created_at: '2025-11-20T00:00:00Z',
          updated_at: '2025-11-20T01:00:00Z',
          last_successful_run: null,
          last_failed_run: null,
          steps: [],
          step_count: 5,
        };

        mockFetch(response);

        const result = await client.updateWorkflow(123, {
          name: 'Updated Workflow',
          description: 'Updated description',
        });

        expect(result).toEqual(response);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/workflows/123'),
          expect.objectContaining({
            method: 'PUT',
          })
        );
      });
    });

    describe('deleteWorkflow', () => {
      it('should delete a workflow', async () => {
        mockFetch({}, { status: 204 });

        await client.deleteWorkflow(123);

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/workflows/123'),
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });
  });

  describe('Screenshots', () => {
    beforeEach(async () => {
      await saveToken('test-token', mockUser);
    });

    describe('uploadScreenshot', () => {
      it('should upload a screenshot', async () => {
        const response = {
          screenshot_id: 456,
          storage_url: 'https://s3.amazonaws.com/bucket/screenshot.jpg',
          storage_key: 'companies/1/workflows/123/screenshots/456.jpg',
          hash: 'sha256:abc123',
          file_size: 12345,
          width: 1920,
          height: 1080,
          format: 'jpeg',
          created_at: '2025-11-20T00:00:00Z',
          deduplicated: false,
        };

        mockFetch(response);

        const blob = new Blob(['fake-image-data'], { type: 'image/jpeg' });
        const result = await client.uploadScreenshot(blob, 123, 'temp-step-1');

        expect(result).toEqual(response);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/screenshots'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-token',
            }),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await saveToken('test-token', mockUser);
    });

    it('should clear auth state on 401 error', async () => {
      mockFetch({ detail: 'Unauthorized' }, { ok: false, status: 401 });

      await expect(client.listWorkflows()).rejects.toThrow(ApiClientError);

      // Verify auth was cleared
      const { getToken } = await import('./storage');
      const token = await getToken();
      expect(token).toBeNull();
    });

    it('should not retry on 4xx client errors', async () => {
      mockFetch(
        { detail: 'Bad request' },
        { ok: false, status: 400 }
      );

      await expect(
        client.createWorkflow({
          name: '',
          starting_url: 'invalid',
          steps: [],
        })
      ).rejects.toThrow(ApiClientError);

      // Should only call once (no retries for client errors)
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors with retries', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error')));

      await expect(client.listWorkflows()).rejects.toThrow();

      // Should retry 3 times
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Health Check', () => {
    it('should check API health', async () => {
      const response = { status: 'ok' };
      mockFetch(response);

      const result = await client.healthCheck();

      expect(result).toEqual(response);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/health'),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });
  });
});
