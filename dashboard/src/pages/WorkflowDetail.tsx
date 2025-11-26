/**
 * Workflow Detail Page
 * View workflow details and steps
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import type { WorkflowResponse } from '@/api/types';
import { HealthBadge } from '@/components/HealthBadge';
import { ExtensionNotInstalledModal } from '@/components/ExtensionNotInstalledModal';
import { startWalkthrough, isExtensionInstalled } from '@/utils/extensionBridge';

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

  const handleDelete = async () => {
    if (!workflow || !confirm('Are you sure you want to delete this workflow?')) {
      return;
    }

    try {
      await apiClient.deleteWorkflow(workflow.id);
      navigate('/dashboard');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete workflow');
    }
  };

  const handleStartWalkthrough = async () => {
    if (!workflow) return;

    // Clear previous errors
    setWalkthroughError(null);

    // Check extension installed
    if (!isExtensionInstalled()) {
      setShowExtensionModal(true);
      return;
    }

    // Start walkthrough
    setIsStartingWalkthrough(true);
    try {
      await startWalkthrough(workflow.id, workflow.starting_url);
      // Success! Tab opened and extension notified
      // User is now in the new tab following the walkthrough
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start walkthrough';
      setWalkthroughError(errorMessage);
      console.error('Failed to start walkthrough:', err);
    } finally {
      setIsStartingWalkthrough(false);
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
          className="text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          ← Back to workflows
        </button>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{workflow.name}</h1>
              <HealthBadge workflow={workflow} size="large" showLabel={true} />
            </div>
            {workflow.description && (
              <p className="mt-2 text-sm text-gray-600">{workflow.description}</p>
            )}
          </div>
          <div className="flex gap-3">
            {/* Start Walkthrough button - only for active workflows */}
            {workflow.status === 'active' && (
              <button
                onClick={handleStartWalkthrough}
                disabled={isStartingWalkthrough}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-md flex items-center gap-2"
              >
                {isStartingWalkthrough ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Starting...
                  </>
                ) : (
                  <>
                    <span>▶️</span>
                    Start Walkthrough
                  </>
                )}
              </button>
            )}

            {/* Review & Edit button */}
            {(workflow.status === 'draft' || workflow.status === 'active') && (
              <button
                onClick={() => navigate(`/workflows/${workflow.id}/review`)}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md"
              >
                {workflow.status === 'draft' ? 'Review & Edit' : 'Edit Workflow'}
              </button>
            )}
            
            {/* Delete button */}
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 border border-red-600 rounded-md hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Walkthrough Error Display */}
      {walkthroughError && (
        <div className="mb-6 rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Failed to start walkthrough</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{walkthroughError}</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => setWalkthroughError(null)}
                  className="text-sm font-medium text-red-800 hover:text-red-900"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg mb-8">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Workflow Information
          </h3>
        </div>
        <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-200">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {workflow.status}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Starting URL</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <a
                  href={workflow.starting_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  {workflow.starting_url}
                </a>
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Total Steps</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {workflow.step_count}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Total Uses</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {workflow.total_uses}
              </dd>
            </div>
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Success Rate</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {(workflow.success_rate * 100).toFixed(0)}%
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Steps */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Workflow Steps
          </h3>
        </div>
        <div className="border-t border-gray-200">
          <ul className="divide-y divide-gray-200">
            {workflow.steps.map((step) => (
              <li key={step.id} className="px-4 py-4 sm:px-6">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary-100 text-primary-600 font-semibold">
                      {step.step_number}
                    </span>
                  </div>
                  <div className="ml-4 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">
                        {step.field_label || step.action_type}
                      </p>
                      <span className="text-xs text-gray-500">
                        {step.action_type}
                      </span>
                    </div>
                    {step.instruction && (
                      <p className="mt-1 text-sm text-gray-600">
                        {step.instruction}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {step.page_context.url}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Extension Not Installed Modal */}
      <ExtensionNotInstalledModal
        isOpen={showExtensionModal}
        onClose={() => setShowExtensionModal(false)}
      />
    </div>
  );
};
