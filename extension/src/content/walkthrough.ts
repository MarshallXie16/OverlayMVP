/**
 * Content Script: Walkthrough Mode
 * Guides users through recorded workflows with visual overlays
 *
 * EXT-001: Walkthrough Messaging & Data Loading
 * EXT-002: Overlay UI Foundation
 */

import type { WalkthroughState, StepResponse } from '@/shared/types';
import { findElement, scrollToElement } from './utils/elementFinder';

console.log('🎯 Walkthrough Mode: Content script loaded');

// Global walkthrough state
let walkthroughState: WalkthroughState | null = null;

// Overlay DOM elements
let overlayContainer: HTMLDivElement | null = null;
let tooltipElement: HTMLDivElement | null = null;
let backdropElement: HTMLDivElement | null = null;
let currentTargetElement: HTMLElement | null = null;

// Action detection state (EXT-004)
let activeListeners: Array<{
  element: EventTarget;
  event: string;
  handler: EventListener;
}> = [];
const inputValues = new WeakMap<HTMLElement, string>();

// Flash success effect with cleanup tracking
const flashPrevStyles = new Map<HTMLElement, { transition: string; boxShadow: string }>();
const flashTimers = new Map<HTMLElement, number>();
function flashElement(element: HTMLElement): void {
  // Save previous inline styles if not saved yet
  if (!flashPrevStyles.has(element)) {
    flashPrevStyles.set(element, {
      transition: element.style.transition,
      boxShadow: element.style.boxShadow,
    });
  }

  // Clear existing timer if any
  const existing = flashTimers.get(element);
  if (existing) window.clearTimeout(existing);

  // Apply flash
  element.style.transition = 'box-shadow 0.15s ease';
  element.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.6)';

  const timerId = window.setTimeout(() => {
    const prev = flashPrevStyles.get(element);
    if (prev) {
      element.style.boxShadow = prev.boxShadow;
      element.style.transition = prev.transition;
      flashPrevStyles.delete(element);
    } else {
      // Fallback restore
      element.style.boxShadow = '';
      element.style.transition = '';
    }
    flashTimers.delete(element);
  }, 250);
  flashTimers.set(element, timerId);
}

function cleanupFlashEffects(): void {
  // Restore any elements that still have flashed styles
  for (const timer of flashTimers.values()) {
    if (timer) window.clearTimeout(timer);
  }
  flashTimers.clear();
  for (const [el, prev] of flashPrevStyles.entries()) {
    el.style.boxShadow = prev.boxShadow;
    el.style.transition = prev.transition;
  }
  flashPrevStyles.clear();
}

/**
 * Initialize walkthrough mode with workflow data
 * Called when background sends WALKTHROUGH_DATA message
 */
async function initializeWalkthrough(payload: {
  workflowId: number;
  workflowName: string;
  startingUrl: string;
  steps: StepResponse[];
  totalSteps: number;
}): Promise<void> {
  console.log(`[Walkthrough] Initializing walkthrough for "${payload.workflowName}"`, {
    workflowId: payload.workflowId,
    totalSteps: payload.totalSteps,
  });

  // Validate payload
  if (!payload.steps || payload.steps.length === 0) {
    console.error('[Walkthrough] No steps provided');
    return;
  }

  // Create walkthrough state
  walkthroughState = {
    workflowId: payload.workflowId,
    workflowName: payload.workflowName,
    startingUrl: payload.startingUrl,
    steps: payload.steps,
    currentStepIndex: 0,
    totalSteps: payload.totalSteps,
    status: 'active',
    error: null,
    retryAttempts: new Map(), // EXT-005: Track retry attempts per step
    startTime: Date.now(), // EXT-006: Track execution time
  };

  console.log('[Walkthrough] State initialized:', walkthroughState);

  // Create overlay UI
  createOverlay();

  // Show first step
  await showCurrentStep();

  walkthroughState.status = 'active';
  console.log(`[Walkthrough] Ready! First step: ${walkthroughState.steps[0]?.instruction || 'No instruction'}`);
}

