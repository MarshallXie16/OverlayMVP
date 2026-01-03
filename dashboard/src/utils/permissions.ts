/**
 * Frontend permission helpers for RBAC
 *
 * Role hierarchy: Admin > Editor > Viewer
 *
 * Permissions by role:
 * - Admin: Full access (manage users, all workflow ops, company settings)
 * - Editor: Create/edit/delete workflows, run workflows, view team
 * - Viewer: Run workflows, view team (no create/edit)
 */

import type { UserRole } from "@/api/types";

/**
 * Permission types that can be checked
 */
export enum Permission {
  // User management (admin only)
  MANAGE_USERS = "manage_users",
  MANAGE_ROLES = "manage_roles",
  MANAGE_STATUS = "manage_status",
  VIEW_INVITES = "view_invites",
  CREATE_INVITE = "create_invite",
  REVOKE_INVITE = "revoke_invite",

  // Workflow operations
  CREATE_WORKFLOW = "create_workflow",
  EDIT_WORKFLOW = "edit_workflow",
  DELETE_WORKFLOW = "delete_workflow",
  RUN_WORKFLOW = "run_workflow",
  VIEW_WORKFLOW = "view_workflow",

  // Company settings
  EDIT_COMPANY = "edit_company",
  VIEW_TEAM = "view_team",
}

/**
 * Role permissions mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  admin: new Set([
    // All permissions
    Permission.MANAGE_USERS,
    Permission.MANAGE_ROLES,
    Permission.MANAGE_STATUS,
    Permission.VIEW_INVITES,
    Permission.CREATE_INVITE,
    Permission.REVOKE_INVITE,
    Permission.CREATE_WORKFLOW,
    Permission.EDIT_WORKFLOW,
    Permission.DELETE_WORKFLOW,
    Permission.RUN_WORKFLOW,
    Permission.VIEW_WORKFLOW,
    Permission.EDIT_COMPANY,
    Permission.VIEW_TEAM,
  ]),
  editor: new Set([
    // Workflow operations + view team
    Permission.CREATE_WORKFLOW,
    Permission.EDIT_WORKFLOW,
    Permission.DELETE_WORKFLOW,
    Permission.RUN_WORKFLOW,
    Permission.VIEW_WORKFLOW,
    Permission.VIEW_TEAM,
  ]),
  viewer: new Set([
    // Run/view workflows + view team only
    Permission.RUN_WORKFLOW,
    Permission.VIEW_WORKFLOW,
    Permission.VIEW_TEAM,
  ]),
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.has(permission) : false;
}

/**
 * Check if user is admin
 */
export function isAdmin(role: UserRole): boolean {
  return role === "admin";
}

/**
 * Check if user is editor or above (editor or admin)
 */
export function isEditorOrAbove(role: UserRole): boolean {
  return role === "admin" || role === "editor";
}

/**
 * Check if user can manage team members
 */
export function canManageUsers(role: UserRole): boolean {
  return hasPermission(role, Permission.MANAGE_USERS);
}

/**
 * Check if user can create workflows
 */
export function canCreateWorkflow(role: UserRole): boolean {
  return hasPermission(role, Permission.CREATE_WORKFLOW);
}

/**
 * Check if user can edit workflows
 */
export function canEditWorkflow(role: UserRole): boolean {
  return hasPermission(role, Permission.EDIT_WORKFLOW);
}

/**
 * Check if user can delete workflows
 */
export function canDeleteWorkflow(role: UserRole): boolean {
  return hasPermission(role, Permission.DELETE_WORKFLOW);
}

/**
 * Check if user can run workflows
 */
export function canRunWorkflow(role: UserRole): boolean {
  return hasPermission(role, Permission.RUN_WORKFLOW);
}

/**
 * Check if user can manage invites
 */
export function canManageInvites(role: UserRole): boolean {
  return hasPermission(role, Permission.CREATE_INVITE);
}

/**
 * Get display name for role
 */
export function getRoleDisplayName(role: UserRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Get role description
 */
export function getRoleDescription(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Full access to all features including team management";
    case "editor":
      return "Create, edit, and run workflows";
    case "viewer":
      return "View and run workflows only";
  }
}
