/**
 * Role Match Scoring Factor
 *
 * Weight: 0.15
 *
 * Compares the semantic role of elements:
 * - Explicit ARIA role
 * - Implicit role from tag name
 * - Compatible role mappings (e.g., button and a[role="button"])
 *
 * This factor CAN VETO for incompatible roles (e.g., textbox vs checkbox)
 */

import type {
  ScoringFactor,
  CandidateElement,
  ElementContext,
  VetoResult,
} from "../types";
import { FACTOR_WEIGHTS, VETO_CONFIG } from "../config";

/**
 * Map of HTML tags to their implicit ARIA roles
 */
const IMPLICIT_ROLES: Record<string, string> = {
  a: "link",
  button: "button",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  img: "img",
  input: "textbox", // Simplified; actual role depends on type
  select: "listbox",
  textarea: "textbox",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  aside: "complementary",
  article: "article",
  section: "region",
  form: "form",
  table: "table",
  ul: "list",
  ol: "list",
  li: "listitem",
  dialog: "dialog",
  menu: "menu",
  menuitem: "menuitem",
};

/**
 * Input type to role mapping
 */
const INPUT_TYPE_ROLES: Record<string, string> = {
  button: "button",
  checkbox: "checkbox",
  email: "textbox",
  number: "spinbutton",
  password: "textbox",
  radio: "radio",
  range: "slider",
  search: "searchbox",
  submit: "button",
  tel: "textbox",
  text: "textbox",
  url: "textbox",
};

/**
 * Compatible role pairs - these roles can be considered equivalent
 * For example, a button element and an anchor with role="button"
 */
const COMPATIBLE_ROLES: [string, string][] = [
  ["button", "link"], // Often used interchangeably for clickable elements
  ["textbox", "searchbox"],
  ["listbox", "combobox"],
];

/**
 * Get the effective role of an element
 */
function getEffectiveRole(
  tagName: string,
  explicitRole: string | null,
  type: string | null,
): string {
  // Explicit role always wins
  if (explicitRole) {
    return explicitRole.toLowerCase();
  }

  // Special handling for input elements
  if (tagName === "input" && type) {
    return INPUT_TYPE_ROLES[type.toLowerCase()] || "textbox";
  }

  // Fall back to implicit role
  return IMPLICIT_ROLES[tagName] || tagName;
}

/**
 * Check if two roles are compatible
 */
function areRolesCompatible(role1: string, role2: string): boolean {
  if (role1 === role2) return true;

  for (const [r1, r2] of COMPATIBLE_ROLES) {
    if ((role1 === r1 && role2 === r2) || (role1 === r2 && role2 === r1)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two roles are incompatible (should veto)
 */
function areRolesIncompatible(role1: string, role2: string): boolean {
  const incompatible = VETO_CONFIG.role.incompatibleRoles;

  for (const [r1, r2] of incompatible) {
    if ((role1 === r1 && role2 === r2) || (role1 === r2 && role2 === r1)) {
      return true;
    }
  }

  // Additional incompatibility checks
  const inputRoles = new Set([
    "textbox",
    "checkbox",
    "radio",
    "spinbutton",
    "slider",
  ]);
  const containerRoles = new Set(["list", "listbox", "menu", "grid", "table"]);

  // Input roles are incompatible with container roles
  if (
    (inputRoles.has(role1) && containerRoles.has(role2)) ||
    (inputRoles.has(role2) && containerRoles.has(role1))
  ) {
    return true;
  }

  // Different input types are generally incompatible
  if (
    inputRoles.has(role1) &&
    inputRoles.has(role2) &&
    role1 !== role2 &&
    !(role1 === "textbox" && role2 === "searchbox") &&
    !(role1 === "searchbox" && role2 === "textbox")
  ) {
    return true;
  }

  return false;
}

/**
 * Role Match Factor
 */
export const roleMatchFactor: ScoringFactor = {
  name: "roleMatch",
  weight: FACTOR_WEIGHTS.roleMatch,

  score(candidate: CandidateElement, original: ElementContext): number {
    const originalRole = getEffectiveRole(
      original.tagName,
      original.role,
      original.type,
    );
    const candidateRole = getEffectiveRole(
      candidate.metadata.tag_name,
      candidate.metadata.role,
      candidate.metadata.type,
    );

    // Exact role match
    if (originalRole === candidateRole) {
      return 1.0;
    }

    // Compatible roles
    if (areRolesCompatible(originalRole, candidateRole)) {
      return 0.8;
    }

    // Same tag name but different roles
    if (original.tagName === candidate.metadata.tag_name) {
      return 0.6;
    }

    // Check if they're in the same category
    const actionRoles = new Set(["button", "link", "menuitem", "tab"]);
    const inputRoles = new Set([
      "textbox",
      "checkbox",
      "radio",
      "spinbutton",
      "slider",
      "searchbox",
    ]);

    if (
      (actionRoles.has(originalRole) && actionRoles.has(candidateRole)) ||
      (inputRoles.has(originalRole) && inputRoles.has(candidateRole))
    ) {
      return 0.4;
    }

    // Different roles
    return 0.1;
  },

  canVeto(
    candidate: CandidateElement,
    original: ElementContext,
  ): VetoResult | null {
    const originalRole = getEffectiveRole(
      original.tagName,
      original.role,
      original.type,
    );
    const candidateRole = getEffectiveRole(
      candidate.metadata.tag_name,
      candidate.metadata.role,
      candidate.metadata.type,
    );

    if (areRolesIncompatible(originalRole, candidateRole)) {
      return {
        factorName: "roleMatch",
        reason: `Incompatible roles: ${originalRole} vs ${candidateRole}`,
        severity: "hard",
      };
    }

    return null;
  },

  getDetails(candidate: CandidateElement, original: ElementContext): string {
    const originalRole = getEffectiveRole(
      original.tagName,
      original.role,
      original.type,
    );
    const candidateRole = getEffectiveRole(
      candidate.metadata.tag_name,
      candidate.metadata.role,
      candidate.metadata.type,
    );

    const compatible = areRolesCompatible(originalRole, candidateRole);
    const incompatible = areRolesIncompatible(originalRole, candidateRole);

    return `Role: ${originalRole} vs ${candidateRole} (${compatible ? "compatible" : incompatible ? "INCOMPATIBLE" : "different"})`;
  },
};
