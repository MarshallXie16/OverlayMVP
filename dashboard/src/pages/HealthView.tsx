/**
 * System Health View
 * Monitor workflow reliability, auto-healing events, and recent execution logs
 * Connected to real backend API
 */

import { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  ArrowRight,
  Loader2,
  RefreshCw,
  Filter,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { apiClient } from "@/api/client";
import type {
  HealthStatsResponse,
  HealthLogResponse,
  WorkflowListItem,
} from "@/api/types";
import { useAuthStore } from "@/store/auth";
import { formatRelativeTimeInTimezone } from "@/utils/timezone";

// Helper to format execution time
function formatExecutionTime(ms: number | null): string {
  if (ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Map backend status to display format
function formatStatus(status: string): "SUCCESS" | "HEALED" | "FAILED" {
  if (status === "success") return "SUCCESS";
  if (status.startsWith("healed")) return "HEALED";
  return "FAILED";
}

// Status filter options
type StatusFilter = "ALL" | "SUCCESS" | "FAILED";
const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "Success", value: "SUCCESS" },
  { label: "Failed", value: "FAILED" },
];

export const HealthView: React.FC = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<HealthStatsResponse | null>(null);
  const [logs, setLogs] = useState<HealthLogResponse[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [workflowFilter, setWorkflowFilter] = useState<number | null>(null);

  // Check if any filters are active
  const hasActiveFilters = statusFilter !== "ALL" || workflowFilter !== null;

  // Map UI status filter to API status values
  const getApiStatus = (filter: StatusFilter): string | undefined => {
    if (filter === "SUCCESS") return "success";
    if (filter === "FAILED") return "failed";
    return undefined;
  };

  // Fetch initial data (stats + workflows list)
  const fetchInitialData = async () => {
    try {
      const [statsResponse, logsResponse, workflowsResponse] =
        await Promise.all([
          apiClient.getHealthStats(30), // Last 30 days
          apiClient.getHealthLogs({ limit: 20 }),
          apiClient.getWorkflows(100, 0), // Get workflows for filter dropdown
        ]);
      setStats(statsResponse);
      setLogs(logsResponse.logs);
      setWorkflows(workflowsResponse.workflows);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load health data",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch logs with current filters
  const fetchFilteredLogs = async () => {
    setIsFilterLoading(true);
    try {
      const params: {
        workflow_id?: number;
        status?: string;
        limit?: number;
      } = { limit: 20 };

      if (workflowFilter !== null) {
        params.workflow_id = workflowFilter;
      }

      const apiStatus = getApiStatus(statusFilter);
      if (apiStatus) {
        params.status = apiStatus;
      }

      const logsResponse = await apiClient.getHealthLogs(params);
      setLogs(logsResponse.logs);
      setError(null); // Clear any previous errors on success
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load filtered logs",
      );
    } finally {
      setIsFilterLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Refetch logs when filters change
  useEffect(() => {
    // Skip on initial load or during refresh to avoid duplicate requests
    if (isLoading || isRefreshing) return;
    fetchFilteredLogs();
  }, [statusFilter, workflowFilter]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Reset filters and fetch fresh data
    setStatusFilter("ALL");
    setWorkflowFilter(null);
    fetchInitialData();
  };

  const handleClearFilters = () => {
    setStatusFilter("ALL");
    setWorkflowFilter(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-primary-600" />
          <span className="text-neutral-600">Loading health data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <XCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            Failed to Load Health Data
          </h3>
          <p className="text-neutral-600 mb-4">{error}</p>
          <Button onClick={handleRefresh}>Try Again</Button>
        </div>
      </div>
    );
  }

  const brokenCount = stats?.workflows_by_status.broken || 0;
  const successRate = stats ? Math.round(stats.success_rate * 100) : 0;

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">
            System Health
          </h1>
          <p className="text-neutral-600">
            Monitor workflow reliability, auto-healing events, and recent
            execution logs.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw
            size={16}
            className={`mr-2 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Critical Alerts */}
      {brokenCount > 0 && (
        <div className="mb-8 animate-pulse">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
            <div className="bg-red-100 p-3 rounded-full text-red-600 shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-800 mb-1">
                Attention Required: {brokenCount} Broken Workflow(s)
              </h3>
              <p className="text-red-700 mb-4 text-sm">
                Some workflows have failed consistently and may require manual
                repair.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="glass-card p-6 rounded-2xl border-t-4 border-green-500 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">
                Success Rate
              </span>
              <h3 className="text-3xl font-bold text-neutral-900 mt-1">
                {successRate}%
              </h3>
            </div>
            <div className="bg-green-50 p-2 rounded-lg text-green-600">
              <CheckCircle size={20} />
            </div>
          </div>
          <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-green-500 h-full rounded-full"
              style={{ width: `${successRate}%` }}
            ></div>
          </div>
          <span className="text-xs text-neutral-500 mt-2 block">
            Last 30 days
          </span>
        </div>

        <div className="glass-card p-6 rounded-2xl border-t-4 border-purple-500 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">
                Auto-Healed
              </span>
              <h3 className="text-3xl font-bold text-neutral-900 mt-1">
                {stats?.healed_count || 0}
              </h3>
            </div>
            <div className="bg-purple-50 p-2 rounded-lg text-purple-600">
              <Zap size={20} />
            </div>
          </div>
          <p className="text-sm text-neutral-600">
            Workflows automatically repaired by AI without user interruption.
          </p>
        </div>

        <div className="glass-card p-6 rounded-2xl border-t-4 border-blue-500 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">
                Total Runs
              </span>
              <h3 className="text-3xl font-bold text-neutral-900 mt-1">
                {(stats?.total_executions || 0).toLocaleString()}
              </h3>
            </div>
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Activity size={20} />
            </div>
          </div>
          <span className="text-xs text-neutral-500">
            {stats?.success_count || 0} successful, {stats?.failed_count || 0}{" "}
            failed
          </span>
        </div>

        <div className="glass-card p-6 rounded-2xl border-t-4 border-amber-500 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">
                Avg Duration
              </span>
              <h3 className="text-3xl font-bold text-neutral-900 mt-1">
                {formatExecutionTime(stats?.avg_execution_time_ms || null)}
              </h3>
            </div>
            <div className="bg-amber-50 p-2 rounded-lg text-amber-600">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-sm text-neutral-600">
            Average time to complete a workflow successfully.
          </p>
        </div>
      </div>

      {/* Recent Logs Table */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-glass overflow-hidden">
        <div className="px-6 py-5 border-b border-neutral-200/60 bg-white/40">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-neutral-900">Recent Executions</h3>
            <Button
              variant="ghost"
              size="sm"
              disabled
              title="Full logs view coming soon"
            >
              View All Logs <ArrowRight size={16} className="ml-1" />
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Status Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center text-neutral-400 mr-1">
                <Filter size={16} />
              </div>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  disabled={isFilterLoading}
                  aria-pressed={statusFilter === f.value}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap disabled:opacity-50 ${
                    statusFilter === f.value
                      ? "bg-neutral-900 text-white shadow-md"
                      : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Workflow Dropdown */}
            <div className="relative">
              <select
                value={workflowFilter ?? ""}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  setWorkflowFilter(
                    e.target.value && Number.isFinite(parsed) ? parsed : null,
                  );
                }}
                disabled={isFilterLoading}
                aria-label="Filter by workflow"
                className="appearance-none bg-white border border-neutral-200 text-sm rounded-lg pl-3 pr-8 py-1.5 outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 min-w-[180px]"
              >
                <option value="">All Workflows</option>
                {workflows.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              />
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                disabled={isFilterLoading}
                aria-label="Clear all filters"
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
              >
                <X size={14} />
                Clear filters
              </button>
            )}

            {/* Loading indicator for filter changes */}
            {isFilterLoading && (
              <div
                className="flex items-center gap-1"
                role="status"
                aria-live="polite"
              >
                <Loader2 size={16} className="animate-spin text-primary-600" />
                <span className="sr-only">Loading filtered results...</span>
              </div>
            )}
          </div>
        </div>

        {logs.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Activity size={48} className="mx-auto mb-4 opacity-30" />
            {hasActiveFilters ? (
              <>
                <p>No logs match your filters.</p>
                <button
                  onClick={handleClearFilters}
                  className="text-primary-600 hover:text-primary-700 font-semibold mt-2 px-4 py-2 rounded-lg hover:bg-primary-50 transition-colors"
                >
                  Clear all filters
                </button>
              </>
            ) : (
              <>
                <p>No execution logs yet.</p>
                <p className="text-sm mt-1">
                  Logs will appear here when workflows are run.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-neutral-200/60 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Workflow</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/60">
                {logs.map((log) => {
                  const displayStatus = formatStatus(log.status);
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-white/40 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                            ${
                              displayStatus === "SUCCESS"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : displayStatus === "HEALED"
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : "bg-red-50 text-red-700 border-red-200"
                            }`}
                        >
                          {displayStatus === "SUCCESS" && (
                            <CheckCircle size={12} />
                          )}
                          {displayStatus === "HEALED" && <Zap size={12} />}
                          {displayStatus === "FAILED" && <XCircle size={12} />}
                          {displayStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-neutral-900">
                          {log.workflow_name}
                        </div>
                        {log.error_message && (
                          <div
                            className="text-xs text-red-600 mt-1 max-w-xs truncate"
                            title={log.error_message}
                          >
                            {log.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-600 font-mono">
                        {formatExecutionTime(log.execution_time_ms)}
                      </td>
                      <td className="px-6 py-4 text-sm text-neutral-500">
                        {formatRelativeTimeInTimezone(
                          log.created_at,
                          user?.timezone,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
