/**
 * Recording Widget Module
 * Floating pill-shaped UI widget shown during workflow recording
 *
 * Features:
 * - Shows recording status with pulsing indicator
 * - Displays timer in real-time
 * - Displays step counter
 * - Stop and Pause/Resume buttons
 * - Draggable positioning
 * - Glassmorphism design
 *
 * Note: CSS is loaded via manifest.json content_scripts.css
 */

// SVG Icons (inline to avoid dependencies)
const ICONS = {
  gripVertical: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v14l11-7-11-7z"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>`,
};

interface RecordingWidget {
  show(): void;
  hide(): void;
  updateStepCount(count: number): void;
  onStop(callback: () => void): void;
  onPause(callback: () => void): void;
}

class RecordingWidgetImpl implements RecordingWidget {
  private widget: HTMLElement | null = null;
  private stepCountElement: HTMLElement | null = null;
  private timerElement: HTMLElement | null = null;
  private timerLabelElement: HTMLElement | null = null;
  private pauseBtn: HTMLButtonElement | null = null;
  private stopCallback: (() => void) | null = null;
  private pauseCallback: (() => void) | null = null;
  private isPaused: boolean = false;
  private timerInterval: number | null = null;
  private elapsedSeconds: number = 0;

  constructor() {
    console.log("[Widget] Initializing RecordingWidget");
    this.createWidget();
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  private startTimer(): void {
    this.elapsedSeconds = 0;
    this.updateTimerDisplay();
    this.timerInterval = window.setInterval(() => {
      if (!this.isPaused) {
        this.elapsedSeconds++;
        this.updateTimerDisplay();
      }
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      window.clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.elapsedSeconds = 0;
  }

  private updateTimerDisplay(): void {
    if (this.timerElement) {
      this.timerElement.textContent = this.formatTime(this.elapsedSeconds);
    }
  }

  private togglePause(): void {
    this.isPaused = !this.isPaused;

    // Update visual state
    if (this.widget) {
      if (this.isPaused) {
        this.widget.classList.add("paused");
      } else {
        this.widget.classList.remove("paused");
      }
    }

    // Update timer label
    if (this.timerLabelElement) {
      this.timerLabelElement.textContent = this.isPaused ? "Paused" : "Rec";
    }

    // Update pause/resume button
    if (this.pauseBtn) {
      if (this.isPaused) {
        this.pauseBtn.innerHTML = ICONS.play;
        this.pauseBtn.className = "icon-btn resume-btn";
        this.pauseBtn.title = "Resume";
      } else {
        this.pauseBtn.innerHTML = ICONS.pause;
        this.pauseBtn.className = "icon-btn pause-btn";
        this.pauseBtn.title = "Pause";
      }
    }
  }

  private createWidget(): void {
    console.log("[Widget] Creating widget element");
    // Create widget container
    this.widget = document.createElement("div");
    this.widget.id = "workflow-recording-widget";
    console.log("[Widget] Widget element created with ID:", this.widget.id);

    // Build widget HTML with new design
    this.widget.innerHTML = `
      <div class="widget-container">
        <!-- Drag Handle -->
        <div class="drag-handle" title="Drag to move">
          ${ICONS.gripVertical}
        </div>

        <!-- Status Section (Recording indicator + Timer) -->
        <div class="status-section">
          <div class="recording-indicator">
            <span class="pulse-ring"></span>
            <span class="pulse-dot"></span>
          </div>
          <div class="timer-display">
            <span class="timer-label">Rec</span>
            <span class="timer-value">0:00</span>
          </div>
        </div>

        <!-- Step Counter -->
        <div class="step-counter">
          <span class="step-count">0</span>
          <span class="step-label">Steps</span>
        </div>

        <!-- Actions -->
        <div class="widget-actions">
          <button class="icon-btn pause-btn" title="Pause">
            ${ICONS.pause}
          </button>
          <button class="icon-btn stop-btn" title="Finish Recording">
            ${ICONS.stop}
          </button>
        </div>
      </div>
    `;

    // Get references to elements
    this.stepCountElement = this.widget.querySelector(".step-count");
    this.timerElement = this.widget.querySelector(".timer-value");
    this.timerLabelElement = this.widget.querySelector(".timer-label");
    this.pauseBtn = this.widget.querySelector(
      ".pause-btn",
    ) as HTMLButtonElement;
    const stopBtn = this.widget.querySelector(".stop-btn");

    // Attach event listeners
    if (stopBtn) {
      stopBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.stopCallback) {
          this.stopCallback();
        }
      });
    }

    if (this.pauseBtn) {
      this.pauseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.togglePause();
        if (this.pauseCallback) {
          this.pauseCallback();
        }
      });
    }

    // Make widget draggable
    this.makeDraggable();

    console.log("[Widget] Widget creation complete");
  }

  private makeDraggable(): void {
    if (!this.widget) return;

    const handle = this.widget.querySelector(".drag-handle") as HTMLElement;
    const widgetEl = this.widget;

    if (!handle) return;

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    handle.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      initialX = e.clientX - currentX;
      initialY = e.clientY - currentY;
      widgetEl.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isDragging) return;

      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      // Update widget position
      widgetEl.style.transform = `translate(${currentX}px, ${currentY}px)`;
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        widgetEl.style.cursor = "auto";
      }
    });
  }

  public show(): void {
    console.log("[Widget] show() called");
    if (!this.widget) {
      console.error("[Widget] Widget element is null, cannot show");
      return;
    }

    if (document.body.contains(this.widget)) {
      console.log("[Widget] Widget already in DOM");
      return;
    }

    // Reset state
    this.isPaused = false;
    this.widget.classList.remove("paused");
    if (this.timerLabelElement) {
      this.timerLabelElement.textContent = "Rec";
    }
    if (this.pauseBtn) {
      this.pauseBtn.innerHTML = ICONS.pause;
      this.pauseBtn.className = "icon-btn pause-btn";
      this.pauseBtn.title = "Pause";
    }

    console.log("[Widget] Appending widget to document.body");
    document.body.appendChild(this.widget);

    // Start timer
    this.startTimer();

    console.log("[Widget] 📍 Recording widget shown successfully");

    // Verify widget is visible
    const widgetElement = document.getElementById("workflow-recording-widget");
    if (widgetElement) {
      console.log("[Widget] Widget verified in DOM with styles:", {
        display: window.getComputedStyle(widgetElement).display,
        visibility: window.getComputedStyle(widgetElement).visibility,
        opacity: window.getComputedStyle(widgetElement).opacity,
      });
    } else {
      console.error("[Widget] Widget not found in DOM after appending!");
    }
  }

  public hide(): void {
    // Stop timer
    this.stopTimer();

    if (this.widget && document.body.contains(this.widget)) {
      document.body.removeChild(this.widget);
      console.log("📍 Recording widget hidden");
    }
  }

  public updateStepCount(count: number): void {
    if (this.stepCountElement) {
      this.stepCountElement.textContent = String(count);
    }
  }

  public onStop(callback: () => void): void {
    this.stopCallback = callback;
  }

  public onPause(callback: () => void): void {
    this.pauseCallback = callback;
  }

  /**
   * Restore widget state after navigation (multi-page recording)
   */
  public restoreState(elapsedSeconds: number, isPaused: boolean): void {
    console.log("[Widget] Restoring state:", { elapsedSeconds, isPaused });

    // Restore elapsed time
    this.elapsedSeconds = elapsedSeconds;
    this.updateTimerDisplay();

    // Restore pause state
    this.isPaused = isPaused;
    if (this.widget) {
      if (isPaused) {
        this.widget.classList.add("paused");
      } else {
        this.widget.classList.remove("paused");
      }
    }

    // Update timer label
    if (this.timerLabelElement) {
      this.timerLabelElement.textContent = isPaused ? "Paused" : "Rec";
    }

    // Update pause/resume button
    if (this.pauseBtn) {
      if (isPaused) {
        this.pauseBtn.innerHTML = ICONS.play;
        this.pauseBtn.className = "icon-btn resume-btn";
        this.pauseBtn.title = "Resume";
      } else {
        this.pauseBtn.innerHTML = ICONS.pause;
        this.pauseBtn.className = "icon-btn pause-btn";
        this.pauseBtn.title = "Pause";
      }
    }

    // Start timer interval (it will respect isPaused flag)
    if (this.timerInterval === null) {
      this.timerInterval = window.setInterval(() => {
        if (!this.isPaused) {
          this.elapsedSeconds++;
          this.updateTimerDisplay();
        }
      }, 1000);
    }

    console.log("[Widget] State restored successfully");
  }
}