/**
 * Get current walkthrough state
 */
export function getWalkthroughState(): WalkthroughState | null {
  return walkthroughState;
}

/**
 * Check if walkthrough is active
 */
export function isWalkthroughActive(): boolean {
  return walkthroughState !== null && walkthroughState.status === 'active';
}

/**
 * Advance to next step
 */
export function advanceStep(): boolean {
  if (!walkthroughState) return false;

  if (walkthroughState.currentStepIndex < walkthroughState.totalSteps - 1) {
    walkthroughState.currentStepIndex++;
    console.log(`[Walkthrough] Advanced to step ${walkthroughState.currentStepIndex + 1}/${walkthroughState.totalSteps}`);
    return true;
  }

  // Reached end of workflow
  console.log('[Walkthrough] Workflow completed!');
  walkthroughState.status = 'completed';
  return false;
}

/**
 * Go back to previous step
 */
export function previousStep(): boolean {
  if (!walkthroughState) return false;

  if (walkthroughState.currentStepIndex > 0) {
    walkthroughState.currentStepIndex--;
    console.log(`[Walkthrough] Went back to step ${walkthroughState.currentStepIndex + 1}/${walkthroughState.totalSteps}`);
    return true;
  }

  return false;
}

/**
 * Create overlay DOM structure
 * EXT-002: Overlay UI Foundation
 */
function createOverlay(): void {
  // Check if overlay already exists
  if (overlayContainer) {
    console.warn('[Walkthrough] Overlay already exists');
    return;
  }

  // Create main overlay container
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'walkthrough-overlay';
  overlayContainer.className = 'walkthrough-overlay';
  overlayContainer.setAttribute('role', 'dialog');
  overlayContainer.setAttribute('aria-label', 'Walkthrough guide');

  // Create backdrop with SVG spotlight mask
  backdropElement = document.createElement('div');
  backdropElement.className = 'walkthrough-backdrop';
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('walkthrough-spotlight-mask');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  
  // Create mask definition
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
  mask.id = 'spotlight-mask';
  
  // White rectangle (shows backdrop)
  const whiteRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  whiteRect.setAttribute('fill', 'white');
  whiteRect.setAttribute('width', '100%');
  whiteRect.setAttribute('height', '100%');
  
  // Black rectangle (cutout for spotlight - will be positioned dynamically)
  const spotlightRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  spotlightRect.id = 'spotlight-cutout';
  spotlightRect.setAttribute('fill', 'black');
  spotlightRect.setAttribute('x', '0');
  spotlightRect.setAttribute('y', '0');
  spotlightRect.setAttribute('width', '0');
  spotlightRect.setAttribute('height', '0');
  spotlightRect.setAttribute('rx', '8');
  
  mask.appendChild(whiteRect);
  mask.appendChild(spotlightRect);
  defs.appendChild(mask);
  svg.appendChild(defs);
  
  // Create backdrop rectangle with mask applied
  const backdropRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  backdropRect.setAttribute('fill', 'rgba(0, 0, 0, 0.7)');
  backdropRect.setAttribute('width', '100%');
  backdropRect.setAttribute('height', '100%');
  backdropRect.setAttribute('mask', 'url(#spotlight-mask)');
  
  svg.appendChild(backdropRect);
  backdropElement.appendChild(svg);

  // Create tooltip
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'walkthrough-tooltip';

  // Tooltip will be populated in showCurrentStep()

  // Append to overlay
  overlayContainer.appendChild(backdropElement);
  overlayContainer.appendChild(tooltipElement);

  // Append overlay to body
  document.body.appendChild(overlayContainer);

  console.log('[Walkthrough] Overlay created');
}

/**
 * Destroy overlay and clean up
 */
function destroyOverlay(): void {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
    tooltipElement = null;
    backdropElement = null;
    currentTargetElement = null;
    console.log('[Walkthrough] Overlay destroyed');
  }
}

