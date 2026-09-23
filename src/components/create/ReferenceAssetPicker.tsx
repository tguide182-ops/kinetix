import React, { useRef, useState } from 'react';
import {
  Upload,
  X,
  Image as ImageIcon,
  FolderOpen,
  MoveLeft,
  MoveRight,
  UserCheck,
  Palette,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ReferenceItem {
  id: string;
  url: string;
  tag: 'character' | 'product' | 'location' | 'style' | 'first_frame' | 'last_frame';
  name?: string;
}

interface ReferenceAssetPickerProps {
  references: ReferenceItem[];
  setReferences: (refs: ReferenceItem[]) => void;
  maxReferences?: number;
  allowFirstLastFrame?: boolean;
}

export const ReferenceAssetPicker: React.FC<ReferenceAssetPickerProps> = ({
  references,
  setReferences,
  maxReferences = 4,
  allowFirstLastFrame = false,
}) => {
  const { assets } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [libraryModalOpen, setLibraryModalOpen] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (references.length >= maxReferences) return;
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const url = loadEvent.target?.result as string;
        setReferences([
          ...references,
          {
            id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
            url,
            tag: allowFirstLastFrame && references.length === 0 ? 'first_frame' : 'character',
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeReference = (id: string) => {
    setReferences(references.filter((r) => r.id !== id));
  };

  const moveReference = (index: number, direction: 'left' | 'right') => {
    const newIdx = direction === 'left' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= references.length) return;
    const copy = [...references];
    const item = copy.splice(index, 1)[0];
    copy.splice(newIdx, 0, item);
    setReferences(copy);
  };

  const updateTag = (id: string, tag: ReferenceItem['tag']) => {
    setReferences(references.map((r) => (r.id === id ? { ...r, tag } : r)));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold tracking-wider text-zinc-300 uppercase font-mono flex items-center gap-1.5">
          <span>Visual Reference Anchors</span>
          <span className="text-zinc-500 font-normal">
            ({references.length}/{maxReferences})
          </span>
        </label>
        <button
          type="button"
          onClick={() => setLibraryModalOpen(true)}
          disabled={references.length >= maxReferences}
          className="text-[11px] text-zinc-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer font-medium"
        >
          <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
          <span>From Library</span>
        </button>
      </div>

      {/* Grid of uploaded/selected references */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {references.map((ref, idx) => (
          <div
            key={ref.id}
            className="group relative rounded-2xl bg-[#111319] border border-white/[0.08] p-2 flex flex-col gap-2 overflow-hidden shadow-sm"
          >
            <div className="aspect-square w-full rounded-xl bg-zinc-900 overflow-hidden relative">
              <img src={ref.url} alt="" className="w-full h-full object-cover" />
              {/* Overlay controls */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 backdrop-blur-xs">
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => moveReference(idx, 'left')}
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                    title="Move left"
                  >
                    <MoveLeft className="w-3 h-3" />
                  </button>
                )}
                {idx < references.length - 1 && (
                  <button
                    type="button"
                    onClick={() => moveReference(idx, 'right')}
                    className="p-1.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 cursor-pointer"
                    title="Move right"
                  >
                    <MoveRight className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeReference(ref.id)}
                  className="p-1.5 rounded-lg bg-rose-950/80 text-rose-300 hover:bg-rose-900 cursor-pointer"
                  title="Remove reference"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Tag Selector */}
            <select
              value={ref.tag}
              onChange={(e) => updateTag(ref.id, e.target.value as any)}
              className="text-[10px] bg-zinc-900 text-zinc-200 border border-white/[0.08] rounded-lg px-2 py-1 outline-none cursor-pointer font-medium"
            >
              <option value="character">Character Consistency</option>
              <option value="product">Object / Prop</option>
              <option value="style">Lighting & Style</option>
              <option value="location">Scene / Environment</option>
              {allowFirstLastFrame && <option value="first_frame">Start Keyframe</option>}
              {allowFirstLastFrame && <option value="last_frame">End Keyframe</option>}
            </select>
          </div>
        ))}

        {/* Upload Slot */}
        {references.length < maxReferences && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-2xl border border-dashed border-white/[0.12] hover:border-emerald-500/50 bg-[#111319]/40 hover:bg-[#111319] flex flex-col items-center justify-center gap-2 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer p-4 group"
          >
            <div className="w-8 h-8 rounded-xl bg-zinc-900/80 border border-white/[0.06] flex items-center justify-center group-hover:scale-105 transition-transform">
              <Upload className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xs font-semibold text-center leading-tight">
              Add Reference
            </span>
            <span className="text-[10px] text-zinc-500">Drop PNG or JPEG</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Select from Library Modal */}
      {libraryModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-[#12141a] border border-white/[0.1] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-zinc-100">Select Reference from Library</h4>
                <p className="text-xs text-zinc-400">Reuse previously rendered assets</p>
              </div>
              <button
                onClick={() => setLibraryModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2.5 max-h-72 overflow-y-auto p-1">
              {assets
                .filter((a) => a.type === 'image' || a.type === 'reference')
                .map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      if (references.length < maxReferences) {
                        setReferences([
                          ...references,
                          {
                            id: `ref-${Date.now()}-${a.id}`,
                            url: a.url,
                            tag: 'character',
                            name: a.prompt.slice(0, 20),
                          },
                        ]);
                      }
                      setLibraryModalOpen(false);
                    }}
                    className="aspect-square rounded-xl bg-zinc-900 border border-white/[0.08] hover:border-emerald-500 overflow-hidden relative group cursor-pointer"
                  >
                    <img
                      src={a.thumbnailUrl || a.url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-end p-1 transition-opacity">
                      <span className="text-[9px] text-zinc-200 truncate font-mono">
                        {a.tags[0] || 'asset'}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
