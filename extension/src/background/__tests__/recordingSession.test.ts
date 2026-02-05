import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { StepCreate } from "@/shared/types";

vi.mock("../screenshot", () => ({
  captureScreenshot: vi.fn().mockResolvedValue({ error: "mock" }),
}));

vi.mock("../screenshotStore", () => ({
  storeScreenshot: vi.fn().mockResolvedValue(undefined),
}));

import {
  startRecordingSession,
  addStepToSession,
  getRecordingSession,
  handleRecordingNavigationStart,
  handleRecordingNavigationComplete,
  endRecordingSession,
} from "../recordingSession";

describe("recordingSession navigation URL capture", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-session-id" });
  });

  afterEach(async () => {
    await endRecordingSession("user_stop");
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("should patch action_data.target_url onto pending navigate step on navigation start", async () => {
    await startRecordingSession("test", "https://example.com", 1);

    const step: StepCreate = {
      step_number: 0,
      timestamp: null,
      action_type: "navigate",
      selectors: {},
      element_meta: {},
      page_context: { url: "https://example.com" },
      action_data: null,
      dom_context: null,
      screenshot_id: null,
    };

    const added = await addStepToSession(step);
    expect(added?.success).toBe(true);

    await handleRecordingNavigationStart(1, "https://docs.google.com/");

    const { session } = await getRecordingSession(1);
    expect(session?.steps[0]?.action_data?.target_url).toBe(
      "https://docs.google.com/",
    );
  });

  it("should patch action_data.final_url onto pending navigate step on navigation complete", async () => {
    vi.useFakeTimers();
    await startRecordingSession("test", "https://example.com", 1);

    const step: StepCreate = {
      step_number: 0,
      timestamp: null,
      action_type: "navigate",
      selectors: {},
      element_meta: {},
      page_context: { url: "https://example.com" },
      action_data: null,
      dom_context: null,
      screenshot_id: null,
    };

    const added = await addStepToSession(step);
    expect(added?.success).toBe(true);

    const promise = handleRecordingNavigationComplete(1, "https://final.test/");
    await vi.runAllTimersAsync();
    await promise;

    const { session } = await getRecordingSession(1);
    expect(session?.steps[0]?.action_data?.final_url).toBe(
      "https://final.test/",
    );
  });
});

