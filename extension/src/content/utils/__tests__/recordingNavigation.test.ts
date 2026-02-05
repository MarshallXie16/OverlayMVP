import { describe, it, expect } from "vitest";
import { shouldRecordNavigateStep } from "../recordingNavigation";

describe("shouldRecordNavigateStep", () => {
  it("should record a navigate step when no events were flushed and no immediate input commit was recorded", () => {
    expect(
      shouldRecordNavigateStep({
        eventsFlushed: 0,
        immediateInputCommitRecorded: false,
      }),
    ).toBe(true);
  });

  it("should NOT record a navigate step when other events were flushed", () => {
    expect(
      shouldRecordNavigateStep({
        eventsFlushed: 1,
        immediateInputCommitRecorded: false,
      }),
    ).toBe(false);
  });

  it("should NOT record a navigate step when an immediate Enter input_commit was recorded", () => {
    expect(
      shouldRecordNavigateStep({
        eventsFlushed: 0,
        immediateInputCommitRecorded: true,
      }),
    ).toBe(false);
  });
});

