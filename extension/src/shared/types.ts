/**
 * Shared TypeScript types for Chrome Extension
 * These types match the backend Pydantic schemas exactly
 *
 * Last updated: 2025-11-20 (FE-002)
 */

// ============================================================================
// AUTH TYPES (backend/app/schemas/auth.py)
// ============================================================================

/**
 * Request payload for user signup
 */
export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  company_name?: string | null;
  invite_token?: string | null;
}

/**
 * Request payload for user login
 */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * User data returned in API responses
 */
export interface UserResponse {
  id: number;
  email: string;
  name: string;
  role: string;
  company_id: number;
  company_name: string;
  created_at: string; // ISO 8601 datetime
  last_login_at: string | null; // ISO 8601 datetime
}

/**
 * Authentication response with JWT token
 */
export interface TokenResponse {
  access_token: string;
  token_type: string; // "bearer"
  user: UserResponse;
}

// ============================================================================
// WORKFLOW TYPES (backend/app/schemas/workflow.py)
// ============================================================================

/**
 * Request payload for creating a new workflow
 */
export interface CreateWorkflowRequest {
  name: string;
  description?: string | null;
  starting_url: string;
  tags?: string[];
  steps: StepCreate[];
}

/**
 * Request payload for updating workflow metadata
 */
export interface UpdateWorkflowRequest {
  name?: string;
  description?: string | null;
  tags?: string[];
  status?:
    | "draft"
    | "processing"
    | "active"
    | "needs_review"
    | "broken"
    | "archived";
}

/**
 * Full workflow response with steps (GET /api/workflows/:id)
 */
export interface WorkflowResponse {
  id: number;
  company_id: number;
  created_by: number | null;
  name: string;
  description: string | null;
  starting_url: string;
  tags: string[];
  status:
    | "draft"
    | "processing"
    | "active"
    | "needs_review"
    | "broken"
    | "archived";
  success_rate: number;
  total_uses: number;
  consecutive_failures: number;
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
  last_successful_run: string | null; // ISO 8601 datetime
  last_failed_run: string | null; // ISO 8601 datetime
  steps: StepResponse[];
  step_count: number;
}

/**
 * Workflow summary for list view (GET /api/workflows)
 */
export interface WorkflowListItem {
  id: number;
  company_id: number;
  created_by: number | null;
  name: string;
  description: string | null;
  starting_url: string;
  tags: string[];
  status:
    | "draft"
    | "processing"
    | "active"
    | "needs_review"
    | "broken"
    | "archived";
  success_rate: number;
  total_uses: number;
  consecutive_failures: number;
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
  last_successful_run: string | null; // ISO 8601 datetime
  last_failed_run: string | null; // ISO 8601 datetime
  step_count: number;
}

/**
 * Paginated workflow list response
 */
export interface WorkflowListResponse {
  total: number;
  limit: number;
  offset: number;
  workflows: WorkflowListItem[];
}

/**
 * Immediate response after workflow creation
 */
export interface CreateWorkflowResponse {
  workflow_id: number;
  status: "processing";
}

// ============================================================================
// STEP TYPES (backend/app/schemas/step.py)
// ============================================================================

/**
 * Request payload for creating a new step
 */
export interface StepCreate {
  step_number: number;
  timestamp?: string | null; // ISO 8601 datetime
  action_type:
    | "click"
    | "input_commit"
    | "select_change"
    | "submit"
    | "navigate";
  selectors: Record<string, any>;
  element_meta: Record<string, any>;
  page_context: Record<string, any>;
  action_data?: Record<string, any> | null;
  dom_context?: Record<string, any> | null;
  screenshot_id?: number | null;
}

/**
 * Full step response with AI labels
 */
export interface StepResponse {
  id: number;
  workflow_id: number;
  step_number: number;
  timestamp: string | null; // ISO 8601 datetime
  action_type: string;
  selectors: Record<string, any>;
  element_meta: Record<string, any>;
  page_context: Record<string, any>;
  action_data: Record<string, any> | null;
  dom_context: Record<string, any> | null;
  screenshot_id: number | null;

  // AI-generated labels
  field_label: string | null;
  instruction: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_generated_at: string | null; // ISO 8601 datetime

  // Admin edits
  label_edited: boolean;
  instruction_edited: boolean;
  edited_by: number | null;
  edited_at: string | null; // ISO 8601 datetime

  // Auto-healing
  healed_selectors: Record<string, any> | null;
  healed_at: string | null; // ISO 8601 datetime
  healing_confidence: number | null;
  healing_method: string | null;

  created_at: string; // ISO 8601 datetime
}

/**
 * Request payload for updating step labels (admin editing)
 */
export interface StepUpdate {
  field_label?: string | null;
  instruction?: string | null;
}

