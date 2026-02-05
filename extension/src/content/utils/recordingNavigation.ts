export interface ShouldRecordNavigateStepParams {
  /** Number of pending events flushed from the deduplicator before unload */
  eventsFlushed: number;
  /**
   * True when an input_commit was recorded immediately on Enter keydown.
   * In that case, the navigation is a side-effect and should not be recorded
   * as a separate NAVIGATE step.
   */
  immediateInputCommitRecorded: boolean;
}

export function shouldRecordNavigateStep(
  params: ShouldRecordNavigateStepParams,
): boolean {
  if (params.eventsFlushed > 0) {
    return false;
  }

  if (params.immediateInputCommitRecorded) {
    return false;
  }

  return true;
}