// Wait for layout to settle after scroll using two rAFs
function waitForLayout(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/**
 * Show current step in overlay
 * Find element, position spotlight, update tooltip
 */
async function showCurrentStep(): Promise<void> {
  if (!walkthroughState || !overlayContainer || !tooltipElement) {
    console.error('[Walkthrough] Cannot show step: missing state or overlay');
    return;
  }

  const currentStep = walkthroughState.steps[walkthroughState.currentStepIndex];
  
  if (!currentStep) {
    console.error('[Walkthrough] Current step is undefined');
    return;
  }

  try {
    // Find target element
    console.log(`[Walkthrough] Finding element for step ${walkthroughState.currentStepIndex + 1}`);
    const result = await findElement(currentStep);
    currentTargetElement = result.element;

    // Scroll into view if needed
    scrollToElement(currentTargetElement);

    // Wait for layout to settle (faster than fixed timeout)
    await waitForLayout();

    // Position spotlight around element
    updateSpotlight(currentTargetElement);

    // Update tooltip content and position
    updateTooltip(currentStep, currentTargetElement);

    // Attach action detection listeners (EXT-004)
    attachActionListeners(currentStep, currentTargetElement);

  } catch (error) {
    console.error('[Walkthrough] Failed to find element:', error);
    showElementNotFoundError(currentStep);
  }
}

/**
 * Update spotlight SVG mask to highlight target element
 */
function updateSpotlight(targetElement: HTMLElement): void {
  const spotlightRect = document.getElementById('spotlight-cutout');
  if (!spotlightRect) return;

  const rect = targetElement.getBoundingClientRect();
  const padding = 8; // Breathing room around element

  spotlightRect.setAttribute('x', String(rect.left - padding));
  spotlightRect.setAttribute('y', String(rect.top - padding));
  spotlightRect.setAttribute('width', String(rect.width + padding * 2));
  spotlightRect.setAttribute('height', String(rect.height + padding * 2));
}

/**
 * Update tooltip content and position
 */
function updateTooltip(step: StepResponse, targetElement: HTMLElement): void {
  if (!tooltipElement || !walkthroughState) return;

  // Update content
  tooltipElement.innerHTML = `
    <div class="walkthrough-tooltip-header">
      <div class="walkthrough-progress">Step ${walkthroughState.currentStepIndex + 1} of ${walkthroughState.totalSteps}</div>
      <button class="walkthrough-close-btn" id="walkthrough-close-btn">×</button>
    </div>
    <div class="walkthrough-tooltip-content">
      ${step.field_label ? `<p class="walkthrough-field-label">${step.field_label}</p>` : ''}
      <p class="walkthrough-instruction">${step.instruction || 'Complete this action'}</p>
      <p class="walkthrough-error hidden" style="color: #EF4444; margin-top: 8px;"></p>
    </div>
    <div class="walkthrough-tooltip-footer">
      <button class="walkthrough-btn walkthrough-btn-back" id="walkthrough-btn-back" ${walkthroughState.currentStepIndex === 0 ? 'disabled' : ''}>
        ← Back
      </button>
      <button class="walkthrough-btn walkthrough-btn-skip hidden" id="walkthrough-btn-skip" style="background: #EF4444;">
        Skip Step
      </button>
      <button class="walkthrough-btn walkthrough-btn-next" id="walkthrough-btn-next">
        ${walkthroughState.currentStepIndex === walkthroughState.totalSteps - 1 ? 'Complete ✓' : 'Next →'}
      </button>
      <button class="walkthrough-btn walkthrough-btn-exit" id="walkthrough-btn-exit">
        Exit
      </button>
    </div>
  `;

  // Position tooltip
  const targetRect = targetElement.getBoundingClientRect();
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const position = calculateTooltipPosition(targetRect, tooltipRect.width, tooltipRect.height);
  
  tooltipElement.style.top = `${position.top}px`;
  tooltipElement.style.left = `${position.left}px`;

  // Attach event listeners
  document.getElementById('walkthrough-btn-next')?.addEventListener('click', handleNext);
  document.getElementById('walkthrough-btn-back')?.addEventListener('click', handleBack);
  document.getElementById('walkthrough-btn-skip')?.addEventListener('click', handleSkipStep);
  document.getElementById('walkthrough-btn-exit')?.addEventListener('click', handleExit);
  document.getElementById('walkthrough-close-btn')?.addEventListener('click', handleExit);
}

/**
 * Calculate optimal tooltip position
 * Try below first, then above, then sides, fallback to corner
 */
function calculateTooltipPosition(
  targetRect: DOMRect,
  tooltipWidth: number,
  tooltipHeight: number
): { top: number; left: number } {
  const padding = 16;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Try below target
  if (targetRect.bottom + padding + tooltipHeight < viewportHeight) {
    return {
      top: targetRect.bottom + padding,
      left: Math.max(padding, Math.min(
        targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        viewportWidth - tooltipWidth - padding
      )),
    };
  }

  // Try above target
  if (targetRect.top - padding - tooltipHeight > 0) {
    return {
      top: targetRect.top - padding - tooltipHeight,
      left: Math.max(padding, Math.min(
        targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        viewportWidth - tooltipWidth - padding
      )),
    };
  }

  // Try right side
  if (targetRect.right + padding + tooltipWidth < viewportWidth) {
    return {
      top: Math.max(padding, Math.min(
        targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
        viewportHeight - tooltipHeight - padding
      )),
      left: targetRect.right + padding,
    };
  }

  // Try left side
  if (targetRect.left - padding - tooltipWidth > 0) {
    return {
      top: Math.max(padding, Math.min(
        targetRect.top + targetRect.height / 2 - tooltipHeight / 2,
        viewportHeight - tooltipHeight - padding
      )),
      left: targetRect.left - padding - tooltipWidth,
    };
  }

  // Fallback: bottom-right corner
  return {
    top: viewportHeight - tooltipHeight - padding,
    left: viewportWidth - tooltipWidth - padding,
  };
}

/**
 * Show error message when element not found
 */
async function showElementNotFoundError(step: StepResponse): Promise<void> {
  if (!tooltipElement || !walkthroughState) return;

  tooltipElement.className = 'walkthrough-tooltip walkthrough-error';
  tooltipElement.innerHTML = `
    <div class="walkthrough-tooltip-header">
      <div class="walkthrough-progress">Error</div>
      <button class="walkthrough-close-btn" id="walkthrough-close-btn">×</button>
    </div>
    <div class="walkthrough-tooltip-content">
      <p class="walkthrough-field-label">
        <span class="walkthrough-error-icon">⚠️</span>
        Element Not Found
      </p>
      <p class="walkthrough-instruction">
        Cannot find "${step.field_label || 'target element'}". This workflow may be outdated.
      </p>
    </div>
    <div class="walkthrough-tooltip-footer">
      <button class="walkthrough-btn walkthrough-btn-back" id="walkthrough-btn-skip">
        Skip Step
      </button>
      <button class="walkthrough-btn walkthrough-btn-exit" id="walkthrough-btn-exit">
        Exit Walkthrough
      </button>
    </div>
  `;

  // Position in center of viewport
  tooltipElement.style.top = '50%';
  tooltipElement.style.left = '50%';
  tooltipElement.style.transform = 'translate(-50%, -50%)';

  // EXT-006: Log element not found via background
  logExecutionViaBackground({
    step_id: step.id,
    status: 'failed',
    error_type: 'element_not_found',
    error_message: `Could not find element for step ${step.step_number}: ${step.field_label || 'Unknown'}`,
    page_url: window.location.href,
  });

  // Attach event listeners
  document.getElementById('walkthrough-btn-skip')?.addEventListener('click', handleNext);
  document.getElementById('walkthrough-btn-exit')?.addEventListener('click', handleExit);
  document.getElementById('walkthrough-close-btn')?.addEventListener('click', handleExit);
}

/**
 * Handle Next button click
 */
function handleNext(): void {
  // Remove action listeners before advancing (EXT-004)
  removeActionListeners();

  if (advanceStep()) {
    showCurrentStep();
  } else {
    // Completed all steps
    showCompletionMessage();
  }
}

/**
 * Handle Back button click
 */
function handleBack(): void {
  // Remove action listeners before going back (EXT-004)
  removeActionListeners();

  if (previousStep()) {
    showCurrentStep();
  }
}

/**
 * Handle Exit button click
 */
function handleExit(): void {
  if (confirm('Are you sure you want to exit this walkthrough?')) {
    exitWalkthrough();
  }
}

/**
 * Show completion message
 */
async function showCompletionMessage(): Promise<void> {
  if (!tooltipElement || !walkthroughState) return;

  tooltipElement.className = 'walkthrough-tooltip';
  tooltipElement.innerHTML = `
    <div class="walkthrough-tooltip-header">
      <div class="walkthrough-progress">Complete!</div>
    </div>
    <div class="walkthrough-tooltip-content">
      <p class="walkthrough-field-label">✓ Workflow Complete!</p>
      <p class="walkthrough-instruction">
        You've successfully completed "${walkthroughState.workflowName}".
      </p>
    </div>
    <div class="walkthrough-tooltip-footer">
      <button class="walkthrough-btn walkthrough-btn-next" id="walkthrough-btn-done">
        Done
      </button>
    </div>
  `;

  // Position in center of viewport
  tooltipElement.style.top = '50%';
  tooltipElement.style.left = '50%';
  tooltipElement.style.transform = 'translate(-50%, -50%)';

  // Remove spotlight
  const spotlightRect = document.getElementById('spotlight-cutout');
  if (spotlightRect) {
    spotlightRect.setAttribute('width', '0');
    spotlightRect.setAttribute('height', '0');
  }

  // EXT-006: Log successful completion via background
  const executionTimeMs = walkthroughState.startTime ? Date.now() - walkthroughState.startTime : null;
  logExecutionViaBackground({
    status: 'success',
    page_url: window.location.href,
    execution_time_ms: executionTimeMs,
  });

  // Attach event listener
  document.getElementById('walkthrough-btn-done')?.addEventListener('click', () => {
    // Clean up without logging again
    if (walkthroughState) {
      removeActionListeners();
      cleanupFlashEffects();
      destroyOverlay();
      walkthroughState = null;
    }
  });
}

/**
 * Get events to listen for based on action type
 * EXT-004: Action Detection
 */
function getEventsForActionType(actionType: string): string[] {
  switch (actionType) {
    case 'click':
      return ['click'];
    case 'input_commit':
      // Mirror recorder heuristics: commit on blur only (not every change)
      return ['blur'];
    case 'select_change':
      return ['change'];
    case 'submit':
      return ['submit'];
    case 'navigate':
      return []; // No auto-advance for navigation
    default:
      return [];
  }
}

/**
 * Check if input value has changed since focus
 */
function hasValueChanged(element: HTMLElement): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return false;
  }
  
  const initialValue = inputValues.get(element) || '';
  const changed = element.value !== initialValue;
  console.log(`[Walkthrough] Value changed: ${changed} (initial: "${initialValue}", current: "${element.value}")`);
  return changed;
}

