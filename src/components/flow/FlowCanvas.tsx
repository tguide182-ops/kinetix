import React, { useState, useRef } from 'react';
import {
  Plus,
  Play,
  Save,
  Download,
  Trash2,
  Copy,
  Sparkles,
  Layers,
  Film,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Compass,
  Image as ImageIcon,
  Wand2,
  Share2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { FlowNode, FlowEdge } from '../../types';
import { api } from '../../services/api';

export const FlowCanvas: React.FC = () => {
  const { activeProject, submitGeneration, showToast, setActiveMediaAsset } = useApp();

  const [nodes, setNodes] = useState<FlowNode[]>([
    {
      id: 'node-char',
      type: 'reference',
      position: { x: 60, y: 140 },
      data: {
        title: 'Lead Subject Anchor',
        prompt: 'Detective Renzo, sharp jawline, obsidian leather trenchcoat, amber cybernetic eye',
        assetUrl:
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
        status: 'completed',
      },
    },
    {
      id: 'node-prompt',
      type: 'prompt',
      position: { x: 380, y: 140 },
      data: {
        title: 'Shibuya Atmosphere',
        prompt:
          'Walking slowly down rainy Shibuya alleyway, neon signs reflecting in puddles, 35mm anamorphic',
        status: 'idle',
      },
    },
    {
      id: 'node-image',
      type: 'image',
      position: { x: 700, y: 120 },
      data: {
        title: 'Anamorphic Still',
        prompt:
          'Detective Renzo walking slowly down rainy Shibuya alleyway, neon signs reflecting in puddles, 35mm anamorphic',
        assetUrl:
          'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80',
        status: 'completed',
      },
    },
    {
      id: 'node-video',
      type: 'video',
      position: { x: 1020, y: 120 },
      data: {
        title: 'Veo Camera Dolly',
        prompt:
          'Cinematic dolly shot following the detective as steam vents pulse in background, 720p',
        assetUrl:
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        status: 'completed',
      },
    },
    {
      id: 'node-extend',
      type: 'extension',
      position: { x: 1340, y: 140 },
      data: {
        title: 'Continuous Extension',
        prompt: 'Continues walking towards neon noodle bar as holographic advert flickers overhead',
        status: 'idle',
      },
    },
  ]);

  const [edges, setEdges] = useState<FlowEdge[]>([
    { id: 'edge-1', source: 'node-char', target: 'node-image', label: 'Reference' },
    { id: 'edge-2', source: 'node-prompt', target: 'node-image', label: 'Directive' },
    { id: 'edge-3', source: 'node-image', target: 'node-video', label: 'Start Frame' },
    { id: 'edge-4', source: 'node-video', target: 'node-extend', label: 'Sequence Link' },
  ]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === containerRef.current ||
      (e.target as HTMLElement).classList.contains('canvas-bg')
    ) {
      setIsPanning(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentMouse = {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
    setMousePos(currentMouse);

    if (isPanning) {
      setPan((prev) => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    } else if (draggedNodeId) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === draggedNodeId
            ? {
                ...n,
                position: {
                  x: n.position.x + e.movementX / zoom,
                  y: n.position.y + e.movementY / zoom,
                },
              }
            : n
        )
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
    setConnectingSourceId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.min(Math.max(prev * zoomFactor, 0.4), 2.2));
  };

  const addNode = (type: FlowNode['type']) => {
    const id = `node-${Date.now().toString(36)}`;
    const titles: Record<string, string> = {
      prompt: 'Prompt Directive Node',
      image: 'Image Synthesis Node',
      video: 'Motion Video Node',
      reference: 'Asset Anchor Node',
      sequence: 'Sequence Story Node',
      extension: 'Continuity Extension Node',
    };
    const newNode: FlowNode = {
      id,
      type,
      position: { x: (-pan.x + 320) / zoom, y: (-pan.y + 200) / zoom },
      data: {
        title: titles[type] || 'New Node',
        prompt: 'Enter prompt details for this generation step...',
        status: 'idle',
      },
    };
    setNodes([...nodes, newNode]);
    showToast(`Added ${type} node to Flow canvas`);
  };

  const deleteNode = (id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.source !== id && e.target !== id));
    showToast('Node removed from flow');
  };

  const duplicateNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const newId = `node-${Date.now().toString(36)}`;
    const cloned: FlowNode = {
      ...node,
      id: newId,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      data: { ...node.data, title: `${node.data.title} (Copy)` },
    };
    setNodes([...nodes, cloned]);
    showToast('Node duplicated');
  };

  const handleConnect = (targetId: string) => {
    if (connectingSourceId && connectingSourceId !== targetId) {
      const exists = edges.some((e) => e.source === connectingSourceId && e.target === targetId);
      if (!exists) {
        setEdges([
          ...edges,
          {
            id: `edge-${Date.now().toString(36)}`,
            source: connectingSourceId,
            target: targetId,
          },
        ]);
        showToast('Nodes connected in flow');
      }
    }
    setConnectingSourceId(null);
  };

  const handleGenerateNode = async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node || !node.data.prompt) return;

    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'running' } } : n))
    );

    try {
      const isVideoNode = node.type === 'video' || node.type === 'extension';
      await submitGeneration({
        projectId: activeProject?.id,
        type: isVideoNode ? 'text_to_video' : 'image',
        model: isVideoNode ? 'veo-3.1-lite-generate-preview' : 'gemini-3.1-flash-lite-image',
        prompt: node.data.prompt,
        aspectRatio: '16:9',
        resolution: '1K',
        duration: isVideoNode ? 6 : undefined,
        numberOfOutputs: 1,
      });

      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'completed' } } : n))
      );
      showToast(`Generation launched for "${node.data.title}"`);
    } catch (err: any) {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, status: 'error' } } : n))
      );
      showToast(err?.message || 'Node execution failed');
    }
  };

  const handleSaveFlow = async () => {
    try {
      await api.saveFlow({
        projectId: activeProject?.id || 'proj-cyber-noir',
        name: `${activeProject?.name || 'Studio'} Flow Pipeline`,
        nodes,
        edges,
      });
      showToast('Flow pipeline saved');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save flow');
    }
  };

  const handleExportFlow = () => {
    const flowData = JSON.stringify({ nodes, edges, project: activeProject?.name }, null, 2);
    const blob = new Blob([flowData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kinetix-flow-${Date.now()}.json`;
    a.click();
    showToast('Exported Flow graph JSON');
  };

  // Node Type Styling Configuration
  const getNodeColor = (type: FlowNode['type']) => {
    switch (type) {
      case 'prompt':
        return { accent: 'text-amber-400', border: 'border-amber-500/40', badge: 'bg-amber-500/20 text-amber-300' };
      case 'image':
        return { accent: 'text-emerald-400', border: 'border-emerald-500/40', badge: 'bg-emerald-500/20 text-emerald-300' };
      case 'video':
        return { accent: 'text-cyan-400', border: 'border-cyan-500/40', badge: 'bg-cyan-500/20 text-cyan-300' };
      case 'reference':
        return { accent: 'text-violet-400', border: 'border-violet-500/40', badge: 'bg-violet-500/20 text-violet-300' };
      case 'extension':
        return { accent: 'text-rose-400', border: 'border-rose-500/40', badge: 'bg-rose-500/20 text-rose-300' };
      default:
        return { accent: 'text-zinc-400', border: 'border-white/10', badge: 'bg-zinc-800 text-zinc-300' };
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#08090c] overflow-hidden relative select-none">
      {/* Top Floating Glass Toolbar */}
      <div className="h-16 px-6 border-b border-white/[0.06] bg-[#0c0d12]/85 backdrop-blur-xl flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Flow Creative Graph</h2>
          </div>
          <span className="text-zinc-600">·</span>
          <span className="text-xs text-zinc-400 font-mono">
            {nodes.length} nodes · {edges.length} connections
          </span>
        </div>

        {/* Node creation quick buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => addNode('prompt')}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/[0.08] text-xs text-zinc-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Prompt</span>
          </button>
          <button
            onClick={() => addNode('image')}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/[0.08] text-xs text-zinc-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Image</span>
          </button>
          <button
            onClick={() => addNode('video')}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-855 border border-white/[0.08] text-xs text-zinc-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>Video</span>
          </button>
          <button
            onClick={() => addNode('reference')}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-white/[0.08] text-xs text-zinc-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-violet-400" />
            <span>Reference</span>
          </button>

          <div className="h-4 w-px bg-white/[0.1] mx-1" />

          <button
            onClick={handleSaveFlow}
            className="px-4 py-1.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Flow</span>
          </button>

          <button
            onClick={handleExportFlow}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            title="Export JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Infinite Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="flex-1 w-full h-full relative overflow-hidden canvas-bg cursor-grab active:cursor-grabbing bg-[#08090c]"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)`,
          backgroundSize: `${28 * zoom}px ${28 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Layer for Pan & Zoom */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* SVG Connecting Edges */}
          <svg className="absolute inset-0 w-[6000px] h-[6000px] overflow-visible pointer-events-none">
            {edges.map((edge) => {
              const sourceNode = nodes.find((n) => n.id === edge.source);
              const targetNode = nodes.find((n) => n.id === edge.target);
              if (!sourceNode || !targetNode) return null;

              const x1 = sourceNode.position.x + 260;
              const y1 = sourceNode.position.y + 120;
              const x2 = targetNode.position.x;
              const y2 = targetNode.position.y + 120;

              const dx = Math.abs(x2 - x1) * 0.5;
              const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

              return (
                <g key={edge.id}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke="rgba(16, 185, 129, 0.45)"
                    strokeWidth="3"
                    strokeDasharray="6 3"
                  />
                  <circle cx={x1} cy={y1} r="5" fill="#10b981" />
                  <circle cx={x2} cy={y2} r="5" fill="#38bdf8" />
                </g>
              );
            })}

            {connectingSourceId && (
              <line
                x1={nodes.find((n) => n.id === connectingSourceId)?.position.x! + 260}
                y1={nodes.find((n) => n.id === connectingSourceId)?.position.y! + 120}
                x2={mousePos.x}
                y2={mousePos.y}
                stroke="#10b981"
                strokeWidth="2.5"
                strokeDasharray="4 4"
              />
            )}
          </svg>

          {/* Node Cards */}
          {nodes.map((node) => {
            const isVideo = node.type === 'video' || node.type === 'extension';
            const colors = getNodeColor(node.type);

            return (
              <div
                key={node.id}
                style={{
                  transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                }}
                className={`absolute w-64 rounded-2xl bg-[#111319] border ${colors.border} shadow-2xl pointer-events-auto overflow-hidden group select-none hover:shadow-emerald-500/10 transition-all`}
              >
                {/* Node Header */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggedNodeId(node.id);
                  }}
                  className="px-3.5 py-2.5 bg-[#0e1015] border-b border-white/[0.06] flex items-center justify-between cursor-move"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${colors.accent.replace('text-', 'bg-')}`} />
                    <span className="text-xs font-bold text-zinc-100 truncate">
                      {node.data.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => duplicateNode(node.id)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteNode(node.id)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Node Body */}
                <div className="p-3.5 space-y-3">
                  {/* Media Asset Preview */}
                  {node.data.assetUrl && (
                    <div className="aspect-video w-full rounded-xl bg-zinc-950 overflow-hidden relative border border-white/[0.08] group/media">
                      <img
                        src={node.data.assetUrl}
                        alt=""
                        className="w-full h-full object-cover group-hover/media:scale-105 transition-transform"
                      />
                      {isVideo && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white fill-current" />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prompt Text / Input */}
                  <textarea
                    rows={2}
                    value={node.data.prompt || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === node.id ? { ...n, data: { ...n.data, prompt: val } } : n
                        )
                      );
                    }}
                    placeholder="Enter prompt directive..."
                    className="w-full px-2.5 py-2 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-zinc-200 outline-none resize-none leading-relaxed focus:border-zinc-700"
                  />

                  {/* Actions & Status */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                    <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-md font-semibold ${colors.badge}`}>
                      {node.type}
                    </span>
                    <button
                      onClick={() => handleGenerateNode(node.id)}
                      disabled={node.data.status === 'running'}
                      className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{node.data.status === 'running' ? 'Rendering...' : 'Execute'}</span>
                    </button>
                  </div>
                </div>

                {/* Input Handle */}
                <div
                  onClick={() => handleConnect(node.id)}
                  className="absolute -left-1.5 top-[110px] w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-emerald-400 hover:scale-125 transition-transform cursor-crosshair shadow-lg"
                  title="Connect input here"
                />

                {/* Output Handle */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setConnectingSourceId(node.id);
                  }}
                  className="absolute -right-1.5 top-[110px] w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-zinc-950 hover:scale-125 transition-transform cursor-crosshair shadow-lg"
                  title="Drag connection to another node"
                />
              </div>
            );
          })}
        </div>

        {/* Floating Zoom & Canvas Controls */}
        <div className="absolute bottom-6 right-6 flex items-center gap-2 p-1.5 bg-[#12141a]/90 border border-white/[0.1] rounded-2xl shadow-2xl backdrop-blur-xl z-20">
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
            className="p-2 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 cursor-pointer"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-zinc-300 font-semibold px-1">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.15, 2.2))}
            className="p-2 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 cursor-pointer"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="p-2 rounded-xl hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-200 cursor-pointer"
            title="Reset viewport"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
