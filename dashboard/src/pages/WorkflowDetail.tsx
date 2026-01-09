/**
 * Workflow Detail Page
 * View workflow details and steps with glassmorphic design
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Play,
  Edit2,
  Trash2,
  Activity,
  BarChart3,
  MousePointerClick,
  Clock,
  Globe,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { apiClient } from "@/api/client";
import type { WorkflowResponse } from "@/api/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AuthenticatedImage } from "@/components/AuthenticatedImage";
import { ExtensionNotInstalledModal } from "@/components/ExtensionNotInstalledModal";
import {
  startWalkthrough,
  isExtensionInstalled,
} from "@/utils/extensionBridge";
import { mapWorkflowStatus } from "@/utils/typeMappers";
import {
  getActionTypeColor,
  formatActionType,
  getScreenshotUrl,
} from "@/utils/stepUtils";
import { showToast } from "@/utils/toast";

export const WorkflowDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [workflow, setWorkflow] = useState<WorkflowResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Walkthrough state
  const [isStartingWalkthrough, setIsStartingWalkthrough] = useState(false);
  const [walkthroughError, setWalkthroughError] = useState<string | null>(null);
  const [showExtensionModal, setShowExtensionModal] = useState(false);

  // Delete confirmation state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      loadWorkflow(parseInt(id, 10));
    }
  }, [id]);

  const loadWorkflow = async (workflowId: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getWorkflow(workflowId);
      setWorkflow(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflow");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;

    setIsDeleting(true);
    try {
      await apiClient.deleteWorkflow(workflow.id);
      navigate("/dashboard");
    } catch (err) {
      showToast.error(
        err instanceof Error ? err.message : "Failed to delete workflow",
      );
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleStartWalkthrough = async () => {
    if (!workflow) return;

    setWalkthroughError(null);

    if (!isExtensionInstalled()) {
      setShowExtensionModal(true);
      return;
    }

    setIsStartingWalkthrough(true);
    try {
      await startWalkthrough(workflow.id, workflow.starting_url);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start walkthrough";
      setWalkthroughError(errorMessage);
      console.error("Failed to start walkthrough:", err);
    } finally {
      setIsStartingWalkthrough(false);
    }
  };

  // Extract domain from URL
  const getDomain = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 gap-4">
        <Loader2 className="h-12 w-12 text-primary-600 animate-spin" />
        <p className="text-neutral-500">Loading workflow...</p>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6">
        <div className="text-red-800">{error || "Workflow not found"}</div>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => navigate("/dashboard")}
        >
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const designStatus = mapWorkflowStatus(
    workflow.status,
    workflow.success_rate,
  );
  const successRatePercent = Math.round(workflow.success_rate * 100);

  return (
    <div className="max-w-5xl mx-auto pb-20 animate-fade-in">
      {/* Back Navigation */}
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span>Back to Dashboard</span>
      </button>

      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-3">
            {workflow.name}
          </h1>
          <div className="flex items-center gap-4 flex-wrap">
            <Badge status={designStatus} />
            <span className="text-neutral-500 text-sm">
              Last updated{" "}
              {new Date(workflow.updated_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
          {workflow.description && (
            <p className="mt-3 text-neutral-600">{workflow.description}</p>
          )}
        </div>
        <div className="flex gap-3 flex-wrap">
          {/* Review & Edit Button */}
          {(workflow.status === "draft" || workflow.status === "active") && (
            <Button
              variant="secondary"
              icon={<Edit2 size={16} />}
              onClick={() => navigate(`/workflows/${workflow.id}/review`)}
            >
              {workflow.status === "draft" ? "Review & Edit" : "Edit Workflow"}
            </Button>
          )}

          {/* Start Walkthrough Button - only for active workflows */}
          {workflow.status === "active" && (
            <Button
              variant="accent"
              icon={<Play size={16} />}
              onClick={handleStartWalkthrough}
              disabled={isStartingWalkthrough}
            >
              {isStartingWalkthrough ? "Starting..." : "Run Walkthrough"}
            </Button>
          )}
        </div>
      </div>

      {/* Walkthrough Error Display */}
      {walkthroughError && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">
                Failed to start walkthrough
              </h3>
              <p className="mt-1 text-sm text-red-700">{walkthroughError}</p>
            </div>
            <button
              onClick={() => setWalkthroughError(null)}
              className="text-red-400 hover:text-red-600"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Workflow Stats Overview */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Success Rate Card */}
        <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-2">
            <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">
              Success Rate
            </span>
            <div
              className={`p-1.5 rounded-lg ${successRatePercent > 90 ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"}`}
            >
              <Activity size={16} />
            </div>
          </div>
          <div>
            <div className="flex items-end gap-2 mb-1">
              <span className="text-2xl font-bold text-neutral-900">
                {successRatePercent}%
              </span>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${successRatePercent > 90 ? "bg-green-500" : "bg-amber-500"}`}
                style={{ width: `${successRatePercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Total Runs Card */}
        <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-2">
            <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">
              Total Runs
            </span>
            <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
              <BarChart3 size={16} />
            </div>
          </div>
          <div>
            <span className="text-2xl font-bold text-neutral-900 block">
              {workflow.total_uses.toLocaleString()}
            </span>
            <span className="text-xs text-neutral-500">
              {workflow.last_successful_run
                ? `Last: ${new Date(workflow.last_successful_run).toLocaleDateString()}`
                : "No runs yet"}
            </span>
          </div>
        </div>

        {/* Complexity Card */}
        <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-2">
            <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">
              Complexity
            </span>
            <div className="p-1.5 rounded-lg bg-purple-100 text-purple-600">
              <MousePointerClick size={16} />
            </div>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <span className="text-2xl font-bold text-neutral-900 block">
                {workflow.step_count}
              </span>
              <span className="text-xs text-neutral-500">Total Steps</span>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-neutral-600 text-sm font-medium">
                <Clock size={14} />~{Math.ceil(workflow.step_count * 0.5)}m
              </div>
              <span className="text-xs text-neutral-400">Est. time</span>
            </div>
          </div>
        </div>

        {/* Starting URL Card */}
        <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
          <div className="flex justify-between items-start mb-2">
            <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">
              Starting Point
            </span>
            <div className="p-1.5 rounded-lg bg-teal-100 text-teal-600">
              <Globe size={16} />
            </div>
          </div>
          <div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-1 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs font-mono text-neutral-600 truncate">
                {getDomain(workflow.starting_url)}
              </span>
            </div>
            <a
              href={workflow.starting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary-600 font-medium hover:underline flex items-center justify-end gap-1"
            >
              Open URL <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </div>

      {/* Steps Section Title */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-neutral-900">Workflow Steps</h2>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={() => setShowDeleteModal(true)}
        >
          Delete Workflow
        </Button>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 gap-6">
        {workflow.steps.map((step) => {
          const screenshotUrl = getScreenshotUrl(step.screenshot_id);

          return (
            <div
              key={step.id}
              className="glass-card p-0 overflow-hidden rounded-2xl hover:shadow-xl transition-all duration-300 border border-white/60 group"
            >
              <div className="flex flex-col md:flex-row">
                {/* Screenshot Area */}
                <div className="w-full md:w-72 h-48 md:h-auto bg-neutral-100 relative overflow-hidden">
                  {screenshotUrl ? (
                    <AuthenticatedImage
                      src={screenshotUrl}
                      alt={`Step ${step.step_number}`}
                      className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-neutral-400">
                      <svg
                        className="w-12 h-12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 bg-neutral-900/80 backdrop-blur-sm text-white text-xs font-bold font-mono px-2.5 py-1 rounded-md shadow-lg z-10">
                    Step {step.step_number}
                  </div>
                </div>

                {/* Content Area */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${getActionTypeColor(step.action_type)}`}
                        >
                          {formatActionType(step.action_type)}
                        </span>
                        <h3 className="font-semibold text-lg text-neutral-900">
                          {step.field_label || "Untitled Step"}
                        </h3>
                      </div>
                    </div>

                    <p className="text-neutral-600 mb-4">
                      {step.instruction || "No instruction provided"}
                    </p>

                    <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 font-mono text-xs text-neutral-500 break-all flex items-center gap-2 group/selector hover:border-primary-200 transition-colors">
                      <span className="text-neutral-400 select-none">$</span>
                      {step.selectors.primary || step.selectors.css}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-100">
                    <div className="flex items-center gap-2 text-sm">
                      {step.ai_confidence !== null &&
                      step.ai_confidence > 0.9 ? (
                        <span className="flex items-center gap-1.5 text-green-600 font-medium bg-green-50 px-2 py-1 rounded-md">
                          <CheckCircle size={14} /> High Confidence
                        </span>
                      ) : step.ai_confidence !== null ? (
                        <span className="flex items-center gap-1.5 text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-md">
                          <AlertCircle size={14} /> Review Suggested
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-neutral-500 font-medium bg-neutral-50 px-2 py-1 rounded-md">
                          Not Analyzed
                        </span>
                      )}
                      {step.label_edited && (
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                          Edited
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-neutral-400">
                      {getDomain(step.page_context.url)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Step Placeholder */}
      <div
        onClick={() => navigate(`/workflows/${workflow.id}/review`)}
        className="mt-6 border-2 border-dashed border-neutral-300 rounded-2xl p-8 flex flex-col items-center justify-center text-neutral-400 hover:border-primary-400 hover:bg-primary-50/30 transition-all cursor-pointer group"
      >
        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3 group-hover:bg-primary-100 group-hover:text-primary-600 transition-colors">
          <span className="text-2xl">+</span>
        </div>
        <span className="font-medium group-hover:text-primary-600 transition-colors">
          Edit or add steps
        </span>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-neutral-200">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-xl font-bold text-center mb-2">
              Delete Workflow?
            </h3>
            <p className="text-neutral-500 text-center mb-6 text-sm">
              Are you sure you want to delete "{workflow.name}"? This action
              cannot be undone and all steps will be permanently removed.
            </p>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Extension Not Installed Modal */}
      <ExtensionNotInstalledModal
        isOpen={showExtensionModal}
        onClose={() => setShowExtensionModal(false)}
      />
    </div>
  );
};
