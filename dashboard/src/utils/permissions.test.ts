/**
 * Tests for frontend permission helpers
 */

import { describe, it, expect } from "vitest";
import {
  Permission,
  hasPermission,
  isAdmin,
  isEditorOrAbove,
  canManageUsers,
  canCreateWorkflow,
  canEditWorkflow,
  canDeleteWorkflow,
  canRunWorkflow,
  canManageInvites,
  getRoleDisplayName,
  getRoleDescription,
} from "./permissions";

describe("Permission Helpers", () => {
  describe("hasPermission", () => {
    it("admin has all permissions", () => {
      expect(hasPermission("admin", Permission.MANAGE_USERS)).toBe(true);
      expect(hasPermission("admin", Permission.CREATE_WORKFLOW)).toBe(true);
      expect(hasPermission("admin", Permission.EDIT_COMPANY)).toBe(true);
    });

    it("editor has workflow permissions but not user management", () => {
      expect(hasPermission("editor", Permission.CREATE_WORKFLOW)).toBe(true);
      expect(hasPermission("editor", Permission.EDIT_WORKFLOW)).toBe(true);
      expect(hasPermission("editor", Permission.MANAGE_USERS)).toBe(false);
      expect(hasPermission("editor", Permission.CREATE_INVITE)).toBe(false);
    });

    it("viewer has run/view permissions only", () => {
      expect(hasPermission("viewer", Permission.RUN_WORKFLOW)).toBe(true);
      expect(hasPermission("viewer", Permission.VIEW_WORKFLOW)).toBe(true);
      expect(hasPermission("viewer", Permission.VIEW_TEAM)).toBe(true);
      expect(hasPermission("viewer", Permission.CREATE_WORKFLOW)).toBe(false);
      expect(hasPermission("viewer", Permission.EDIT_WORKFLOW)).toBe(false);
      expect(hasPermission("viewer", Permission.MANAGE_USERS)).toBe(false);
    });
  });

  describe("Role Checkers", () => {
    it("isAdmin returns true only for admin", () => {
      expect(isAdmin("admin")).toBe(true);
      expect(isAdmin("editor")).toBe(false);
      expect(isAdmin("viewer")).toBe(false);
    });

    it("isEditorOrAbove returns true for admin and editor", () => {
      expect(isEditorOrAbove("admin")).toBe(true);
      expect(isEditorOrAbove("editor")).toBe(true);
      expect(isEditorOrAbove("viewer")).toBe(false);
    });

    it("canManageUsers returns true only for admin", () => {
      expect(canManageUsers("admin")).toBe(true);
      expect(canManageUsers("editor")).toBe(false);
      expect(canManageUsers("viewer")).toBe(false);
    });

    it("canCreateWorkflow returns true for admin and editor", () => {
      expect(canCreateWorkflow("admin")).toBe(true);
      expect(canCreateWorkflow("editor")).toBe(true);
      expect(canCreateWorkflow("viewer")).toBe(false);
    });

    it("canEditWorkflow returns true for admin and editor", () => {
      expect(canEditWorkflow("admin")).toBe(true);
      expect(canEditWorkflow("editor")).toBe(true);
      expect(canEditWorkflow("viewer")).toBe(false);
    });

    it("canDeleteWorkflow returns true for admin and editor", () => {
      expect(canDeleteWorkflow("admin")).toBe(true);
      expect(canDeleteWorkflow("editor")).toBe(true);
      expect(canDeleteWorkflow("viewer")).toBe(false);
    });

    it("canRunWorkflow returns true for all roles", () => {
      expect(canRunWorkflow("admin")).toBe(true);
      expect(canRunWorkflow("editor")).toBe(true);
      expect(canRunWorkflow("viewer")).toBe(true);
    });

    it("canManageInvites returns true only for admin", () => {
      expect(canManageInvites("admin")).toBe(true);
      expect(canManageInvites("editor")).toBe(false);
      expect(canManageInvites("viewer")).toBe(false);
    });
  });

  describe("Display Helpers", () => {
    it("getRoleDisplayName capitalizes role", () => {
      expect(getRoleDisplayName("admin")).toBe("Admin");
      expect(getRoleDisplayName("editor")).toBe("Editor");
      expect(getRoleDisplayName("viewer")).toBe("Viewer");
    });

    it("getRoleDescription returns correct descriptions", () => {
      expect(getRoleDescription("admin")).toContain("team management");
      expect(getRoleDescription("editor")).toContain("Create, edit");
      expect(getRoleDescription("viewer")).toContain("View and run");
    });
  });
});
