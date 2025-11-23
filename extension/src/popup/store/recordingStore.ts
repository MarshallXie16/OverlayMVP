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
  checkRecordingState: () => Promise<void>;
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
      console.log('[RecordingStore] Starting recording:', workflowName);
      
      // Get current tab URL
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!activeTab || !activeTab.url) {
        throw new Error('No active tab found. Please navigate to a webpage and try again.');
      }

      console.log('[RecordingStore] Active tab:', activeTab.url);

      // Send message to background worker to start recording
      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        payload: {
          workflowName: name,
          startingUrl: activeTab.url
        },
      });

      console.log('[RecordingStore] Response from background:', response);

      // Parse response correctly - background returns {type: 'START_RECORDING', payload: {success: true, ...}}
      const success = response?.payload?.success === true;

      if (success) {
        console.log('[RecordingStore] Recording started successfully');
        set({
          isRecording: true,
          workflowName,
          isLoading: false,
          error: null
        });
      } else {
        const errorMessage =
          response?.payload?.error ||
          response?.error ||
          'Failed to start recording';
        console.error('[RecordingStore] Failed to start recording:', errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to start recording';
      console.error('[RecordingStore] Error in startRecording:', error);
      set({ isRecording: false, isLoading: false, error: errorMessage });
      throw error;
    }
  },

  stopRecording: async () => {
    set({ isLoading: true, error: null });
    try {
      console.log('[RecordingStore] Stopping recording');
      
      // Send message to background worker to stop recording
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
      });

      console.log('[RecordingStore] Stop recording response:', response);

      // Parse response correctly
      const success = response?.payload?.success === true;

      if (success) {
        console.log('[RecordingStore] Recording stopped successfully');
        set({
          isRecording: false,
          workflowName: '',
          isLoading: false,
          error: null
        });

        // Refresh workflow list after stopping
        await get().fetchWorkflows();
      } else {
        const errorMessage = response?.payload?.error || response?.error || 'Failed to stop recording';
        console.error('[RecordingStore] Failed to stop recording:', errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to stop recording';
      console.error('[RecordingStore] Error in stopRecording:', error);
      set({ isLoading: false, error: errorMessage });
      throw error;
    }
  },

  checkRecordingState: async () => {
    try {
      console.log('[RecordingStore] Checking recording state');
      
      // Query background worker for current recording state
      const response = await chrome.runtime.sendMessage({
        type: 'GET_RECORDING_STATE',
      });

      console.log('[RecordingStore] Recording state response:', response);

      // Parse response correctly
      if (response?.payload?.recordingState) {
        const { isRecording, workflowName } = response.payload.recordingState;
        console.log('[RecordingStore] Found recording state:', { isRecording, workflowName });
        set({
          isRecording: isRecording || false,
          workflowName: workflowName || '',
        });
      } else {
        // No recording state, ensure UI shows not recording
        console.log('[RecordingStore] No active recording found');
        set({
          isRecording: false,
          workflowName: '',
        });
      }
    } catch (error) {
      console.error('[RecordingStore] Failed to check recording state:', error);
      // Don't show error to user, just assume not recording
      set({
        isRecording: false,
        workflowName: '',
      });
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
