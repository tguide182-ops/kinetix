import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Layers,
  Film,
  Image as ImageIcon,
  Wand2,
  GitBranch,
  ArrowRightLeft,
  Grid3X3,
  Play,
  SlidersHorizontal,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PromptEditor } from './PromptEditor';
import { ReferenceAssetPicker, ReferenceItem } from './ReferenceAssetPicker';
import { ControlPanel } from './ControlPanel';
import { BatchResultsGrid } from './BatchResultsGrid';
import { JobType } from '../../types';

export const CreateWorkspace: React.FC = () => {
  const {
    creationMode,
    setCreationMode,
    models,
    user,
    activeProject,
    assets,
    jobs,
    prefillData,
    setPrefillData,
    submitGeneration,
    showToast,
    setActiveNav,
  } = useApp();

  const [prompt, setPrompt] = useState(
    'A cinematic African family dinner in a modern sunlit home, golden hour chiaroscuro, natural laughter, 35mm anamorphic'
  );
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-lite-image');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [resolution, setResolution] = useState('1K');
  const [numberOfOutputs, setNumberOfOutputs] = useState(4);
  const [duration, setDuration] = useState(6);
  const [seed, setSeed] = useState('');
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Consume prefill data
  useEffect(() => {
    if (prefillData) {
      if (prefillData.prompt) setPrompt(prefillData.prompt);
      if (prefillData.aspectRatio) setAspectRatio(prefillData.aspectRatio);
      if (prefillData.sourceAsset) {
        setReferences([
          {
            id: `prefill-${prefillData.sourceAsset.id}`,
            url: prefillData.sourceAsset.url,
            tag: prefillData.mode === 'image_to_video' ? 'first_frame' : 'character',
            name: prefillData.sourceAsset.prompt.slice(0, 24),
          },
        ]);
      }
      if (prefillData.referenceAssets) {
        setReferences(
          prefillData.referenceAssets.map((url, i) => ({
            id: `prefill-ref-${i}`,
            url,
            tag: 'character',
          }))
        );
      }
      setPrefillData(null);
    }
  }, [prefillData, setPrefillData]);

  // Adjust model defaults when switching mode
  useEffect(() => {
    if (creationMode.includes('video') || creationMode === 'sequence_segment') {
      if (!selectedModel.startsWith('veo')) {
        setSelectedModel('veo-3.1-lite-generate-preview');
      }
    } else {
      if (selectedModel.startsWith('veo')) {
        setSelectedModel('gemini-3.1-flash-lite-image');
      }
    }
  }, [creationMode]);

  // Calculate estimated credits
  const modelCap = models.find((m) => m.id === selectedModel);
  const isVideo = creationMode.includes('video') || creationMode === 'sequence_segment';
  const estimatedCost = isVideo
    ? Math.round((modelCap?.creditCost || 18) * (duration / 6))
    : (modelCap?.creditCost || 4) * numberOfOutputs;

  const creationModes: Array<{ id: JobType; label: string; icon: React.ReactNode }> = [
    { id: 'image', label: 'Image', icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { id: 'text_to_video', label: 'Text to Video', icon: <Film className="w-3.5 h-3.5" /> },
    { id: 'image_to_video', label: 'Image to Video', icon: <Play className="w-3.5 h-3.5" /> },
    { id: 'image_reference', label: 'With Reference', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'image_variations', label: 'Variations', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: 'video_extension', label: 'Video Extend', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'video_transition', label: 'Transition', icon: <ArrowRightLeft className="w-3.5 h-3.5" /> },
    { id: 'image_edit', label: 'Image Inpaint', icon: <Wand2 className="w-3.5 h-3.5" /> },
  ];

  const handleLaunchGeneration = async () => {
    if (!prompt.trim() && creationMode !== 'video_extension') {
      showToast('Please specify a creative prompt directive');
      return;
    }

    if (user && user.credits < estimatedCost) {
      showToast(`Insufficient credits (${user.credits} CR available, ${estimatedCost} CR needed)`);
      return;
    }

    setIsSubmitting(true);
    try {
      const firstFrame = references.find((r) => r.tag === 'first_frame')?.url;
      const lastFrame = references.find((r) => r.tag === 'last_frame')?.url;
      const refImages = references
        .filter((r) => r.tag !== 'first_frame' && r.tag !== 'last_frame')
        .map((r) => r.url);

      await submitGeneration({
        projectId: activeProject?.id,
        type: creationMode,
        model: selectedModel,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio,
        resolution,
        duration: isVideo ? duration : undefined,
        numberOfOutputs: isVideo ? 1 : numberOfOutputs,
        referenceAssets: refImages,
        firstFrame: firstFrame || (references[0]?.url && isVideo ? references[0].url : undefined),
        lastFrame,
        estimatedCredits: estimatedCost,
        parameters: {
          seed: seed ? parseInt(seed) : undefined,
        },
      });
    } catch (err: any) {
      showToast(err?.message || 'Generation failed to start');
    } finally {
      setIsSubmitting(false);
    }
  };

  const projectAssets = assets.filter((a) => !activeProject || a.projectId === activeProject.id);
  const projectActiveJobs = jobs.filter(
    (j) =>
      (!activeProject || j.projectId === activeProject.id) &&
      (j.status === 'queued' ||
        j.status === 'preparing' ||
        j.status === 'generating' ||
        j.status === 'processing')
  );

  return (
    <div className="flex-1 flex overflow-hidden bg-[#090a0e]">
      {/* Central Creative Canvas Viewport */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6">
        {/* Creation Modes Segmented Bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-[#101217] border border-white/[0.06] rounded-2xl overflow-x-auto no-scrollbar">
            {creationModes.map((item) => {
              const isActive = creationMode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCreationMode(item.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={isActive ? 'text-emerald-400' : 'text-zinc-500'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Panel Toggle */}
          <button
            onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
            className="lg:hidden p-2 rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-300"
            title="Toggle Engine Settings"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Master Creative Directive Box */}
        <div className="bg-[#101218] border border-white/[0.08] p-5 sm:p-6 rounded-3xl shadow-xl space-y-5">
          <PromptEditor
            prompt={prompt}
            setPrompt={setPrompt}
            negativePrompt={negativePrompt}
            setNegativePrompt={setNegativePrompt}
            showNegativePrompt={showNegativePrompt}
            setShowNegativePrompt={setShowNegativePrompt}
            disabled={isSubmitting}
          />

          {/* Reference Anchors */}
          <ReferenceAssetPicker
            references={references}
            setReferences={setReferences}
            maxReferences={isVideo ? 3 : 4}
            allowFirstLastFrame={
              creationMode === 'video_transition' || creationMode === 'image_to_video'
            }
          />

          {/* Action Launch Bar */}
          <div className="pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-white/[0.06]">
            <div className="text-xs text-zinc-400 font-mono">
              <span className="text-zinc-500">Pipeline: </span>
              <span className="text-emerald-400 font-bold uppercase">{creationMode}</span>
              <span className="text-zinc-600"> · </span>
              <span>
                {isVideo
                  ? `${duration}s sequence`
                  : `${numberOfOutputs} parallel render${numberOfOutputs > 1 ? 's' : ''}`}
              </span>
            </div>

            <button
              onClick={handleLaunchGeneration}
              disabled={isSubmitting || !prompt.trim()}
              className="w-full sm:w-auto px-7 py-3 rounded-2xl bg-white hover:bg-zinc-100 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold text-xs tracking-wider uppercase transition-all duration-150 flex items-center justify-center gap-2 shadow-lg shadow-white/5 active:scale-[0.98] cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
              <span>{isSubmitting ? 'Dispatching...' : `Generate (${estimatedCost} CR)`}</span>
            </button>
          </div>
        </div>

        {/* Studio Asset Output Gallery */}
        <BatchResultsGrid recentAssets={projectAssets} activeJobs={projectActiveJobs} />
      </div>

      {/* Right Control Panel (Desktop static, mobile toggleable) */}
      <div
        className={`${
          mobilePanelOpen ? 'block fixed inset-y-0 right-0 z-40' : 'hidden lg:block'
        }`}
      >
        <ControlPanel
          mode={creationMode}
          models={models}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          resolution={resolution}
          setResolution={setResolution}
          numberOfOutputs={numberOfOutputs}
          setNumberOfOutputs={setNumberOfOutputs}
          duration={duration}
          setDuration={setDuration}
          seed={seed}
          setSeed={setSeed}
          estimatedCost={estimatedCost}
          userCredits={user?.credits ?? 0}
          disabled={isSubmitting}
        />
      </div>
    </div>
  );
};
