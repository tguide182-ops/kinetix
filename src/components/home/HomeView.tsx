import React from 'react';
import {
  Sparkles,
  Film,
  Layers,
  Coins,
  ArrowRight,
  Plus,
  Play,
  Image as ImageIcon,
  Wand2,
  FolderOpen,
  Compass,
  ArrowUpRight,
  Clock,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const HomeView: React.FC = () => {
  const {
    user,
    projects,
    assets,
    activeJobsCount,
    setActiveNav,
    setCreationMode,
    sendToCreate,
    setActiveMediaAsset,
    setActiveProject,
  } = useApp();

  const curatedTemplates = [
    {
      id: 'tmpl-1',
      title: 'Cinematic Anamorphic Film Still',
      subtitle: '35mm · Panavision Lens · Shibuya Rain',
      prompt:
        'A weary detective in a wet obsidian trenchcoat walking through rainy cyberpunk alleyways, neon kanji reflections in puddles, 35mm anamorphic, atmospheric steam vents',
      aspectRatio: '16:9',
      mode: 'image' as const,
      model: 'gemini-3.1-flash-image',
      image:
        'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80',
      badge: 'Image Model',
    },
    {
      id: 'tmpl-2',
      title: 'Veo 3.1 Tracking Camera Motion',
      subtitle: 'Dynamic Dolly · Fluid Slow Motion · 720p',
      prompt:
        'Cinematic dolly forward following character as glowing neon signs reflect on wet asphalt, mist floating between buildings, 24fps motion blur',
      aspectRatio: '16:9',
      mode: 'text_to_video' as const,
      model: 'veo-3.1-lite-generate-preview',
      image:
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80',
      badge: 'Video Engine',
    },
    {
      id: 'tmpl-3',
      title: 'Haute Couture Editorial Lookbook',
      subtitle: 'Studio Lighting · Sculptural Silk · 3:4',
      prompt:
        'Avant-garde sculptural silk cape with metallic embroidery, high key directional spotlight, Vogue editorial cover composition, crisp skin micro-texture',
      aspectRatio: '3:4',
      mode: 'image' as const,
      model: 'gemini-3.1-flash-lite-image',
      image:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
      badge: 'Fashion Portrait',
    },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#090a0e] overflow-y-auto p-4 sm:p-6 md:p-8 space-y-8">
      {/* Studio Hero Canvas Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-zinc-900/90 via-[#10131a] to-[#0c0d12] border border-white/[0.08] p-6 sm:p-8 md:p-10 shadow-2xl">
        {/* Subtle Ambient Radial Lighting */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="uppercase tracking-widest text-[11px] font-semibold">
              KINETIX PRODUCTION SUITE
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Powered by Google AI Video & Image Models</span>
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
            Create cinema-grade imagery and multi-shot videos with full directorial control.
          </h1>

          <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-2xl">
            Orchestrate continuous 30-second narratives, animate still keyframes with Google Veo,
            explore combinatorial prompt matrices, and connect assets in the visual Flow Canvas.
          </p>

          {/* Quick Action Cards in Hero */}
          <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => {
                setCreationMode('image');
                setActiveNav('create');
              }}
              className="p-3 rounded-2xl bg-white text-zinc-950 hover:bg-zinc-100 font-semibold text-xs transition-all duration-150 active:scale-98 flex items-center justify-between shadow-lg cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                <span>Create Image</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => {
                setCreationMode('text_to_video');
                setActiveNav('create');
              }}
              className="p-3 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] text-zinc-100 font-semibold text-xs transition-all duration-150 active:scale-98 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-cyan-400" />
                <span>Create Video</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => {
                setCreationMode('image_reference');
                setActiveNav('create');
              }}
              className="p-3 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] text-zinc-100 font-semibold text-xs transition-all duration-150 active:scale-98 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-violet-400" />
                <span>With Reference</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => setActiveNav('flow')}
              className="p-3 rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] text-zinc-100 font-semibold text-xs transition-all duration-150 active:scale-98 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>Flow Canvas</span>
              </div>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Studio Quick-Start Production Presets */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Production Studio Presets</h2>
            <p className="text-xs text-zinc-400">
              Select a calibrated recipe to load model settings, aspect ratios, and prompt structures.
            </p>
          </div>
          <button
            onClick={() => setActiveNav('batch')}
            className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Open Prompt Matrix</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {curatedTemplates.map((tmpl) => (
            <div
              key={tmpl.id}
              onClick={() =>
                sendToCreate({
                  mode: tmpl.mode,
                  prompt: tmpl.prompt,
                  aspectRatio: tmpl.aspectRatio,
                })
              }
              className="group relative rounded-2xl bg-[#111319] border border-white/[0.07] hover:border-white/[0.18] overflow-hidden flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-lg hover:shadow-2xl"
            >
              {/* Media Thumbnail */}
              <div className="aspect-[16/10] w-full bg-zinc-900 overflow-hidden relative">
                <img
                  src={tmpl.image}
                  alt={tmpl.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111319] via-black/20 to-transparent" />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-mono text-zinc-200 border border-white/10">
                  {tmpl.badge}
                </div>
              </div>

              {/* Text Info */}
              <div className="p-4 space-y-2">
                <div>
                  <h3 className="text-xs font-bold text-zinc-100 group-hover:text-emerald-300 transition-colors">
                    {tmpl.title}
                  </h3>
                  <p className="text-[11px] font-mono text-zinc-400 mt-0.5">{tmpl.subtitle}</p>
                </div>

                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {tmpl.prompt}
                </p>

                <div className="pt-2 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                  <span>Launch in Studio</span>
                  <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Split Section: Recent Creations + Active Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Generations Gallery */}
        <div className="lg:col-span-2 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Recent Studio Generations</h2>
              <p className="text-xs text-zinc-400">
                {assets.length} assets ready in project library
              </p>
            </div>
            <button
              onClick={() => setActiveNav('assets')}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {assets.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#111319]/50 p-8 text-center space-y-2">
              <p className="text-xs text-zinc-400">No assets created yet.</p>
              <button
                onClick={() => {
                  setCreationMode('image');
                  setActiveNav('create');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-white text-zinc-950 font-semibold text-xs"
              >
                Create First Asset
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {assets.slice(0, 6).map((asset) => {
                const isVid = asset.type === 'video';
                return (
                  <div
                    key={asset.id}
                    onClick={() => setActiveMediaAsset(asset)}
                    className="group relative aspect-square rounded-2xl bg-zinc-900 border border-white/[0.06] hover:border-white/[0.18] overflow-hidden cursor-pointer transition-all duration-200 shadow-md"
                  >
                    <img
                      src={asset.thumbnailUrl || asset.url}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />

                    {isVid && (
                      <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-mono text-zinc-200 flex items-center gap-1 border border-white/10">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>{asset.duration || 6}s</span>
                      </div>
                    )}

                    {/* Hover Info Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs text-zinc-200 line-clamp-2 leading-snug">
                        {asset.prompt}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono mt-1">
                        <span>{asset.model.split('-')[0]}</span>
                        <span>{asset.aspectRatio}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Active Projects & Fast Workspace */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Studio Projects</h2>
              <p className="text-xs text-zinc-400">Scoped creative workspaces</p>
            </div>
            <button
              onClick={() => setActiveNav('projects')}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>Manage</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            {projects.map((proj) => (
              <div
                key={proj.id}
                onClick={() => {
                  setActiveProject(proj);
                  setActiveNav('create');
                }}
                className="p-3.5 rounded-2xl bg-[#111319] border border-white/[0.06] hover:border-white/[0.18] transition-all cursor-pointer group space-y-1.5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-zinc-100 group-hover:text-emerald-300 transition-colors">
                      {proj.name}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
                    {proj.assetCount} assets
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 line-clamp-1">
                  {proj.description || 'Dedicated generation workspace'}
                </p>
              </div>
            ))}
          </div>

          {/* Flow Workspace Card Teaser */}
          <div
            onClick={() => setActiveNav('flow')}
            className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 to-teal-950/20 border border-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-zinc-100">Visual Flow Graph</span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              Connect reference characters, scene prompts, and video extensions on an infinite spatial canvas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
