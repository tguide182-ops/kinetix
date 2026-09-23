import React, { useState } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  FolderOpen,
  Layers,
  ArrowRight,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const ProjectsView: React.FC = () => {
  const {
    projects,
    activeProject,
    setActiveProject,
    createProject,
    deleteProject,
    setActiveNav,
  } = useApp();

  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createProject(name.trim(), desc.trim());
    setName('');
    setDesc('');
    setModalOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#090a0e] overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-emerald-400" />
            <span>Studio Production Projects</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Organize generations, prompts, characters, and sequence pipelines into isolated workspaces.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Studio Project</span>
        </button>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => {
          const isActive = activeProject?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => setActiveProject(p)}
              className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-4 ${
                isActive
                  ? 'bg-[#12141c] border-emerald-500 shadow-xl ring-1 ring-emerald-500/20'
                  : 'bg-[#0f1117] border-white/[0.07] hover:border-white/[0.18] hover:bg-[#12141a]'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center">
                      <FolderOpen
                        className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-zinc-400'}`}
                      />
                    </div>
                    <span className="text-sm font-bold text-zinc-100">{p.name}</span>
                  </div>
                  {isActive && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold border border-emerald-500/30">
                      Active
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {p.description || 'No description provided.'}
                </p>
              </div>

              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{p.assetCount} assets</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveProject(p);
                      setActiveNav('create');
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
                  >
                    <span>Open Workspace</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  {projects.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id);
                      }}
                      className="p-1 rounded-lg text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#111319] border border-white/[0.1] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100">Create New Studio Project</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 font-mono uppercase">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Autumn Avant-Garde Lookbook"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] focus:border-emerald-500 text-xs text-zinc-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5 font-mono uppercase">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Aesthetic directives, character lore, narrative notes..."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/[0.08] focus:border-emerald-500 text-xs text-zinc-100 outline-none resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs transition-colors cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
