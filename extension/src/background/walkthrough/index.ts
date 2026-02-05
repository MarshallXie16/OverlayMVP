/**
 * Background Walkthrough Module
 *
 * Exports all background-side walkthrough components.
 */

export { SessionManager, sessionManager } from "./SessionManager";
export type {
  SessionManagerConfig,
  SessionStateCallback,
} from "./SessionManager";

export { NavigationWatcher } from "./NavigationWatcher";
export type { NavigationWatcherConfig } from "./NavigationWatcher";

export { StepRouter } from "./StepRouter";
export type { StepRouterConfig, JumpResult } from "./StepRouter";

export { TabManager } from "./TabManager";
export type { TabManagerConfig } from "./TabManager";
