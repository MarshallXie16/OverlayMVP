import React, { useState } from 'react';
import { Workflow, Step } from '../types';
import { ArrowLeft, Play, Edit2, Trash2, AlertCircle, CheckCircle, Clock, Activity, Globe, MousePointerClick, BarChart3, AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';
import { Badge } from './Badge';

interface WorkflowDetailProps {
  workflow: Workflow;
  onBack: () => void;
}

export const WorkflowDetail: React.FC<WorkflowDetailProps> = ({ workflow, onBack }) => {
  const [steps, setSteps] = useState<Step[]>(workflow.steps);
  const [stepToDelete, setStepToDelete] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<Step | null>(null);

  // Form state for editing
  const [editForm, setEditForm] = useState<{ label: string; description: string }>({ label: '', description: '' });

  // Mock stats data (in a real app, this would come from the workflow object or API)
  const stats = {
    totalRuns: 1243,
    successRate: 94.2,
    avgDuration: '1m 12s',
    lastRun: '10 mins ago'
  };

  const handleDeleteStep = () => {
    if (stepToDelete) {
      setSteps(steps.filter(s => s.id !== stepToDelete));
      setStepToDelete(null);
    }
  };

  const handleEditClick = (step: Step) => {
    setEditingStep(step);
    setEditForm({ label: step.label, description: step.description });
  };

  const handleSaveStep = () => {
    if (editingStep) {
      setSteps(steps.map(s => 
        s.id === editingStep.id 
          ? { ...s, label: editForm.label, description: editForm.description }
          : s
      ));
      setEditingStep(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-20 animate-fade-in relative">
      {/* Header Navigation */}
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span>Back to Dashboard</span>
      </button>

      {/* Title & Actions */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-3">{workflow.title}</h1>
          <div className="flex items-center gap-4">
            <Badge status={workflow.status} />
            <span className="text-neutral-500 text-sm">Last updated {workflow.updatedAt} by {workflow.creator.name}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" icon={<Edit2 size={16} />}>Edit Workflow</Button>
          <Button icon={<Play size={16} />}>Run Workflow</Button>
        </div>
      </div>

      {/* Workflow Stats Overview (Replaces AI Section) */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
         {/* Success Rate Card */}
         <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
            <div className="flex justify-between items-start mb-2">
                <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">Success Rate</span>
                <div className={`p-1.5 rounded-lg ${stats.successRate > 90 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                    <Activity size={16} />
                </div>
            </div>
            <div>
                <div className="flex items-end gap-2 mb-1">
                    <span className="text-2xl font-bold text-neutral-900">{stats.successRate}%</span>
                    <span className="text-xs text-green-600 font-medium mb-1.5">↑ 2%</span>
                </div>
                <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full rounded-full" style={{ width: `${stats.successRate}%` }}></div>
                </div>
            </div>
         </div>

         {/* Total Runs Card */}
         <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
            <div className="flex justify-between items-start mb-2">
                <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">Total Runs</span>
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                    <BarChart3 size={16} />
                </div>
            </div>
            <div>
                <span className="text-2xl font-bold text-neutral-900 block">{stats.totalRuns.toLocaleString()}</span>
                <span className="text-xs text-neutral-500">Last run: {stats.lastRun}</span>
            </div>
         </div>

         {/* Steps & Duration */}
         <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
            <div className="flex justify-between items-start mb-2">
                <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">Complexity</span>
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-600">
                    <MousePointerClick size={16} />
                </div>
            </div>
            <div className="flex justify-between items-end">
                <div>
                    <span className="text-2xl font-bold text-neutral-900 block">{steps.length}</span>
                    <span className="text-xs text-neutral-500">Total Steps</span>
                </div>
                <div className="text-right">
                    <div className="flex items-center gap-1 text-neutral-600 text-sm font-medium">
                        <Clock size={14} />
                        {stats.avgDuration}
                    </div>
                    <span className="text-xs text-neutral-400">Avg time</span>
                </div>
            </div>
         </div>

         {/* Starting URL */}
         <div className="glass-card p-5 rounded-2xl border border-white/60 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300 col-span-1 md:col-span-1">
            <div className="flex justify-between items-start mb-2">
                <span className="text-neutral-500 text-xs font-bold uppercase tracking-wider">Starting Point</span>
                <div className="p-1.5 rounded-lg bg-teal-100 text-teal-600">
                    <Globe size={16} />
                </div>
            </div>
            <div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 mb-1 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-xs font-mono text-neutral-600 truncate">portal.netsuite.com</span>
                </div>
                <span className="text-xs text-primary-600 font-medium cursor-pointer hover:underline block text-right">Open URL</span>
            </div>
         </div>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 gap-6">
        {steps.map((step, index) => (
          <div 
            key={step.id} 
            className="glass-card p-0 overflow-hidden rounded-2xl hover:shadow-xl transition-all duration-300 border border-white/60 group"
          >
            <div className="flex flex-col md:flex-row">
              {/* Screenshot Area - Clickable */}
              <div 
                className="w-full md:w-72 h-48 md:h-auto bg-neutral-100 relative cursor-pointer overflow-hidden"
                onClick={() => handleEditClick(step)}
              >
                <img 
                  src={step.screenshotUrl} 
                  alt={`Step ${index + 1}`} 
                  className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                />
                <div className="absolute top-3 left-3 bg-neutral-900/80 backdrop-blur-sm text-white text-xs font-bold font-mono px-2.5 py-1 rounded-md shadow-lg z-10">
                  Step {step.order}
                </div>
                
                {/* Hover Overlay for Edit Action */}
                <div className="absolute inset-0 bg-primary-900/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <span className="bg-white text-neutral-900 px-4 py-2 rounded-xl font-semibold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 flex items-center gap-2">
                        <Edit2 size={14} /> Edit Step
                    </span>
                </div>
              </div>

              {/* Content Area */}
              <div className="p-6 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${
                        step.actionType === 'CLICK' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                        step.actionType === 'INPUT' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                        step.actionType === 'NAVIGATE' ? 'bg-teal-100 text-teal-700 border border-teal-200' :
                        'bg-gray-100 text-gray-700 border border-gray-200'
                      }`}>
                        {step.actionType}
                      </span>
                      {/* Interactive Step Title */}
                      <h3 
                        className="font-semibold text-lg text-neutral-900 hover:text-primary-600 cursor-pointer transition-colors border-b border-transparent hover:border-primary-200"
                        onClick={() => handleEditClick(step)}
                      >
                        {step.label}
                      </h3>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setStepToDelete(step.id)}
                            className="text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors p-2 rounded-lg"
                            title="Delete Step"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                  </div>
                  
                  {/* Interactive Description */}
                  <p 
                    className="text-neutral-600 mb-4 cursor-pointer hover:text-neutral-900 transition-colors"
                    onClick={() => handleEditClick(step)}
                  >
                    {step.description}
                  </p>
                  
                  <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 font-mono text-xs text-neutral-500 break-all flex items-center gap-2 group/selector hover:border-primary-200 transition-colors">
                    <span className="text-neutral-400 select-none">$</span>
                    {step.selector}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-100">
                  <div className="flex items-center gap-2 text-sm">
                    {step.confidence > 0.9 ? (
                      <span className="flex items-center gap-1.5 text-green-600 font-medium bg-green-50 px-2 py-1 rounded-md">
                        <CheckCircle size={14} /> High Confidence
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-md">
                        <AlertCircle size={14} /> Review Suggested
                      </span>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" icon={<Edit2 size={14} />} onClick={() => handleEditClick(step)}>
                      Edit Label
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Add Step Placeholder */}
      <div className="mt-6 border-2 border-dashed border-neutral-300 rounded-2xl p-8 flex flex-col items-center justify-center text-neutral-400 hover:border-primary-400 hover:bg-primary-50/30 transition-all cursor-pointer group">
        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3 group-hover:bg-primary-100 group-hover:text-primary-600 transition-colors">
            <span className="text-2xl">+</span>
        </div>
        <span className="font-medium group-hover:text-primary-600 transition-colors">Record new steps</span>
      </div>

      {/* Edit Step Modal */}
      {editingStep && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm" onClick={() => setEditingStep(null)}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden animate-fade-in border border-neutral-200">
             
             {/* Close Button */}
             <button 
                onClick={() => setEditingStep(null)}
                className="absolute top-4 right-4 z-20 text-neutral-400 hover:text-white md:hover:text-neutral-600 bg-black/20 md:bg-neutral-100 p-2 rounded-full transition-colors"
             >
                <X size={20} />
             </button>

             {/* Left: Screenshot */}
             <div className="w-full md:w-3/5 bg-neutral-100 relative flex items-center justify-center overflow-hidden">
                <img 
                    src={editingStep.screenshotUrl} 
                    alt="Step Screenshot" 
                    className="max-w-full max-h-[40vh] md:max-h-full object-contain" 
                />
                <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-mono font-bold">
                    Step {editingStep.order}
                </div>
             </div>

             {/* Right: Form */}
             <div className="w-full md:w-2/5 p-6 md:p-8 flex flex-col h-full overflow-y-auto bg-white">
                <h2 className="text-2xl font-bold text-neutral-900 mb-6">Edit Step</h2>
                
                <div className="space-y-6 flex-1">
                    <div className="form-group">
                        <label className="block text-sm font-bold text-neutral-700 mb-1.5">Label</label>
                        <input 
                            type="text" 
                            value={editForm.label}
                            onChange={(e) => setEditForm({...editForm, label: e.target.value})}
                            maxLength={100}
                            className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-neutral-900 font-medium"
                            placeholder="e.g. Invoice Number Field"
                        />
                        <div className="text-right text-xs text-neutral-400 mt-1">{editForm.label.length}/100</div>
                    </div>

                    <div className="form-group">
                        <label className="block text-sm font-bold text-neutral-700 mb-1.5">Instruction</label>
                        <textarea 
                            value={editForm.description}
                            onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                            maxLength={500}
                            rows={4}
                            className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-neutral-900 resize-none"
                            placeholder="Describe what the user should do..."
                        />
                         <div className="text-right text-xs text-neutral-400 mt-1">{editForm.description.length}/500</div>
                    </div>

                    <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-100">
                        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                            <MousePointerClick size={14} /> Technical Details
                        </h4>
                        <div className="space-y-2">
                             <div>
                                <span className="text-xs text-neutral-400 block">Action Type</span>
                                <span className="text-sm font-mono text-neutral-700 bg-white px-2 py-0.5 rounded border border-neutral-200 inline-block">{editingStep.actionType}</span>
                             </div>
                             <div>
                                <span className="text-xs text-neutral-400 block mb-1">Selector</span>
                                <code className="text-xs font-mono text-primary-700 bg-primary-50 px-2 py-1.5 rounded block break-all border border-primary-100">
                                    {editingStep.selector}
                                </code>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 mt-6 border-t border-neutral-100 flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setEditingStep(null)}>
                        Cancel
                    </Button>
                    <Button className="flex-1" onClick={handleSaveStep}>
                        Save Changes
                    </Button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {stepToDelete && (
        <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-neutral-900/30 backdrop-blur-sm" onClick={() => setStepToDelete(null)}></div>
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-neutral-200">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
                    <AlertTriangle size={24} />
                </div>
                <h3 className="text-xl font-bold text-center mb-2">Delete Step?</h3>
                <p className="text-neutral-500 text-center mb-6 text-sm">
                    Are you sure you want to delete this step? This action cannot be undone and remaining steps will be renumbered.
                </p>
                <div className="flex gap-3">
                    <Button variant="secondary" className="flex-1" onClick={() => setStepToDelete(null)}>Cancel</Button>
                    <Button 
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white border-transparent" 
                        onClick={handleDeleteStep}
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