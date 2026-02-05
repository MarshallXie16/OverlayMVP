/**
 * Feature Flags
 *
 * Runtime toggleable flags for gradual rollout of new features.
 * Stored in chrome.storage.local to persist across sessions.
 *
 * Usage:
 *   const useNew = await getFeatureFlag('WALKTHROUGH_USE_NEW_SYSTEM');
 *   if (useNew) { ... }
 *
 *   // To toggle for testing:
 *   await setFeatureFlag('WALKTHROUGH_USE_NEW_SYSTEM', true);
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * All available feature flags
 */
export interface FeatureFlags {
  /**
   * Use the new walkthrough state machine system
   * When false (default): Uses legacy walkthrough.ts and walkthroughSession.ts
   * When true: Uses new background/walkthrough/ and content/walkthrough/ modules
   */
  WALKTHROUGH_USE_NEW_SYSTEM: boolean;
}

/**
 * Feature flag names as type
 */
export type FeatureFlagName = keyof FeatureFlags;

// ============================================================================
// DEFAULTS
// ============================================================================

/**
 * Default values for all feature flags
 * Sprint 6: New walkthrough system defaults to true after validation
 */
const DEFAULT_FLAGS: FeatureFlags = {
  WALKTHROUGH_USE_NEW_SYSTEM: true,
};

// ============================================================================
// STORAGE KEY
// ============================================================================

const FEATURE_FLAGS_STORAGE_KEY = "workflow_platform_feature_flags";

// ============================================================================
// API
// ============================================================================

/**
 * Get the current value of a feature flag
 *
 * @param flag - The flag name to check
 * @returns Current value of the flag (or default if not set)
 */
export async function getFeatureFlag(
  flag: FeatureFlagName,
): Promise<FeatureFlags[typeof flag]> {
  try {
    const result = await chrome.storage.local.get(FEATURE_FLAGS_STORAGE_KEY);
    const flags = result[FEATURE_FLAGS_STORAGE_KEY] as
      | Partial<FeatureFlags>
      | undefined;

    if (flags && flag in flags) {
      return flags[flag] as FeatureFlags[typeof flag];
    }

    return DEFAULT_FLAGS[flag];
  } catch (error) {
    console.error(`[FeatureFlags] Error reading flag ${flag}:`, error);
    return DEFAULT_FLAGS[flag];
  }
}

/**
 * Set the value of a feature flag
 *
 * @param flag - The flag name to set
 * @param value - The new value
 */
export async function setFeatureFlag(
  flag: FeatureFlagName,
  value: FeatureFlags[typeof flag],
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(FEATURE_FLAGS_STORAGE_KEY);
    const currentFlags =
      (result[FEATURE_FLAGS_STORAGE_KEY] as Partial<FeatureFlags>) || {};

    const updatedFlags: Partial<FeatureFlags> = {
      ...currentFlags,
      [flag]: value,
    };

    await chrome.storage.local.set({
      [FEATURE_FLAGS_STORAGE_KEY]: updatedFlags,
    });

    console.log(`[FeatureFlags] Set ${flag} = ${value}`);
  } catch (error) {
    console.error(`[FeatureFlags] Error setting flag ${flag}:`, error);
    throw error;
  }
}

/**
 * Get all feature flags with their current values
 *
 * @returns Object with all flags and their current values
 */
export async function getAllFeatureFlags(): Promise<FeatureFlags> {
  try {
    const result = await chrome.storage.local.get(FEATURE_FLAGS_STORAGE_KEY);
    const flags =
      (result[FEATURE_FLAGS_STORAGE_KEY] as Partial<FeatureFlags>) || {};

    return {
      ...DEFAULT_FLAGS,
      ...flags,
    };
  } catch (error) {
    console.error("[FeatureFlags] Error reading all flags:", error);
    return DEFAULT_FLAGS;
  }
}

/**
 * Reset all feature flags to defaults
 */
export async function resetFeatureFlags(): Promise<void> {
  try {
    await chrome.storage.local.remove(FEATURE_FLAGS_STORAGE_KEY);
    console.log("[FeatureFlags] Reset all flags to defaults");
  } catch (error) {
    console.error("[FeatureFlags] Error resetting flags:", error);
    throw error;
  }
}

/**
 * Check if new walkthrough system should be used
 * Convenience wrapper for the most common flag check
 */
export async function useNewWalkthroughSystem(): Promise<boolean> {
  return getFeatureFlag("WALKTHROUGH_USE_NEW_SYSTEM");
}
