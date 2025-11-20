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
  status: 'draft' | 'processing' | 'active' | 'needs_review' | 'broken' | 'archived';
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
  action_type: 'click' | 'input_commit' | 'select_change' | 'submit' | 'navigate';
  ai_label: string | null;
  selectors: Selectors;
  element_meta: ElementMeta;
  action_data: Record<string, any>;
  page_context: PageContext;
  screenshot_id: number | null;
  created_at: string;
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
// API ERROR
// ============================================================================

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}
