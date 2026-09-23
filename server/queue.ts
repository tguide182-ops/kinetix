import { db } from './db.js';
import { modelProvider } from './models/provider.js';
import { Asset } from './types.js';

class JobQueue {
  private queue: string[] = [];
  private activeJobs: Set<string> = new Set();
  private maxConcurrency = 2;
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  enqueue(jobId: string) {
    if (!this.queue.includes(jobId)) {
      this.queue.push(jobId);
    }
  }

  cancel(jobId: string): boolean {
    const queueIdx = this.queue.indexOf(jobId);
    if (queueIdx !== -1) {
      this.queue.splice(queueIdx, 1);
      return true;
    }
    if (this.activeJobs.has(jobId)) {
      this.activeJobs.delete(jobId);
      return true;
    }
    return false;
  }

  startWorker() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick();
    }, 1500);
  }

  private async tick() {
    if (this.isProcessing) return;
    if (this.activeJobs.size >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const nextJobId = this.queue.shift();
    if (!nextJobId) return;

    this.activeJobs.add(nextJobId);
    this.processJob(nextJobId).finally(() => {
      this.activeJobs.delete(nextJobId);
    });
  }

  private async processJob(jobId: string) {
    const job = db.getJobById(jobId);
    if (!job || job.status === 'cancelled') {
      return;
    }

    try {
      db.updateJob(jobId, {
        status: 'preparing',
        progress: 15,
        startedAt: new Date().toISOString(),
      });

      await new Promise((r) => setTimeout(r, 600));

      db.updateJob(jobId, {
        status: 'generating',
        progress: 45,
      });

      let result;
      const isVideo = job.type.includes('video') || job.type === 'sequence_segment';

      if (isVideo) {
        if (job.type === 'video_extension') {
          result = await modelProvider.extendVideo({
            prompt: job.prompt,
            model: job.model,
            aspectRatio: job.aspectRatio,
            resolution: job.resolution,
            duration: job.duration,
            referenceImages: job.referenceAssets,
          });
        } else {
          result = await modelProvider.generateVideo({
            prompt: job.prompt,
            model: job.model,
            aspectRatio: job.aspectRatio,
            resolution: job.resolution,
            duration: job.duration,
            firstFrame: job.firstFrame,
            lastFrame: job.lastFrame,
            referenceImages: job.referenceAssets,
          });
        }
      } else {
        result = await modelProvider.generateImage({
          prompt: job.prompt,
          negativePrompt: job.negativePrompt,
          aspectRatio: job.aspectRatio,
          resolution: job.resolution,
          model: job.model,
          seed: job.parameters?.seed,
          referenceImages: job.referenceAssets,
        });
      }

      db.updateJob(jobId, {
        status: 'processing',
        progress: 85,
      });

      await new Promise((r) => setTimeout(r, 400));

      // Create new Asset record
      const assetId = `asset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newAsset: Asset = {
        id: assetId,
        userId: job.userId,
        projectId: job.projectId,
        type: isVideo ? 'video' : 'image',
        mimeType: result.mimeType,
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        prompt: job.prompt,
        model: job.model,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        duration: isVideo ? (job.duration || 6) : undefined,
        width: result.width,
        height: result.height,
        isFavorite: false,
        tags: [job.type, job.aspectRatio, job.model.split('-')[0]],
        metadata: {
          jobId: job.id,
          parameters: job.parameters,
          provider: result.provider,
        },
        sourceJobId: job.id,
        createdAt: new Date().toISOString(),
      };

      db.createAsset(newAsset);

      db.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        outputAssetIds: [assetId],
        completedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`[JobQueue] Job ${jobId} failed:`, err);
      db.updateJob(jobId, {
        status: 'failed',
        error: err?.message || 'Generation processing error',
        completedAt: new Date().toISOString(),
      });

      // Auto-refund credits to user on system error
      if (job.estimatedCredits) {
        db.addCredits(job.userId, job.estimatedCredits, `Auto-refund for failed generation #${job.id.slice(0, 8)}`);
      }
    }
  }
}

export const jobQueue = new JobQueue();
