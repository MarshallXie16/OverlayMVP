/**
 * Workflow Library View
 * Browse, manage, and execute company-wide automation workflows
 * Uses real data from API
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, AlertTriangle, Loader2 } from "lucide-react";
import { apiClient } from "@/api/client";
import type { WorkflowListItem } from "@/api/types";
import { WorkflowCard } from "@/components/workflows/WorkflowCard";
import { Button } from "@/components/ui/Button";
import { mapWorkflowListItemToDesign } from "@/utils/typeMappers";
import { showToast } from "@/utils/toast";
import { useAuthStore } from "@/store/auth";
import { WorkflowStatus, DesignWorkflow } from "@/types/design";

export const LibraryView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "ALL">(
    "ALL",
  );
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getWorkflows(100, 0);
      setWorkflows(response.workflows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setIsLoading(false);
    }
  };

  // Convert to design workflows
  const designWorkflows: DesignWorkflow[] = useMemo(() => {
    return workflows.map((wf) =>
      mapWorkflowListItemToDesign(wf, user?.name || "Unknown"),
    );
  }, [workflows, user?.name]);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    return designWorkflows.filter((wf) => {
      const matchesSearch =
        wf.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wf.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "ALL" || wf.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [designWorkflows, searchQuery, statusFilter]);

  const handleDeleteWorkflow = async () => {
    if (!workflowToDelete) return;

    try {
      await apiClient.deleteWorkflow(workflowToDelete);
      setWorkflows(workflows.filter((w) => String(w.id) !== workflowToDelete));
      setWorkflowToDelete(null);
    } catch (err) {
      console.error("Failed to delete workflow:", err);
      showToast.error("Failed to delete workflow");
    }
  };

  const handleSelectWorkflow = (wf: DesignWorkflow) => {
    navigate(`/workflows/${wf.id}`);
  };

  const filters = [
    { label: "All", value: "ALL" },
    { label: "Drafts", value: WorkflowStatus.DRAFT },
    { label: "Processing", value: WorkflowStatus.PROCESSING },
    { label: "Active", value: WorkflowStatus.ACTIVE },
    { label: "Archived", value: WorkflowStatus.ARCHIVED },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-4">
        <Loader2 className="h-12 w-12 text-primary-600 animate-spin" />
        <p className="text-neutral-500">Loading workflows...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6">
        <div className="text-red-800">{error}</div>
        <Button variant="secondary" className="mt-4" onClick={loadWorkflows}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">
          Workflow Library
        </h1>
        <p className="text-neutral-600">
          Browse, manage, and execute company-wide automation workflows.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8 bg-white/40 backdrop-blur-md p-4 rounded-2xl border border-white/50 shadow-sm">
        {/* Search */}
        <div className="relative w-full lg:w-96 group">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-primary-500 transition-colors"
            size={18}
          />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all shadow-inner"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 w-full lg:w-auto overflow-x-auto pb-2 lg:pb-0 scrollbar-hide">
          <div className="flex items-center text-neutral-400 mr-2">
            <Filter size={16} />
          </div>
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value as WorkflowStatus | "ALL")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                statusFilter === f.value
                  ? "bg-neutral-900 text-white shadow-lg transform scale-105"
                  : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200 hover:border-neutral-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filteredWorkflows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onClick={handleSelectWorkflow}
              onDelete={() => setWorkflowToDelete(wf.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-white/40 border border-dashed border-neutral-300 rounded-3xl">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-4 text-neutral-400">
            <Search size={32} />
          </div>
          <h3 className="text-lg font-bold text-neutral-900 mb-1">
            No workflows found
          </h3>
          <p className="text-neutral-500 mb-6">
            {workflows.length === 0
              ? "No workflows have been created yet."
              : "We couldn't find any workflows matching your filters."}
          </p>
          {(searchQuery || statusFilter !== "ALL") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("ALL");
              }}
              className="text-primary-600 font-semibold hover:text-primary-700 px-4 py-2 rounded-lg hover:bg-primary-50 transition-colors"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {workflowToDelete && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm"
            onClick={() => setWorkflowToDelete(null)}
          ></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-neutral-200">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-xl font-bold text-center mb-2">
              Delete Workflow?
            </h3>
            <p className="text-neutral-500 text-center mb-6 text-sm">
              Are you sure you want to delete this workflow? This action cannot
              be undone.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setWorkflowToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleDeleteWorkflow}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
