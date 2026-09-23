import fs from 'fs';
import path from 'path';
import { User, Project, Asset, GenerationJob, Flow, SequenceProject, CreditTransaction } from './types.js';

interface DatabaseSchema {
  users: Record<string, User>;
  projects: Record<string, Project>;
  assets: Record<string, Asset>;
  jobs: Record<string, GenerationJob>;
  flows: Record<string, Flow>;
  sequences: Record<string, SequenceProject>;
  transactions: CreditTransaction[];
}

const DB_FILE = path.resolve('data/kinetix_db.json');

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadInitialData();
  }

  private loadInitialData(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Failed to read db file, creating default state');
    }

    const defaultUser: User = {
      id: 'user-default',
      name: 'Kai Vance',
      email: 'tguide182@gmail.com',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      role: 'studio',
      tier: 'pro',
      credits: 750,
      createdAt: new Date().toISOString(),
    };

    const secondaryUser: User = {
      id: 'user-guest',
      name: 'Elena Rostova',
      email: 'elena@kinetix.studio',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      role: 'creator',
      tier: 'enterprise',
      credits: 1200,
      createdAt: new Date().toISOString(),
    };

    const defaultProject: Project = {
      id: 'proj-cyber-noir',
      userId: 'user-default',
      name: 'Neon Solitude (Feature Short)',
      description: 'Atmospheric cyberpunk neo-noir narrative short filmed in Shibuya rain.',
      assetCount: 4,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const secondaryProject: Project = {
      id: 'proj-fashion',
      userId: 'user-default',
      name: 'Autumn Avant-Garde',
      description: 'High-contrast luxury editorial lookbook with dynamic studio backlighting.',
      assetCount: 2,
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Pre-seed some initial high-quality showcase assets
    const initialAssets: Record<string, Asset> = {
      'asset-showcase-1': {
        id: 'asset-showcase-1',
        userId: 'user-default',
        projectId: 'proj-cyber-noir',
        type: 'image',
        mimeType: 'image/jpeg',
        url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&auto=format&fit=crop&q=80',
        prompt: 'A lone detective in a wet obsidian trenchcoat standing under holographic kanji signs in rainy cyberpunk Tokyo, 35mm anamorphic, neon rim light, Kodak Vision3 tone.',
        model: 'gemini-3.1-flash-image',
        aspectRatio: '16:9',
        resolution: '2K',
        width: 1920,
        height: 1080,
        isFavorite: true,
        tags: ['cyberpunk', 'neon', 'cinematic', 'noir'],
        metadata: { seed: 84920, quality: 'master' },
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
      'asset-showcase-2': {
        id: 'asset-showcase-2',
        userId: 'user-default',
        projectId: 'proj-cyber-noir',
        type: 'video',
        mimeType: 'video/mp4',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnailUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&auto=format&fit=crop&q=80',
        prompt: 'Slow dolly zoom into neon arcade reflection puddle as a hover-vehicle passes overhead, cinematic steam vents, motion blur.',
        model: 'veo-3.1-generate-preview',
        aspectRatio: '16:9',
        resolution: '1080p',
        duration: 8,
        width: 1920,
        height: 1080,
        isFavorite: true,
        tags: ['action', 'dolly-zoom', 'rain', 'puddle'],
        metadata: { motionStrength: 8, camera: 'dolly-in' },
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      'asset-showcase-3': {
        id: 'asset-showcase-3',
        userId: 'user-default',
        projectId: 'proj-fashion',
        type: 'image',
        mimeType: 'image/jpeg',
        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200&auto=format&fit=crop&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
        prompt: 'Avant-garde sculptural silk cape with metallic embroidery, high key directional spotlight, Vogue editorial cover composition, crisp skin micro-texture.',
        model: 'gemini-3.1-flash-image',
        aspectRatio: '3:4',
        resolution: '1K',
        width: 768,
        height: 1024,
        isFavorite: false,
        tags: ['fashion', 'portrait', 'editorial', 'studio'],
        metadata: { seed: 12903 },
        createdAt: new Date(Date.now() - 14400000).toISOString(),
      },
      'asset-showcase-4': {
        id: 'asset-showcase-4',
        userId: 'user-default',
        projectId: 'proj-cyber-noir',
        type: 'reference',
        mimeType: 'image/jpeg',
        url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
        thumbnailUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
        prompt: 'Lead Character Concept: Detective Renzo, sharp jawline, cybernetic right eyebrow scar, intense amber eyes.',
        model: 'gemini-3.1-flash-lite-image',
        aspectRatio: '1:1',
        width: 800,
        height: 800,
        isFavorite: true,
        tags: ['character', 'reference', 'lead-actor'],
        metadata: { characterName: 'Renzo' },
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    };

    return {
      users: {
        'user-default': defaultUser,
        'user-guest': secondaryUser,
      },
      projects: {
        'proj-cyber-noir': defaultProject,
        'proj-fashion': secondaryProject,
      },
      assets: initialAssets,
      jobs: {},
      flows: {},
      sequences: {},
      transactions: [
        {
          id: 'tx-init-1',
          userId: 'user-default',
          amount: 800,
          balanceAfter: 800,
          reason: 'Initial Studio Creator Welcome Bonus',
          timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: 'tx-init-2',
          userId: 'user-default',
          amount: -50,
          balanceAfter: 750,
          reason: 'Showcase Studio Generations',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    };
  }

  private save() {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save db state:', err);
    }
  }

  // Users
  getUser(id: string): User | undefined {
    return this.data.users[id];
  }

  getAllUsers(): User[] {
    return Object.values(this.data.users);
  }

  deductCredits(userId: string, amount: number, reason: string): boolean {
    const user = this.data.users[userId];
    if (!user || user.credits < amount) {
      return false;
    }
    user.credits -= amount;
    this.data.transactions.unshift({
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId,
      amount: -amount,
      balanceAfter: user.credits,
      reason,
      timestamp: new Date().toISOString(),
    });
    this.save();
    return true;
  }

  addCredits(userId: string, amount: number, reason: string): void {
    const user = this.data.users[userId];
    if (!user) return;
    user.credits += amount;
    this.data.transactions.unshift({
      id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId,
      amount,
      balanceAfter: user.credits,
      reason,
      timestamp: new Date().toISOString(),
    });
    this.save();
  }

  getCreditHistory(userId: string): CreditTransaction[] {
    return this.data.transactions.filter((tx) => tx.userId === userId).slice(0, 50);
  }

  // Projects
  getProjects(userId: string): Project[] {
    return Object.values(this.data.projects).filter((p) => p.userId === userId);
  }

  createProject(userId: string, data: { name: string; description?: string }): Project {
    const id = `proj-${Date.now().toString(36)}`;
    const project: Project = {
      id,
      userId,
      name: data.name,
      description: data.description,
      assetCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.projects[id] = project;
    this.save();
    return project;
  }

  deleteProject(userId: string, projectId: string): boolean {
    const project = this.data.projects[projectId];
    if (!project || project.userId !== userId) {
      return false;
    }
    delete this.data.projects[projectId];
    this.save();
    return true;
  }

  // Jobs
  createJob(userId: string, data: Omit<GenerationJob, 'id' | 'userId' | 'status' | 'progress' | 'retryCount' | 'createdAt'>): GenerationJob {
    const id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const job: GenerationJob = {
      ...data,
      id,
      userId,
      status: 'queued',
      progress: 0,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.data.jobs[id] = job;
    this.save();
    return job;
  }

  getJob(userId: string, jobId: string): GenerationJob | undefined {
    const job = this.data.jobs[jobId];
    if (!job || job.userId !== userId) return undefined;
    return job;
  }

  getJobById(jobId: string): GenerationJob | undefined {
    return this.data.jobs[jobId];
  }

  getJobs(userId: string, projectId?: string): GenerationJob[] {
    return Object.values(this.data.jobs)
      .filter((j) => j.userId === userId && (!projectId || j.projectId === projectId))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  updateJob(jobId: string, updates: Partial<GenerationJob>): GenerationJob | undefined {
    const job = this.data.jobs[jobId];
    if (!job) return undefined;
    Object.assign(job, updates);
    this.save();
    return job;
  }

  // Assets
  createAsset(asset: Asset): Asset {
    this.data.assets[asset.id] = asset;
    if (this.data.projects[asset.projectId]) {
      this.data.projects[asset.projectId].assetCount = Object.values(this.data.assets).filter((a) => a.projectId === asset.projectId).length;
    }
    this.save();
    return asset;
  }

  getAsset(userId: string, assetId: string): Asset | undefined {
    const asset = this.data.assets[assetId];
    if (!asset || asset.userId !== userId) return undefined;
    return asset;
  }

  getAssets(userId: string, filter?: { projectId?: string; type?: string; search?: string; favorite?: boolean }): Asset[] {
    return Object.values(this.data.assets)
      .filter((a) => {
        if (a.userId !== userId) return false;
        if (filter?.projectId && a.projectId !== filter.projectId) return false;
        if (filter?.type && filter.type !== 'all' && a.type !== filter.type) return false;
        if (filter?.favorite && !a.isFavorite) return false;
        if (filter?.search) {
          const q = filter.search.toLowerCase();
          const matchPrompt = a.prompt.toLowerCase().includes(q);
          const matchTags = a.tags.some((t) => t.toLowerCase().includes(q));
          if (!matchPrompt && !matchTags) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  toggleFavorite(userId: string, assetId: string): Asset | undefined {
    const asset = this.data.assets[assetId];
    if (!asset || asset.userId !== userId) return undefined;
    asset.isFavorite = !asset.isFavorite;
    this.save();
    return asset;
  }

  deleteAsset(userId: string, assetId: string): boolean {
    const asset = this.data.assets[assetId];
    if (!asset || asset.userId !== userId) return false;
    delete this.data.assets[assetId];
    if (this.data.projects[asset.projectId]) {
      this.data.projects[asset.projectId].assetCount = Object.values(this.data.assets).filter((a) => a.projectId === asset.projectId).length;
    }
    this.save();
    return true;
  }

  // Flows
  getFlows(userId: string, projectId?: string): Flow[] {
    return Object.values(this.data.flows).filter((f) => f.userId === userId && (!projectId || f.projectId === projectId));
  }

  getFlow(userId: string, flowId: string): Flow | undefined {
    const flow = this.data.flows[flowId];
    if (!flow || flow.userId !== userId) return undefined;
    return flow;
  }

  saveFlow(userId: string, data: { id?: string; projectId: string; name: string; nodes: any[]; edges: any[] }): Flow {
    const id = data.id || `flow-${Date.now().toString(36)}`;
    const flow: Flow = {
      id,
      userId,
      projectId: data.projectId,
      name: data.name || 'Untitled Canvas Flow',
      nodes: data.nodes || [],
      edges: data.edges || [],
      updatedAt: new Date().toISOString(),
      createdAt: this.data.flows[id]?.createdAt || new Date().toISOString(),
    };
    this.data.flows[id] = flow;
    this.save();
    return flow;
  }

  deleteFlow(userId: string, flowId: string): boolean {
    const flow = this.data.flows[flowId];
    if (!flow || flow.userId !== userId) return false;
    delete this.data.flows[flowId];
    this.save();
    return true;
  }

  // Sequences
  getSequences(userId: string, projectId?: string): SequenceProject[] {
    return Object.values(this.data.sequences).filter((s) => s.userId === userId && (!projectId || s.projectId === projectId));
  }

  saveSequence(userId: string, data: any): SequenceProject {
    const id = data.id || `seq-${Date.now().toString(36)}`;
    const seq: SequenceProject = {
      id,
      userId,
      projectId: data.projectId || 'proj-cyber-noir',
      title: data.title || 'Cinematic 30s Sequence',
      targetDuration: data.targetDuration || 30,
      aspectRatio: data.aspectRatio || '16:9',
      shots: data.shots || [],
      finalVideoUrl: data.finalVideoUrl,
      updatedAt: new Date().toISOString(),
      createdAt: this.data.sequences[id]?.createdAt || new Date().toISOString(),
    };
    this.data.sequences[id] = seq;
    this.save();
    return seq;
  }

  // Observability & Admin Metrics
  getAdminMetrics() {
    const allJobs = Object.values(this.data.jobs);
    const completedJobs = allJobs.filter((j) => j.status === 'completed');
    const failedJobs = allJobs.filter((j) => j.status === 'failed');
    const activeJobs = allJobs.filter((j) => j.status === 'generating' || j.status === 'processing' || j.status === 'preparing');
    const queuedJobs = allJobs.filter((j) => j.status === 'queued');

    const totalCreditsBurned = this.data.transactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    return {
      totalUsers: Object.keys(this.data.users).length,
      totalProjects: Object.keys(this.data.projects).length,
      totalAssets: Object.keys(this.data.assets).length,
      totalJobs: allJobs.length,
      completedJobs: completedJobs.length,
      failedJobs: failedJobs.length,
      activeJobs: activeJobs.length,
      queuedJobs: queuedJobs.length,
      totalCreditsBurned,
      providers: [
        { name: 'Google Gemini Image', status: 'operational', uptime: '99.9%' },
        { name: 'Google Veo Video', status: 'operational', uptime: '99.7%' },
        { name: 'Kinetix Multi-Shot Orchestrator', status: 'operational', uptime: '100%' },
        { name: 'Storage Cache (Cloud)', status: 'operational', uptime: '100%' },
      ],
      recentErrors: failedJobs.slice(0, 5).map((j) => ({
        jobId: j.id,
        model: j.model,
        error: j.error || 'Generation timeout',
        timestamp: j.completedAt || j.createdAt,
      })),
    };
  }
}

export const db = new Database();
