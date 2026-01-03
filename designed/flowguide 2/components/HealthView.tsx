import React from 'react';
import { RECENT_EXECUTIONS, HEALTH_STATS, WORKFLOWS } from '../mockData';
import { WorkflowStatus } from '../types';
import { Activity, CheckCircle, AlertTriangle, XCircle, Clock, Zap, ArrowRight } from 'lucide-react';
import { Button } from './Button';

export const HealthView: React.FC = () => {
  const brokenWorkflows = WORKFLOWS.filter(w => w.status === WorkflowStatus.BROKEN);

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">System Health</h1>
        <p className="text-neutral-600">Monitor workflow reliability, auto-healing events, and recent execution logs.</p>
      </div>

      {/* Critical Alerts (Story 5.2) */}
      {brokenWorkflows.length > 0 && (
        <div className="mb-8 animate-pulse">
           <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-4 shadow-sm">
              <div className="bg-red-100 p-3 rounded-full text-red-600 shrink-0">
                 <AlertTriangle size={24} />
              </div>
              <div className="flex-1">
                 <h3 className="text-lg font-bold text-red-800 mb-1">Attention Required: {brokenWorkflows.length} Broken Workflow(s)</h3>
                 <p className="text-red-700 mb-4 text-sm">The following workflows have failed consistently and require manual repair.</p>
                 
                 <div className="grid gap-3">
                    {brokenWorkflows.map(wf => (
                       <div key={wf.id} className="bg-white/60 p-4 rounded-xl border border-red-100 flex justify-between items-center">
                          <div>
                             <span className="font-bold text-neutral-900 block">{wf.title}</span>
                             <span className="text-xs text-neutral-500">Last failed: 2 hours ago • Step 5 not found</span>
                          </div>
                          <Button variant="accent" size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                             Fix Now
                          </Button>
                       </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Metrics Grid (Story 5.3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="glass-card p-6 rounded-2xl border-t-4 border-green-500 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">Success Rate</span>
                    <h3 className="text-3xl font-bold text-neutral-900 mt-1">{HEALTH_STATS.successRate}%</h3>
                </div>
                <div className="bg-green-50 p-2 rounded-lg text-green-600">
                    <CheckCircle size={20} />
                </div>
            </div>
            <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full rounded-full" style={{ width: `${HEALTH_STATS.successRate}%` }}></div>
            </div>
            <span className="text-xs text-neutral-500 mt-2 block">Last 30 days</span>
        </div>

        <div className="glass-card p-6 rounded-2xl border-t-4 border-purple-500 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">Auto-Healed</span>
                    <h3 className="text-3xl font-bold text-neutral-900 mt-1">{HEALTH_STATS.healedCount}</h3>
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
                    <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">Total Runs</span>
                    <h3 className="text-3xl font-bold text-neutral-900 mt-1">{HEALTH_STATS.totalRuns}</h3>
                </div>
                <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                    <Activity size={20} />
                </div>
            </div>
            <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full">+12% from last week</span>
        </div>

        <div className="glass-card p-6 rounded-2xl border-t-4 border-amber-500 shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <span className="text-neutral-500 text-sm font-medium uppercase tracking-wide">Avg Duration</span>
                    <h3 className="text-3xl font-bold text-neutral-900 mt-1">{HEALTH_STATS.avgExecutionTime}</h3>
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

      {/* Recent Logs Table (Story 5.3) */}
      <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-glass overflow-hidden">
         <div className="px-6 py-5 border-b border-neutral-200/60 flex justify-between items-center bg-white/40">
            <h3 className="font-bold text-neutral-900">Recent Executions</h3>
            <Button variant="ghost" size="sm" className="text-primary-600 hover:text-primary-700">
                View All Logs <ArrowRight size={16} />
            </Button>
         </div>
         
         <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                    <tr className="text-left border-b border-neutral-200/60 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Workflow</th>
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Duration</th>
                        <th className="px-6 py-4">Time</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/60">
                    {RECENT_EXECUTIONS.map((log) => (
                        <tr key={log.id} className="hover:bg-white/40 transition-colors group">
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border
                                    ${log.status === 'SUCCESS' ? 'bg-green-50 text-green-700 border-green-200' : 
                                      log.status === 'HEALED' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                                      'bg-red-50 text-red-700 border-red-200'}`}
                                >
                                    {log.status === 'SUCCESS' && <CheckCircle size={12} />}
                                    {log.status === 'HEALED' && <Zap size={12} />}
                                    {log.status === 'FAILED' && <XCircle size={12} />}
                                    {log.status}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="font-semibold text-neutral-900">{log.workflowTitle}</div>
                                {log.errorMessage && (
                                    <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={log.errorMessage}>
                                        {log.errorMessage}
                                    </div>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <img src={log.user.avatarUrl} alt={log.user.name} className="w-6 h-6 rounded-full border border-white" />
                                    <span className="text-sm text-neutral-700">{log.user.name}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-neutral-600 font-mono">
                                {log.duration}
                            </td>
                            <td className="px-6 py-4 text-sm text-neutral-500">
                                {log.timestamp}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};