// ============================================================================
// SCREENSHOT TYPES (backend/app/schemas/screenshot.py)
// ============================================================================

/**
 * Request payload for screenshot upload (multipart form data)
 */
export interface ScreenshotUploadRequest {
  workflow_id: number;
  step_id?: string | null;
}

/**
 * Screenshot upload response
 */
export interface ScreenshotResponse {
  screenshot_id: number;
  storage_url: string;
  storage_key: string;
  hash: string;
  file_size: number | null;
  width: number | null;
  height: number | null;
  format: string;
  created_at: string; // ISO 8601 datetime
  deduplicated: boolean;
}

// ============================================================================
// EXTENSION-SPECIFIC TYPES
// ============================================================================

/**
 * Message types for Chrome extension communication
 */
export type MessageType =
  | "PING"
  | "PONG"
  | "START_RECORDING"
  | "STOP_RECORDING"
  | "START_WALKTHROUGH"
  | "WALKTHROUGH_DATA"
  | "WALKTHROUGH_ERROR"
  | "CAPTURE_SCREENSHOT"
  | "GET_RECORDING_STATE"
  | "SAVE_STEP"
  | "SCREENSHOT_CAPTURED"
  | "LOG_EXECUTION"
  | "LOG_HEALING_ATTEMPT"
  | "VALIDATE_HEALING"
  | "STEP_SAVED"
  | "ERROR";

/**
 * Extension message structure
 */
export interface ExtensionMessage<T = any> {
  type: MessageType;
  payload?: T;
  timestamp?: number;
}

/**
 * Recording state stored in chrome.storage
 */
export interface RecordingState {
  isRecording: boolean;
  workflowId: number | null;
  workflowName: string | null;
  startingUrl: string | null;
  steps: StepCreate[];
  currentStepNumber: number;
}

/**
 * Walkthrough state for content script
 * EXT-001: Walkthrough Messaging & Data Loading
 * EXT-005: Error tracking and retry logic
 * EXT-006: Execution timing
 */
export interface WalkthroughState {
  workflowId: number;
  workflowName: string;
  startingUrl: string;
  steps: StepResponse[];
  currentStepIndex: number;
  totalSteps: number;
  status: "initializing" | "active" | "completed" | "error";
  error: string | null;
  // EXT-005: Retry tracking
  retryAttempts: Map<number, number>; // stepIndex -> attempt count
  // EXT-006: Execution timing
  startTime: number | null; // Date.now() timestamp
}

/**
 * Auth state stored in chrome.storage
 */
export interface AuthState {
  token: string | null;
  user: UserResponse | null;
  expiresAt: string | null; // ISO 8601 datetime
}

// ============================================================================
// API ERROR TYPES
// ============================================================================

/**
 * Standard API error response
 */
export interface ApiError {
  detail: string | { message: string; field?: string }[];
  status?: number;
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: any;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
}

// ============================================================================
// HEALING VALIDATION TYPES (backend/app/schemas/healing.py)
// ============================================================================

/**
 * Visual region of the page where element appears
 */
export type VisualRegion =
  | "header"
  | "main"
  | "footer"
  | "sidebar"
  | "modal"
  | "unknown";

/**
 * Form context for an element
 */
export interface FormContextApi {
  form_id: string | null;
  form_action: string | null;
  form_name: string | null;
  form_classes: string[];
  field_index: number;
  total_fields: number;
}

/**
 * Nearby landmarks for contextual anchoring
 */
export interface NearbyLandmarksApi {
  closest_heading: { text: string; level: number; distance: number } | null;
  closest_label: { text: string; for_id: string | null } | null;
  sibling_texts: string[];
  container_text: string | null;
}

/**
 * Element context for healing validation API
 */
export interface ElementContextApi {
  tag_name: string;
  text: string | null;
  role: string | null;
  type: string | null;
  id: string | null;
  name: string | null;
  classes: string[];
  data_testid: string | null;
  label_text: string | null;
  placeholder: string | null;
  aria_label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  visual_region: VisualRegion;
  form_context: FormContextApi | null;
  nearby_landmarks: NearbyLandmarksApi | null;
}

/**
 * Request payload for healing validation
 */
export interface HealingValidationRequest {
  workflow_id: number;
  step_id: number;
  original_context: ElementContextApi;
  candidate_context: ElementContextApi;
  deterministic_score: number;
  factor_scores: Record<string, number>;
  original_screenshot: string | null;
  current_screenshot: string | null;
  page_url: string;
  original_url: string;
  field_label: string | null;
}

/**
 * Response from healing validation
 */
export interface HealingValidationResponse {
  is_match: boolean;
  ai_confidence: number;
  reasoning: string;
  combined_score: number;
  recommendation: "accept" | "reject" | "prompt_user";
  ai_model: string;
}
