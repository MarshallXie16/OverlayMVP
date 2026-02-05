/**
 * State Machine Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WalkthroughStateMachine,
  isSessionExpired,
  describeState,
} from "../StateMachine";
import { createIdleState, WalkthroughState } from "../WalkthroughState";
import type { WalkthroughEvent } from "../events";
import { SESSION_TIMEOUT_MS } from "../constants";

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestWorkflow() {
  return {
    id: 1,
    name: "Test Workflow",
    starting_url: "https://example.com",
    steps: [
      {
        id: 1,
        order: 0,
        action_type: "click",
        target_selector: "#button1",
        processed_description: "Click the first button",
      },
      {
        id: 2,
        order: 1,
        action_type: "input",
        target_selector: "#input1",
        processed_description: "Enter text",
      },
    ],
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("WalkthroughStateMachine", () => {
  let machine: WalkthroughStateMachine;

  beforeEach(() => {
    machine = new WalkthroughStateMachine();
  });

  describe("Initial State", () => {
    it("should start in IDLE state", () => {
      expect(machine.getState().machineState).toBe("IDLE");
    });

    it("should have empty session ID initially", () => {
      expect(machine.getState().sessionId).toBe("");
    });

    it("should have no steps initially", () => {
      expect(machine.getState().steps).toEqual([]);
      expect(machine.getState().totalSteps).toBe(0);
    });
  });

  describe("Session Lifecycle Transitions", () => {
    it("should transition IDLE → INITIALIZING on START", () => {
      const newState = machine.dispatch({
        type: "START",
        workflowId: 123,
        tabId: 1,
      });

      expect(newState.machineState).toBe("INITIALIZING");
      expect(newState.workflowId).toBe(123);
      expect(newState.tabs.primaryTabId).toBe(1);
      expect(newState.sessionId).toMatch(/^wt_/);
    });

    it("should transition INITIALIZING → SHOWING_STEP on DATA_LOADED with steps", () => {
      // Start first
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });

      // Load data
      const workflow = createTestWorkflow();
      const newState = machine.dispatch({
        type: "DATA_LOADED",
        workflow,
        tabId: 1,
      });

      expect(newState.machineState).toBe("SHOWING_STEP");
      expect(newState.workflowName).toBe("Test Workflow");
      expect(newState.steps).toHaveLength(2);
      expect(newState.totalSteps).toBe(2);
      expect(newState.currentStepIndex).toBe(0);
    });

    it("should transition INITIALIZING → ERROR on DATA_LOADED with no steps", () => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });

      const newState = machine.dispatch({
        type: "DATA_LOADED",
        workflow: { ...createTestWorkflow(), steps: [] },
        tabId: 1,
      });

      expect(newState.machineState).toBe("ERROR");
    });

    it("should transition INITIALIZING → ERROR on INIT_FAILED", () => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });

      const newState = machine.dispatch({
        type: "INIT_FAILED",
        error: "API error",
      });

      expect(newState.machineState).toBe("ERROR");
      expect(newState.errorInfo.message).toBe("API error");
    });
  });

  describe("Step Navigation Transitions", () => {
    beforeEach(() => {
      // Set up to WAITING_ACTION state
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });
      machine.dispatch({ type: "ELEMENT_FOUND", stepIndex: 0 });
    });

    it("should transition WAITING_ACTION → TRANSITIONING on ACTION_DETECTED", () => {
      const newState = machine.dispatch({
        type: "ACTION_DETECTED",
        stepIndex: 0,
        actionType: "click",
      });

      expect(newState.machineState).toBe("TRANSITIONING");
      expect(newState.completedStepIndexes).toContain(0);
    });

    it("should transition TRANSITIONING → SHOWING_STEP on NEXT_STEP when more steps exist", () => {
      machine.dispatch({
        type: "ACTION_DETECTED",
        stepIndex: 0,
        actionType: "click",
      });

      const newState = machine.dispatch({ type: "NEXT_STEP" });

      expect(newState.machineState).toBe("SHOWING_STEP");
      expect(newState.currentStepIndex).toBe(1);
    });

    it("should transition TRANSITIONING → COMPLETED on NEXT_STEP when no more steps", () => {
      // Complete first step
      machine.dispatch({
        type: "ACTION_DETECTED",
        stepIndex: 0,
        actionType: "click",
      });
      machine.dispatch({ type: "NEXT_STEP" });
      machine.dispatch({ type: "ELEMENT_FOUND", stepIndex: 1 });
      machine.dispatch({
        type: "ACTION_DETECTED",
        stepIndex: 1,
        actionType: "input_commit",
      });

      const newState = machine.dispatch({ type: "NEXT_STEP" });

      expect(newState.machineState).toBe("COMPLETED");
    });

    it("should transition TRANSITIONING → SHOWING_STEP on PREV_STEP", () => {
      // Move to second step first
      machine.dispatch({
        type: "ACTION_DETECTED",
        stepIndex: 0,
        actionType: "click",
      });
      machine.dispatch({ type: "NEXT_STEP" });
      machine.dispatch({ type: "ELEMENT_FOUND", stepIndex: 1 });
      machine.dispatch({
        type: "ACTION_DETECTED",
        stepIndex: 1,
        actionType: "input_commit",
      });

      const newState = machine.dispatch({ type: "PREV_STEP" });

      expect(newState.machineState).toBe("SHOWING_STEP");
      expect(newState.currentStepIndex).toBe(0);
    });
  });

  describe("Element Finding Transitions", () => {
    beforeEach(() => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });
    });

    it("should transition SHOWING_STEP → WAITING_ACTION on ELEMENT_FOUND", () => {
      const newState = machine.dispatch({
        type: "ELEMENT_FOUND",
        stepIndex: 0,
      });

      expect(newState.machineState).toBe("WAITING_ACTION");
    });

    it("should transition SHOWING_STEP → HEALING on ELEMENT_NOT_FOUND", () => {
      const newState = machine.dispatch({
        type: "ELEMENT_NOT_FOUND",
        stepIndex: 0,
      });

      expect(newState.machineState).toBe("HEALING");
      expect(newState.healingInfo?.inProgress).toBe(true);
    });
  });

  describe("Healing Transitions", () => {
    beforeEach(() => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });
      machine.dispatch({ type: "ELEMENT_NOT_FOUND", stepIndex: 0 });
    });

    it("should transition HEALING → WAITING_ACTION on HEAL_SUCCESS", () => {
      const newState = machine.dispatch({
        type: "HEAL_SUCCESS",
        stepIndex: 0,
        confidence: 0.9,
        aiValidated: false,
      });

      expect(newState.machineState).toBe("WAITING_ACTION");
      expect(newState.healingInfo?.bestScore).toBe(0.9);
    });

    it("should transition HEALING → ERROR on HEAL_FAILED", () => {
      const newState = machine.dispatch({
        type: "HEAL_FAILED",
        stepIndex: 0,
        reason: "No candidates found",
      });

      expect(newState.machineState).toBe("ERROR");
      expect(newState.errorInfo.type).toBe("healing_failed");
    });
  });

  describe("Navigation Transitions", () => {
    beforeEach(() => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });
    });

    it("should transition SHOWING_STEP → NAVIGATING on URL_CHANGED", () => {
      const newState = machine.dispatch({
        type: "URL_CHANGED",
        tabId: 1,
        url: "https://example.com/page2",
      });

      expect(newState.machineState).toBe("NAVIGATING");
      expect(newState.navigation.inProgress).toBe(true);
      expect(newState.navigation.targetUrl).toBe("https://example.com/page2");
    });

    it("should transition NAVIGATING → SHOWING_STEP on PAGE_LOADED", () => {
      machine.dispatch({
        type: "URL_CHANGED",
        tabId: 1,
        url: "https://example.com/page2",
      });

      const newState = machine.dispatch({
        type: "PAGE_LOADED",
        tabId: 1,
        url: "https://example.com/page2",
      });

      expect(newState.machineState).toBe("SHOWING_STEP");
      expect(newState.navigation.inProgress).toBe(false);
    });

    it("should transition NAVIGATING → ERROR on NAVIGATION_TIMEOUT", () => {
      machine.dispatch({
        type: "URL_CHANGED",
        tabId: 1,
        url: "https://example.com/page2",
      });

      const newState = machine.dispatch({
        type: "NAVIGATION_TIMEOUT",
        tabId: 1,
      });

      expect(newState.machineState).toBe("ERROR");
      expect(newState.errorInfo.type).toBe("navigation_timeout");
    });

    it("should only transition PAGE_LOADED when tabId matches", () => {
      machine.dispatch({
        type: "URL_CHANGED",
        tabId: 1,
        url: "https://example.com/page2",
      });

      // PAGE_LOADED from wrong tab should be ignored
      const newState = machine.dispatch({
        type: "PAGE_LOADED",
        tabId: 999, // Wrong tab
        url: "https://example.com/page2",
      });

      expect(newState.machineState).toBe("NAVIGATING"); // Still navigating
    });
  });

  describe("Jump To Step Transitions", () => {
    beforeEach(() => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });
    });

    it("should transition SHOWING_STEP → SHOWING_STEP on JUMP_TO_STEP", () => {
      // Currently in SHOWING_STEP at step 0
      expect(machine.getState().machineState).toBe("SHOWING_STEP");
      expect(machine.getState().currentStepIndex).toBe(0);

      const newState = machine.dispatch({
        type: "JUMP_TO_STEP",
        stepIndex: 1,
      });

      expect(newState.machineState).toBe("SHOWING_STEP");
      expect(newState.currentStepIndex).toBe(1);
    });

    it("should transition WAITING_ACTION → SHOWING_STEP on JUMP_TO_STEP", () => {
      machine.dispatch({ type: "ELEMENT_FOUND", stepIndex: 0 });
      expect(machine.getState().machineState).toBe("WAITING_ACTION");

      const newState = machine.dispatch({
        type: "JUMP_TO_STEP",
        stepIndex: 1,
      });

      expect(newState.machineState).toBe("SHOWING_STEP");
      expect(newState.currentStepIndex).toBe(1);
    });

    it("should ignore JUMP_TO_STEP with invalid index", () => {
      const stateBefore = machine.getState();

      const newState = machine.dispatch({
        type: "JUMP_TO_STEP",
        stepIndex: 99, // Out of bounds
      });

      expect(newState.machineState).toBe(stateBefore.machineState);
      expect(newState.currentStepIndex).toBe(stateBefore.currentStepIndex);
    });

    it("should ignore JUMP_TO_STEP with negative index", () => {
      const stateBefore = machine.getState();

      const newState = machine.dispatch({
        type: "JUMP_TO_STEP",
        stepIndex: -1,
      });

      expect(newState.machineState).toBe(stateBefore.machineState);
      expect(newState.currentStepIndex).toBe(stateBefore.currentStepIndex);
    });
  });

  describe("Error Recovery Transitions", () => {
    beforeEach(() => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });
      machine.dispatch({ type: "ELEMENT_NOT_FOUND", stepIndex: 0 });
      machine.dispatch({ type: "HEAL_FAILED", stepIndex: 0, reason: "Failed" });
    });

    it("should transition ERROR → SHOWING_STEP on RETRY", () => {
      const newState = machine.dispatch({ type: "RETRY" });

      expect(newState.machineState).toBe("SHOWING_STEP");
    });

    it("should transition ERROR → TRANSITIONING on SKIP_STEP when more steps", () => {
      const newState = machine.dispatch({ type: "SKIP_STEP" });

      expect(newState.machineState).toBe("TRANSITIONING");
      expect(newState.currentStepIndex).toBe(1);
    });
  });

  describe("Global Transitions", () => {
    it("should transition any state → IDLE on EXIT", () => {
      // Start a session
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });
      machine.dispatch({ type: "ELEMENT_FOUND", stepIndex: 0 });

      expect(machine.getState().machineState).toBe("WAITING_ACTION");

      const newState = machine.dispatch({ type: "EXIT", reason: "user_exit" });

      expect(newState.machineState).toBe("IDLE");
    });

    it("should transition to IDLE when primary tab closes", () => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });

      const newState = machine.dispatch({ type: "TAB_CLOSED", tabId: 1 });

      expect(newState.machineState).toBe("IDLE");
    });
  });

  describe("Invalid Transitions", () => {
    it("should ignore invalid transitions and return current state", () => {
      const initialState = machine.getState();

      // Try to transition from IDLE with an invalid event
      const newState = machine.dispatch({ type: "NEXT_STEP" });

      expect(newState).toEqual(initialState);
    });

    it("should not transition DATA_LOADED from IDLE", () => {
      const initialState = machine.getState();

      const newState = machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });

      expect(newState.machineState).toBe("IDLE");
    });
  });

  describe("canTransition", () => {
    it("should return true for valid transitions", () => {
      expect(
        machine.canTransition({ type: "START", workflowId: 123, tabId: 1 }),
      ).toBe(true);
    });

    it("should return false for invalid transitions", () => {
      expect(machine.canTransition({ type: "NEXT_STEP" })).toBe(false);
    });
  });

  describe("getValidEvents", () => {
    it("should return valid events for current state", () => {
      const validEvents = machine.getValidEvents();

      expect(validEvents).toContain("START");
      expect(validEvents).toContain("EXIT");
    });

    it("should update after state change", () => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });

      const validEvents = machine.getValidEvents();

      expect(validEvents).toContain("DATA_LOADED");
      expect(validEvents).toContain("INIT_FAILED");
      expect(validEvents).not.toContain("START");
    });
  });

  describe("subscribe", () => {
    it("should notify listeners on state change", () => {
      const listener = vi.fn();
      machine.subscribe(listener);

      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ machineState: "INITIALIZING" }),
        expect.objectContaining({ type: "START" }),
        expect.objectContaining({ machineState: "IDLE" }),
      );
    });

    it("should allow unsubscribing", () => {
      const listener = vi.fn();
      const unsubscribe = machine.subscribe(listener);

      unsubscribe();
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("State Serialization", () => {
    it("should produce JSON-serializable state", () => {
      machine.dispatch({ type: "START", workflowId: 123, tabId: 1 });
      machine.dispatch({
        type: "DATA_LOADED",
        workflow: createTestWorkflow(),
        tabId: 1,
      });

      const state = machine.getState();
      const serialized = JSON.stringify(state);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(state);
    });
  });
});

describe("isSessionExpired", () => {
  it("should return true for expired session", () => {
    const state: WalkthroughState = {
      ...createIdleState(),
      timing: {
        sessionStartedAt: Date.now() - SESSION_TIMEOUT_MS - 1000,
        lastActivityAt: Date.now() - SESSION_TIMEOUT_MS - 1000,
        expiresAt: Date.now() - 1000, // Already expired
      },
    };

    expect(isSessionExpired(state)).toBe(true);
  });

  it("should return false for active session", () => {
    const state: WalkthroughState = {
      ...createIdleState(),
      timing: {
        sessionStartedAt: Date.now(),
        lastActivityAt: Date.now(),
        expiresAt: Date.now() + SESSION_TIMEOUT_MS,
      },
    };

    expect(isSessionExpired(state)).toBe(false);
  });
});

describe("describeState", () => {
  it("should describe IDLE state", () => {
    const state = createIdleState();
    expect(describeState(state)).toBe("No active walkthrough");
  });

  it("should describe SHOWING_STEP state with step info", () => {
    const state: WalkthroughState = {
      ...createIdleState(),
      machineState: "SHOWING_STEP",
      currentStepIndex: 0,
      totalSteps: 3,
    };
    expect(describeState(state)).toBe("Showing step (step 1/3)");
  });

  it("should describe COMPLETED state", () => {
    const state: WalkthroughState = {
      ...createIdleState(),
      machineState: "COMPLETED",
      totalSteps: 5,
    };
    expect(describeState(state)).toBe("Completed! 5 steps finished");
  });
});