/**
 * Validate that action matches expected step
 */
function validateAction(
  event: Event,
  step: StepResponse,
  targetElement: HTMLElement
): boolean {
  const eventTarget = event.target as HTMLElement;

  // 1. Check if event target matches expected target element
  if (eventTarget !== targetElement) {
    console.log('[Walkthrough] Action validation failed: wrong element');
    return false;
  }

  // 2. Check if action type matches
  switch (step.action_type) {
    case 'click':
      return event.type === 'click';
    
    case 'input_commit':
      // Commit on blur only (mirror recorder); ensure value actually changed
      return event.type === 'blur' && hasValueChanged(eventTarget);
    
    case 'select_change':
      return event.type === 'change' && 
             eventTarget instanceof HTMLSelectElement;
    
    case 'submit':
      return event.type === 'submit';
    
    default:
      return false;
  }
}

/**
 * Handle detected action - validate and auto-advance if correct
 */
function handleActionDetected(
  event: Event,
  step: StepResponse,
  targetElement: HTMLElement
): void {
  console.log(`[Walkthrough] Action detected: ${event.type} on`, event.target);

  // Validate action
  if (!validateAction(event, step, targetElement)) {
    console.log('[Walkthrough] Action did not match expected step');
    // EXT-005: Handle incorrect action
    handleIncorrectAction(step, targetElement, 'That\'s not quite right. Please try the highlighted step.');
    return;
  }

  console.log('[Walkthrough] Correct action detected! Auto-advancing...');

  // Reset retry counter for this step (EXT-005)
  if (walkthroughState) {
    walkthroughState.retryAttempts.set(walkthroughState.currentStepIndex, 0);
  }

  // Show success feedback
  flashElement(targetElement);

  // Auto-advance after a small delay tuned per action
  const delay = ((): number => {
    switch (step.action_type) {
      case 'click':
      case 'submit':
        return 60;
      case 'select_change':
        return 120;
      case 'input_commit':
        return 150;
      default:
        return 120;
    }
  })();

  setTimeout(() => {
    handleNext();
  }, delay);
}

