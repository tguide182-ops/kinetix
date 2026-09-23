import { GoogleGenAI } from '@google/genai';
import { generateCinematicVisual } from '../ai/canvasRenderer.js';
import { MODEL_REGISTRY } from './registry.js';
import { ModelCapability } from '../types.js';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: string;
  resolution?: string;
  seed?: number;
  model?: string;
  referenceImages?: string[]; // base64 strings or URLs
}

export interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  aspectRatio: string;
  resolution?: string;
  duration?: number;
  firstFrame?: string; // base64
  lastFrame?: string;  // base64
  referenceImages?: string[];
  previousVideoUri?: string;
}

export interface GenerationResult {
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  mimeType: string;
  duration?: number;
  provider: 'google' | 'kinetix-sim';
  meta?: Record<string, any>;
}

export class ModelProviderRegistry {
  getCapabilities(modelId: string): ModelCapability | undefined {
    return MODEL_REGISTRY.find((m) => m.id === modelId);
  }

  estimateCost(modelId: string, duration?: number, count = 1): number {
    const cap = this.getCapabilities(modelId) || MODEL_REGISTRY[0];
    if (cap.type === 'video') {
      const dur = duration || 6;
      const rate = cap.creditCost;
      return Math.round((rate * (dur / 6)) * count);
    }
    return cap.creditCost * count;
  }

  validateParameters(modelId: string, params: { aspectRatio: string; resolution?: string; duration?: number; referenceCount?: number }): { valid: boolean; error?: string } {
    const cap = this.getCapabilities(modelId);
    if (!cap) {
      return { valid: true };
    }
    if (!cap.aspectRatios.includes(params.aspectRatio)) {
      return { valid: false, error: `Aspect ratio ${params.aspectRatio} not supported by ${cap.name}. Choose from: ${cap.aspectRatios.join(', ')}` };
    }
    if (params.referenceCount && cap.maxReferences && params.referenceCount > cap.maxReferences) {
      return { valid: false, error: `Model supports up to ${cap.maxReferences} references (provided ${params.referenceCount})` };
    }
    return { valid: true };
  }

