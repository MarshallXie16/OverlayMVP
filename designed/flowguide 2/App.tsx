
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { WorkflowDetail } from './components/WorkflowDetail';
import { TeamView } from './components/TeamView';
import { HealthView } from './components/HealthView';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { Workflow, WorkflowStatus } from './types';
import { WORKFLOWS, TEAM_MEMBERS, MOCK_USER } from './mockData';

// Simple key check - in a real app this would be in a secure context/auth service
const hasApiKey = !!process.env.API_KEY;

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);

  const handleSelectWorkflow = (wf: Workflow) => {
    if (wf.status === WorkflowStatus.HEALTHY || wf.status === WorkflowStatus.NEEDS_REVIEW) {
        // For demo purposes, we populate the "empty" workflows with mock data if needed
        // or just use the first one which has data
        if (wf.steps.length === 0 && WORKFLOWS[0].steps.length > 0) {
            wf.steps = WORKFLOWS[0].steps; 
        }
    }
    setSelectedWorkflow(wf);
    setCurrentView('detail');
    window.scrollTo(0, 0);
  };

  const handleNavigate = (viewId: string) => {
      setCurrentView(viewId);
      window.scrollTo(0, 0);
  };

  return (
    <div className="flex min-h-screen bg-primary-50 font-sans text-neutral-900">
      {/* Background Gradients for the main page (Glassmorphism effect base) */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary-300/30 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-accent-300/20 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob animation-delay-2000"></div>
        <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-purple-300/20 rounded-full blur-3xl opacity-50 mix-blend-multiply animate-blob animation-delay-4000"></div>
      </div>

      <Sidebar currentView={currentView} onNavigate={handleNavigate} />
      
      <main className="flex-1 ml-64 p-8 relative z-10">
        {/* Top Bar Placeholder (User controls, Notification) */}
        <div className="flex justify-end mb-8 sticky top-4 z-50 h-10">
             {!hasApiKey && (
                 <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-4 shadow-glass">
                    <div className="px-3 py-1 bg-red-100 text-red-600 rounded-lg text-xs font-bold border border-red-200">
                        Demo Mode (No API Key)
                    </div>
                 </div>
             )}
        </div>

        {currentView === 'dashboard' && (
          <Dashboard 
            workflows={WORKFLOWS} 
            onSelectWorkflow={handleSelectWorkflow} 
          />
        )}
        
        {currentView === 'team' && (
            <TeamView members={TEAM_MEMBERS} />
        )}

        {currentView === 'health' && (
            <HealthView />
        )}
        
        {currentView === 'library' && (
            <LibraryView 
                workflows={WORKFLOWS} 
                onSelectWorkflow={handleSelectWorkflow} 
            />
        )}

        {currentView === 'settings' && (
            <SettingsView user={MOCK_USER} />
        )}
        
        {currentView === 'detail' && selectedWorkflow && (
          <WorkflowDetail 
            workflow={selectedWorkflow} 
            onBack={() => setCurrentView('dashboard')} 
          />
        )}
      </main>

      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .animate-fade-in {
            animation: fadeIn 0.5s ease-out forwards;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default App;
