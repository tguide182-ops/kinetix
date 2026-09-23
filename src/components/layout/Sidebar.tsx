import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  Film,
  FolderKanban,
  Image as ImageIcon,
  Heart,
  Grid3X3,
  Sliders,
  Home,
  Plus,
  Compass,
  Menu,
  X,
  Wand2,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { useApp, NavPage } from '../../context/AppContext';

export const Sidebar: React.FC = () => {
  const {
    activeNav,
    setActiveNav,
    setCreationMode,
    activeJobsCount,
    setQueueDrawerOpen,
  } = useApp();

  const [mobileOpen, setMobileOpen] = useState(false);

  const mainNav: Array<{ id: NavPage; label: string; icon: React.ReactNode }> = [
    { id: 'home', label: 'Studio Home', icon: <Home className="w-4 h-4" /> },
    { id: 'create', label: 'Create Studio', icon: <Sparkles className="w-4 h-4" /> },
    { id: 'flow', label: 'Flow Canvas', icon: <Compass className="w-4 h-4" /> },
    { id: 'sequences', label: 'Sequence 30s', icon: <Film className="w-4 h-4" /> },
  ];

  const libraryNav: Array<{ id: NavPage; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'generations', label: 'Render Queue', icon: <Layers className="w-4 h-4" />, badge: activeJobsCount },
    { id: 'assets', label: 'Asset Library', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'favorites', label: 'Starred', icon: <Heart className="w-4 h-4" /> },
    { id: 'batch', label: 'Prompt Matrix', icon: <Grid3X3 className="w-4 h-4" /> },
    { id: 'projects', label: 'Projects', icon: <FolderKanban className="w-4 h-4" /> },
    { id: 'settings', label: 'Studio Settings', icon: <Sliders className="w-4 h-4" /> },
  ];

  const handleNavClick = (id: NavPage) => {
    setActiveNav(id);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Hamburger Toggle Bar */}
      <div className="md:hidden fixed top-3 left-4 z-40">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-300 backdrop-blur-md shadow-lg"
          aria-label="Toggle Navigation"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Backdrop for Mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-35 w-64 bg-[#0c0d12] border-r border-white/[0.06] flex flex-col shrink-0 select-none transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400/20 to-teal-600/10 border border-emerald-500/30 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-zinc-100 text-sm flex items-center gap-1.5">
                <span>KINETIX</span>
                <span className="text-[10px] text-zinc-400 font-mono tracking-wider">STUDIO</span>
              </div>
              <div className="text-[11px] text-zinc-400">Creative Production</div>
            </div>
          </div>
        </div>

        {/* Primary Creation Action Button */}
        <div className="p-3.5 space-y-2">
          <button
            onClick={() => {
              setCreationMode('image');
              handleNavClick('create');
            }}
            className="w-full h-10 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-semibold text-xs tracking-tight flex items-center justify-center gap-2 shadow-lg shadow-white/5 transition-all duration-150 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Generation</span>
          </button>

          {/* Quick Mode Shortcuts */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              onClick={() => {
                setCreationMode('image');
                handleNavClick('create');
              }}
              className="py-1.5 px-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/[0.05] text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-3 h-3 text-emerald-400" />
              <span>Image</span>
            </button>
            <button
              onClick={() => {
                setCreationMode('text_to_video');
                handleNavClick('create');
              }}
              className="py-1.5 px-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/[0.05] text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Film className="w-3 h-3 text-cyan-400" />
              <span>Video</span>
            </button>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 px-3 py-2 space-y-6 overflow-y-auto">
          {/* Main Workspaces */}
          <div className="space-y-1">
            <div className="px-3 py-1 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-medium">
              Creative Spaces
            </div>
            {mainNav.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-zinc-800/70 text-zinc-100 shadow-xs border border-white/[0.06]'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isActive ? 'text-emerald-400' : 'text-zinc-500'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
                </button>
              );
            })}
          </div>

          {/* Library & Projects */}
          <div className="space-y-1">
            <div className="px-3 py-1 text-[10px] uppercase font-mono tracking-wider text-zinc-400 font-medium">
              Workspace & Assets
            </div>
            {libraryNav.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-zinc-800/70 text-zinc-100 shadow-xs border border-white/[0.06]'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isActive ? 'text-emerald-400' : 'text-zinc-500'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono flex items-center justify-center font-bold">
                      {item.badge}
                    </span>
                  ) : isActive ? (
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Engine Status Bar */}
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => setQueueDrawerOpen(true)}
            className="w-full p-2.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900/90 border border-white/[0.06] text-left transition-all duration-150 cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeJobsCount > 0 ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                  }`}
                />
                <span className="text-zinc-300 font-medium text-xs">Engine Queue</span>
              </span>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                {activeJobsCount > 0 ? `${activeJobsCount} active` : 'Ready'}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 group-hover:text-zinc-300 transition-colors truncate">
              {activeJobsCount > 0
                ? 'Processing generation pipeline...'
                : 'All background workers nominal'}
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};
