/**
 * Authentication store using Zustand
 * Manages user state and auth operations
 */

import { create } from 'zustand';
import { apiClient } from '@/api/client';
import type { UserResponse, LoginRequest, SignupRequest } from '@/api/types';

interface AuthState {
  user: UserResponse | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.login(data);
      set({ user: response.user, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  signup: async (data: SignupRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.signup(data);
      set({ user: response.user, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  logout: () => {
    apiClient.logout();
    set({ user: null, error: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const user = await apiClient.getCurrentUser();
      set({ user, isLoading: false });
    } catch (error) {
      set({ user: null, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
