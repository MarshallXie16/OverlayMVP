/**
 * Workflow Review Page (FE-008)
 * Review and edit AI-generated labels for workflow steps
 * Glassmorphic design with drag-and-drop reordering
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
  Save,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { apiClient } from "@/api/client";
import type { WorkflowResponse, StepResponse } from "@/api/types";
import { StepCard } from "@/components/StepCard";
import { EditStepModal } from "@/components/EditStepModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { mapWorkflowStatus } from "@/utils/typeMappers";

/**
 * Sortable wrapper for StepCard that enables drag-and-drop
 */
interface SortableStepCardProps {
  step: StepResponse;
  onEdit: (step: StepResponse) => void;
  onDelete: (stepId: number) => void;
}

const SortableStepCard: React.FC<SortableStepCardProps> = ({
  step,
  onEdit,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <StepCard
        step={step}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
};

export const WorkflowReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<WorkflowResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [editingStep, setEditingStep] = useState<StepResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px drag before activating
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  const handleEditStep = (step: StepResponse) => {
    setEditingStep(step);
    setIsModalOpen(true);
  };

  const handleStepSaved = (updatedStep: StepResponse) => {
    if (!workflow) return;

    const updatedSteps = workflow.steps.map((s) =>
      s.id === updatedStep.id ? updatedStep : s,
    );

    setWorkflow({
      ...workflow,
      steps: updatedSteps,
    });
  };

  const handleDeleteStep = async (stepId: number) => {
    if (!workflow) return;

    const step = workflow.steps.find((s) => s.id === stepId);
    const confirmMessage = step
      ? `Delete Step ${step.step_number}? This cannot be undone.`
      : "Delete this step? This cannot be undone.";

    if (!window.confirm(confirmMessage)) return;

    try {
      await apiClient.deleteStep(stepId);
      // Reload workflow to get updated step numbers
      await loadWorkflow(workflow.id);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to delete step";
      alert(errorMsg);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!workflow) return;

    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = workflow.steps.findIndex((s) => s.id === active.id);
    const newIndex = workflow.steps.findIndex((s) => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistically update the UI
    const reorderedSteps = arrayMove(workflow.steps, oldIndex, newIndex);
    // Update step_number for display
    const updatedSteps = reorderedSteps.map((step, index) => ({
      ...step,
      step_number: index + 1,
    }));
    setWorkflow({ ...workflow, steps: updatedSteps });

    // Persist to backend
    setIsReordering(true);
    try {
      const stepOrder = updatedSteps.map((s) => s.id);
      await apiClient.reorderSteps(workflow.id, stepOrder);
    } catch (err) {
      // Revert on error
      await loadWorkflow(workflow.id);
      const errorMsg =
        err instanceof Error ? err.message : "Failed to reorder steps";
      alert(errorMsg);
    } finally {
      setIsReordering(false);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!workflow) return;

    const incompleteSteps = workflow.steps.filter(
      (step) => !step.field_label || !step.instruction,
    );

    if (incompleteSteps.length > 0) {
      alert(
        `Cannot save: ${incompleteSteps.length} step(s) missing labels. Please review all steps.`,
      );
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.updateWorkflow(workflow.id, { status: "active" });
      alert("Workflow activated successfully!");
      navigate("/dashboard");
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to save workflow";
      alert(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // Count steps that need review
  const stepsNeedingReview =
    workflow?.steps.filter((step) => !step.field_label || !step.instruction)
      .length ?? 0;

  const completedSteps = (workflow?.steps.length ?? 0) - stepsNeedingReview;

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

  return (
    <div className="max-w-6xl mx-auto pb-32 animate-fade-in">
      {/* Back Navigation */}
      <button
        onClick={() => navigate(`/workflows/${workflow.id}`)}
        className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span>Back to Workflow</span>
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-3">
            Review: {workflow.name}
          </h1>
          <div className="flex items-center gap-4 flex-wrap">
            <Badge status={designStatus} />
            <span className="text-neutral-500 text-sm">
              {workflow.steps.length} steps to review
            </span>
          </div>
          {workflow.description && (
            <p className="mt-3 text-neutral-600">{workflow.description}</p>
          )}
        </div>
      </div>

      {/* Progress Card */}
      <div className="glass-card rounded-2xl p-6 mb-8 border border-white/60">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              Review Progress
            </h3>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-green-600">
                <CheckCircle size={16} />
                {completedSteps} complete
              </span>
              {stepsNeedingReview > 0 && (
                <span className="flex items-center gap-1.5 text-amber-600">
                  <AlertCircle size={16} />
                  {stepsNeedingReview} need review
                </span>
              )}
            </div>
            <div className="mt-3 w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-green-500 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${workflow.steps.length > 0 ? (completedSteps / workflow.steps.length) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>
          <Button
            variant="accent"
            icon={<Save size={16} />}
            onClick={handleSaveWorkflow}
            disabled={isSaving || isReordering || stepsNeedingReview > 0}
          >
            {isSaving
              ? "Saving..."
              : isReordering
                ? "Reordering..."
                : "Activate Workflow"}
          </Button>
        </div>
      </div>

      {/* Steps grid */}
      {workflow.steps.length === 0 ? (
        <div className="text-center py-16 glass-card rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-neutral-400" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-700">
            No steps in this workflow
          </h3>
          <p className="text-neutral-500 mt-1">
            Record some steps to get started
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={workflow.steps.map((s) => s.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {workflow.steps.map((step) => (
                <SortableStepCard
                  key={step.id}
                  step={step}
                  onEdit={handleEditStep}
                  onDelete={handleDeleteStep}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Floating Save Button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-8 z-50">
        <div className="glass-panel rounded-2xl p-4 shadow-lg flex items-center gap-4">
          <div className="text-sm">
            <span className="text-neutral-600">
              {stepsNeedingReview === 0 ? (
                <span className="text-green-600 font-medium">
                  All steps reviewed!
                </span>
              ) : (
                <>
                  <span className="font-medium text-amber-600">
                    {stepsNeedingReview}
                  </span>{" "}
                  steps need review
                </>
              )}
            </span>
          </div>
          <Button
            variant="accent"
            icon={<Save size={16} />}
            onClick={handleSaveWorkflow}
            disabled={isSaving || isReordering || stepsNeedingReview > 0}
          >
            {isSaving ? "Saving..." : isReordering ? "..." : "Activate"}
          </Button>
        </div>
      </div>

      {/* Edit Step Modal */}
      <EditStepModal
        step={editingStep}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingStep(null);
        }}
        onSave={handleStepSaved}
      />
    </div>
  );
};