/**
 * Attach action detection listeners to target element
 * EXT-004: Auto-advance on correct action
 */
function attachActionListeners(
  step: StepResponse,
  targetElement: HTMLElement
): void {
  // Clear previous listeners
  removeActionListeners();

  // Track initial value for inputs
  if (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement) {
    inputValues.set(targetElement, targetElement.value);
    console.log(`[Walkthrough] Tracking initial value: "${targetElement.value}"`);
  }

  // Determine which events to listen for
  const events = getEventsForActionType(step.action_type);
  
  if (events.length === 0) {
    console.log(`[Walkthrough] No auto-advance for action type: ${step.action_type}`);
    return;
  }

  console.log(`[Walkthrough] Attaching listeners for ${step.action_type}:`, events);

  // For input commits, also listen to focus to reset baseline value
  if (step.action_type === 'input_commit') {
    const focusHandler = () => {
      if (targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement) {
        inputValues.set(targetElement, targetElement.value);
      }
    };
    targetElement.addEventListener('focusin', focusHandler);
    activeListeners.push({ element: targetElement, event: 'focusin', handler: focusHandler });
  }

  // Attach listeners
  events.forEach(eventType => {
    const handler = (event: Event) => {
      handleActionDetected(event, step, targetElement);
    };

    // For submit events, listen on form (not button)
    const listenOn: EventTarget = eventType === 'submit' 
      ? targetElement.closest('form') || document 
      : targetElement;

    listenOn.addEventListener(eventType, handler);
    activeListeners.push({ element: listenOn, event: eventType, handler });
  });
}

