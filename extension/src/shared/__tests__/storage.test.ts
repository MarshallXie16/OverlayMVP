/**
 * Tests for Chrome Storage Utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveAuthState,
  getAuthState,
  clearAuthState,
  saveToken,
  getToken,
  getCurrentUser,
  isAuthenticated,
  saveRecordingState,
  getRecordingState,
  clearRecordingState,
  createEmptyRecordingState,
  onAuthStateChanged,
  onRecordingStateChanged,
} from './storage';
import type { AuthState, UserResponse, RecordingState } from './types';
import { resetChromeStorage } from '../test/setup';

describe('Auth Storage', () => {
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
    resetChromeStorage();
  });

  describe('saveAuthState', () => {
    it('should save auth state to chrome.storage', async () => {
      const authState: AuthState = {
        token: 'test-token',
        user: mockUser,
        expiresAt: '2025-11-27T00:00:00Z',
      };

      await saveAuthState(authState);

      const result = await getAuthState();
      expect(result).toEqual(authState);
    });
  });

  describe('getAuthState', () => {
    it('should return null when no auth state exists', async () => {
      const result = await getAuthState();
      expect(result).toBeNull();
    });

    it('should retrieve saved auth state', async () => {
      const authState: AuthState = {
        token: 'test-token',
        user: mockUser,
        expiresAt: '2025-11-27T00:00:00Z',
      };

      await saveAuthState(authState);
      const result = await getAuthState();

      expect(result).toEqual(authState);
    });
  });

  describe('clearAuthState', () => {
    it('should clear auth state from storage', async () => {
      const authState: AuthState = {
        token: 'test-token',
        user: mockUser,
        expiresAt: '2025-11-27T00:00:00Z',
      };

      await saveAuthState(authState);
      await clearAuthState();

      const result = await getAuthState();
      expect(result).toBeNull();
    });
  });

  describe('saveToken', () => {
    it('should save token with user and expiration date', async () => {
      await saveToken('test-token', mockUser, 7);

      const authState = await getAuthState();
      expect(authState).toBeTruthy();
      expect(authState?.token).toBe('test-token');
      expect(authState?.user).toEqual(mockUser);
      expect(authState?.expiresAt).toBeTruthy();

      // Check expiration is 7 days from now
      const expiresAt = new Date(authState!.expiresAt!);
      const now = new Date();
      const daysDiff = Math.floor(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBeGreaterThanOrEqual(6);
      expect(daysDiff).toBeLessThanOrEqual(7);
    });
  });

  describe('getToken', () => {
    it('should return null when no token exists', async () => {
      const token = await getToken();
      expect(token).toBeNull();
    });

    it('should return valid token', async () => {
      await saveToken('test-token', mockUser, 7);

      const token = await getToken();
      expect(token).toBe('test-token');
    });

    it('should return null for expired token', async () => {
      const authState: AuthState = {
        token: 'test-token',
        user: mockUser,
        expiresAt: '2020-01-01T00:00:00Z', // Past date
      };

      await saveAuthState(authState);

      const token = await getToken();
      expect(token).toBeNull();

      // Verify auth state was cleared
      const clearedState = await getAuthState();
      expect(clearedState).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('should return null when no user exists', async () => {
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('should return current user', async () => {
      await saveToken('test-token', mockUser, 7);

      const user = await getCurrentUser();
      expect(user).toEqual(mockUser);
    });

    it('should return null for expired token', async () => {
      const authState: AuthState = {
        token: 'test-token',
        user: mockUser,
        expiresAt: '2020-01-01T00:00:00Z', // Past date
      };

      await saveAuthState(authState);

      const user = await getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when not authenticated', async () => {
      const authenticated = await isAuthenticated();
      expect(authenticated).toBe(false);
    });

    it('should return true when authenticated', async () => {
      await saveToken('test-token', mockUser, 7);

      const authenticated = await isAuthenticated();
      expect(authenticated).toBe(true);
    });

    it('should return false for expired token', async () => {
      const authState: AuthState = {
        token: 'test-token',
        user: mockUser,
        expiresAt: '2020-01-01T00:00:00Z', // Past date
      };

      await saveAuthState(authState);

      const authenticated = await isAuthenticated();
      expect(authenticated).toBe(false);
    });
  });
});

describe('Recording Storage', () => {
  beforeEach(() => {
    resetChromeStorage();
  });

  describe('saveRecordingState', () => {
    it('should save recording state to chrome.storage', async () => {
      const recordingState: RecordingState = {
        isRecording: true,
        workflowId: 123,
        workflowName: 'Test Workflow',
        startingUrl: 'https://example.com',
        steps: [],
        currentStepNumber: 1,
      };

      await saveRecordingState(recordingState);

      const result = await getRecordingState();
      expect(result).toEqual(recordingState);
    });
  });

  describe('getRecordingState', () => {
    it('should return null when no recording state exists', async () => {
      const result = await getRecordingState();
      expect(result).toBeNull();
    });

    it('should retrieve saved recording state', async () => {
      const recordingState: RecordingState = {
        isRecording: false,
        workflowId: null,
        workflowName: null,
        startingUrl: null,
        steps: [],
        currentStepNumber: 0,
      };

      await saveRecordingState(recordingState);
      const result = await getRecordingState();

      expect(result).toEqual(recordingState);
    });
  });

  describe('clearRecordingState', () => {
    it('should clear recording state from storage', async () => {
      const recordingState = createEmptyRecordingState();
      recordingState.isRecording = true;
      recordingState.workflowId = 123;

      await saveRecordingState(recordingState);
      await clearRecordingState();

      const result = await getRecordingState();
      expect(result).toBeNull();
    });
  });

  describe('createEmptyRecordingState', () => {
    it('should create empty recording state', () => {
      const state = createEmptyRecordingState();

      expect(state).toEqual({
        isRecording: false,
        workflowId: null,
        workflowName: null,
        startingUrl: null,
        steps: [],
        currentStepNumber: 0,
      });
    });
  });
});

describe('Storage Listeners', () => {
  beforeEach(() => {
    resetChromeStorage();
  });

  it('should register auth state change listener', () => {
    const callback = vi.fn();

    onAuthStateChanged(callback);

    expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
  });

  it('should register recording state change listener', () => {
    const callback = vi.fn();

    onRecordingStateChanged(callback);

    expect(chrome.storage.onChanged.addListener).toHaveBeenCalled();
  });
});
