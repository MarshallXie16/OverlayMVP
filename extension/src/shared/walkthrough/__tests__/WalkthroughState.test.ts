import { describe, expect, it } from "vitest";
import { createIdleState, isActiveWalkthrough } from "../WalkthroughState";

describe("isActiveWalkthrough", () => {
  it("returns false for IDLE", () => {
    expect(isActiveWalkthrough(createIdleState())).toBe(false);
  });

  it("returns true for COMPLETED so session can be exited", () => {
    const state = createIdleState();
    state.machineState = "COMPLETED";
    expect(isActiveWalkthrough(state)).toBe(true);
  });

  it("returns true for ERROR so session can be exited", () => {
    const state = createIdleState();
    state.machineState = "ERROR";
    expect(isActiveWalkthrough(state)).toBe(true);
  });
});