/**
 * Remove all active action listeners
 */
function removeActionListeners(): void {
  activeListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler);
  });
  activeListeners = [];
  console.log('[Walkthrough] Removed action listeners');
}

/**
 * Log execution via background to avoid importing API client in content script (EXT-006)
 */
function logExecutionViaBackground(data: {
  step_id?: number | null;
  status: 'success' | 'healed_deterministic' | 'healed_ai' | 'failed';
  error_type?: 'element_not_found' | 'timeout' | 'navigation_error' | 'user_exit' | null;
  error_message?: string | null;
  healing_confidence?: number | null;
  deterministic_score?: number | null;
  page_url?: string | null;
  execution_time_ms?: number | null;
}): void {
  if (!walkthroughState) return;
  chrome.runtime.sendMessage(
    {
      type: 'LOG_EXECUTION',
      payload: { workflowId: walkthroughState.workflowId, ...data },
    },
    () => {
      // Swallow lastError to avoid noisy console warnings
      const e = chrome.runtime.lastError;
      if (e) {
        console.debug('[Walkthrough] LOG_EXECUTION ignored:', e.message);
      }
    }
  );
}

/**
 * Handle incorrect action (EXT-005)
 */
function handleIncorrectAction(
  _step: StepResponse,
  targetElement: HTMLElement,
  message: string
): void {
  if (!walkthroughState || !tooltipElement) return;

  // Increment retry counter
  const attempts = walkthroughState.retryAttempts.get(walkthroughState.currentStepIndex) || 0;
  walkthroughState.retryAttempts.set(walkthroughState.currentStepIndex, attempts + 1);

  console.log(`[Walkthrough] Incorrect action. Attempt ${attempts + 1}/3`);

  // Show error message in tooltip
  const errorEl = tooltipElement.querySelector('.walkthrough-error');
  if (errorEl) {
    errorEl.textContent = attempts >= 2 
      ? 'Having trouble? You can skip this step.'
      : message;
    errorEl.classList.remove('hidden');
  }

  // After 3 failed attempts, show Skip button
  if (attempts >= 2) {
    const skipBtn = tooltipElement.querySelector('#walkthrough-btn-skip');
    if (skipBtn) {
      skipBtn.classList.remove('hidden');
    }
  }

  // Flash target element red to indicate error
  if (targetElement) {
    const prevBoxShadow = targetElement.style.boxShadow;
    targetElement.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.6)'; // red
    setTimeout(() => {
      targetElement.style.boxShadow = prevBoxShadow;
    }, 400);
  }
}

