/**
 * Authentication store using Zustand
 * Manages user state and auth operations
 */

import { create } from "zustand";
import { apiClient } from "@/api/client";
import type {
  UserResponse,
  LoginRequest,
  SignupRequest,
  UpdateProfileRequest,
} from "@/api/types";

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
  updateProfile: (data: UpdateProfileRequest) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true, // Start true - assume we need to check auth on load
  error: null,

  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.login(data);
      set({ user: response.user, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed";
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
      const message = error instanceof Error ? error.message : "Signup failed";
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

  updateProfile: async (data: UpdateProfileRequest) => {
    try {
      const updatedUser = await apiClient.updateProfile(data);
      set({ user: updatedUser });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Profile update failed";
      set({ error: message });
      throw error;
    }
  },
}));
