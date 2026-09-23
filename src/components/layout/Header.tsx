import React, { useState } from 'react';
import {
  Coins,
  ChevronDown,
  Layers,
  Plus,
  User as UserIcon,
  ShieldCheck,
  FolderOpen,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const Header: React.FC = () => {
  const {
    user,
    allUsers,
    switchUser,
    projects,
    activeProject,
    setActiveProject,
    createProject,
    activeJobsCount,
    setQueueDrawerOpen,
    setActiveNav,
  } = useApp();

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await createProject(newProjectName.trim(), newProjectDesc.trim());
    setNewProjectName('');
    setNewProjectDesc('');
    setNewProjectModalOpen(false);
  };

  return (
    <header className="h-16 bg-[#0c0d12]/85 backdrop-blur-xl border-b border-white/[0.06] px-4 md:px-8 flex items-center justify-between z-20">
      {/* Left Zone: Workspace / Project Selector */}
      <div className="flex items-center gap-3 pl-12 md:pl-0">
        <div className="relative">
          <button
            onClick={() => {
              setProjectDropdownOpen(!projectDropdownOpen);
              setUserDropdownOpen(false);
            }}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-white/[0.08] hover:border-white/[0.16] hover:bg-zinc-800/60 text-xs font-medium text-zinc-200 transition-all duration-150 cursor-pointer shadow-xs"
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span className="max-w-[140px] md:max-w-[200px] truncate font-semibold">
              {activeProject ? activeProject.name : 'Select Project'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {projectDropdownOpen && (
            <div className="absolute left-0 mt-2 w-72 bg-[#12141a] border border-white/[0.1] rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-1.5 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                Studio Projects
              </div>
              <div className="max-h-60 overflow-y-auto px-1 space-y-0.5">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveProject(p);
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      activeProject?.id === p.id
                        ? 'bg-emerald-500/10 text-emerald-300 font-medium'
                        : 'text-zinc-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-zinc-400 font-mono tabular-nums">
                      {p.assetCount} assets
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t border-white/[0.06] mt-2 pt-1.5 px-1.5">
                <button
                  onClick={() => {
                    setProjectDropdownOpen(false);
                    setNewProjectModalOpen(true);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-xs font-medium text-zinc-200 hover:bg-white/[0.06] flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Create New Project</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => setActiveNav('projects')}
          className="hidden sm:inline-flex text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          Manage Projects
        </button>
      </div>

      {/* Right Zone: Credit Counter, Queue Trigger, User Profile */}
      <div className="flex items-center gap-2.5">
        {/* Credits Balance Display */}
        <div
          onClick={() => setActiveNav('settings')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-white/[0.08] hover:border-amber-400/30 transition-all cursor-pointer group"
          title="View credit transactions & ledger"
        >
          <Coins className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-bold font-mono text-zinc-100 tabular-nums">
              {user?.credits ?? 0}
            </span>
            <span className="text-[10px] text-zinc-400 font-medium">CR</span>
          </div>
        </div>

        {/* Live Queue Drawer Trigger */}
        <button
          onClick={() => setQueueDrawerOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
            activeJobsCount > 0
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
              : 'bg-zinc-900/60 border-white/[0.08] text-zinc-300 hover:bg-zinc-800/60 hover:border-white/[0.16]'
          }`}
        >
          <Layers
            className={`w-3.5 h-3.5 ${
              activeJobsCount > 0 ? 'animate-pulse text-emerald-400' : 'text-zinc-400'
            }`}
          />
          <span className="hidden sm:inline">Queue</span>
          {activeJobsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-zinc-950 text-[10px] font-bold font-mono">
              {activeJobsCount}
            </span>
          )}
        </button>

        {/* User Account & Switcher Dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setUserDropdownOpen(!userDropdownOpen);
              setProjectDropdownOpen(false);
            }}
            className="flex items-center gap-2 p-1.5 pl-2 rounded-xl bg-zinc-900/60 border border-white/[0.08] hover:border-white/[0.16] hover:bg-zinc-800/60 transition-all cursor-pointer"
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-6 h-6 rounded-full object-cover ring-1 ring-white/10"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs">
                <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
              </div>
            )}
            <span className="text-xs text-zinc-200 max-w-[90px] truncate hidden md:inline font-medium">
              {user?.name}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {userDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-[#12141a] border border-white/[0.1] rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <div className="text-xs font-semibold text-zinc-100">{user?.name}</div>
                <div className="text-[11px] text-zinc-400 font-mono mt-0.5">{user?.email}</div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="uppercase font-mono">
                    {user?.tier} TIER · {user?.role}
                  </span>
                </div>
              </div>

              {/* Data Isolation Verification: Switch User Profile */}
              <div className="px-4 pt-3 pb-1 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-semibold">
                Switch Profile (Test Data Isolation)
              </div>
              <div className="px-1.5 space-y-0.5">
                {allUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      switchUser(u.id);
                      setUserDropdownOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      user?.id === u.id
                        ? 'bg-emerald-500/10 text-emerald-300 font-medium'
                        : 'text-zinc-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={u.avatar}
                        alt={u.name}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      <span className="truncate">{u.name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                      {u.credits} CR
                    </span>
                  </button>
                ))}
              </div>

              <div className="border-t border-white/[0.06] mt-2 pt-1.5 px-1.5">
                <button
                  onClick={() => {
                    setActiveNav('settings');
                    setUserDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06] cursor-pointer transition-colors"
                >
                  Account & Studio Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Project Modal */}
      {newProjectModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141a] border border-white/[0.1] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-100">Create New Studio Project</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Isolate assets, generation sequences, prompts, and canvas flows into a dedicated project space.
              </p>
            </div>
            <form onSubmit={handleCreateProjectSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cyberpunk Noir Feature Short"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] focus:border-emerald-500 text-xs text-zinc-100 outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Brief creative synopsis or aesthetic guidelines..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] focus:border-emerald-500 text-xs text-zinc-100 outline-none resize-none transition-colors"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setNewProjectModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors cursor-pointer shadow-sm"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
