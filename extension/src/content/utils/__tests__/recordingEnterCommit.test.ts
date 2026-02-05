import { describe, it, expect } from "vitest";
import { isEnterCommitKeydown } from "../recordingEnterCommit";

describe("isEnterCommitKeydown", () => {
  it("should return false for non-Enter keys", () => {
    expect(
      isEnterCommitKeydown({ key: "a", shiftKey: false, isTextArea: false }),
    ).toBe(false);
  });

  it("should return true for Enter on input-like fields", () => {
    expect(
      isEnterCommitKeydown({
        key: "Enter",
        shiftKey: false,
        isTextArea: false,
      }),
    ).toBe(true);
  });

  it("should return true for Enter on textarea when Shift is not held", () => {
    expect(
      isEnterCommitKeydown({
        key: "Enter",
        shiftKey: false,
        isTextArea: true,
      }),
    ).toBe(true);
  });

  it("should return false for Shift+Enter on textarea", () => {
    expect(
      isEnterCommitKeydown({
        key: "Enter",
        shiftKey: true,
        isTextArea: true,
      }),
    ).toBe(false);
  });
});

