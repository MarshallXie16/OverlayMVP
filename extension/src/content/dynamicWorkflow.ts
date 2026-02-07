/**
 * Dynamic Workflow Content Script Entry Point
 *
 * IIFE bundle that initializes the DynamicWalkthroughController
 * when injected into a page. Follows the same pattern as walkthrough.ts.
 *
 * Feature-flag gated: only initializes when DYNAMIC_WORKFLOW_ENABLED is true.
 */
import { DynamicWalkthroughController } from "./dynamicWorkflow/DynamicWalkthroughController";
import { getFeatureFlag } from "../shared/featureFlags";

(async () => {
  try {
    // Check feature flag before doing any work
    const enabled = await getFeatureFlag("DYNAMIC_WORKFLOW_ENABLED");

    if (!enabled) {
      console.log(
        "[DynamicWorkflow] Feature disabled, skipping initialization",
      );
      return;
    }

    const controller = new DynamicWalkthroughController({ debug: true });
    await controller.initialize();

    console.log("[DynamicWorkflow] Content script initialized");
  } catch (error) {
    console.error("[DynamicWorkflow] Initialization failed:", error);
  }
})();
