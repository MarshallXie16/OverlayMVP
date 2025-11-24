/**
 * Workflow Review Page (FE-008)
 * Review and edit AI-generated labels for workflow steps
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import type { WorkflowResponse, StepResponse } from '@/api/types';
import { StepCard } from '@/components/StepCard';
import { EditStepModal } from '@/components/EditStepModal';

export const WorkflowReview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [workflow, setWorkflow] = useState<WorkflowResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingStep, setEditingStep] = useState<StepResponse | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
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

    // Update the step in the workflow
    const updatedSteps = workflow.steps.map((s) =>
      s.id === updatedStep.id ? updatedStep : s
    );

    setWorkflow({
      ...workflow,
      steps: updatedSteps,
    });
  };

  const handleSaveWorkflow = async () => {
    if (!workflow) return;

    // Validate all steps have labels
    const incompleteSteps = workflow.steps.filter(
      (step) => !step.field_label || !step.instruction
    );

    if (incompleteSteps.length > 0) {
      alert(
        `Cannot save: ${incompleteSteps.length} step(s) missing labels. Please review all steps.`
      );
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.updateWorkflow(workflow.id, { status: 'active' });
      alert('Workflow activated successfully!');
      navigate('/dashboard');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save workflow';
      alert(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !workflow) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="text-sm text-red-800">{error || 'Workflow not found'}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-sm text-gray-600 hover:text-gray-900 mb-4 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to workflows
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{workflow.name}</h1>
            {workflow.description && (
              <p className="mt-2 text-sm text-gray-600">{workflow.description}</p>
            )}
            <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
              <span>{workflow.steps.length} steps</span>
              <span>•</span>
              <span className="capitalize">{workflow.status}</span>
            </div>
          </div>

          {/* Save button (top) */}
          <button
            onClick={handleSaveWorkflow}
            disabled={isSaving}
            className="px-6 py-2 bg-primary-600 text-white font-medium rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Workflow'}
          </button>
        </div>
      </div>

      {/* Steps grid */}
      {workflow.steps.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No steps in this workflow</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {workflow.steps.map((step) => (
              <StepCard key={step.id} step={step} onEdit={handleEditStep} />
            ))}
          </div>

          {/* Save button (bottom) */}
          <div className="sticky bottom-0 py-4 bg-white border-t border-gray-200">
            <div className="flex justify-end">
              <button
                onClick={handleSaveWorkflow}
                disabled={isSaving}
                className="px-8 py-3 bg-primary-600 text-white font-medium rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
              >
                {isSaving ? 'Saving...' : 'Save Workflow'}
              </button>
            </div>
          </div>
        </>
      )}

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
