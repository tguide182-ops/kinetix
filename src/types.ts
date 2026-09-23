export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'creator' | 'admin' | 'studio';
  tier: 'pro' | 'enterprise';
  credits: number;
  createdAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export type JobType =
  | 'image'
  | 'image_edit'
  | 'image_variations'
  | 'image_reference'
  | 'text_to_video'
  | 'image_to_video'
  | 'video_extension'
  | 'video_transition'
  | 'sequence_segment'
  | 'batch_matrix';

export type JobStatus =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GenerationJob {
  id: string;
  userId: string;
  projectId: string;
  type: JobType;
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  resolution: string;
  duration?: number;
  batchIndex: number;
  batchTotal: number;
  status: JobStatus;
  progress: number;
  referenceAssets?: string[];
  firstFrame?: string;
  lastFrame?: string;
  sourceAssetId?: string;
  parameters: Record<string, any>;
  estimatedCredits: number;
  outputAssetIds?: string[];
  error?: string;
  retryCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Asset {
  id: string;
  userId: string;
  projectId: string;
  type: 'image' | 'video' | 'reference';
  mimeType: string;
  url: string;
  thumbnailUrl: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution?: string;
  duration?: number;
  width?: number;
  height?: number;
  isFavorite: boolean;
  tags: string[];
  metadata: Record<string, any>;
  sourceJobId?: string;
  createdAt: string;
}

export interface FlowNode {
  id: string;
  type: 'prompt' | 'image' | 'video' | 'reference' | 'sequence' | 'extension';
  position: { x: number; y: number };
  data: {
    title: string;
    prompt?: string;
    assetId?: string;
    assetUrl?: string;
    status?: 'idle' | 'running' | 'completed' | 'error';
    settings?: Record<string, any>;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Flow {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: string;
  createdAt: string;
}

export interface SceneShot {
  id: string;
  sceneNumber: number;
  title: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  model: string;
  status: 'idle' | 'generating' | 'completed' | 'failed';
  referenceImage?: string;
  outputVideoUrl?: string;
  outputAssetId?: string;
  error?: string;
}

export interface SequenceProject {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  targetDuration: number;
  aspectRatio: string;
  shots: SceneShot[];
  finalVideoUrl?: string;
  updatedAt: string;
  createdAt: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  timestamp: string;
}

export interface ModelCapability {
  id: string;
  name: string;
  provider: 'google' | 'kinetix-orchestrator';
  type: 'image' | 'video';
  description: string;
  creditCost: number;
  creditUnit: string;
  aspectRatios: string[];
  resolutions: string[];
  maxDuration?: number;
  supportsReferences: boolean;
  maxReferences?: number;
  supportsExtension: boolean;
  supportsTransitions: boolean;
  isPaidOnly?: boolean;
}

export interface AdminMetrics {
  totalUsers: number;
  totalProjects: number;
  totalAssets: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  queuedJobs: number;
  totalCreditsBurned: number;
  providers: Array<{ name: string; status: string; uptime: string }>;
  recentErrors: Array<{ jobId: string; model: string; error: string; timestamp: string }>;
}
