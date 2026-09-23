import React, { useState } from 'react';
import {
  Sparkles,
  Wand2,
  Trash2,
  Bookmark,
  History,
  ChevronDown,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';

interface PromptEditorProps {
  prompt: string;
  setPrompt: (p: string) => void;
  negativePrompt: string;
  setNegativePrompt: (np: string) => void;
  showNegativePrompt: boolean;
  setShowNegativePrompt: (show: boolean) => void;
  disabled?: boolean;
}

export const PromptEditor: React.FC<PromptEditorProps> = ({
  prompt,
  setPrompt,
  negativePrompt,
  setNegativePrompt,
  showNegativePrompt,
  setShowNegativePrompt,
  disabled,
}) => {
  const { showToast } = useApp();
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [rewriteModeOpen, setRewriteModeOpen] = useState(false);
  const [savedPromptsOpen, setSavedPromptsOpen] = useState(false);

  const styleSuggestions = [
    { label: '35mm Anamorphic', suffix: ', 35mm anamorphic lens, Panavision bokeh, cinematic color grading' },
    { label: 'Studio Editorial', suffix: ', high-fashion editorial, directional softbox rim lighting, Vogue aesthetic' },
    { label: 'Hyper-Realistic', suffix: ', photorealistic 8k, raw texture, authentic natural light, shot on Leica M11' },
    { label: 'Atmospheric Noir', suffix: ', deep chiaroscuro shadows, neon reflections in rain, moody volumetric fog' },
    { label: 'Painterly Anime', suffix: ', Makoto Shinkai aesthetic, luminous clouds, vivid emotive color palette' },
  ];

  const handleEnhance = async (mode?: string) => {
    if (!prompt.trim() || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const res = await api.enhancePrompt(prompt.trim(), mode);
      setPrompt(res.enhancedPrompt);
      showToast(mode ? `Rewritten with ${mode} direction` : 'Prompt enhanced with cinematic polish');
    } catch (err: any) {
      showToast(err?.message || 'Failed to enhance prompt');
    } finally {
      setIsEnhancing(false);
      setRewriteModeOpen(false);
    }
  };

  const handleAppendStyle = (suffix: string) => {
    if (prompt.includes(suffix.trim())) return;
    setPrompt(prompt ? `${prompt.trim()}${suffix}` : suffix.replace(/^, /, ''));
    showToast('Aesthetic style modifier appended');
  };

  return (
    <div className="space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold tracking-wider text-zinc-200 uppercase font-mono">
            Creative Directive
          </label>
          <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
            {prompt.length} chars
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Style Presets Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRewriteModeOpen(!rewriteModeOpen)}
              disabled={disabled || !prompt.trim() || isEnhancing}
              className="px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-white/[0.08] hover:border-white/[0.16] text-[11px] text-zinc-300 font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Wand2 className="w-3 h-3 text-emerald-400" />
              <span>Rewrite Style</span>
              <ChevronDown className="w-3 h-3 text-zinc-400" />
            </button>

            {rewriteModeOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-[#12141a] border border-white/[0.1] rounded-xl shadow-2xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                {[
                  { id: 'cinematic', label: 'Cinematic Film Still' },
                  { id: 'realistic', label: 'Hyper-Realistic Photo' },
                  { id: 'product', label: 'Product Commercial' },
                  { id: 'social', label: 'Vibrant Dynamic Scene' },
                  { id: 'anime', label: 'Painterly & Anime' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => handleEnhance(mode.id)}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AI Enhance Prompt Button */}
          <button
            type="button"
            onClick={() => handleEnhance()}
            disabled={disabled || !prompt.trim() || isEnhancing}
            className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer shadow-xs active:scale-98"
          >
            <Sparkles className={`w-3 h-3 ${isEnhancing ? 'animate-spin' : ''}`} />
            <span>{isEnhancing ? 'Polishing...' : 'Enhance Directive'}</span>
          </button>

          {/* Clear Button */}
          {prompt.trim() && (
            <button
              type="button"
              onClick={() => setPrompt('')}
              className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Clear input"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Prompt Textarea Canvas */}
      <div className="relative rounded-2xl bg-[#0e1015] border border-white/[0.08] focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all shadow-inner overflow-hidden">
        <textarea
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe subjects, camera focal length, lighting composition, wardrobe, action, and cinematic color grade..."
          className="w-full p-4 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none resize-none leading-relaxed"
          disabled={disabled}
        />

        {/* Bottom Interactive Bar inside Textarea */}
        <div className="px-4 py-2 bg-[#0c0d12]/90 border-t border-white/[0.05] flex items-center justify-between">
          {/* Quick Style Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] uppercase font-mono text-zinc-400 shrink-0 mr-1 font-semibold">
              Add Modifier:
            </span>
            {styleSuggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAppendStyle(s.suffix)}
                className="px-2 py-0.5 rounded-md bg-zinc-900/90 hover:bg-zinc-800 border border-white/[0.06] hover:border-emerald-500/30 text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap cursor-pointer shrink-0"
              >
                + {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowNegativePrompt(!showNegativePrompt)}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors shrink-0 ml-2 font-medium cursor-pointer"
          >
            {showNegativePrompt ? 'Hide Negative' : '+ Negative Prompt'}
          </button>
        </div>
      </div>

      {/* Negative Prompt Field */}
      {showNegativePrompt && (
        <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold tracking-wider text-zinc-400 uppercase font-mono">
              Negative Elements to Suppress
            </label>
            <button
              onClick={() => setShowNegativePrompt(false)}
              className="text-zinc-400 hover:text-zinc-200 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="e.g. blurry, text, watermark, oversaturated, deformed facial anatomy, digital grain"
            className="w-full px-3.5 py-2 rounded-xl bg-[#0e1015] border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-700 transition-colors"
          />
        </div>
      )}
    </div>
  );
};
