import React, { useState } from 'react';
import {
  Grid3X3,
  Plus,
  Trash2,
  Sparkles,
  CheckSquare,
  Square,
  Sliders,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const BatchMatrixView: React.FC = () => {
  const { user, activeProject, submitGeneration, showToast, setActiveNav } = useApp();

  const [basePrompt, setBasePrompt] = useState(
    'A cinematic 35mm film still of {character} in {location}, lit by {lighting}'
  );

  const [variableA, setVariableA] = useState({
    name: 'character',
    values: ['a weary cyberpunk detective', 'an haute couture model', 'a space station engineer'],
  });

  const [variableB, setVariableB] = useState({
    name: 'location',
    values: ['rainy neon Shibuya', 'a sunlit minimalist villa', 'an orbital biosphere'],
  });

  const [variableC, setVariableC] = useState({
    name: 'lighting',
    values: ['dramatic anamorphic lens flare', 'soft golden hour chiaroscuro'],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate Cartesian product
  const combinations: string[] = [];
  variableA.values.forEach((va) => {
    variableB.values.forEach((vb) => {
      variableC.values.forEach((vc) => {
        const p = basePrompt
          .replace('{character}', va)
          .replace('{location}', vb)
          .replace('{lighting}', vc);
        combinations.push(p);
      });
    });
  });

  const [selectedIndices, setSelectedIndices] = useState<number[]>(
    combinations.map((_, i) => i)
  );

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleLaunchMatrix = async () => {
    if (selectedIndices.length === 0) {
      showToast('Select at least one combination');
      return;
    }

    const estimatedCredits = selectedIndices.length * 4;
    if (user && user.credits < estimatedCredits) {
      showToast(
        `Insufficient credits (${user.credits} CR available, ${estimatedCredits} CR needed)`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedPrompts = selectedIndices.map((i) => combinations[i]);
      for (const p of selectedPrompts) {
        await submitGeneration({
          projectId: activeProject?.id,
          type: 'image',
          model: 'gemini-3.1-flash-lite-image',
          prompt: p,
          aspectRatio: '16:9',
          numberOfOutputs: 1,
          estimatedCredits: 4,
        });
      }
      showToast(`Dispatched ${selectedPrompts.length} matrix generations!`);
      setActiveNav('create');
    } catch (err: any) {
      showToast(err?.message || 'Failed to dispatch matrix');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#090a0e] overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-zinc-100">Combinatorial Prompt Matrix</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Systematically test variations across characters, locations, aesthetics, and camera setups.
          </p>
        </div>

        <button
          onClick={handleLaunchMatrix}
          disabled={isSubmitting || selectedIndices.length === 0}
          className="px-6 py-2.5 rounded-2xl bg-white hover:bg-zinc-100 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-98"
        >
          <Sparkles className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
          <span>Launch Matrix ({selectedIndices.length * 4} CR)</span>
        </button>
      </div>

      {/* Base Template Prompt */}
      <div className="bg-[#111319] border border-white/[0.08] p-5 sm:p-6 rounded-3xl space-y-3 shadow-xl">
        <label className="text-xs font-bold uppercase font-mono tracking-wider text-zinc-300">
          Template Prompt with Variable Slots
        </label>
        <input
          type="text"
          value={basePrompt}
          onChange={(e) => setBasePrompt(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl bg-zinc-900 border border-white/[0.08] text-xs font-mono text-emerald-300 outline-none focus:border-zinc-700 transition-colors"
        />
        <p className="text-[11px] text-zinc-400">
          Use brackets like <code className="text-emerald-400 font-semibold">{'{character}'}</code>,{' '}
          <code className="text-emerald-400 font-semibold">{'{location}'}</code>, and{' '}
          <code className="text-emerald-400 font-semibold">{'{lighting}'}</code> to define replacement axes.
        </p>
      </div>

      {/* 3 Variable Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Variable A */}
        <div className="bg-[#111319] border border-white/[0.08] p-5 rounded-2xl space-y-3">
          <div className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
            Slot: {variableA.name}
          </div>
          <div className="space-y-2">
            {variableA.values.map((val, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={val}
                  onChange={(e) => {
                    const copy = [...variableA.values];
                    copy[idx] = e.target.value;
                    setVariableA({ ...variableA, values: copy });
                  }}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-zinc-200 outline-none"
                />
                <button
                  onClick={() =>
                    setVariableA({
                      ...variableA,
                      values: variableA.values.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setVariableA({
                ...variableA,
                values: [...variableA.values, 'new variation'],
              })
            }
            className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 cursor-pointer font-medium pt-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add Variation</span>
          </button>
        </div>

        {/* Variable B */}
        <div className="bg-[#111319] border border-white/[0.08] p-5 rounded-2xl space-y-3">
          <div className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
            Slot: {variableB.name}
          </div>
          <div className="space-y-2">
            {variableB.values.map((val, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={val}
                  onChange={(e) => {
                    const copy = [...variableB.values];
                    copy[idx] = e.target.value;
                    setVariableB({ ...variableB, values: copy });
                  }}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-zinc-200 outline-none"
                />
                <button
                  onClick={() =>
                    setVariableB({
                      ...variableB,
                      values: variableB.values.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setVariableB({
                ...variableB,
                values: [...variableB.values, 'new variation'],
              })
            }
            className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 cursor-pointer font-medium pt-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add Variation</span>
          </button>
        </div>

        {/* Variable C */}
        <div className="bg-[#111319] border border-white/[0.08] p-5 rounded-2xl space-y-3">
          <div className="text-xs font-bold text-zinc-200 uppercase font-mono tracking-wider">
            Slot: {variableC.name}
          </div>
          <div className="space-y-2">
            {variableC.values.map((val, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={val}
                  onChange={(e) => {
                    const copy = [...variableC.values];
                    copy[idx] = e.target.value;
                    setVariableC({ ...variableC, values: copy });
                  }}
                  className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-zinc-200 outline-none"
                />
                <button
                  onClick={() =>
                    setVariableC({
                      ...variableC,
                      values: variableC.values.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setVariableC({
                ...variableC,
                values: [...variableC.values, 'new variation'],
              })
            }
            className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 cursor-pointer font-medium pt-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add Variation</span>
          </button>
        </div>
      </div>

      {/* Generated Combinations Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold uppercase font-mono tracking-wider text-zinc-300">
            Resolved Prompt Matrix ({combinations.length} Variations)
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedIndices(combinations.map((_, i) => i))}
              className="text-zinc-400 hover:text-zinc-200 underline cursor-pointer font-medium"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedIndices([])}
              className="text-zinc-400 hover:text-zinc-200 underline cursor-pointer font-medium"
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {combinations.map((p, idx) => {
            const isSelected = selectedIndices.includes(idx);
            return (
              <div
                key={idx}
                onClick={() => toggleSelect(idx)}
                className={`p-3.5 rounded-2xl border text-xs flex items-start gap-3 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#12141a] border-emerald-500/50 text-zinc-100 shadow-sm'
                    : 'bg-[#0e1015] border-white/[0.05] text-zinc-400 opacity-60 hover:opacity-100'
                }`}
              >
                <div className="pt-0.5 text-emerald-400">
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="text-[10px] text-zinc-400 font-mono">
                    Variation #{idx + 1}
                  </div>
                  <div className="leading-relaxed text-zinc-200">{p}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
