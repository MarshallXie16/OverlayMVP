/**
 * Shared TypeScript types for Dashboard
 * These types match the backend Pydantic schemas exactly
 * Reused from extension/src/shared/types.ts
 */

// ============================================================================
// AUTH TYPES
// ============================================================================

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
  company_name?: string | null;
  invite_token?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  id: number;
  email: string;
  name: string;
  role: string;
  company_id: number;
  company_name: string;
  created_at: string;
  last_login_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

// ============================================================================
// USER PROFILE TYPES
// ============================================================================

export interface UpdateProfileRequest {
  name?: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

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
  created_at: string;
  updated_at: string;
  last_successful_run: string | null;
  last_failed_run: string | null;
  step_count: number;
}

export interface WorkflowListResponse {
  total: number;
  limit: number;
  offset: number;
  workflows: WorkflowListItem[];
}

export interface WorkflowResponse extends WorkflowListItem {
  steps: StepResponse[];
}

export interface StepResponse {
  id: number;
  workflow_id: number;
  step_number: number;
  timestamp: string | null;
  action_type:
    | "click"
    | "input_commit"
    | "select_change"
    | "submit"
    | "navigate";
  selectors: Selectors;
  element_meta: ElementMeta;
  page_context: PageContext;
  action_data: Record<string, any> | null;
  dom_context: Record<string, any> | null;
  screenshot_id: number | null;

  // AI-generated labels
  field_label: string | null;
  instruction: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_generated_at: string | null;

  // Admin edits
  label_edited: boolean;
  instruction_edited: boolean;
  edited_by: number | null;
  edited_at: string | null;

  // Auto-healing (future)
  healed_selectors: Record<string, any> | null;
  healed_at: string | null;
  healing_confidence: number | null;
  healing_method: string | null;

  created_at: string;
}

export interface UpdateStepRequest {
  field_label?: string;
  instruction?: string;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  tags?: string[];
  status?: "draft" | "active" | "archived" | "needs_review" | "broken";
}

export interface Selectors {
  primary: string | null;
  css: string;
  xpath: string;
  data_testid?: string;
  stable_attrs?: Record<string, any>;
}

export interface ElementMeta {
  tag_name: string;
  role?: string;
  type?: string;
  inner_text?: string;
  classes: string[];
  bounding_box: BoundingBox;
  parent?: ParentInfo;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParentInfo {
  tag_name: string;
  role?: string;
  classes: string[];
}

export interface PageContext {
  url: string;
  title: string;
  viewport: Viewport;
  timestamp: string;
}

export interface Viewport {
  width: number;
  height: number;
}

// ============================================================================
// COMPANY TYPES
// ============================================================================

export type UserRole = "admin" | "editor" | "viewer";
export type UserStatus = "active" | "suspended";

export interface CompanyResponse {
  id: number;
  name: string;
  invite_token: string;
  created_at: string;
  member_count: number;
}

export interface TeamMemberResponse {
  id: number;
  name: string | null;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
}

export interface UpdateCompanyRequest {
  name: string;
}

export interface UpdateMemberRoleRequest {
  role: UserRole;
}

export interface UpdateMemberStatusRequest {
  status: UserStatus;
}

export interface InviteInfoResponse {
  company_name: string;
}

// ============================================================================
// INVITE TYPES
// ============================================================================

export interface InviteCreateRequest {
  email: string;
  role: UserRole;
}

export interface InviteResponse {
  id: number;
  token: string;
  email: string;
  role: UserRole;
  company_id: number;
  invited_by_id: number;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface InviteListResponse {
  invites: InviteResponse[];
  total: number;
}

export interface InviteVerifyResponse {
  valid: boolean;
  company_name: string | null;
  role: UserRole | null;
  email: string | null;
  expired: boolean;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type NotificationType =
  | "workflow_broken"
  | "workflow_healed"
  | "low_confidence"
  | "high_failure_rate";

export type NotificationSeverity = "info" | "warning" | "error";

export interface NotificationResponse {
  id: number;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string | null;
  action_url: string | null;
  workflow_id: number | null;
  read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: NotificationResponse[];
  unread_count: number;
  total: number;
}

export interface MarkAsReadRequest {
  read: boolean;
}

// ============================================================================
// HEALTH DASHBOARD TYPES
// ============================================================================

export type HealthLogStatus =
  | "success"
  | "healed_deterministic"
  | "healed_ai"
  | "failed";

export interface HealthLogResponse {
  id: number;
  workflow_id: number;
  workflow_name: string;
  step_id: number | null;
  status: HealthLogStatus;
  error_type: string | null;
  error_message: string | null;
  healing_confidence: number | null;
  execution_time_ms: number | null;
  page_url: string | null;
  created_at: string;
}

export interface HealthLogListResponse {
  logs: HealthLogResponse[];
  total: number;
}

export interface HealthStatsResponse {
  total_executions: number;
  success_count: number;
  healed_count: number;
  failed_count: number;
  success_rate: number;
  healing_rate: number;
  avg_execution_time_ms: number;
  workflows_by_status: Record<string, number>;
}

// ============================================================================
// SLACK INTEGRATION TYPES
// ============================================================================

export interface SlackSettingsRequest {
  webhook_url?: string | null;
  enabled: boolean;
  notify_on: NotificationType[];
}

export interface SlackSettingsResponse {
  enabled: boolean;
  webhook_configured: boolean;
  notify_on: NotificationType[];
}

export interface SlackTestResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// API ERROR
// ============================================================================

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
