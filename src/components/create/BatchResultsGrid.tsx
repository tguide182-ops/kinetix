import React from 'react';
import {
  Download,
  Heart,
  Wand2,
  Film,
  Layers,
  Sparkles,
  Trash2,
  Copy,
  Play,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Asset, GenerationJob } from '../../types';

interface BatchResultsGridProps {
  recentAssets: Asset[];
  activeJobs: GenerationJob[];
}

export const BatchResultsGrid: React.FC<BatchResultsGridProps> = ({
  recentAssets,
  activeJobs,
}) => {
  const {
    toggleFavorite,
    deleteAsset,
    setActiveMediaAsset,
    sendToCreate,
    showToast,
  } = useApp();

  const handleCopyPrompt = (prompt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(prompt);
    showToast('Prompt copied to clipboard');
  };

  const handleDownload = (asset: Asset, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = asset.url;
    a.download = `kinetix-${asset.type}-${asset.id.slice(0, 8)}.${asset.type === 'video' ? 'mp4' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download initialized');
  };

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
            Studio Outputs
          </h3>
          <span className="text-[11px] text-zinc-500 font-mono">
            {recentAssets.length} rendered · {activeJobs.length} in queue
          </span>
        </div>
      </div>

      {recentAssets.length === 0 && activeJobs.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#0e1015] border border-white/[0.06] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center mx-auto text-zinc-500">
            <Sparkles className="w-6 h-6 text-zinc-400" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h4 className="text-sm font-semibold text-zinc-200">No Rendered Assets Yet</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Enter your prompt directive and click Generate to start generating images, video clips, or continuous multi-segment sequences.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Active Generation Jobs (Loading States) */}
          {activeJobs.map((job) => (
            <div
              key={job.id}
              className="aspect-square rounded-2xl bg-[#0f1117] border border-emerald-500/30 p-5 flex flex-col justify-between relative overflow-hidden shadow-2xl group"
            >
              <div className="space-y-2 z-10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Rendering {job.type} ({job.batchIndex + 1}/{job.batchTotal})
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {job.progress}%
                  </span>
                </div>
                <p className="text-xs text-zinc-300 line-clamp-3 leading-relaxed">
                  {job.prompt}
                </p>
              </div>

              {/* Progress and status */}
              <div className="space-y-2 z-10">
                <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                  <span className="capitalize">{job.status}...</span>
                  <span>{job.duration ? `${job.duration}s clip` : 'Hi-Res'}</span>
                </div>
                <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/[0.08]">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>

              {/* Atmospheric Glow Shimmer */}
              <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 via-transparent to-cyan-500/10 animate-pulse pointer-events-none" />
            </div>
          ))}

          {/* Rendered Assets */}
          {recentAssets.map((asset) => {
            const isVid = asset.type === 'video';
            return (
              <div
                key={asset.id}
                onClick={() => setActiveMediaAsset(asset)}
                className="group relative rounded-2xl bg-[#111319] border border-white/[0.07] hover:border-white/[0.18] overflow-hidden flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-lg hover:shadow-2xl"
              >
                {/* Media Image / Video Box */}
                <div className="aspect-square w-full bg-zinc-900 relative overflow-hidden">
                  <img
                    src={asset.thumbnailUrl || asset.url}
                    alt={asset.prompt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Video duration pill */}
                  {isVid && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[10px] font-mono text-zinc-200 flex items-center gap-1.5 border border-white/10">
                      <Play className="w-2.5 h-2.5 fill-current text-cyan-400" />
                      <span>{asset.duration || 6}s</span>
                    </div>
                  )}

                  {/* Aspect Ratio pill */}
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[9px] font-mono text-zinc-300 border border-white/10">
                    {asset.aspectRatio}
                  </div>

                  {/* Hover Quick View / Favorite Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-between">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(asset.id);
                        }}
                        className={`p-2 rounded-xl backdrop-blur-md transition-colors cursor-pointer ${
                          asset.isFavorite
                            ? 'bg-rose-500/80 text-white'
                            : 'bg-black/60 text-zinc-300 hover:text-white'
                        }`}
                        title={asset.isFavorite ? 'Favorited' : 'Add to favorites'}
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${asset.isFavorite ? 'fill-current' : ''}`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <span className="px-3 py-1.5 rounded-xl bg-white/20 backdrop-blur-md text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg">
                        <Maximize2 className="w-3 h-3" />
                        <span>Inspect Asset</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Details & Action Bar */}
                <div className="p-3.5 bg-[#0f1117] border-t border-white/[0.06] space-y-2">
                  <p
                    className="text-xs text-zinc-200 line-clamp-2 leading-relaxed"
                    title={asset.prompt}
                  >
                    {asset.prompt}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1 border-t border-white/[0.05]">
                    <span>{asset.model.split('-')[0]}</span>
                    <span>
                      {new Date(asset.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Fast Direct Action Buttons */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-between gap-1 pt-1 text-zinc-400"
                  >
                    {/* Animate to Video */}
                    {!isVid && (
                      <button
                        onClick={() =>
                          sendToCreate({
                            mode: 'image_to_video',
                            prompt: `Animate this scene with natural cinematic motion: ${asset.prompt}`,
                            sourceAsset: asset,
                          })
                        }
                        className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-cyan-400 transition-colors cursor-pointer"
                        title="Animate into Video Clip"
                      >
                        <Film className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Extend Video */}
                    {isVid && (
                      <button
                        onClick={() =>
                          sendToCreate({
                            mode: 'video_extension',
                            prompt: asset.prompt,
                            sourceAsset: asset,
                          })
                        }
                        className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-emerald-400 transition-colors cursor-pointer"
                        title="Extend Sequence (+7s)"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Generate Variations */}
                    <button
                      onClick={() =>
                        sendToCreate({
                          mode: 'image_variations',
                          prompt: asset.prompt,
                          sourceAsset: asset,
                        })
                      }
                      className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-emerald-400 transition-colors cursor-pointer"
                      title="Generate Variations"
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>

                    {/* Use as Reference */}
                    <button
                      onClick={() =>
                        sendToCreate({
                          mode: 'image_reference',
                          prompt: asset.prompt,
                          referenceAssets: [asset.url],
                        })
                      }
                      className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-emerald-400 transition-colors cursor-pointer"
                      title="Use as Reference"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Copy Prompt */}
                    <button
                      onClick={(e) => handleCopyPrompt(asset.prompt, e)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
                      title="Copy Prompt"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Download */}
                    <button
                      onClick={(e) => handleDownload(asset, e)}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
                      title="Download Asset"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => deleteAsset(asset.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-950/60 hover:text-rose-400 transition-colors cursor-pointer"
                      title="Delete Asset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
