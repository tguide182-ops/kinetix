import React, { useState } from 'react';
import {
  Search,
  Grid,
  List,
  Image as ImageIcon,
  Film,
  Heart,
  Download,
  Trash2,
  FolderOpen,
  Play,
  Layers,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Asset } from '../../types';

export const MediaLibrary: React.FC<{ favoritesOnly?: boolean }> = ({
  favoritesOnly = false,
}) => {
  const {
    assets,
    activeProject,
    setActiveMediaAsset,
    toggleFavorite,
    deleteAsset,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'image' | 'video' | 'reference'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  const filteredAssets = assets.filter((a) => {
    if (favoritesOnly && !a.isFavorite) return false;
    if (activeTab !== 'all' && a.type !== activeTab) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPrompt = a.prompt.toLowerCase().includes(q);
      const matchTags = a.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchPrompt && !matchTags) return false;
    }
    return true;
  });

  const toggleSelectAsset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkDownload = () => {
    selectedAssetIds.forEach((id) => {
      const asset = assets.find((a) => a.id === id);
      if (asset) {
        const a = document.createElement('a');
        a.href = asset.url;
        a.download = `kinetix-${asset.type}-${asset.id}.${asset.type === 'video' ? 'mp4' : 'png'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
    showToast(`Downloading ${selectedAssetIds.length} assets`);
    setSelectedAssetIds([]);
  };

  const handleBulkDelete = () => {
    selectedAssetIds.forEach((id) => deleteAsset(id));
    setSelectedAssetIds([]);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#090a0e] overflow-hidden p-4 sm:p-6 md:p-8 space-y-6">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            {favoritesOnly ? (
              <Heart className="w-4 h-4 text-rose-400 fill-current" />
            ) : (
              <ImageIcon className="w-4 h-4 text-emerald-400" />
            )}
            <span>{favoritesOnly ? 'Starred Favorites' : 'Studio Asset Library'}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {filteredAssets.length} rendered assets in{' '}
            {activeProject ? activeProject.name : 'All Projects'}
          </p>
        </div>

        {/* Filter Controls & Search */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompts & tags..."
              className="pl-9 pr-3.5 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-700 w-48 sm:w-60 transition-colors"
            />
          </div>

          {/* Type Tabs */}
          {!favoritesOnly && (
            <div className="flex p-1 bg-zinc-900 border border-white/[0.08] rounded-xl">
              {[
                { id: 'all', label: 'All' },
                { id: 'image', label: 'Images' },
                { id: 'video', label: 'Videos' },
                { id: 'reference', label: 'Anchors' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex p-1 bg-zinc-900 border border-white/[0.08] rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedAssetIds.length > 0 && (
        <div className="p-3 bg-[#111319] border border-white/[0.1] rounded-2xl flex items-center justify-between animate-in fade-in duration-150 shadow-xl">
          <span className="text-xs font-mono text-zinc-300">
            {selectedAssetIds.length} assets selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDownload}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Selected</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3.5 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-950 text-xs text-rose-300 border border-rose-900/60 flex items-center gap-1.5 cursor-pointer font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
            <button
              onClick={() => setSelectedAssetIds([])}
              className="text-xs text-zinc-400 hover:text-zinc-200 underline ml-2 cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Asset Display */}
      {filteredAssets.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-zinc-500">
            <ImageIcon className="w-7 h-7 text-zinc-400" />
          </div>
          <h4 className="text-sm font-semibold text-zinc-200">No Assets Found</h4>
          <p className="text-xs text-zinc-400 max-w-sm">
            {searchQuery
              ? 'Try changing your search terms or filters.'
              : 'Render new assets in the Studio to view them here.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-1">
          {filteredAssets.map((asset) => {
            const isSelected = selectedAssetIds.includes(asset.id);
            const isVid = asset.type === 'video';
            return (
              <div
                key={asset.id}
                onClick={() => setActiveMediaAsset(asset)}
                className={`group relative rounded-2xl bg-[#111319] border overflow-hidden flex flex-col justify-between transition-all duration-200 cursor-pointer shadow-md hover:shadow-2xl ${
                  isSelected
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'border-white/[0.07] hover:border-white/[0.18]'
                }`}
              >
                {/* Media Container */}
                <div className="aspect-square w-full bg-zinc-900 relative overflow-hidden">
                  <img
                    src={asset.thumbnailUrl || asset.url}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />

                  {/* Multi-select checkbox */}
                  <div
                    onClick={(e) => toggleSelectAsset(asset.id, e)}
                    className={`absolute top-2.5 left-2.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500 border-emerald-400 text-zinc-950 font-bold'
                        : 'bg-black/60 border-white/30 opacity-0 group-hover:opacity-100 hover:border-white'
                    }`}
                  >
                    {isSelected && <span className="text-xs leading-none">✓</span>}
                  </div>

                  {/* Video duration badge */}
                  {isVid && (
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-[10px] font-mono text-zinc-200 flex items-center gap-1 border border-white/10">
                      <Play className="w-2.5 h-2.5 fill-current text-cyan-400" />
                      <span>{asset.duration || 6}s</span>
                    </div>
                  )}

                  {/* Aspect ratio */}
                  <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[9px] font-mono text-zinc-300 border border-white/10">
                    {asset.aspectRatio}
                  </div>

                  {/* Favorite button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(asset.id);
                    }}
                    className={`absolute bottom-2.5 right-2.5 p-1.5 rounded-xl backdrop-blur-md transition-colors cursor-pointer ${
                      asset.isFavorite
                        ? 'bg-rose-500/90 text-white'
                        : 'bg-black/60 text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${asset.isFavorite ? 'fill-current' : ''}`}
                    />
                  </button>
                </div>

                {/* Info Footer */}
                <div className="p-3 bg-[#0f1117] border-t border-white/[0.06] space-y-1">
                  <p className="text-xs text-zinc-200 line-clamp-1 font-medium">{asset.prompt}</p>
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                    <span>{asset.model.split('-')[0]}</span>
                    <span>
                      {new Date(asset.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06] border border-white/[0.06] rounded-2xl bg-[#0e1015]">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              onClick={() => setActiveMediaAsset(asset)}
              className="p-3.5 flex items-center justify-between hover:bg-white/[0.03] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl bg-zinc-900 overflow-hidden relative shrink-0 border border-white/[0.08]">
                  <img
                    src={asset.thumbnailUrl || asset.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {asset.type === 'video' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-current" />
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-100 line-clamp-1 max-w-xl">
                    {asset.prompt}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 mt-1">
                    <span className="uppercase font-bold text-emerald-400">{asset.type}</span>
                    <span>·</span>
                    <span>{asset.model}</span>
                    <span>·</span>
                    <span>{asset.aspectRatio}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(asset.id);
                  }}
                  className={`p-2 rounded-xl hover:bg-zinc-800 ${
                    asset.isFavorite ? 'text-rose-400' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 ${asset.isFavorite ? 'fill-current' : ''}`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