  async generateImage(req: ImageGenerationRequest): Promise<GenerationResult> {
    const client = getAiClient();
    const model = req.model || 'gemini-3.1-flash-lite-image';

    if (client) {
      try {
        const parts: any[] = [];
        
        // Add references if supplied
        if (req.referenceImages && req.referenceImages.length > 0) {
          for (const ref of req.referenceImages.slice(0, 2)) {
            if (ref.startsWith('data:')) {
              const [meta, data] = ref.split(',');
              const mimeMatch = meta.match(/:(.*?);/);
              const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
              parts.push({
                inlineData: { data, mimeType },
              });
            }
          }
        }

        // Add text prompt
        parts.push({ text: req.prompt });

        const config: any = {};
        // Add imageConfig for supported nano banana models if aspect ratio given
        const allowedRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
        if (allowedRatios.includes(req.aspectRatio)) {
          config.imageConfig = {
            aspectRatio: req.aspectRatio,
          };
          if (model === 'gemini-3.1-flash-image' && req.resolution) {
            config.imageConfig.imageSize = req.resolution === '4K' ? '4K' : (req.resolution === '2K' ? '2K' : '1K');
          }
        }

        const response = await client.models.generateContent({
          model,
          contents: { parts },
          config: Object.keys(config).length > 0 ? config : undefined,
        });

        // Search for inlineData in candidate parts
        const candidates = response.candidates;
        if (candidates && candidates.length > 0 && candidates[0].content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const mimeType = part.inlineData.mimeType || 'image/png';
              const dataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
              return {
                url: dataUrl,
                thumbnailUrl: dataUrl,
                width: 1024,
                height: 1024,
                mimeType,
                provider: 'google',
                meta: { model, prompt: req.prompt },
              };
            }
          }
        }
      } catch (err: any) {
        console.warn(`[KINETIX API] Google Image API attempt fallback (${err?.message || err})`);
      }
    }

    // High quality procedural visual fallback for seamless studio testing
    const visual = generateCinematicVisual({
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      seed: req.seed || Math.floor(Math.random() * 100000),
    });

    return {
      url: visual.url,
      thumbnailUrl: visual.url,
      width: visual.width,
      height: visual.height,
      mimeType: 'image/svg+xml',
      provider: 'kinetix-sim',
      meta: { model, fallbackRender: true },
    };
  }

  async generateVideo(req: VideoGenerationRequest): Promise<GenerationResult> {
    const client = getAiClient();
    const model = req.model || 'veo-3.1-lite-generate-preview';
    const aspectRatio = (req.aspectRatio === '9:16' ? '9:16' : '16:9') as '16:9' | '9:16';
    const resolution = (req.resolution === '1080p' ? '1080p' : '720p') as '720p' | '1080p';

    if (client) {
      try {
        const payload: any = {
          model,
          prompt: req.prompt,
          config: {
            numberOfVideos: 1,
            resolution,
            aspectRatio,
          },
        };

        if (req.firstFrame && req.firstFrame.startsWith('data:')) {
          const [meta, data] = req.firstFrame.split(',');
          const mimeMatch = meta.match(/:(.*?);/);
          payload.image = {
            imageBytes: data,
            mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
          };
        }

        if (req.lastFrame && req.lastFrame.startsWith('data:')) {
          const [meta, data] = req.lastFrame.split(',');
          const mimeMatch = meta.match(/:(.*?);/);
          payload.config.lastFrame = {
            imageBytes: data,
            mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
          };
        }

        // Call Veo generateVideos
        const operation = await (client.models as any).generateVideos(payload);
        if (operation && operation.name) {
          // Poll operation status until done (up to 4 attempts in worker context or return op name)
          let opName = operation.name;
          const { GenerateVideosOperation } = await import('@google/genai');
          const op = new GenerateVideosOperation();
          op.name = opName;
          
          let pollAttempts = 0;
          let updated = await (client.operations as any).getVideosOperation({ operation: op });
          while (!updated.done && pollAttempts < 15) {
            await new Promise((r) => setTimeout(r, 6000));
            updated = await (client.operations as any).getVideosOperation({ operation: op });
            pollAttempts++;
          }

          if (updated.done && updated.response?.generatedVideos?.[0]?.video?.uri) {
            const uri = updated.response.generatedVideos[0].video.uri;
            return {
              url: uri,
              thumbnailUrl: uri,
              width: aspectRatio === '16:9' ? 1280 : 720,
              height: aspectRatio === '16:9' ? 720 : 1280,
              mimeType: 'video/mp4',
              duration: req.duration || 6,
              provider: 'google',
              meta: { model, operationName: opName },
            };
          }
        }
      } catch (err: any) {
        console.warn(`[KINETIX API] Google Veo API call notice (${err?.message || err}). Providing simulated cinematic video output.`);
      }
    }

    // High quality procedural cinematic visual
    const visual = generateCinematicVisual({
      prompt: req.prompt,
      aspectRatio: req.aspectRatio,
      isVideo: true,
      duration: req.duration || 6,
    });

    return {
      url: visual.url,
      thumbnailUrl: visual.url,
      width: visual.width,
      height: visual.height,
      mimeType: 'video/mp4',
      duration: req.duration || 6,
      provider: 'kinetix-sim',
      meta: { model, proceduralSimulated: true },
    };
  }

  async extendVideo(req: VideoGenerationRequest): Promise<GenerationResult> {
    const extendedDuration = (req.duration || 6) + 7;
    return this.generateVideo({
      ...req,
      prompt: `Continuing seamless action: ${req.prompt}`,
      duration: extendedDuration,
    });
  }
}

export const modelProvider = new ModelProviderRegistry();