// Singleton instance
let widgetInstance: RecordingWidget | null = null;

/**
 * Get or create the recording widget instance
 */
export function getRecordingWidget(): RecordingWidget {
  if (!widgetInstance) {
    console.log("[Widget] Creating new widget instance");
    widgetInstance = new RecordingWidgetImpl();
  } else {
    console.log("[Widget] Reusing existing widget instance");
  }
  return widgetInstance;
}

/**
 * Show the recording widget
 */
export function showRecordingWidget(): void {
  console.log("[Widget] showRecordingWidget() called");
  const widget = getRecordingWidget();
  widget.show();
}

/**
 * Hide the recording widget
 */
export function hideRecordingWidget(): void {
  const widget = getRecordingWidget();
  widget.hide();
}

/**
 * Update step count in the widget
 */
export function updateWidgetStepCount(count: number): void {
  const widget = getRecordingWidget();
  widget.updateStepCount(count);
}

/**
 * Set callback for stop button
 */
export function onWidgetStop(callback: () => void): void {
  const widget = getRecordingWidget();
  widget.onStop(callback);
}

/**
 * Set callback for pause button
 */
export function onWidgetPause(callback: () => void): void {
  const widget = getRecordingWidget();
  widget.onPause(callback);
}

/**
 * Restore widget state after navigation (multi-page recording)
 * Restores timer value and pause state
 */
export function restoreWidgetState(
  elapsedSeconds: number,
  isPaused: boolean,
): void {
  const widget = getRecordingWidget() as RecordingWidgetImpl;
  if (widget && typeof (widget as any).restoreState === "function") {
    (widget as any).restoreState(elapsedSeconds, isPaused);
  }
}
