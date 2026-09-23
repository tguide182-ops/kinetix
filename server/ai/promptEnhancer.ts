import { GoogleGenAI } from '@google/genai';

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

export async function enhancePrompt(prompt: string): Promise<string> {
  const client = getAiClient();
  if (client) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are an expert AI prompt engineer for state-of-the-art image and video generation models like Gemini Flash Image, Imagen, and Veo.
Enhance and expand the following user prompt to maximize visual fidelity, depth of field, dramatic cinematic lighting, texture details, compositional staging, color palette, and camera lens specifications.
Do not add meta conversational text or commentary. Output ONLY the enhanced prompt.

User prompt: "${prompt}"`,
      });

      const text = response.text?.trim();
      if (text && text.length > 5) {
        return text;
      }
    } catch (err) {
      console.warn('Gemini prompt enhancement fallback:', err);
    }
  }

  // Graceful rule-based enhancement fallback
  const enhancements = [
    'shot on 35mm anamorphic lens',
    'cinematic soft volumetric lighting',
    'shallow depth of field with creamy bokeh',
    'hyper-detailed textures and rich material realism',
    'balanced golden hour chiaroscuro',
    'Kodak Vision3 color grading, 8k resolution master shot',
  ];
  return `${prompt}, ${enhancements.slice(0, 3).join(', ')}`;
}

export async function rewritePrompt(prompt: string, mode: string): Promise<string> {
  const client = getAiClient();
  const modeInstructions: Record<string, string> = {
    cinematic: 'Rewrite this prompt into a Hollywood movie still: anamorphic widescreen composition, dramatic dramatic lighting, Panavision 70mm lens, rich atmosphere, subtle lens flare.',
    realistic: 'Rewrite this prompt into an authentic ultra-photorealistic candid photograph: natural ambient sunlight, Sony A7R V with 85mm f/1.4 lens, natural skin and fabric textures, raw documentary composition, zero artificial gloss.',
    product: 'Rewrite this prompt into a commercial high-end product advertisement: precision studio rim lighting, Hasselblad medium format, pristine reflective staging, crisp micro-contrast, elegant minimalist background.',
    social: 'Rewrite this prompt for an eye-catching, vibrant, viral visual: punchy dynamic angles, hyper-vivid complementary color harmony, crisp focal subject, captivating motion blur and modern aesthetic.',
    anime: 'Rewrite this prompt into a breathtaking Makoto Shinkai / Studio Ghibli inspired anime aesthetic: painterly skies, luminous atmospheric particles, hand-drawn detailing, emotive color resonance.',
  };

  const instruction = modeInstructions[mode] || modeInstructions.cinematic;

  if (client) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are an elite creative director for visual generative AI.
${instruction}
Output ONLY the rewritten prompt without quotation marks or explanations.

Prompt: "${prompt}"`,
      });

      const text = response.text?.trim();
      if (text && text.length > 5) {
        return text;
      }
    } catch (err) {
      console.warn('Gemini prompt rewrite fallback:', err);
    }
  }

  // Fallback
  if (mode === 'cinematic') {
    return `Cinematic 35mm widescreen still: ${prompt}, dramatic chiaroscuro key lighting, atmospheric haze, subtle film grain, color graded by Deakins.`;
  }
  if (mode === 'realistic') {
    return `Ultra-realistic candid photograph of ${prompt}, shot on Sony Alpha 85mm f/1.4, natural daylight, uncompressed raw detail, natural micro-textures.`;
  }
  if (mode === 'product') {
    return `Editorial luxury commercial studio shot of ${prompt}, pristine softbox illumination, reflective dark glass pedestal, razor-sharp focus, Hasselblad H6D.`;
  }
  if (mode === 'social') {
    return `High-energy vibrant editorial visual of ${prompt}, bold contemporary composition, dynamic framing, vivid punchy color palette.`;
  }
  return `${prompt}, cinematic aesthetic, 8k resolution, Masterpiece composition`;
}
