/**
 * Walkthrough Messaging Module
 *
 * Provides abstractions for content script communication with:
 * - Background service worker (BackgroundBridge)
 * - Dashboard page (DashboardBridge)
 *
 * Usage:
 * ```typescript
 * import { backgroundBridge, dashboardBridge } from './messaging';
 *
 * // Initialize at content script startup
 * backgroundBridge.initialize();
 * dashboardBridge.initialize();
 *
 * // Send commands
 * await backgroundBridge.sendCommand('NEXT', {});
 *
 * // Subscribe to state changes
 * const unsubscribe = backgroundBridge.subscribe((state) => {
 *   console.log('State:', state.machineState);
 * });
 *
 * // Dashboard messages are automatically forwarded to background
 *
 * // Cleanup
 * unsubscribe();
 * backgroundBridge.destroy();
 * dashboardBridge.destroy();
 * ```
 */

// Re-export BackgroundBridge
export {
  BackgroundBridge,
  backgroundBridge,
  type BackgroundBridgeConfig,
  type StateListener,
} from "./BackgroundBridge";

// Re-export DashboardBridge
export {
  DashboardBridge,
  dashboardBridge,
  type DashboardBridgeConfig,
} from "./DashboardBridge";
