import React from 'react';
import { Home, PlayCircle, Settings, Users, Activity, Plus } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const navItems = [
    { icon: <Home size={20} />, label: 'Dashboard', id: 'dashboard' },
    { icon: <Users size={20} />, label: 'Team', id: 'team' },
    { icon: <PlayCircle size={20} />, label: 'Library', id: 'library' },
    { icon: <Activity size={20} />, label: 'Health', id: 'health' },
    { icon: <Settings size={20} />, label: 'Settings', id: 'settings' },
  ];

  return (
    <div className="w-64 h-screen fixed left-0 top-0 flex flex-col glass-panel border-r border-white/40 z-20">
      {/* Logo Area */}
      <div className="p-6 flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-xl shadow-lg transform rotate-3">
          F
        </div>
        <span className="font-bold text-lg text-neutral-900 tracking-tight">FlowGuide</span>
      </div>

      {/* Action Button */}
      <div className="px-6 mb-8">
        <button className="w-full py-3 px-4 bg-gradient-to-r from-accent-500 to-accent-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2">
          <Plus size={18} />
          <span>New Workflow</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              currentView === item.id 
                ? 'bg-primary-50/80 text-primary-700 font-medium shadow-sm border border-primary-100' 
                : 'text-neutral-600 hover:bg-white/50 hover:text-neutral-900'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* User Profile Stub */}
      <div className="p-4 border-t border-neutral-200/50">
        <button 
            onClick={() => onNavigate('settings')}
            className="flex items-center gap-3 w-full p-2 rounded-xl hover:bg-white/60 transition-colors text-left group"
        >
          <div className="w-10 h-10 rounded-full bg-neutral-200 overflow-hidden border-2 border-white shadow-sm group-hover:border-primary-200 transition-colors">
             <img src="https://picsum.photos/seed/user/100" alt="User" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors">Sarah Jenkins</span>
            <span className="text-xs text-neutral-500">Admin • FlowGuide</span>
          </div>
        </button>
      </div>
    </div>
  );
};