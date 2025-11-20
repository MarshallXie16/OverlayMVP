/**
 * Shared TypeScript types for Chrome Extension
 * These types match the backend Pydantic schemas
 *
 * Full implementation in FE-002
 */

/**
 * User authentication types
 */
export interface User {
  id: number;
  email: string;
  name: string | null;
  role: 'admin' | 'regular';
  company_id: number;
  created_at: string;
  last_login_at: string | null;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user: User;
}

/**
 * Workflow types (placeholder - full implementation in FE-002)
 */
export interface Workflow {
  id: number;
  name: string;
  description: string | null;
  status: 'draft' | 'processing' | 'active' | 'needs_review' | 'broken' | 'archived';
  starting_url: string;
  step_count?: number;
  success_rate?: number;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Chrome Extension specific message types
 */
export type MessageType =
  | 'PING'
  | 'PONG'
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'START_WALKTHROUGH'
  | 'CAPTURE_SCREENSHOT'
  | 'SAVE_STEP';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
  timestamp?: number;
}

// More types will be added in FE-002
