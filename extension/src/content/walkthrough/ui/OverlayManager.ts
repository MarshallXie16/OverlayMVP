/**
 * Overlay Manager
 *
 * Creates and manages the overlay container and SVG backdrop.
 * Maintains exact DOM parity with existing walkthrough.ts for CSS compatibility.
 *
 * DOM Structure:
 * <div id="walkthrough-overlay" class="walkthrough-overlay" role="dialog">
 *   <div class="walkthrough-backdrop">
 *     <svg class="walkthrough-spotlight-mask">
 *       <defs>
 *         <mask id="wt-mask-{random}">
 *           <rect fill="white" width="100%" height="100%"/>
 *           <rect id="wt-cutout-{random}" fill="black" rx="8"/>
 *         </mask>
 *       </defs>
 *       <rect fill="rgba(0, 0, 0, 0.7)" mask="url(#wt-mask-{random})"/>
 *     </svg>
 *   </div>
 *   <div class="walkthrough-tooltip">...</div>
 * </div>
 *
 * Note: Mask/cutout IDs are randomly generated to avoid conflicts with page SVGs.
 */

// SVG namespace for creating SVG elements
const SVG_NS = "http://www.w3.org/2000/svg";

// ============================================================================
// OVERLAY MANAGER
// ============================================================================

export class OverlayManager {
  private container: HTMLDivElement | null = null;
  private backdrop: HTMLDivElement | null = null;
  private svg: SVGSVGElement | null = null;
  private spotlightCutout: SVGRectElement | null = null;

  /**
   * Creates the overlay container with SVG backdrop.
   * Handles stale overlay cleanup (BUG-001 fix).
   *
   * @returns Created elements for use by other components
   */
  create(): {
    container: HTMLDivElement;
    backdrop: HTMLDivElement;
    svg: SVGSVGElement;
    spotlightCutout: SVGRectElement;
  } {
    // BUG-001 Fix: Check DOM for existing overlay (handles script re-injection)
    // When background re-injects content script, module state is reset but DOM persists
    const existingOverlay = document.getElementById("walkthrough-overlay");
    if (existingOverlay) {
      console.log(
        "[OverlayManager] Removing stale overlay from DOM after re-injection",
      );
      existingOverlay.remove();
    }

    // Create main overlay container
    this.container = document.createElement("div");
    this.container.id = "walkthrough-overlay";
    this.container.className = "walkthrough-overlay";
    this.container.setAttribute("role", "dialog");
    this.container.setAttribute("aria-modal", "true");
    this.container.setAttribute("aria-label", "Walkthrough guide");

    // Create backdrop wrapper
    this.backdrop = document.createElement("div");
    this.backdrop.className = "walkthrough-backdrop";

    // Create SVG with spotlight mask
    this.svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.svg.classList.add("walkthrough-spotlight-mask");
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "100%");

    // Create mask definition with unique IDs to avoid conflicts with page SVGs
    const maskId = `wt-mask-${Math.random().toString(36).slice(2, 9)}`;
    const cutoutId = `wt-cutout-${Math.random().toString(36).slice(2, 9)}`;

    const defs = document.createElementNS(SVG_NS, "defs");
    const mask = document.createElementNS(SVG_NS, "mask");
    mask.id = maskId;
    // Ensure consistent mask behavior across sites (some page CSS can override defaults).
    // Using luminance ensures a black cutout produces a transparent "hole".
    // Set as both SVG attribute AND CSS property for maximum browser compatibility.
    mask.setAttribute("mask-type", "luminance");
    mask.style.setProperty("mask-type", "luminance");
    // Use viewport/user coordinates for spotlight positioning.
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("maskContentUnits", "userSpaceOnUse");

    // White rectangle (shows backdrop - everything visible)
    const whiteRect = document.createElementNS(SVG_NS, "rect");
    whiteRect.setAttribute("fill", "white");
    whiteRect.setAttribute("width", "100%");
    whiteRect.setAttribute("height", "100%");

    // Black rectangle (cutout for spotlight - will be positioned dynamically)
    this.spotlightCutout = document.createElementNS(
      SVG_NS,
      "rect",
    ) as SVGRectElement;
    this.spotlightCutout.id = cutoutId;
    this.spotlightCutout.setAttribute("fill", "black");
    this.spotlightCutout.setAttribute("x", "0");
    this.spotlightCutout.setAttribute("y", "0");
    this.spotlightCutout.setAttribute("width", "0");
    this.spotlightCutout.setAttribute("height", "0");
    this.spotlightCutout.setAttribute("rx", "8");

    // Assemble mask
    mask.appendChild(whiteRect);
    mask.appendChild(this.spotlightCutout);
    defs.appendChild(mask);
    this.svg.appendChild(defs);

    // Create backdrop rectangle with mask applied
    // NOTE: This SVG-based backdrop is now hidden since we use CSS box-shadow
    // for the spotlight effect. The SVG mask approach was unreliable across sites.
    // The spotlight overlay in SpotlightRenderer provides the dark overlay via box-shadow.
    const backdropRect = document.createElementNS(SVG_NS, "rect");
    backdropRect.setAttribute("fill", "rgba(0, 0, 0, 0.7)");
    backdropRect.setAttribute("width", "100%");
    backdropRect.setAttribute("height", "100%");
    backdropRect.setAttribute("mask", `url(#${maskId})`);
    // Hide the SVG backdrop - CSS box-shadow provides the overlay now
    backdropRect.style.display = "none";

    this.svg.appendChild(backdropRect);
    this.backdrop.appendChild(this.svg);

    // Append backdrop to overlay (tooltip will be appended by TooltipRenderer)
    this.container.appendChild(this.backdrop);

    // Append overlay to body
    document.body.appendChild(this.container);

    console.log("[OverlayManager] Overlay created");

    return {
      container: this.container,
      backdrop: this.backdrop,
      svg: this.svg,
      spotlightCutout: this.spotlightCutout,
    };
  }

  /**
   * Destroys overlay and cleans up all DOM elements.
   */
  destroy(): void {
    if (this.container) {
      this.container.remove();
      console.log("[OverlayManager] Overlay destroyed");
    }

    this.container = null;
    this.backdrop = null;
    this.svg = null;
    this.spotlightCutout = null;
  }

  /**
   * Returns true if overlay is currently created.
   */
  isCreated(): boolean {
    return this.container !== null;
  }

  /**
   * Get the container element.
   */
  getContainer(): HTMLDivElement | null {
    return this.container;
  }

  /**
   * Get the backdrop element.
   */
  getBackdrop(): HTMLDivElement | null {
    return this.backdrop;
  }

  /**
   * Get the SVG element.
   */
  getSvg(): SVGSVGElement | null {
    return this.svg;
  }

  /**
   * Get the spotlight cutout element.
   */
  getSpotlightCutout(): SVGRectElement | null {
    return this.spotlightCutout;
  }
}
