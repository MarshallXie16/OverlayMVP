/**
 * Recording Store
 * Manages workflow recording state with Zustand
 *
 * FE-004: Popup UI (Login/Recording Controls)
 */

import { create } from 'zustand';
import type { WorkflowListItem } from '@/shared/types';
import { apiClient } from '@/shared/api';

interface RecordingState {
  isRecording: boolean;
  workflowName: string;
  workflows: WorkflowListItem[];
  isLoading: boolean;
  error: string | null;
}

interface RecordingActions {
  setWorkflowName: (name: string) => void;
  startRecording: (name: string) => Promise<void>;
  stopRecording: () => Promise<void>;
  fetchWorkflows: () => Promise<void>;
  clearError: () => void;
}

type RecordingStore = RecordingState & RecordingActions;

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  // Initial state
  isRecording: false,
  workflowName: '',
  workflows: [],
  isLoading: false,
  error: null,

  // Actions
  setWorkflowName: (name: string) => {
    set({ workflowName: name });
  },

  startRecording: async (name: string) => {
    const workflowName = name.trim();
    set({ isLoading: true, error: null });
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const startingUrl = activeTab?.url;

      if (!startingUrl) {
        throw new Error('Please start recording from an open webpage tab.');
      }

      // Send message to background worker to start recording
      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        payload: { workflowName, startingUrl },
      });

      const responsePayload = response?.payload ?? response;
      const success = responsePayload?.success === true;

      if (success) {
        set({
          isRecording: true,
          workflowName,
          isLoading: false,
          error: null
        });
      } else {
        const errorMessage =
          responsePayload?.error ||
          response?.error ||
          'Failed to start recording';
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to start recording';
      set({ isRecording: false, isLoading: false, error: errorMessage });
      throw error;
    }
  },

  stopRecording: async () => {
    set({ isLoading: true, error: null });
    try {
      // Send message to background worker to stop recording
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
      });

      if (response?.success) {
        set({
          isRecording: false,
          workflowName: '',
          isLoading: false,
          error: null
        });

        // Refresh workflow list after stopping
        await get().fetchWorkflows();
      } else {
        throw new Error(response?.error || 'Failed to stop recording');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to stop recording';
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  fetchWorkflows: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiClient.listWorkflows({
        limit: 5,
        offset: 0
      });
      set({
        workflows: response.workflows,
        isLoading: false,
        error: null
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to load workflows';
      set({ workflows: [], isLoading: false, error: errorMessage });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
