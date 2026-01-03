import React, { useState, useEffect, useRef } from 'react';
import { TeamMember, UserRole, UserStatus } from '../types';
import { Button } from './Button';
import { Copy, Check, UserPlus, Mail, Shield, MoreVertical, Trash2, RefreshCw, UserCog, Ban, AlertTriangle, X } from 'lucide-react';

interface TeamViewProps {
    members: TeamMember[];
}

export const TeamView: React.FC<TeamViewProps> = ({ members: initialMembers }) => {
    const [members, setMembers] = useState<TeamMember[]>(initialMembers);
    const [inviteLink] = useState('https://flowguide.io/invite?token=tk_8f92a8c7');
    const [copied, setCopied] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    
    // State for managing dropdown menus and deletions
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
    
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCopyInvite = () => {
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const confirmDeleteMember = () => {
        if (memberToDelete) {
            setMembers(members.filter(m => m.id !== memberToDelete));
            setMemberToDelete(null);
            setActiveMenuId(null);
        }
    };

    const toggleMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === id ? null : id);
    };

    // Helper to Title Case strings
    const toTitleCase = (str: string) => {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    return (
        <div className="animate-fade-in pb-20 relative">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-neutral-900 mb-2">Team Management</h1>
                    <p className="text-neutral-600">Manage your team members, roles, and invitations.</p>
                </div>
                <Button icon={<UserPlus size={18} />} onClick={() => setIsInviteModalOpen(true)}>
                    Invite Member
                </Button>
            </div>

            {/* Invite Section */}
            <div className="glass-card rounded-2xl p-8 mb-8 border border-primary-100 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary-100 to-transparent opacity-50 rounded-bl-full pointer-events-none -mr-16 -mt-16"></div>
                
                <div className="relative z-10">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 shrink-0">
                            <Mail size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-neutral-900 mb-1">Invite your team</h3>
                            <p className="text-neutral-600 max-w-xl">
                                Share this link with your team members to let them join your company workspace. 
                                They will automatically be added as Viewers until you change their role.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
                        <div className="flex-1 relative">
                            <input 
                                type="text" 
                                readOnly 
                                value={inviteLink} 
                                className="w-full pl-4 pr-4 py-3 rounded-xl border border-neutral-300 bg-white text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm shadow-inner"
                            />
                        </div>
                        <Button 
                            variant={copied ? "secondary" : "primary"} 
                            onClick={handleCopyInvite}
                            className={`w-36 justify-center ${copied ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100" : ""}`}
                            icon={copied ? <Check size={18} /> : <Copy size={18} />}
                        >
                            {copied ? "Copied!" : "Copy Link"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Members List */}
            <div className="bg-white/60 backdrop-blur-xl rounded-2xl border border-white/60 shadow-glass overflow-hidden min-h-[400px]">
                <div className="px-6 py-4 border-b border-neutral-200/60 flex justify-between items-center bg-white/40">
                    <h3 className="font-bold text-neutral-900 flex items-center gap-2">
                        All Members <span className="bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-full text-xs">{members.length}</span>
                    </h3>
                    <div className="flex gap-2">
                         <button className="p-2 text-neutral-500 hover:bg-neutral-100 rounded-lg transition-colors">
                             <RefreshCw size={16} />
                         </button>
                    </div>
                </div>

                <div className="overflow-visible">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left border-b border-neutral-200/60 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Role</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Joined</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-200/60">
                            {members.map((member) => (
                                <tr key={member.id} className="hover:bg-white/40 transition-colors group relative">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full border border-white shadow-sm" />
                                            <div>
                                                <div className="font-semibold text-neutral-900">{member.name}</div>
                                                <div className="text-xs text-neutral-500">{member.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border
                                            ${member.role === UserRole.ADMIN ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                                              member.role === UserRole.EDITOR ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                                              'bg-neutral-100 text-neutral-600 border-neutral-200'}`}
                                        >
                                            {member.role === UserRole.ADMIN && <Shield size={10} />}
                                            {toTitleCase(member.role)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                         <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border
                                            ${member.status === UserStatus.ACTIVE ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}
                                        >
                                            <span className={`w-1.5 h-1.5 rounded-full ${member.status === UserStatus.ACTIVE ? 'bg-green-500' : 'bg-amber-500'}`}></span>
                                            {member.status === UserStatus.ACTIVE ? 'Active' : 'Pending Invite'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-neutral-600">
                                        {member.joinedAt}
                                    </td>
                                    <td className="px-6 py-4 text-right relative">
                                        <div className="flex items-center justify-end">
                                            <button 
                                                onClick={(e) => toggleMenu(member.id, e)}
                                                className={`p-2 rounded-lg transition-colors ${activeMenuId === member.id ? 'bg-primary-50 text-primary-600' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'}`}
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                        </div>

                                        {/* Dropdown Menu */}
                                        {activeMenuId === member.id && (
                                            <div ref={menuRef} className="absolute right-6 top-12 w-48 bg-white/95 backdrop-blur-xl rounded-xl shadow-xl border border-neutral-100 z-50 text-left overflow-hidden animate-fade-in origin-top-right">
                                                <div className="py-1">
                                                    <button className="w-full px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-primary-600 flex items-center gap-2 transition-colors">
                                                        <UserCog size={16} /> Edit Role
                                                    </button>
                                                    {member.status === UserStatus.PENDING && (
                                                        <button className="w-full px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-primary-600 flex items-center gap-2 transition-colors">
                                                            <Mail size={16} /> Resend Invite
                                                        </button>
                                                    )}
                                                    <button className="w-full px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 hover:text-amber-600 flex items-center gap-2 transition-colors">
                                                        <Ban size={16} /> Suspend User
                                                    </button>
                                                    <div className="h-px bg-neutral-100 my-1"></div>
                                                    <button 
                                                        onClick={() => setMemberToDelete(member.id)}
                                                        className="w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                                                    >
                                                        <Trash2 size={16} /> Remove Member
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Invite Modal */}
            {isInviteModalOpen && (
                <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-neutral-900/40" onClick={() => setIsInviteModalOpen(false)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
                        <button 
                            onClick={() => setIsInviteModalOpen(false)}
                            className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600 p-1 rounded-full hover:bg-neutral-100 transition-colors"
                        >
                            <X size={20} />
                        </button>
                        
                        <h3 className="text-xl font-bold mb-4 text-neutral-900">Invite Team Member</h3>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-1">Email Address</label>
                                <input 
                                    type="email" 
                                    placeholder="colleague@company.com" 
                                    className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-neutral-900" 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-neutral-700 mb-1">Role</label>
                                <select className="w-full p-3 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-neutral-900">
                                    <option value="VIEWER">Viewer</option>
                                    <option value="EDITOR">Editor</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <Button variant="secondary" onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
                            <Button onClick={() => setIsInviteModalOpen(false)}>Send Invite</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {memberToDelete && (
                <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm" onClick={() => setMemberToDelete(null)}></div>
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-fade-in border border-neutral-200">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4 mx-auto">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-center mb-2 text-neutral-900">Remove Member?</h3>
                        <p className="text-neutral-500 text-center mb-6 text-sm">
                            Are you sure you want to remove this user from the workspace? They will lose access immediately.
                        </p>
                        <div className="flex gap-3">
                            <Button variant="secondary" className="flex-1" onClick={() => setMemberToDelete(null)}>Cancel</Button>
                            <Button 
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white border-transparent" 
                                onClick={confirmDeleteMember}
                            >
                                Remove
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};