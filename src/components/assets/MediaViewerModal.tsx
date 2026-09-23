import React, { useState, useRef } from 'react';
import {
  X,
  Heart,
  Download,
  Film,
  Sparkles,
  Layers,
  Wand2,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  Calendar,
  Cpu,
  Ratio,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const MediaViewerModal: React.FC = () => {
  const {
    activeMediaAsset,
    setActiveMediaAsset,
    toggleFavorite,
    deleteAsset,
    sendToCreate,
    showToast,
  } = useApp();

  const [zoomLevel, setZoomLevel] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!activeMediaAsset) return null;

  const isVideo = activeMediaAsset.type === 'video';

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(activeMediaAsset.prompt);
    showToast('Prompt directive copied to clipboard');
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = activeMediaAsset.url;
    a.download = `kinetix-${activeMediaAsset.type}-${activeMediaAsset.id}.${isVideo ? 'mp4' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download initialized');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 md:p-8 animate-in fade-in duration-200">
      <div className="w-full max-w-6xl h-[92vh] bg-[#0c0d12] border border-white/[0.1] rounded-3xl flex flex-col md:flex-row overflow-hidden shadow-2xl">
        {/* Main Media Theater (Left/Center) */}
        <div className="flex-1 bg-black/60 flex flex-col justify-between relative overflow-hidden">
          {/* Top Theater Bar */}
          <div className="p-4 sm:p-5 flex items-center justify-between z-10 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-300 border border-white/[0.08]">
                {activeMediaAsset.type} · {activeMediaAsset.aspectRatio}
              </span>
              {isVideo && (
                <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold">
                  {activeMediaAsset.duration || 6}s Video
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isVideo && (
                <>
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(z - 0.25, 0.5))}
                    className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 cursor-pointer border border-white/[0.06]"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(z + 0.25, 3))}
                    className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 cursor-pointer border border-white/[0.06]"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={() => setActiveMediaAsset(null)}
                className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer border border-white/[0.06]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Media Viewport */}
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-hidden relative">
            {isVideo ? (
              <div className="relative max-h-full max-w-full flex items-center justify-center">
                <video
                  ref={videoRef}
                  src={activeMediaAsset.url}
                  autoPlay
                  loop
                  controls
                  className="max-h-[64vh] rounded-2xl shadow-2xl object-contain border border-white/[0.06]"
                />
              </div>
            ) : (
              <div
                className="transition-transform duration-150 flex items-center justify-center max-h-full max-w-full"
                style={{ transform: `scale(${zoomLevel})` }}
              >
                <img
                  src={activeMediaAsset.url}
                  alt={activeMediaAsset.prompt}
                  className="max-h-[64vh] rounded-2xl shadow-2xl object-contain border border-white/[0.06]"
                />
              </div>
            )}
          </div>

          {/* Bottom Fast Downstream Bar */}
          <div className="p-4 sm:p-5 bg-gradient-to-t from-black/90 to-transparent flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] z-10">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Animate to Video */}
              {!isVideo && (
                <button
                  onClick={() => {
                    sendToCreate({
                      mode: 'image_to_video',
                      prompt: `Animate this scene with natural cinematic motion: ${activeMediaAsset.prompt}`,
                      sourceAsset: activeMediaAsset,
                      aspectRatio: activeMediaAsset.aspectRatio,
                    });
                    setActiveMediaAsset(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Film className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                  <span>Animate to Video</span>
                </button>
              )}

              {/* Extend Video */}
              {isVideo && (
                <button
                  onClick={() => {
                    sendToCreate({
                      mode: 'video_extension',
                      prompt: activeMediaAsset.prompt,
                      sourceAsset: activeMediaAsset,
                      aspectRatio: activeMediaAsset.aspectRatio,
                    });
                    setActiveMediaAsset(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
                  <span>Extend Sequence (+7s)</span>
                </button>
              )}

              {/* Variations */}
              <button
                onClick={() => {
                  sendToCreate({
                    mode: 'image_variations',
                    prompt: activeMediaAsset.prompt,
                    sourceAsset: activeMediaAsset,
                    aspectRatio: activeMediaAsset.aspectRatio,
                  });
                  setActiveMediaAsset(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Variations</span>
              </button>

              {/* Use as Reference */}
              <button
                onClick={() => {
                  sendToCreate({
                    mode: 'image_reference',
                    prompt: activeMediaAsset.prompt,
                    referenceAssets: [activeMediaAsset.url],
                    aspectRatio: activeMediaAsset.aspectRatio,
                  });
                  setActiveMediaAsset(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Anchor Reference</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleFavorite(activeMediaAsset.id)}
                className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                  activeMediaAsset.isFavorite
                    ? 'bg-rose-950/70 border-rose-800 text-rose-400'
                    : 'bg-zinc-900 border-white/[0.08] text-zinc-400 hover:text-white'
                }`}
                title="Favorite"
              >
                <Heart
                  className={`w-4 h-4 ${activeMediaAsset.isFavorite ? 'fill-current' : ''}`}
                />
              </button>

              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-white/[0.08] text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Asset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Metadata Inspection Sidebar */}
        <div className="w-full md:w-88 bg-[#0e1015] border-t md:border-t-0 md:border-l border-white/[0.08] p-6 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
                <span className="uppercase font-bold tracking-wider">Prompt Directive</span>
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer font-medium"
                >
                  <Copy className="w-3 h-3 text-emerald-400" />
                  <span>Copy</span>
                </button>
              </div>
              <p className="text-xs text-zinc-200 leading-relaxed bg-[#14161f] p-3.5 rounded-2xl border border-white/[0.06]">
                {activeMediaAsset.prompt}
              </p>
            </div>

            {/* Technical Metadata */}
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
                Engine Telemetry
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-1">
                  <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-emerald-400" />
                    <span>Engine</span>
                  </div>
                  <div className="text-zinc-200 font-semibold truncate">
                    {activeMediaAsset.model}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-1">
                  <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <Ratio className="w-3 h-3 text-cyan-400" />
                    <span>Aspect Ratio</span>
                  </div>
                  <div className="text-zinc-200 font-semibold">
                    {activeMediaAsset.aspectRatio}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-1">
                  <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Resolution</span>
                  </div>
                  <div className="text-zinc-200 font-semibold">
                    {activeMediaAsset.resolution ||
                      `${activeMediaAsset.width}x${activeMediaAsset.height}`}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-1">
                  <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-violet-400" />
                    <span>Timestamp</span>
                  </div>
                  <div className="text-zinc-200 font-semibold text-[11px]">
                    {new Date(activeMediaAsset.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            {activeMediaAsset.tags && activeMediaAsset.tags.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
                  Semantic Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {activeMediaAsset.tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-0.5 rounded-lg bg-zinc-900 text-zinc-300 border border-white/[0.06] text-[10px] font-mono font-medium"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Delete Action */}
          <div className="pt-6 border-t border-white/[0.06]">
            <button
              onClick={() => deleteAsset(activeMediaAsset.id)}
              className="w-full py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/60 text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete from Library</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
