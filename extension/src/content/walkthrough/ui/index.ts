/**
 * Walkthrough UI Module
 *
 * Modular UI components for the walkthrough system.
 * Uses a facade pattern with WalkthroughUI as the main coordinator.
 *
 * Usage:
 *   import { WalkthroughUI, type TooltipAction } from './ui';
 *
 *   const ui = new WalkthroughUI({ debug: true });
 *   ui.initialize((action) => handleAction(action));
 *
 *   // Show a step
 *   const { renderId } = ui.showStep(element, state);
 *   if (!ui.isRenderIdCurrent(renderId)) return; // Cancelled
 *
 *   // Show error/completion
 *   ui.showError(state);
 *   ui.showCompletion(state);
 *
 *   // Cleanup
 *   ui.destroy();
 */

// Main facade
export { WalkthroughUI, type WalkthroughUIConfig } from "./WalkthroughUI";

// Individual components (for testing or direct use)
export { OverlayManager } from "./OverlayManager";
export {
  SpotlightRenderer,
  type SpotlightRendererConfig,
} from "./SpotlightRenderer";
export {
  TooltipRenderer,
  type TooltipRendererConfig,
  type TooltipContent,
  type TooltipMode,
  type TooltipAction,
  type TooltipActionHandler,
  type ErrorOptions,
  type CompletionOptions,
  type NavigationOptions,
} from "./TooltipRenderer";
