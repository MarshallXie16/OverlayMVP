/**
 * Dashboard Page
 * Glassmorphic dashboard with workflow grid and health stats
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, AlertTriangle, Loader2 } from "lucide-react";
import { apiClient } from "@/api/client";
import type { WorkflowListItem } from "@/api/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/Button";
import { WorkflowCard } from "@/components/workflows/WorkflowCard";
import { mapWorkflowListItemToDesign } from "@/utils/typeMappers";
import { compareByHealth } from "@/utils/workflowHealth";
import { DesignWorkflow, WorkflowStatus } from "@/types/design";

export const Dashboard: React.FC = () => {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.getWorkflows(50, 0);
      const sortedWorkflows = [...response.workflows].sort(compareByHealth);
      setWorkflows(sortedWorkflows);
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

  // Filter by search
  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) return designWorkflows;
    const query = searchQuery.toLowerCase();
    return designWorkflows.filter(
      (wf) =>
        wf.title.toLowerCase().includes(query) ||
        wf.description.toLowerCase().includes(query),
    );
  }, [designWorkflows, searchQuery]);

  // Calculate health stats
  const healthStats = useMemo(() => {
    const total = workflows.length;
    const totalRuns = workflows.reduce((sum, wf) => sum + wf.total_uses, 0);
    const successRates = workflows
      .filter((wf) => wf.total_uses > 0)
      .map((wf) => wf.success_rate);
    const avgSuccessRate =
      successRates.length > 0
        ? Math.round(
            (successRates.reduce((a, b) => a + b, 0) / successRates.length) *
              100,
          )
        : 100;
    const brokenCount = designWorkflows.filter(
      (wf) => wf.status === WorkflowStatus.BROKEN,
    ).length;

    return {
      successRate: avgSuccessRate,
      totalWorkflows: total,
      totalRuns,
      brokenWorkflows: brokenCount,
    };
  }, [workflows, designWorkflows]);

  const handleSelectWorkflow = (wf: DesignWorkflow) => {
    navigate(`/workflows/${wf.id}`);
  };

  const handleDeleteWorkflow = async () => {
    if (!workflowToDelete) return;

    try {
      await apiClient.deleteWorkflow(Number(workflowToDelete));
      setWorkflows(workflows.filter((w) => String(w.id) !== workflowToDelete));
      setWorkflowToDelete(null);
    } catch (err) {
      console.error("Failed to delete workflow:", err);
    }
  };

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
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight mb-2">
          Operations Dashboard
        </h1>
        <p className="text-neutral-500">
          Real-time overview of your team's automation health and activity.
        </p>
      </div>

      {/* Stats Panel */}
      <div className="relative bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm mb-12 p-6">
        {/* Floating Status Badge */}
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-white/40 backdrop-blur-md text-green-700 rounded-full border border-green-200/50 shadow-sm z-10">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
          </span>
          <span className="font-bold text-sm">Operational</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          {/* Success Rate */}
          <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
              Success Rate
            </span>
            <span className="text-3xl font-bold text-neutral-900">
              {healthStats.successRate}%
            </span>
            <span className="text-xs text-green-600 font-medium mt-1">
              All time average
            </span>
          </div>

          {/* Total Workflows */}
          <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
              Total Workflows
            </span>
            <span className="text-3xl font-bold text-neutral-900">
              {healthStats.totalWorkflows}
            </span>
            <span className="text-xs text-neutral-500 mt-1">
              Active workflows
            </span>
          </div>

          {/* Total Runs */}
          <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
              Total Runs
            </span>
            <span className="text-3xl font-bold text-neutral-900">
              {healthStats.totalRuns.toLocaleString()}
            </span>
            <span className="text-xs text-neutral-500 mt-1">All time</span>
          </div>

          {/* Failing Workflows */}
          <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">
              Failing Workflows
            </span>
            <span
              className={`text-3xl font-bold ${healthStats.brokenWorkflows > 0 ? "text-red-600" : "text-neutral-900"}`}
            >
              {healthStats.brokenWorkflows}
            </span>
            {healthStats.brokenWorkflows > 0 ? (
              <span className="text-xs text-red-600 font-medium mt-1">
                Needs attention
              </span>
            ) : (
              <span className="text-xs text-neutral-500 mt-1">
                All systems go
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search & Title */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-neutral-900">
          Recent Workflows
        </h2>
        <div className="relative w-full md:w-96">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-200 bg-white/80 backdrop-blur focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Workflow Grid */}
      {filteredWorkflows.length === 0 && workflows.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-2xl">
          <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-6">
            <Search className="h-10 w-10 text-neutral-300" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">
            No workflows yet
          </h3>
          <p className="text-neutral-500 max-w-md mx-auto mb-6">
            Create your first workflow by recording your actions using the
            Chrome extension.
          </p>
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 max-w-lg mx-auto text-left">
            <h4 className="font-semibold text-primary-900 mb-3">
              How to create a workflow:
            </h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-primary-800">
              <li>Click the extension icon in your Chrome toolbar</li>
              <li>Enter a name for your workflow</li>
              <li>Click "Start Recording" to begin</li>
              <li>Perform the actions you want to record</li>
              <li>Click "Stop Recording" when finished</li>
            </ol>
          </div>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-2xl">
          <Search className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-neutral-700">
            No matching workflows
          </h3>
          <p className="text-neutral-500 mt-1">Try a different search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onClick={handleSelectWorkflow}
              onDelete={() => setWorkflowToDelete(wf.id)}
            />
          ))}

          {/* Add New Card */}
          <div
            onClick={() => {
              // Could open extension or show instructions
            }}
            className="border-2 border-dashed border-neutral-200 rounded-2xl flex flex-col items-center justify-center text-neutral-400 p-6 hover:border-primary-400 hover:bg-primary-50/30 transition-all cursor-pointer group min-h-[240px]"
          >
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <span className="text-3xl text-neutral-300 group-hover:text-primary-500">
                +
              </span>
            </div>
            <span className="font-semibold group-hover:text-primary-600 transition-colors">
              Create New Workflow
            </span>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {workflowToDelete && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm"
            onClick={() => setWorkflowToDelete(null)}
          />
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