/**
 * Handle skip step (EXT-005)
 */
function handleSkipStep(): void {
  if (!walkthroughState) return;

  console.log('[Walkthrough] Skipping step', walkthroughState.currentStepIndex + 1);

  // Log skipped step as failed (EXT-006)
  const currentStep = walkthroughState.steps[walkthroughState.currentStepIndex];
  if (currentStep) {
    logExecutionViaBackground({
      step_id: currentStep.id,
      status: 'failed',
      error_type: 'user_exit',
      error_message: 'User skipped step after 3 failed attempts',
      page_url: window.location.href,
    });
  }

  // Advance to next step
  handleNext();
}

/**
 * Exit walkthrough mode
 */
export function exitWalkthrough(): void {
  if (!walkthroughState) return;

  console.log('[Walkthrough] Exiting walkthrough');
  
  // EXT-006: Log early exit as failed via background
  const executionTimeMs = walkthroughState.startTime ? Date.now() - walkthroughState.startTime : null;
  logExecutionViaBackground({
    status: 'failed',
    error_type: 'user_exit',
    error_message: 'User exited walkthrough early',
    page_url: window.location.href,
    execution_time_ms: executionTimeMs,
  });
  
  // Clean up action listeners (EXT-004)
  removeActionListeners();
  // Clean up any lingering visual effects on page elements
  cleanupFlashEffects();
  
  // Clean up overlay UI
  destroyOverlay();
  
  // Reset state
  walkthroughState = null;
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Walkthrough] Received message:', message.type);

  if (message.type === 'WALKTHROUGH_DATA') {
    initializeWalkthrough(message.payload);
    sendResponse({ success: true, status: 'initialized' });
    return true;
  }

  if (message.type === 'WALKTHROUGH_ERROR') {
    console.error('[Walkthrough] Error from background:', message.payload.error);
    if (walkthroughState) {
      walkthroughState.status = 'error';
      walkthroughState.error = message.payload.error;
    }
    sendResponse({ success: false });
    return true;
  }

  return true;
});

// Listen for messages from page (dashboard) via window.postMessage
// Forwards START_WALKTHROUGH to background script
window.addEventListener('message', (event: MessageEvent) => {
  try {
    const data = (event.data || {}) as { source?: string; type?: string; payload?: any };
    if (data.source !== 'overlay-dashboard') return;

    if (data.type === 'START_WALKTHROUGH') {
      console.log('[Walkthrough] Forwarding START_WALKTHROUGH from page to background');
      chrome.runtime.sendMessage({ type: 'START_WALKTHROUGH', payload: data.payload }, () => {
        // Swallow lastError to prevent console warnings
        const e = chrome.runtime.lastError;
        if (e) {
          console.debug('[Walkthrough] START_WALKTHROUGH send ignored:', e.message);
        }
      });
    }
  } catch (err) {
    console.error('[Walkthrough] Error handling window message', err);
  }
});
