/**
 * Authentication Store
 * Manages user authentication state with Zustand
 *
 * FE-004: Popup UI (Login/Recording Controls)
 */

import { create } from 'zustand';
import type { UserResponse } from '@/shared/types';
import { apiClient } from '@/shared/api';
import { getCurrentUser, clearAuthState } from '@/shared/storage';

interface AuthState {
  user: UserResponse | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  // Initial state
  user: null,
  isLoading: false,
  error: null,

  // Actions
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.login({ email, password });
      set({ user: response.user, isLoading: false, error: null });
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed. Please try again.';
      set({ user: null, isLoading: false, error: errorMessage });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });
    try {
      await apiClient.logout();
      set({ user: null, isLoading: false, error: null });
    } catch (error: any) {
      // Even if logout API fails, clear local state
      await clearAuthState();
      set({ user: null, isLoading: false, error: null });
    }
  },

  checkAuth: async () => {
    set({ isLoading: true, error: null });
    try {
      const user = await getCurrentUser();
      set({ user, isLoading: false, error: null });
    } catch (error: any) {
      set({ user: null, isLoading: false, error: null });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
