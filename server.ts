import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.js';
import { jobQueue } from './server/queue.js';
import { enhancePrompt, rewritePrompt } from './server/ai/promptEnhancer.js';
import { MODEL_REGISTRY } from './server/models/registry.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Ensure public assets folder exists
const publicAssetsDir = path.resolve('public/generated');
if (!fs.existsSync(publicAssetsDir)) {
  fs.mkdirSync(publicAssetsDir, { recursive: true });
}
app.use('/generated', express.static(publicAssetsDir));

// --- API ROUTES ---

// 1. Current User / Authentication & Profile
app.get('/api/auth/me', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const user = db.getUser(userId);
  res.json({ user });
});

app.get('/api/auth/users', (req, res) => {
  const users = db.getAllUsers();
  res.json({ users });
});

app.post('/api/auth/switch', (req, res) => {
  const { userId } = req.body;
  const user = db.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// 2. Projects
app.get('/api/projects', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const projects = db.getProjects(userId);
  res.json({ projects });
});

app.post('/api/projects', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  const project = db.createProject(userId, { name, description });
  res.json({ project });
});

app.delete('/api/projects/:id', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const success = db.deleteProject(userId, req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Project not found or unauthorized' });
  }
  res.json({ success: true });
});

// 3. Model Registry & Capabilities
app.get('/api/models', (req, res) => {
  res.json({ models: MODEL_REGISTRY });
});

// 4. Prompt Enhancement / Intelligence
app.post('/api/prompts/enhance', async (req, res) => {
  try {
    const { prompt, mode } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    const result = mode && mode !== 'standard' 
      ? await rewritePrompt(prompt, mode)
      : await enhancePrompt(prompt);
    res.json({ enhancedPrompt: result });
  } catch (error: any) {
    console.error('Prompt enhancement error:', error);
    res.status(500).json({ error: error?.message || 'Failed to enhance prompt' });
  }
});

// 5. Job Creation & Queue Management
app.get('/api/jobs', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const projectId = req.query.projectId as string | undefined;
  const jobs = db.getJobs(userId, projectId);
  res.json({ jobs });
});

app.get('/api/jobs/:id', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const job = db.getJob(userId, req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job });
});

