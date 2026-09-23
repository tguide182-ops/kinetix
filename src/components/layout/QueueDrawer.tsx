import React from 'react';
import {
  X,
  RefreshCw,
  Ban,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const QueueDrawer: React.FC = () => {
  const {
    jobs,
    queueDrawerOpen,
    setQueueDrawerOpen,
    cancelJob,
    retryJob,
    assets,
    setActiveMediaAsset,
  } = useApp();

  if (!queueDrawerOpen) return null;

  const activeJobs = jobs.filter(
    (j) =>
      j.status === 'queued' ||
      j.status === 'preparing' ||
      j.status === 'generating' ||
      j.status === 'processing'
  );
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const failedJobs = jobs.filter((j) => j.status === 'failed' || j.status === 'cancelled');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-md flex justify-end">
      <div className="w-full max-w-md bg-[#0c0d12] border-l border-white/[0.08] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center">
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">Generation Queue</h3>
              <p className="text-[11px] text-zinc-400 font-mono">
                {jobs.length} pipeline jobs registered
              </p>
            </div>
          </div>
          <button
            onClick={() => setQueueDrawerOpen(false)}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {/* Active / Running Section */}
          <section>
            <div className="flex items-center justify-between text-xs font-bold uppercase font-mono tracking-wider text-zinc-300 mb-3">
              <span>Active Processing ({activeJobs.length})</span>
              {activeJobs.length > 0 && (
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 lowercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  live inference
                </span>
              )}
            </div>

            {activeJobs.length === 0 ? (
              <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/[0.04] text-center text-xs text-zinc-500">
                No active rendering tasks in queue
              </div>
            ) : (
              <div className="space-y-3">
                {activeJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3.5 rounded-2xl bg-[#12141a] border border-emerald-500/30 space-y-2.5 shadow-lg relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold">
                          {job.type.replace('_', ' ')} · {job.model.split('-')[0]}
                        </div>
                        <div className="text-xs font-semibold text-zinc-200 line-clamp-1 mt-0.5">
                          {job.prompt}
                        </div>
                      </div>
                      <button
                        onClick={() => cancelJob(job.id)}
                        className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer p-1 rounded-lg"
                        title="Cancel generation & refund credits"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                        <span className="capitalize">{job.status}...</span>
                        <span className="tabular-nums font-semibold">{job.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/[0.06]">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <span>Aspect: {job.aspectRatio}</span>
                      <span>Cost: {job.estimatedCredits} CR</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Failed / Needs Attention Section */}
          {failedJobs.length > 0 && (
            <section>
              <div className="text-xs font-bold uppercase font-mono tracking-wider text-rose-400 mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Failed or Cancelled ({failedJobs.length})</span>
              </div>
              <div className="space-y-2.5">
                {failedJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3.5 rounded-2xl bg-rose-950/20 border border-rose-900/40 text-xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-mono uppercase font-bold text-rose-300">
                          {job.status.toUpperCase()} · #{job.id.slice(0, 8)}
                        </div>
                        <div className="text-zinc-200 line-clamp-1 mt-0.5">{job.prompt}</div>
                      </div>
                      <button
                        onClick={() => retryJob(job.id)}
                        className="px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Retry generation"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    </div>
                    {job.error && (
                      <div className="text-[11px] text-rose-400/90 font-mono bg-rose-950/50 p-2 rounded-xl">
                        {job.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed Section */}
          <section>
            <div className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-400 mb-3 flex items-center justify-between">
              <span>Completed ({completedJobs.length})</span>
            </div>
            {completedJobs.length === 0 ? (
              <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/[0.04] text-center text-xs text-zinc-500">
                Completed jobs will appear here
              </div>
            ) : (
              <div className="space-y-2">
                {completedJobs.slice(0, 10).map((job) => {
                  const outputAsset = assets.find((a) => job.outputAssetIds?.includes(a.id));
                  return (
                    <div
                      key={job.id}
                      onClick={() => outputAsset && setActiveMediaAsset(outputAsset)}
                      className="p-3 rounded-2xl bg-[#111319] hover:bg-zinc-850 border border-white/[0.06] flex items-center gap-3 transition-colors cursor-pointer group"
                    >
                      {outputAsset ? (
                        outputAsset.type === 'video' ? (
                          <div className="w-12 h-12 rounded-xl bg-zinc-950 shrink-0 relative overflow-hidden border border-white/[0.08]">
                            <img
                              src={outputAsset.thumbnailUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="w-2.5 h-2.5 border-l-4 border-l-white border-y-2 border-y-transparent ml-0.5" />
                            </div>
                          </div>
                        ) : (
                          <img
                            src={outputAsset.url}
                            alt=""
                            className="w-12 h-12 rounded-xl bg-zinc-950 object-cover shrink-0 border border-white/[0.08]"
                          />
                        )
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-500 border border-white/[0.08]">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-200 line-clamp-1 font-semibold group-hover:text-emerald-300 transition-colors">
                          {job.prompt}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{job.model.split('-')[0]}</span>
                          <span>·</span>
                          <span>{job.aspectRatio}</span>
                        </div>
                      </div>

                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-200 shrink-0 transition-colors" />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
