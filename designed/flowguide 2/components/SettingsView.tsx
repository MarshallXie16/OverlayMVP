import React, { useState } from 'react';
import { User } from '../types';
import { Button } from './Button';
import { User as UserIcon, Building, Bell, Shield, Camera, Lock, Mail, Globe, Moon, Key, Webhook } from 'lucide-react';

interface SettingsViewProps {
  user: User; // Current user
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'company' | 'preferences' | 'integrations'>('profile');
  const [userName, setUserName] = useState(user.name);
  const [companyName, setCompanyName] = useState('Acme Corp');

  return (
    <div className="animate-fade-in pb-20 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">Account Settings</h1>
        <p className="text-neutral-600">Manage your profile, workspace configuration, and preferences.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Settings Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0">
             <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-glass overflow-hidden p-2 sticky top-24">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'profile' ? 'bg-white shadow-sm text-primary-700' : 'text-neutral-600 hover:bg-white/50'}`}
                >
                    <UserIcon size={18} /> Profile
                </button>
                <button
                    onClick={() => setActiveTab('company')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'company' ? 'bg-white shadow-sm text-primary-700' : 'text-neutral-600 hover:bg-white/50'}`}
                >
                    <Building size={18} /> Company
                </button>
                <button
                    onClick={() => setActiveTab('integrations')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'integrations' ? 'bg-white shadow-sm text-primary-700' : 'text-neutral-600 hover:bg-white/50'}`}
                >
                    <Webhook size={18} /> Integrations
                </button>
                <button
                    onClick={() => setActiveTab('preferences')}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${activeTab === 'preferences' ? 'bg-white shadow-sm text-primary-700' : 'text-neutral-600 hover:bg-white/50'}`}
                >
                    <Bell size={18} /> Preferences
                </button>
             </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
            {activeTab === 'profile' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Profile Card */}
                    <div className="glass-card p-8 rounded-2xl border border-white/60 relative overflow-hidden">
                        
                        <h2 className="text-xl font-bold text-neutral-900 mb-8">Public Profile</h2>
                        
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 mb-8">
                            <div className="relative group cursor-pointer">
                                <img src={user.avatarUrl} alt={user.name} className="w-28 h-28 rounded-full border-4 border-white shadow-lg object-cover" />
                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm">
                                    <Camera className="text-white" size={24} />
                                </div>
                            </div>
                            <div className="text-center sm:text-left pt-2">
                                <h3 className="font-bold text-2xl text-neutral-900">{userName}</h3>
                                <p className="text-neutral-500 mb-4">Admin • Acme Corp Workspace</p>
                            </div>
                        </div>

                        <div className="grid gap-6 max-w-2xl">
                            <div className="form-group">
                                <label className="block text-sm font-semibold text-neutral-700 mb-1">Display Name</label>
                                <input 
                                    type="text" 
                                    value={userName} 
                                    onChange={(e) => setUserName(e.target.value)}
                                    className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50 transition-all" 
                                />
                            </div>
                            <div className="form-group">
                                <label className="block text-sm font-semibold text-neutral-700 mb-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                                    <input 
                                        type="email" 
                                        value="sarah@flowguide.io" 
                                        readOnly
                                        className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl bg-neutral-50 text-neutral-500 cursor-not-allowed" 
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-8 pt-6 border-t border-neutral-100 flex justify-end">
                            <Button>Save Changes</Button>
                        </div>
                    </div>

                    {/* Security Card */}
                    <div className="glass-card p-8 rounded-2xl border border-white/60">
                         <h2 className="text-xl font-bold text-neutral-900 mb-6">Security</h2>
                         <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="bg-neutral-100 p-3 rounded-xl">
                                    <Lock size={20} className="text-neutral-600" />
                                </div>
                                <div>
                                    <p className="font-bold text-neutral-900 text-sm">Password</p>
                                    <p className="text-xs text-neutral-500">Last changed 3 months ago</p>
                                </div>
                            </div>
                            <Button variant="secondary" size="sm">Update</Button>
                         </div>
                    </div>
                </div>
            )}

            {activeTab === 'company' && (
                <div className="space-y-6 animate-fade-in">
                     <div className="glass-card p-8 rounded-2xl border border-white/60">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-neutral-900">Workspace Details</h2>
                                <p className="text-sm text-neutral-500">Manage your company identity and billing.</p>
                            </div>
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold border border-purple-200 uppercase tracking-wide">
                                Enterprise
                            </span>
                        </div>

                        <div className="form-group mb-8 max-w-md">
                                <label className="block text-sm font-semibold text-neutral-700 mb-1">Company Name</label>
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={18} />
                                        <input 
                                            type="text" 
                                            value={companyName} 
                                            onChange={(e) => setCompanyName(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white/50" 
                                        />
                                    </div>
                                    <Button>Update</Button>
                                </div>
                        </div>

                        <div className="bg-neutral-50 rounded-xl p-6 border border-neutral-200">
                            <h4 className="text-sm font-bold text-neutral-900 mb-4 uppercase tracking-wide text-xs text-neutral-500">Usage</h4>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium text-neutral-700">Seats</span>
                                        <span className="text-neutral-500">15 / 20 used</span>
                                    </div>
                                    <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
                                        <div className="bg-primary-500 h-full w-3/4 rounded-full"></div>
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium text-neutral-700">Workflows</span>
                                        <span className="text-neutral-500">124 / Unlimited</span>
                                    </div>
                                    <div className="w-full bg-neutral-200 h-2 rounded-full overflow-hidden">
                                        <div className="bg-accent-500 h-full w-1/12 rounded-full"></div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 pt-4 border-t border-neutral-200 flex justify-end">
                                <a href="#" className="text-sm text-primary-600 font-bold hover:text-primary-700">Manage Subscription &rarr;</a>
                            </div>
                        </div>
                     </div>
                </div>
            )}
            
            {activeTab === 'integrations' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="glass-card p-8 rounded-2xl border border-white/60">
                        <h2 className="text-xl font-bold text-neutral-900 mb-6">API & Integrations</h2>
                        
                        <div className="space-y-6">
                            <div className="border border-neutral-200 rounded-xl p-5 bg-white/50">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-neutral-900 p-2.5 rounded-lg text-white">
                                            <Key size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-neutral-900">API Keys</h3>
                                            <p className="text-xs text-neutral-500">Access FlowGuide programmatically</p>
                                        </div>
                                    </div>
                                    <Button size="sm">Create New Key</Button>
                                </div>
                                <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 font-mono text-xs text-neutral-500 flex justify-between items-center">
                                    <span>pk_live_59...x829</span>
                                    <button className="text-primary-600 font-bold hover:underline">Reveal</button>
                                </div>
                            </div>

                            <div className="border border-neutral-200 rounded-xl p-5 bg-white/50">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-600 p-2.5 rounded-lg text-white">
                                            <Webhook size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-neutral-900">Webhooks</h3>
                                            <p className="text-xs text-neutral-500">Receive real-time event updates</p>
                                        </div>
                                    </div>
                                    <Button variant="secondary" size="sm">Manage</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'preferences' && (
                 <div className="glass-card p-8 rounded-2xl border border-white/60 animate-fade-in">
                    <h2 className="text-xl font-bold text-neutral-900 mb-6">Application Preferences</h2>
                    
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-4">Notifications</h3>
                            <div className="space-y-4">
                                {[
                                    { label: 'Workflow failures', desc: 'Get notified when a workflow breaks', default: true },
                                    { label: 'Weekly health reports', desc: 'Summary of team activity', default: true },
                                    { label: 'New team member joins', desc: 'When someone accepts an invite', default: false },
                                    { label: 'Product updates', desc: 'New features and improvements', default: false }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0">
                                        <div>
                                            <span className="text-neutral-900 font-medium block">{item.label}</span>
                                            <span className="text-neutral-500 text-xs">{item.desc}</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" defaultChecked={item.default} className="sr-only peer" />
                                            <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6">
                            <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-4">Interface</h3>
                            <div className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <div className="bg-neutral-100 p-2 rounded-lg">
                                        <Globe size={18} className="text-neutral-600" />
                                    </div>
                                    <div>
                                        <span className="text-neutral-900 font-medium block">Timezone</span>
                                        <span className="text-neutral-500 text-xs">Auto-detect (UTC-08:00)</span>
                                    </div>
                                </div>
                                <Button variant="secondary" size="sm">Edit</Button>
                            </div>
                             <div className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                    <div className="bg-neutral-100 p-2 rounded-lg">
                                        <Moon size={18} className="text-neutral-600" />
                                    </div>
                                    <div>
                                        <span className="text-neutral-900 font-medium block">Theme</span>
                                        <span className="text-neutral-500 text-xs">Light mode active</span>
                                    </div>
                                </div>
                                <select className="bg-white border border-neutral-200 text-sm rounded-lg p-2 outline-none focus:ring-2 focus:ring-primary-500">
                                    <option>Light</option>
                                    <option>Dark</option>
                                    <option>System</option>
                                </select>
                            </div>
                        </div>
                    </div>
                 </div>
            )}
        </div>
      </div>
    </div>
  );
};