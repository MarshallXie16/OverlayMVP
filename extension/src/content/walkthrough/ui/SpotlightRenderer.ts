/**
 * Spotlight Renderer
 *
 * Positions the spotlight around target elements using CSS box-shadow.
 * Creates a dark overlay with a transparent "window" showing the target element.
 *
 * NOTE: Scroll/resize handlers are managed by WalkthroughUI facade (Codex review).
 * This component only handles element observation via ResizeObserver.
 *
 * Uses CSS box-shadow approach instead of SVG mask for better cross-site compatibility.
 * The spotlight element is positioned over the target and uses a massive box-shadow
 * to darken the rest of the page.
 */

import { SPOTLIGHT_PADDING } from "../../../shared/walkthrough";

// ============================================================================
// TYPES
// ============================================================================

export interface SpotlightRendererConfig {
  /** Enable debug logging */
  debug?: boolean;
}

// ============================================================================
// SPOTLIGHT RENDERER
// ============================================================================

export class SpotlightRenderer {
  // Legacy SVG cutout (kept for compatibility but not used for visual effect)
  private spotlightCutout: SVGRectElement | null = null;
  // CSS-based spotlight using box-shadow (primary visual effect)
  private spotlightOverlay: HTMLDivElement | null = null;
  private currentElement: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private config: SpotlightRendererConfig;

  constructor(config?: SpotlightRendererConfig) {
    this.config = config ?? {};
  }

  /**
   * Initialize with the SVG backdrop's spotlight cutout element.
   * Note: SVG cutout is kept for compatibility but the visual effect
   * is now handled by the CSS box-shadow overlay.
   */
  initialize(spotlightCutout: SVGRectElement): void {
    this.spotlightCutout = spotlightCutout;
    this.setupResizeObserver();
    this.createSpotlightOverlay();
    console.log(
      "[SpotlightRenderer] Initialized with CSS box-shadow spotlight",
    );
    this.log("Initialized");
  }

  /**
   * Create CSS-based spotlight overlay using box-shadow technique.
   * This creates a transparent "window" with the rest of the viewport darkened.
   */
  private createSpotlightOverlay(): void {
    // Remove existing overlay if any
    if (this.spotlightOverlay) {
      this.spotlightOverlay.remove();
    }

    this.spotlightOverlay = document.createElement("div");
    this.spotlightOverlay.className = "walkthrough-spotlight-overlay";
    this.spotlightOverlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border-radius: 8px;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7);
      z-index: 999998;
      display: none;
      transition: all 0.15s ease-out;
    `;
    document.body.appendChild(this.spotlightOverlay);
  }

  /**
   * Highlight element by positioning spotlight around it.
   * NOTE: Does NOT set up scroll/resize handlers - WalkthroughUI owns those.
   */
  highlight(element: HTMLElement): void {
    console.log(
      "[SpotlightRenderer] highlight() called",
      "element:",
      element?.tagName,
    );

    // Stop observing previous element
    if (this.currentElement && this.resizeObserver) {
      this.resizeObserver.unobserve(this.currentElement);
    }

    this.currentElement = element;

    // Start observing new element for size changes
    if (this.resizeObserver) {
      this.resizeObserver.observe(element);
    }

    // Update position
    this.updatePosition(element);
  }

  /**
   * Update spotlight position (called by WalkthroughUI on scroll/resize).
   */
  updatePosition(element: HTMLElement): void {
    if (!this.spotlightOverlay) {
      console.warn("[SpotlightRenderer] Spotlight overlay not initialized!");
      this.log("Spotlight overlay not initialized", "warn");
      return;
    }

    const rect = element.getBoundingClientRect();
    const padding = SPOTLIGHT_PADDING;

    console.log(
      "[SpotlightRenderer] Element rect:",
      rect.left,
      rect.top,
      rect.width,
      rect.height,
    );

    // Validate rect values - element may be hidden or have zero size
    if (rect.width === 0 || rect.height === 0) {
      console.warn("[SpotlightRenderer] Target element has zero dimensions!");
      this.log("Target element has zero dimensions, hiding spotlight", "warn");
      this.hide();
      return;
    }

    // Position spotlight with padding
    const x = rect.left - padding;
    const y = rect.top - padding;
    const width = rect.width + padding * 2;
    const height = rect.height + padding * 2;

    console.log(
      "[SpotlightRenderer] Setting spotlight position:",
      x,
      y,
      width,
      height,
    );

    // Position the CSS box-shadow overlay
    this.spotlightOverlay.style.left = `${x}px`;
    this.spotlightOverlay.style.top = `${y}px`;
    this.spotlightOverlay.style.width = `${width}px`;
    this.spotlightOverlay.style.height = `${height}px`;
    this.spotlightOverlay.style.display = "block";

    // Also update SVG cutout for backwards compatibility (hidden but functional)
    if (this.spotlightCutout) {
      this.spotlightCutout.setAttribute("x", String(x));
      this.spotlightCutout.setAttribute("y", String(y));
      this.spotlightCutout.setAttribute("width", String(width));
      this.spotlightCutout.setAttribute("height", String(height));
    }

    this.log(`Spotlight positioned: ${x}, ${y} (${width}x${height})`);
  }

  /**
   * Hide spotlight.
   */
  hide(): void {
    // Hide CSS overlay
    if (this.spotlightOverlay) {
      this.spotlightOverlay.style.display = "none";
    }

    // Also hide SVG cutout for backwards compatibility
    if (this.spotlightCutout) {
      this.spotlightCutout.setAttribute("x", "0");
      this.spotlightCutout.setAttribute("y", "0");
      this.spotlightCutout.setAttribute("width", "0");
      this.spotlightCutout.setAttribute("height", "0");
    }

    // Stop observing element
    if (this.currentElement && this.resizeObserver) {
      this.resizeObserver.unobserve(this.currentElement);
    }
    this.currentElement = null;

    this.log("Spotlight hidden");
  }

  /**
   * Clean up ResizeObserver and spotlight overlay.
   */
  destroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // Remove CSS overlay from DOM
    if (this.spotlightOverlay) {
      this.spotlightOverlay.remove();
      this.spotlightOverlay = null;
    }

    this.spotlightCutout = null;
    this.currentElement = null;

    this.log("Destroyed");
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Setup ResizeObserver for element size changes.
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.currentElement) {
        this.updatePosition(this.currentElement);
      }
    });
  }

  /**
   * Log message if debug enabled.
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug && level === "log") return;
    console[level](`[SpotlightRenderer] ${message}`);
  }
}
