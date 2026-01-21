/**
 * Frontend permission helpers for RBAC
 *
 * Role hierarchy: Admin > Editor > Viewer
 *
 * Permissions by role:
 * - Admin: Full access (all workflow ops)
 * - Editor: Create/edit/delete workflows, run workflows
 * - Viewer: Run workflows (no create/edit)
 */

import type { UserRole } from "@/api/types";

/**
 * Permission types that can be checked
 */
export enum Permission {
  // Workflow operations
  CREATE_WORKFLOW = "create_workflow",
  EDIT_WORKFLOW = "edit_workflow",
  DELETE_WORKFLOW = "delete_workflow",
  RUN_WORKFLOW = "run_workflow",
  VIEW_WORKFLOW = "view_workflow",
}

/**
 * Role permissions mapping
 */
const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  admin: new Set([
    // All workflow permissions
    Permission.CREATE_WORKFLOW,
    Permission.EDIT_WORKFLOW,
    Permission.DELETE_WORKFLOW,
    Permission.RUN_WORKFLOW,
    Permission.VIEW_WORKFLOW,
  ]),
  editor: new Set([
    // Workflow operations
    Permission.CREATE_WORKFLOW,
    Permission.EDIT_WORKFLOW,
    Permission.DELETE_WORKFLOW,
    Permission.RUN_WORKFLOW,
    Permission.VIEW_WORKFLOW,
  ]),
  viewer: new Set([
    // Run/view workflows only
    Permission.RUN_WORKFLOW,
    Permission.VIEW_WORKFLOW,
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
      return "Full access to all workflow features";
    case "editor":
      return "Create, edit, and run workflows";
    case "viewer":
      return "View and run workflows only";
  }
}
