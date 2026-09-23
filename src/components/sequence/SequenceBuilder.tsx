import React, { useState } from 'react';
import {
  Film,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Sparkles,
  CheckCircle2,
  Clock,
  Ratio,
  ArrowRight,
  Layers,
  ChevronRight,
  Sliders,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { SceneShot } from '../../types';

export const SequenceBuilder: React.FC = () => {
  const { activeProject, submitGeneration, showToast } = useApp();

  const [sequenceTitle, setSequenceTitle] = useState('Neon Solitude (Opening Sequence)');
  const [targetDuration] = useState(30);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayIndex, setCurrentPlayIndex] = useState(0);

  const [shots, setShots] = useState<SceneShot[]>([
    {
      id: 'shot-1',
      sceneNumber: 1,
      title: 'Establishing Shibuya Rain',
      prompt:
        'Wide anamorphic establishing shot of Shibuya crossing in heavy rain, giant holographic kanji adverts, neon reflection in puddles',
      duration: 7.5,
      aspectRatio: '16:9',
      model: 'veo-3.1-lite-generate-preview',
      status: 'completed',
      outputVideoUrl:
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    },
    {
      id: 'shot-2',
      sceneNumber: 2,
      title: 'Detective Approaches Phone Booth',
      prompt:
        'Medium tracking dolly shot of Detective Renzo in wet obsidian coat walking toward an illuminated glowing glass phone booth',
      duration: 7.5,
      aspectRatio: '16:9',
      model: 'veo-3.1-generate-preview',
      status: 'completed',
      outputVideoUrl:
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    },
    {
      id: 'shot-3',
      sceneNumber: 3,
      title: 'Close-up Cybernetic Eye Flare',
      prompt:
        'Tight cinematic close-up of Detective Renzo picking up the handset receiver, amber optic lens focusing with digital HUD reflection',
      duration: 7.5,
      aspectRatio: '16:9',
      model: 'veo-3.1-generate-preview',
      status: 'completed',
      outputVideoUrl:
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    },
    {
      id: 'shot-4',
      sceneNumber: 4,
      title: 'Hover-Cab Speeds Away',
      prompt:
        'Low angle departure shot as a black matte hover-vehicle lifts above steam vents into the night sky, tail-lights streaking',
      duration: 7.5,
      aspectRatio: '16:9',
      model: 'veo-3.1-lite-generate-preview',
      status: 'idle',
    },
  ]);

  const totalCalculatedDuration = shots.reduce((acc, s) => acc + s.duration, 0);

  const handleGenerateShot = async (shotId: string) => {
    const shot = shots.find((s) => s.id === shotId);
    if (!shot) return;

    setShots((prev) =>
      prev.map((s) => (s.id === shotId ? { ...s, status: 'generating' } : s))
    );

    try {
      await submitGeneration({
        projectId: activeProject?.id,
        type: 'sequence_segment',
        model: shot.model,
        prompt: shot.prompt,
        aspectRatio: shot.aspectRatio,
        duration: Math.round(shot.duration),
        estimatedCredits: 18,
      });

      // Simulation completion for demo preview
      setTimeout(() => {
        setShots((prev) =>
          prev.map((s) =>
            s.id === shotId
              ? {
                  ...s,
                  status: 'completed',
                  outputVideoUrl:
                    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
                }
              : s
          )
        );
        showToast(`Shot #${shot.sceneNumber} rendered with frame continuity!`);
      }, 3500);
    } catch (err: any) {
      setShots((prev) =>
        prev.map((s) => (s.id === shotId ? { ...s, status: 'failed', error: err?.message } : s))
      );
      showToast(err?.message || 'Shot generation failed');
    }
  };

  const addShot = () => {
    const nextNum = shots.length + 1;
    const newShot: SceneShot = {
      id: `shot-${Date.now()}`,
      sceneNumber: nextNum,
      title: `Scene Beat #${nextNum}`,
      prompt: 'Describe camera movement, lighting continuity, and character action...',
      duration: 7.5,
      aspectRatio,
      model: 'veo-3.1-lite-generate-preview',
      status: 'idle',
    };
    setShots([...shots, newShot]);
    showToast(`Added Shot #${nextNum} to director timeline`);
  };

  const removeShot = (id: string) => {
    setShots(shots.filter((s) => s.id !== id));
    showToast('Shot removed');
  };

  const completedShots = shots.filter((s) => s.status === 'completed');

  return (
    <div className="flex-1 flex flex-col bg-[#090a0e] overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-emerald-400" />
            <input
              type="text"
              value={sequenceTitle}
              onChange={(e) => setSequenceTitle(e.target.value)}
              className="text-lg font-bold text-zinc-100 bg-transparent outline-none focus:border-b border-emerald-400 transition-colors"
            />
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Intelligent multi-segment orchestration up to ~30 seconds with frame-to-frame continuity passback.
          </p>
        </div>

        {/* Runtime Metrics & Add Shot CTA */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs font-mono text-zinc-200">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span className="tabular-nums">
              Runtime: {totalCalculatedDuration}s / {targetDuration}s
            </span>
          </div>

          <button
            onClick={addShot}
            className="px-4 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-98"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Shot Segment</span>
          </button>
        </div>
      </div>

      {/* Master Video Preview Player */}
      <div className="rounded-3xl bg-[#111319] border border-white/[0.08] p-5 sm:p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
              Master Sequence Monitor
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              ({completedShots.length}/{shots.length} shots ready)
            </span>
          </div>

          {completedShots.length > 0 && (
            <button
              onClick={() => showToast('Assembling and exporting full sequence...')}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-xs font-medium text-zinc-200 flex items-center gap-2 transition-colors cursor-pointer border border-white/[0.06]"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export Full Sequence</span>
            </button>
          )}
        </div>

        {/* Video Canvas */}
        <div className="aspect-video max-h-96 w-full rounded-2xl bg-black overflow-hidden relative border border-white/[0.08] flex items-center justify-center mx-auto shadow-inner">
          {shots[currentPlayIndex]?.outputVideoUrl ? (
            <video
              src={shots[currentPlayIndex].outputVideoUrl}
              controls
              autoPlay={isPlaying}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="text-center p-6 space-y-2">
              <Film className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400">
                Render shot #{shots[currentPlayIndex]?.sceneNumber || 1} to preview sequence
              </p>
            </div>
          )}

          {/* Current Shot Label Overlay */}
          <div className="absolute top-3 left-3 px-3 py-1 rounded-xl bg-black/80 backdrop-blur-md text-[11px] font-mono text-zinc-200 border border-white/10 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>
              Shot {currentPlayIndex + 1}: {shots[currentPlayIndex]?.title}
            </span>
          </div>
        </div>

        {/* Timeline Strip */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>DIRECTOR TIMELINE & CONTINUITY LINK</span>
            <span>{totalCalculatedDuration}s Multi-Shot Total</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {shots.map((shot, idx) => (
              <button
                key={shot.id}
                onClick={() => setCurrentPlayIndex(idx)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                  currentPlayIndex === idx
                    ? 'bg-zinc-800/80 border-emerald-500 text-zinc-100 ring-1 ring-emerald-500/20'
                    : 'bg-[#0e1015] border-white/[0.06] text-zinc-400 hover:border-white/[0.14]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="font-bold text-emerald-400">Shot {shot.sceneNumber}</span>
                  <span className="tabular-nums">{shot.duration}s</span>
                </div>
                <div className="text-xs font-semibold text-zinc-200 line-clamp-1 mt-1">
                  {shot.title}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5 capitalize">{shot.status}</div>

                {/* Progress bar */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1 ${
                    shot.status === 'completed'
                      ? 'bg-emerald-500'
                      : shot.status === 'generating'
                      ? 'bg-cyan-400 animate-pulse'
                      : 'bg-zinc-800'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Segment Level Cards & Regeneration Controls */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
          Segment Director Pipeline
        </h3>

        <div className="space-y-3">
          {shots.map((shot, idx) => (
            <div
              key={shot.id}
              className="p-4 rounded-2xl bg-[#111319] border border-white/[0.07] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:border-white/[0.14]"
            >
              {/* Left Info */}
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded-lg bg-zinc-900 border border-white/[0.08] text-emerald-400 font-mono text-[10px] font-bold">
                    Shot {shot.sceneNumber}
                  </span>
                  <span className="text-xs font-bold text-zinc-100">{shot.title}</span>
                  <span className="text-[11px] text-zinc-400 font-mono">({shot.duration}s)</span>

                  {idx > 0 && (
                    <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/60 px-2 py-0.5 rounded-lg border border-cyan-800/40 flex items-center gap-1">
                      <ArrowRight className="w-2.5 h-2.5" />
                      <span>Inherits last keyframe of Shot {idx}</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">{shot.prompt}</p>
              </div>

              {/* Actions & Status */}
              <div className="flex items-center gap-2.5 shrink-0">
                {shot.status === 'completed' ? (
                  <>
                    <button
                      onClick={() => handleGenerateShot(shot.id)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Regenerate this shot while maintaining sequence links"
                    >
                      <RefreshCw className="w-3 h-3 text-cyan-400" />
                      <span>Regenerate</span>
                    </button>
                    <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Ready</span>
                    </span>
                  </>
                ) : shot.status === 'generating' ? (
                  <span className="text-xs text-cyan-400 font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>Rendering...</span>
                  </span>
                ) : (
                  <button
                    onClick={() => handleGenerateShot(shot.id)}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Render Shot</span>
                  </button>
                )}

                <button
                  onClick={() => removeShot(shot.id)}
                  className="p-2 rounded-xl hover:bg-rose-950/40 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Remove shot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
