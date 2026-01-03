import React, { useState } from 'react';
import { Workflow } from '../types';
import { Button } from './Button';
import { Search, AlertTriangle } from 'lucide-react';
import { HEALTH_STATS, TEAM_MEMBERS } from '../mockData';
import { WorkflowCard } from './WorkflowCard';

interface DashboardProps {
  workflows: Workflow[];
  onSelectWorkflow: (wf: Workflow) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ workflows: initialWorkflows, onSelectWorkflow }) => {
  const [workflows, setWorkflows] = useState<Workflow[]>(initialWorkflows);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  const handleDeleteWorkflow = () => {
      if (workflowToDelete) {
          setWorkflows(workflows.filter(w => w.id !== workflowToDelete));
          setWorkflowToDelete(null);
      }
  };

  return (
    <div className="animate-fade-in pb-20">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight mb-2">Operations Dashboard</h1>
        <p className="text-neutral-500">Real-time overview of your team's automation health and activity.</p>
      </div>

      {/* Unified Stats Component */}
      <div className="relative bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm mb-12 p-6">
        
        {/* Floating System Status Badge */}
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-white/40 backdrop-blur-md text-green-700 rounded-full border border-green-200/50 shadow-sm z-10">
            <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="font-bold text-sm">Operational</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
            
            {/* 1. Success Rate */}
            <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Success Rate</span>
                <span className="text-3xl font-bold text-neutral-900">{HEALTH_STATS.successRate}%</span>
                <span className="text-xs text-green-600 font-medium mt-1">↑ 2.1% this week</span>
            </div>

            {/* 2. Total Workflows */}
            <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Total Workflows</span>
                <span className="text-3xl font-bold text-neutral-900">{workflows.length}</span>
                <span className="text-xs text-neutral-500 mt-1">Across {TEAM_MEMBERS.length} users</span>
            </div>

            {/* 3. Total Runs */}
            <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Total Runs</span>
                <span className="text-3xl font-bold text-neutral-900">{HEALTH_STATS.totalRuns.toLocaleString()}</span>
                <span className="text-xs text-neutral-500 mt-1">Last 30 days</span>
            </div>

             {/* 4. Failing Workflows */}
             <div className="bg-white/50 rounded-xl p-5 border border-white/60 shadow-sm flex flex-col justify-center h-32 hover:shadow-md transition-shadow">
                <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Failing Workflows</span>
                <span className={`text-3xl font-bold ${HEALTH_STATS.brokenWorkflows > 0 ? 'text-red-600' : 'text-neutral-900'}`}>
                    {HEALTH_STATS.brokenWorkflows}
                </span>
                {HEALTH_STATS.brokenWorkflows > 0 ? (
                    <span className="text-xs text-red-600 font-medium mt-1">Needs attention</span>
                ) : (
                     <span className="text-xs text-neutral-500 mt-1">All systems go</span>
                )}
            </div>

        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-neutral-900">Recent Workflows</h2>
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
            <input 
                type="text" 
                placeholder="Search workflows..." 
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-neutral-200 bg-white/80 backdrop-blur focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all shadow-sm"
            />
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map((wf) => (
          <WorkflowCard 
            key={wf.id} 
            workflow={wf} 
            onClick={onSelectWorkflow} 
            onDelete={() => setWorkflowToDelete(wf.id)}
          />
        ))}
        
        {/* Empty State / Add New */}
        <div className="border-2 border-dashed border-neutral-200 rounded-2xl flex flex-col items-center justify-center text-neutral-400 p-6 hover:border-primary-400 hover:bg-primary-50/30 transition-all cursor-pointer group min-h-[240px]">
             <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="text-3xl text-neutral-300 group-hover:text-primary-500">+</span>
             </div>
             <span className="font-semibold group-hover:text-primary-600 transition-colors">Create New Workflow</span>
        </div>
      </div>

       {/* Delete Confirmation Modal */}
       {workflowToDelete && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm" onClick={() => setWorkflowToDelete(null)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-neutral-200">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
                    <AlertTriangle size={24} />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">Delete Workflow?</h3>
                <p className="text-neutral-500 text-center mb-6 text-sm">
                    Are you sure you want to delete this workflow? This action cannot be undone and your team will lose access to it.
                </p>
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setWorkflowToDelete(null)}>Cancel</Button>
                    <Button 
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white border-transparent" 
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