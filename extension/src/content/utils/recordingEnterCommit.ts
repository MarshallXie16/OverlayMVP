export interface IsEnterCommitKeydownParams {
  key: string;
  shiftKey: boolean;
  isTextArea: boolean;
}

/**
 * True when a keydown should be treated as an "Enter commit" for recording.
 * Used to record input_commit before immediate navigations (e.g. Google search).
 */
export function isEnterCommitKeydown(params: IsEnterCommitKeydownParams): boolean {
  if (params.key !== "Enter") {
    return false;
  }

  // Shift+Enter in textarea is newline insertion, not a commit
  if (params.isTextArea && params.shiftKey) {
    return false;
  }

  return true;
}

