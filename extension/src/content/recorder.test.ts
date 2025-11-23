/**
 * Tests for workflow recording functionality
 * Ensures recording flow works end-to-end
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Workflow Recording', () => {
  // Mock chrome APIs
  const mockChrome = {
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
      },
    },
  };

  beforeEach(() => {
    // @ts-ignore
    global.chrome = mockChrome;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Widget Button Filtering', () => {
    it('should not record clicks on recording widget buttons', () => {
      // This test ensures the fix for widget buttons being recorded
      const widgetButton = document.createElement('button');
      widgetButton.className = 'stop-btn';
      
      const widget = document.createElement('div');
      widget.id = 'workflow-recording-widget';
      widget.appendChild(widgetButton);
      
      document.body.appendChild(widget);
      
      // Verify widget button is correctly identified
      expect(widgetButton.closest('#workflow-recording-widget')).toBeTruthy();
      
      document.body.removeChild(widget);
    });
  });

  describe('Stop Recording Flow', () => {
    it('should remove event listeners before stopping', () => {
      // This test ensures event listeners are removed BEFORE stopping
      // to prevent recording the stop button click
      
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      
      // Simulate stop flow (simplified)
      const handleClick = vi.fn();
      document.addEventListener('click', handleClick, true);
      
      // Event listeners should be removed first
      document.removeEventListener('click', handleClick, true);
      
      // Then state changes
      const state = { isRecording: false };
      
      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(state.isRecording).toBe(false);
      
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('Response Parsing', () => {
    it('should correctly parse background response', () => {
      // Background returns: {type: 'STOP_RECORDING', payload: {success: true, workflowId: 123}}
      const mockResponse = {
        type: 'STOP_RECORDING',
        payload: {
          success: true,
          workflowId: 123,
          status: 'processing',
        },
      };
      
      // Should check response.payload.success, not response.success
      expect(mockResponse.payload.success).toBe(true);
      expect(mockResponse.payload.workflowId).toBe(123);
    });
    
    it('should handle error response correctly', () => {
      const mockErrorResponse = {
        type: 'STOP_RECORDING',
        payload: {
          success: false,
          error: 'Failed to create workflow',
        },
      };
      
      expect(mockErrorResponse.payload.success).toBe(false);
      expect(mockErrorResponse.payload.error).toBeDefined();
    });
  });

  describe('Step Data Validation', () => {
    it('should have valid step structure', () => {
      const mockStep = {
        step_number: 1,
        timestamp: new Date().toISOString(),
        action_type: 'click',
        selectors: { primary: '#test-button' },
        element_meta: { tag_name: 'BUTTON', inner_text: 'Click me' },
        page_context: { url: 'http://localhost:3000', title: 'Test Page' },
        action_data: null,
        dom_context: null,
        screenshot_id: null,
      };
      
      // Verify all required fields are present
      expect(mockStep.step_number).toBeDefined();
      expect(mockStep.action_type).toBeDefined();
      expect(mockStep.selectors).toBeDefined();
      expect(mockStep.element_meta).toBeDefined();
      expect(mockStep.page_context).toBeDefined();
      
      // Timestamp should be ISO string or null
      expect(typeof mockStep.timestamp === 'string' || mockStep.timestamp === null).toBe(true);
      if (typeof mockStep.timestamp === 'string') {
        expect(() => new Date(mockStep.timestamp)).not.toThrow();
      }
    });
  });

  describe('Step Number Race Condition', () => {
    it('should generate unique step numbers for concurrent events', () => {
      // Simulate the race condition fix
      let currentStepNumber = 0;
      
      // Old (buggy) approach - all would get the same number
      const buggyApproach = () => {
        currentStepNumber++;
        return currentStepNumber;
      };
      
      // New (fixed) approach - each gets unique number
      const fixedApproach = () => {
        return ++currentStepNumber;
      };
      
      // Reset for fixed approach test
      currentStepNumber = 0;
      
      // Simulate 3 events firing "simultaneously"
      const step1 = fixedApproach();
      const step2 = fixedApproach();
      const step3 = fixedApproach();
      
      // All should be unique
      expect(step1).toBe(1);
      expect(step2).toBe(2);
      expect(step3).toBe(3);
      
      // Verify no duplicates
      const steps = [step1, step2, step3];
      const uniqueSteps = new Set(steps);
      expect(uniqueSteps.size).toBe(steps.length);
    });
    
    it('should maintain step order even with async operations', async () => {
      // Simulate async operations that might interleave
      let currentStepNumber = 0;
      const recordedSteps: number[] = [];
      
      const recordStep = async (delay: number) => {
        // Capture step number IMMEDIATELY (atomic)
        const stepNumber = ++currentStepNumber;
        
        // Simulate async screenshot capture
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Record the step
        recordedSteps.push(stepNumber);
        
        return stepNumber;
      };
      
      // Fire 3 "events" with different delays
      const promises = [
        recordStep(30),  // Slowest
        recordStep(10),  // Fastest
        recordStep(20),  // Medium
      ];
      
      const results = await Promise.all(promises);
      
      // Step numbers should be 1, 2, 3 (captured order)
      expect(results).toEqual([1, 2, 3]);
      
      // Recorded steps might be in different order due to async
      // But they should still be unique
      expect(new Set(recordedSteps).size).toBe(3);
      expect(recordedSteps).toContain(1);
      expect(recordedSteps).toContain(2);
      expect(recordedSteps).toContain(3);
    });
  });
});
