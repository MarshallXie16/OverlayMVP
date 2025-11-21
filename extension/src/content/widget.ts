/**
 * Recording Widget Module
 * Floating UI widget shown during workflow recording
 *
 * Features:
 * - Shows recording status with pulsing indicator
 * - Displays step counter in real-time
 * - Stop and Pause buttons
 * - Draggable positioning
 * - Non-intrusive design
 */

// Import CSS
import './widget.css';

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
  private stopCallback: (() => void) | null = null;
  private pauseCallback: (() => void) | null = null;

  constructor() {
    this.createWidget();
  }

  private createWidget(): void {
    // Create widget container
    this.widget = document.createElement('div');
    this.widget.id = 'workflow-recording-widget';

    // Build widget HTML
    this.widget.innerHTML = `
      <div class="widget-container">
        <div class="drag-handle" title="Drag to move">
          <svg viewBox="0 0 24 24">
            <path d="M9 5h2v2H9V5zm0 6h2v2H9v-2zm0 6h2v2H9v-2zm6-12h2v2h-2V5zm0 6h2v2h-2v-2zm0 6h2v2h-2v-2z"/>
          </svg>
        </div>
        <div class="recording-indicator">
          <div class="pulse-dot"></div>
          <span class="recording-text">Recording</span>
          <span class="step-counter">0 steps</span>
        </div>
        <div class="widget-actions">
          <button class="pause-btn" title="Pause recording">
            Pause
          </button>
          <button class="stop-btn" title="Stop recording">
            Stop
          </button>
        </div>
      </div>
    `;

    // Get references to elements
    this.stepCountElement = this.widget.querySelector('.step-counter');

    // Attach event listeners
    const stopBtn = this.widget.querySelector('.stop-btn');
    const pauseBtn = this.widget.querySelector('.pause-btn');

    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        if (this.stopCallback) {
          this.stopCallback();
        }
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        if (this.pauseCallback) {
          this.pauseCallback();
        }
      });
    }

    // Make widget draggable
    this.makeDraggable();
  }

  private makeDraggable(): void {
    if (!this.widget) return;

    const handle = this.widget.querySelector('.drag-handle') as HTMLElement;
    const container = this.widget.querySelector('.widget-container') as HTMLElement;

    if (!handle || !container) return;

    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      isDragging = true;
      initialX = e.clientX - currentX;
      initialY = e.clientY - currentY;
      container.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging || !this.widget) return;

      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      // Update widget position
      this.widget.style.transform = `translate(${currentX}px, ${currentY}px)`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        container.style.cursor = 'move';
      }
    });
  }

  public show(): void {
    if (this.widget && !document.body.contains(this.widget)) {
      document.body.appendChild(this.widget);
      console.log('📍 Recording widget shown');
    }
  }

  public hide(): void {
    if (this.widget && document.body.contains(this.widget)) {
      document.body.removeChild(this.widget);
      console.log('📍 Recording widget hidden');
    }
  }

  public updateStepCount(count: number): void {
    if (this.stepCountElement) {
      const stepText = count === 1 ? 'step' : 'steps';
      this.stepCountElement.textContent = `${count} ${stepText}`;
    }
  }

  public onStop(callback: () => void): void {
    this.stopCallback = callback;
  }

  public onPause(callback: () => void): void {
    this.pauseCallback = callback;
  }
}

// Singleton instance
let widgetInstance: RecordingWidget | null = null;

/**
 * Get or create the recording widget instance
 */
export function getRecordingWidget(): RecordingWidget {
  if (!widgetInstance) {
    widgetInstance = new RecordingWidgetImpl();
  }
  return widgetInstance;
}

/**
 * Show the recording widget
 */
export function showRecordingWidget(): void {
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
