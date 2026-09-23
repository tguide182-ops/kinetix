import React from 'react';
import {
  Coins,
  Cpu,
  Tv,
  Film,
  Sparkles,
  Clock,
  Layers,
  Ratio,
  Info,
} from 'lucide-react';
import { ModelCapability, JobType } from '../../types';

interface ControlPanelProps {
  mode: JobType;
  models: ModelCapability[];
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  aspectRatio: string;
  setAspectRatio: (ar: string) => void;
  resolution: string;
  setResolution: (r: string) => void;
  numberOfOutputs: number;
  setNumberOfOutputs: (n: number) => void;
  duration: number;
  setDuration: (d: number) => void;
  seed: string;
  setSeed: (s: string) => void;
  estimatedCost: number;
  userCredits: number;
  disabled?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  mode,
  models,
  selectedModel,
  setSelectedModel,
  aspectRatio,
  setAspectRatio,
  resolution,
  setResolution,
  numberOfOutputs,
  setNumberOfOutputs,
  duration,
  setDuration,
  seed,
  setSeed,
  estimatedCost,
  userCredits,
  disabled,
}) => {
  const isVideo = mode.includes('video') || mode === 'sequence_segment';
  const availableModels = models.filter((m) => (isVideo ? m.type === 'video' : m.type === 'image'));

  const aspectRatios = isVideo
    ? [
        { id: '16:9', label: '16:9', desc: 'Cinema / YouTube', w: 16, h: 9 },
        { id: '9:16', label: '9:16', desc: 'Reels / TikTok', w: 9, h: 16 },
      ]
    : [
        { id: '1:1', label: '1:1', desc: 'Square', w: 12, h: 12 },
        { id: '16:9', label: '16:9', desc: 'Cinema Landscape', w: 16, h: 9 },
        { id: '9:16', label: '9:16', desc: 'Vertical Mobile', w: 9, h: 16 },
        { id: '4:3', label: '4:3', desc: 'Classic TV', w: 12, h: 9 },
        { id: '3:4', label: '3:4', desc: 'Editorial Portrait', w: 9, h: 12 },
        { id: '21:9', label: '21:9', desc: 'Ultra-Panavision', w: 18, h: 8 },
      ];

  return (
    <div className="w-80 md:w-88 bg-[#0c0d12] border-l border-white/[0.06] p-5 space-y-6 overflow-y-auto shrink-0 select-none">
      {/* Credit & Pre-generation Cost Card */}
      <div className="p-4 rounded-2xl bg-[#12141a] border border-white/[0.07] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Estimated Cost</span>
          <div className="flex items-center gap-1.5 text-zinc-100 font-mono font-bold text-sm">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="tabular-nums">{estimatedCost} CR</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-2 border-t border-white/[0.05]">
          <span>Wallet Balance:</span>
          <span
            className={
              userCredits < estimatedCost
                ? 'text-rose-400 font-bold tabular-nums'
                : 'text-emerald-400 font-semibold tabular-nums'
            }
          >
            {userCredits} CR
          </span>
        </div>
        {userCredits < estimatedCost && (
          <div className="text-[11px] text-rose-300 bg-rose-950/40 p-2.5 rounded-xl border border-rose-900/50 leading-tight">
            Insufficient credits. Reduce batch count or top up your account.
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold tracking-wider text-zinc-300 uppercase font-mono flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Generative Engine</span>
          </label>
          <span className="text-[10px] text-zinc-400 font-mono">Google AI</span>
        </div>

        <div className="space-y-2">
          {availableModels.map((m) => {
            const isSelected = selectedModel === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModel(m.id)}
                className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-800/80 border-emerald-500/80 text-zinc-100 shadow-md ring-1 ring-emerald-500/20'
                    : 'bg-[#101217] border-white/[0.06] text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-100">{m.name}</span>
                  <span className="text-[10px] font-mono text-emerald-400 font-semibold tabular-nums">
                    {m.creditCost} CR
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                  {m.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Aspect Ratio Selector with Wireframe Shapes */}
      <div className="space-y-2.5">
        <label className="text-xs font-semibold tracking-wider text-zinc-300 uppercase font-mono flex items-center gap-1.5">
          <Ratio className="w-3.5 h-3.5 text-zinc-400" />
          <span>Canvas Aspect Ratio</span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          {aspectRatios.map((r) => {
            const isSelected = aspectRatio === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setAspectRatio(r.id)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                  isSelected
                    ? 'bg-zinc-800/80 border-emerald-500/80 text-zinc-100 shadow-xs ring-1 ring-emerald-500/20'
                    : 'bg-[#101217] border-white/[0.06] text-zinc-400 hover:border-white/[0.14] hover:text-zinc-200'
                }`}
              >
                {/* Visual Ratio Wireframe Shape */}
                <div className="w-7 h-7 rounded bg-zinc-900 border border-white/[0.1] flex items-center justify-center shrink-0">
                  <div
                    style={{ width: `${r.w}px`, height: `${r.h}px` }}
                    className={`rounded-xs transition-colors ${
                      isSelected ? 'bg-emerald-400' : 'bg-zinc-600'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold leading-tight">{r.label}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{r.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Video Duration (if Video Mode) */}
      {isVideo && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold tracking-wider text-zinc-300 uppercase font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Target Duration</span>
            </label>
            <span className="text-xs font-mono font-bold text-cyan-400">{duration}s</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[4, 6, 8, 15, 20, 25, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`py-2 rounded-xl border text-center text-xs font-mono font-semibold transition-all cursor-pointer ${
                  duration === d
                    ? 'bg-cyan-500 text-zinc-950 border-cyan-400 shadow-md'
                    : 'bg-[#101217] border-white/[0.06] text-zinc-300 hover:border-white/[0.14]'
                }`}
              >
                {d}s
              </button>
            ))}
          </div>

          {duration > 8 && (
            <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-cyan-200">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Multi-Shot Continuity Engine</span>
              </div>
              <p className="text-[11px] text-cyan-400/90 leading-relaxed">
                Native Veo clips cap at 8s. A {duration}s sequence automatically orchestrates into{' '}
                {Math.ceil(duration / 7.5)} connected shots with seamless frame passback.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Image Parallel Outputs Batch (if Image Mode) */}
      {!isVideo && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold tracking-wider text-zinc-300 uppercase font-mono flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
              <span>Parallel Outputs</span>
            </label>
            <span className="text-xs font-mono text-emerald-400 font-bold">{numberOfOutputs}</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 4, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumberOfOutputs(n)}
                className={`py-2 rounded-xl border text-center text-xs font-mono font-semibold transition-all cursor-pointer ${
                  numberOfOutputs === n
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-md'
                    : 'bg-[#101217] border-white/[0.06] text-zinc-300 hover:border-white/[0.14]'
                }`}
              >
                {n} {n === 1 ? 'Shot' : 'Shots'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resolution */}
      <div className="space-y-2.5">
        <label className="text-xs font-semibold tracking-wider text-zinc-300 uppercase font-mono flex items-center gap-1.5">
          <Tv className="w-3.5 h-3.5 text-zinc-400" />
          <span>Output Fidelity</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {(isVideo ? ['720p', '1080p', '4K'] : ['1K', '2K', '4K']).map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => setResolution(res)}
              className={`py-2 rounded-xl border text-center text-xs font-mono font-semibold transition-all cursor-pointer ${
                resolution === res
                  ? 'bg-zinc-800 text-emerald-400 border-emerald-500/60 shadow-xs'
                  : 'bg-[#101217] border-white/[0.06] text-zinc-400 hover:border-white/[0.14]'
              }`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* Deterministic Seed */}
      <div className="space-y-1.5 pt-1">
        <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase font-mono">
          Deterministic Seed (Optional)
        </label>
        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
          placeholder="Random Seed (e.g. 842109)"
          className="w-full px-3.5 py-2 rounded-xl bg-[#101217] border border-white/[0.07] text-xs font-mono text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-700 transition-colors"
        />
      </div>
    </div>
  );
};