app.post('/api/jobs', async (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const {
    projectId,
    type,
    model,
    prompt,
    negativePrompt,
    aspectRatio,
    resolution,
    duration,
    numberOfOutputs = 1,
    referenceAssets = [],
    firstFrame,
    lastFrame,
    sourceAssetId,
    parameters = {},
    estimatedCredits,
  } = req.body;

  if (!prompt && type !== 'video_extension') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Deduct/reserve credits atomically
  const requiredCredits = estimatedCredits || (type.includes('video') ? 20 * (duration ? Math.ceil(duration / 5) : 1) : 4 * numberOfOutputs);
  const user = db.getUser(userId);
  if (!user || user.credits < requiredCredits) {
    return res.status(402).json({
      error: 'Insufficient credits',
      required: requiredCredits,
      current: user ? user.credits : 0,
    });
  }

  // Atomically reserve credits
  db.deductCredits(userId, requiredCredits, `Generation: ${type} (${numberOfOutputs} output${numberOfOutputs > 1 ? 's' : ''})`);

  // Create individual jobs for batch or single
  const jobs = [];
  for (let i = 0; i < numberOfOutputs; i++) {
    const job = db.createJob(userId, {
      projectId: projectId || 'proj-default',
      type,
      model: model || (type.includes('video') ? 'veo-3.1-lite-generate-preview' : 'gemini-3.1-flash-lite-image'),
      prompt,
      negativePrompt,
      aspectRatio: aspectRatio || '1:1',
      resolution: resolution || '1K',
      duration: duration || (type.includes('video') ? 6 : undefined),
      batchIndex: i,
      batchTotal: numberOfOutputs,
      referenceAssets,
      firstFrame,
      lastFrame,
      sourceAssetId,
      parameters,
      estimatedCredits: Math.ceil(requiredCredits / numberOfOutputs),
    });
    jobs.push(job);
    jobQueue.enqueue(job.id);
  }

  res.status(201).json({ jobs, remainingCredits: db.getUser(userId)?.credits });
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const job = db.getJob(userId, req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  const cancelled = jobQueue.cancel(req.params.id);
  if (cancelled) {
    db.updateJob(req.params.id, { status: 'cancelled' });
    // Refund credits
    if (job.estimatedCredits) {
      db.addCredits(userId, job.estimatedCredits, `Refund for cancelled job #${job.id.slice(0, 8)}`);
    }
  }
  res.json({ success: true, status: 'cancelled' });
});

app.post('/api/jobs/:id/retry', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const job = db.getJob(userId, req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  if (job.status !== 'failed' && job.status !== 'cancelled') {
    return res.status(400).json({ error: 'Can only retry failed or cancelled jobs' });
  }

  // Check user credits
  const user = db.getUser(userId);
  const cost = job.estimatedCredits || 4;
  if (!user || user.credits < cost) {
    return res.status(402).json({ error: 'Insufficient credits for retry', required: cost, current: user ? user.credits : 0 });
  }

  db.deductCredits(userId, cost, `Retry generation #${job.id.slice(0, 8)}`);
  db.updateJob(job.id, {
    status: 'queued',
    progress: 0,
    error: undefined,
    retryCount: (job.retryCount || 0) + 1,
    startedAt: undefined,
    completedAt: undefined,
  });

  jobQueue.enqueue(job.id);
  res.json({ success: true, job: db.getJob(userId, job.id) });
});

// 6. Assets / Media Library
app.get('/api/assets', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const { projectId, type, search, favorite } = req.query;
  const assets = db.getAssets(userId, {
    projectId: projectId as string,
    type: type as string,
    search: search as string,
    favorite: favorite === 'true',
  });
  res.json({ assets });
});

app.get('/api/assets/:id', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const asset = db.getAsset(userId, req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.json({ asset });
});

app.post('/api/assets/:id/favorite', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const asset = db.toggleFavorite(userId, req.params.id);
  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.json({ asset });
});

app.delete('/api/assets/:id', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const success = db.deleteAsset(userId, req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.json({ success: true });
});

// 7. Flows (Canvas Workflows)
app.get('/api/flows', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const projectId = req.query.projectId as string | undefined;
  const flows = db.getFlows(userId, projectId);
  res.json({ flows });
});

app.get('/api/flows/:id', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const flow = db.getFlow(userId, req.params.id);
  if (!flow) {
    return res.status(404).json({ error: 'Flow not found' });
  }
  res.json({ flow });
});

app.post('/api/flows', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const { id, projectId, name, nodes, edges } = req.body;
  const flow = db.saveFlow(userId, { id, projectId, name, nodes, edges });
  res.json({ flow });
});

app.delete('/api/flows/:id', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const success = db.deleteFlow(userId, req.params.id);
  res.json({ success });
});

// 8. Story & Sequence Builder (Multi-shot orchestration)
app.get('/api/sequences', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const projectId = req.query.projectId as string | undefined;
  const sequences = db.getSequences(userId, projectId);
  res.json({ sequences });
});

app.post('/api/sequences', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const sequence = db.saveSequence(userId, req.body);
  res.json({ sequence });
});

// 9. Credit Transactions & Usage
app.get('/api/credits/history', (req, res) => {
  const userId = (req.headers['x-user-id'] as string) || 'user-default';
  const history = db.getCreditHistory(userId);
  const user = db.getUser(userId);
  res.json({ balance: user?.credits || 0, history });
});

// 10. Admin Metrics & Observability
app.get('/api/admin/metrics', (req, res) => {
  const metrics = db.getAdminMetrics();
  res.json({ metrics });
});

// Mount Vite or serve static files
async function startServer() {
  if (process.env.NODE_ENV === 'production' && fs.existsSync(path.resolve('dist'))) {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Start background job queue processing loop
  jobQueue.startWorker();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KINETIX] Creative Studio running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
