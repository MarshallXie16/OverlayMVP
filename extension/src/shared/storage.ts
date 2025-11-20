/**
 * Chrome Storage Utilities
 *
 * Provides type-safe wrappers around chrome.storage.local for persisting
 * authentication tokens, user data, and recording state.
 *
 * FE-002: Shared Types & API Client
 */

import type { AuthState, RecordingState, UserResponse } from './types';

// Storage keys
const STORAGE_KEYS = {
  AUTH: 'auth_state',
  RECORDING: 'recording_state',
} as const;

// ============================================================================
// AUTH STORAGE
// ============================================================================

/**
 * Save authentication state to chrome.storage.local
 */
export async function saveAuthState(authState: AuthState): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEYS.AUTH]: authState }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get authentication state from chrome.storage.local
 */
export async function getAuthState(): Promise<AuthState | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS.AUTH, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve((result[STORAGE_KEYS.AUTH] as AuthState) || null);
      }
    });
  });
}

/**
 * Clear authentication state from chrome.storage.local
 */
export async function clearAuthState(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(STORAGE_KEYS.AUTH, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Save JWT token to storage
 */
export async function saveToken(
  token: string,
  user: UserResponse,
  expiresInDays: number = 7
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const authState: AuthState = {
    token,
    user,
    expiresAt: expiresAt.toISOString(),
  };

  await saveAuthState(authState);
}

/**
 * Get JWT token from storage
 * Returns null if token doesn't exist or is expired
 */
export async function getToken(): Promise<string | null> {
  const authState = await getAuthState();

  if (!authState || !authState.token) {
    return null;
  }

  // Check if token is expired
  if (authState.expiresAt) {
    const expiresAt = new Date(authState.expiresAt);
    const now = new Date();
    if (now >= expiresAt) {
      // Token expired, clear it
      await clearAuthState();
      return null;
    }
  }

  return authState.token;
}

/**
 * Get current authenticated user from storage
 */
export async function getCurrentUser(): Promise<UserResponse | null> {
  const authState = await getAuthState();

  if (!authState || !authState.user) {
    return null;
  }

  // Check if token is expired
  if (authState.expiresAt) {
    const expiresAt = new Date(authState.expiresAt);
    const now = new Date();
    if (now >= expiresAt) {
      // Token expired, clear it
      await clearAuthState();
      return null;
    }
  }

  return authState.user;
}

/**
 * Check if user is currently authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return token !== null;
}

// ============================================================================
// RECORDING STORAGE
// ============================================================================

/**
 * Save recording state to chrome.storage.local
 */
export async function saveRecordingState(
  recordingState: RecordingState
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEYS.RECORDING]: recordingState }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Get recording state from chrome.storage.local
 */
export async function getRecordingState(): Promise<RecordingState | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEYS.RECORDING, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve((result[STORAGE_KEYS.RECORDING] as RecordingState) || null);
      }
    });
  });
}

/**
 * Clear recording state from chrome.storage.local
 */
export async function clearRecordingState(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(STORAGE_KEYS.RECORDING, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Initialize empty recording state
 */
export function createEmptyRecordingState(): RecordingState {
  return {
    isRecording: false,
    workflowId: null,
    workflowName: null,
    startingUrl: null,
    steps: [],
    currentStepNumber: 0,
  };
}

// ============================================================================
// STORAGE LISTENERS
// ============================================================================

/**
 * Listen for changes to auth state
 */
export function onAuthStateChanged(
  callback: (authState: AuthState | null) => void
): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.AUTH]) {
      const newValue = changes[STORAGE_KEYS.AUTH].newValue as AuthState | undefined;
      callback(newValue || null);
    }
  });
}

/**
 * Listen for changes to recording state
 */
export function onRecordingStateChanged(
  callback: (recordingState: RecordingState | null) => void
): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEYS.RECORDING]) {
      const newValue = changes[STORAGE_KEYS.RECORDING].newValue as
        | RecordingState
        | undefined;
      callback(newValue || null);
    }
  });
}
