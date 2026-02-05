/**
 * Dashboard Bridge
 *
 * Handles window.postMessage communication from the dashboard web app.
 * Provides secure validation of messages and forwards them to background.
 *
 * The dashboard uses window.postMessage to communicate with the extension
 * because chrome.runtime is not accessible from regular web pages.
 *
 * Security:
 * - Origin validation via allowlist
 * - Message shape validation
 * - Source identifier check
 *
 * Flow:
 * 1. Dashboard calls startWalkthrough() → window.postMessage
 * 2. DashboardBridge receives message via 'message' event
 * 3. Validates origin and message shape
 * 4. Forwards to background via chrome.runtime.sendMessage
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DashboardBridgeConfig {
  /** Additional origins to allow (added to defaults) */
  additionalOrigins?: string[];
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Message format from dashboard
 */
interface DashboardMessage {
  source: "overlay-dashboard";
  type: "START_WALKTHROUGH";
  payload: {
    workflowId: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default allowed origins for dashboard messages
 *
 * Security note: Only origins hosting the trusted dashboard should be here.
 * In production, this should only be the production dashboard URL.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://localhost:3000", // For local HTTPS development
  // Production origins (add when deployed)
  // 'https://app.overlay.com',
] as const;

// ============================================================================
// DASHBOARD BRIDGE
// ============================================================================

export class DashboardBridge {
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private initialized = false;
  private destroyed = false;

  private allowedOrigins: Set<string>;
  private debug: boolean;

  constructor(config?: DashboardBridgeConfig) {
    this.allowedOrigins = new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(config?.additionalOrigins ?? []),
    ]);
    this.debug = config?.debug ?? false;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Initialize the bridge
   *
   * Sets up window 'message' event listener to receive dashboard messages.
   */
  initialize(): void {
    if (this.initialized) {
      this.log("Already initialized");
      return;
    }

    if (this.destroyed) {
      throw new Error(
        "DashboardBridge has been destroyed, create a new instance",
      );
    }

    this.log("Initializing...");

    // Set up message listener
    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener("message", this.messageHandler);

    this.initialized = true;
    this.log("Initialized");
  }

  /**
   * Destroy the bridge
   *
   * Removes window message listener.
   */
  destroy(): void {
    this.log("Destroying...");

    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }

    this.initialized = false;
    this.destroyed = true;
    this.log("Destroyed");
  }

  // ============================================================================
  // MESSAGE HANDLING
  // ============================================================================

  /**
   * Handle incoming window messages
   */
  private handleMessage(event: MessageEvent): void {
    // Security check 1: Validate origin
    if (!this.isValidOrigin(event.origin)) {
      // Don't log - this would spam for every unrelated postMessage
      return;
    }

    // Security check 2: Validate message shape
    if (!this.isDashboardMessage(event.data)) {
      return;
    }

    this.log(`Received ${event.data.type} from ${event.origin}`);

    // Handle the message
    this.handleDashboardMessage(event.data);
  }

  /**
   * Check if origin is in allowlist
   */
  private isValidOrigin(origin: string): boolean {
    return this.allowedOrigins.has(origin);
  }

  /**
   * Type guard for dashboard messages
   */
  private isDashboardMessage(data: unknown): data is DashboardMessage {
    if (typeof data !== "object" || data === null) {
      return false;
    }

    const msg = data as Record<string, unknown>;

    // Check source identifier
    if (msg.source !== "overlay-dashboard") {
      return false;
    }

    // Check type
    if (msg.type !== "START_WALKTHROUGH") {
      return false;
    }

    // Check payload
    if (typeof msg.payload !== "object" || msg.payload === null) {
      return false;
    }

    const payload = msg.payload as Record<string, unknown>;
    if (typeof payload.workflowId !== "number") {
      return false;
    }

    return true;
  }

  /**
   * Handle validated dashboard message
   */
  private async handleDashboardMessage(
    message: DashboardMessage,
  ): Promise<void> {
    switch (message.type) {
      case "START_WALKTHROUGH":
        await this.forwardStartWalkthrough(message.payload);
        break;
    }
  }

  /**
   * Forward START_WALKTHROUGH to background
   *
   * Note: Fire-and-forget. We don't respond to the dashboard because:
   * 1. The dashboard doesn't wait for a response
   * 2. window.postMessage responses are complex (need separate listener)
   * 3. The background handles success/failure through state broadcasts
   */
  private async forwardStartWalkthrough(payload: {
    workflowId: number;
  }): Promise<void> {
    const { workflowId } = payload;

    this.log(`Forwarding START_WALKTHROUGH for workflow ${workflowId}`);

    try {
      // Forward to background service worker
      const response = await chrome.runtime.sendMessage({
        type: "START_WALKTHROUGH",
        workflowId,
      });

      if (response?.success) {
        this.log(`Walkthrough started successfully: tab ${response.tabId}`);
      } else {
        this.log(
          `Walkthrough start failed: ${response?.error ?? "unknown error"}`,
          "error",
        );
      }
    } catch (error) {
      this.log(`Failed to forward to background: ${error}`, "error");
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Log message if debug enabled
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.debug && level === "log") {
      return;
    }
    console[level](`[DashboardBridge] ${message}`);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton dashboard bridge instance for content scripts
 *
 * Usage:
 * ```typescript
 * import { dashboardBridge } from './messaging';
 *
 * // Initialize once at content script startup
 * dashboardBridge.initialize();
 *
 * // Messages from dashboard are automatically forwarded to background
 *
 * // Cleanup
 * dashboardBridge.destroy();
 * ```
 */
export const dashboardBridge = new DashboardBridge({ debug: true });
