/**
 * Tests for workflow health calculation
 * FE-012: Health Status Indicators
 */

import { describe, it, expect } from "vitest";
import { calculateWorkflowHealth, compareByHealth } from "./workflowHealth";
import type { WorkflowListItem } from "@/api/types";

// Helper to create mock workflow
function createMockWorkflow(
  overrides: Partial<WorkflowListItem>,
): WorkflowListItem {
  return {
    id: 1,
    company_id: 1,
    created_by: 1,
    name: "Test Workflow",
    description: null,
    starting_url: "https://example.com",
    tags: [],
    status: "active",
    success_rate: 1.0,
    total_uses: 10,
    consecutive_failures: 0,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    last_successful_run: "2025-01-01T00:00:00Z",
    last_failed_run: null,
    step_count: 5,
    ...overrides,
  };
}

describe("calculateWorkflowHealth", () => {
  it("should return healthy for active workflow with high success rate", () => {
    const workflow = createMockWorkflow({
      status: "active",
      success_rate: 0.95,
      consecutive_failures: 0,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("healthy");
  });

  it("should return needs_review for active workflow with medium success rate", () => {
    const workflow = createMockWorkflow({
      status: "active",
      success_rate: 0.75,
      consecutive_failures: 0,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("needs_review");
  });

  it("should return broken for active workflow with low success rate and enough runs", () => {
    const workflow = createMockWorkflow({
      status: "active",
      success_rate: 0.5,
      consecutive_failures: 0,
      total_uses: 10, // Enough runs to apply success rate threshold
    });
    expect(calculateWorkflowHealth(workflow)).toBe("broken");
  });

  it("should return healthy for active workflow with low success rate but insufficient runs", () => {
    // Workflows with fewer than 5 runs should default to healthy
    // regardless of success rate (not enough data to determine health)
    const workflow = createMockWorkflow({
      status: "active",
      success_rate: 0.19, // Low rate due to EMA initialization, but only 2 runs
      consecutive_failures: 0,
      total_uses: 2,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("healthy");
  });

  it("should return broken for workflow with consecutive_failures >= 3", () => {
    const workflow = createMockWorkflow({
      status: "active",
      success_rate: 0.95,
      consecutive_failures: 3,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("broken");
  });

  it("should return broken for workflow with status=broken", () => {
    const workflow = createMockWorkflow({
      status: "broken",
      success_rate: 0.95,
      consecutive_failures: 0,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("broken");
  });

  it("should return needs_review for workflow with status=needs_review", () => {
    const workflow = createMockWorkflow({
      status: "needs_review",
      success_rate: 0.95,
      consecutive_failures: 0,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("needs_review");
  });

  it("should return unknown for draft workflow", () => {
    const workflow = createMockWorkflow({
      status: "draft",
      success_rate: 0,
      consecutive_failures: 0,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("unknown");
  });

  it("should return unknown for processing workflow", () => {
    const workflow = createMockWorkflow({
      status: "processing",
      success_rate: 0,
      consecutive_failures: 0,
    });
    expect(calculateWorkflowHealth(workflow)).toBe("unknown");
  });

  it("should prioritize broken status over success rate", () => {
    const workflow = createMockWorkflow({
      status: "active",
      success_rate: 0.95, // High success rate
      consecutive_failures: 5, // But many consecutive failures
    });
    expect(calculateWorkflowHealth(workflow)).toBe("broken");
  });
});

describe("compareByHealth", () => {
  it("should sort broken workflows first", () => {
    const healthy = createMockWorkflow({
      status: "active",
      success_rate: 0.95,
    });
    const broken = createMockWorkflow({ status: "broken", success_rate: 0.5 });

    const workflows = [healthy, broken];
    workflows.sort(compareByHealth);

    expect(workflows[0]).toBe(broken);
    expect(workflows[1]).toBe(healthy);
  });

  it("should sort needs_review between broken and healthy", () => {
    const healthy = createMockWorkflow({
      status: "active",
      success_rate: 0.95,
    });
    const needsReview = createMockWorkflow({
      status: "needs_review",
      success_rate: 0.75,
    });
    const broken = createMockWorkflow({ status: "broken", success_rate: 0.5 });

    const workflows = [healthy, broken, needsReview];
    workflows.sort(compareByHealth);

    expect(workflows[0]).toBe(broken);
    expect(workflows[1]).toBe(needsReview);
    expect(workflows[2]).toBe(healthy);
  });

  it("should sort by updated_at within same health status", () => {
    const older = createMockWorkflow({
      status: "active",
      success_rate: 0.95,
      updated_at: "2025-01-01T00:00:00Z",
    });
    const newer = createMockWorkflow({
      status: "active",
      success_rate: 0.96,
      updated_at: "2025-01-02T00:00:00Z",
    });

    const workflows = [older, newer];
    workflows.sort(compareByHealth);

    // Newer should come first
    expect(workflows[0]).toBe(newer);
    expect(workflows[1]).toBe(older);
  });
});
