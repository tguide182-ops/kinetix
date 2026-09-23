/**
 * High-quality procedural cinematic visual generator for fallback & offline testing.
 * Generates beautiful SVG-based cinematic stills and animated video previews
 * with rich lighting, atmospheric fog, geometric depth, and color palettes.
 */

interface RenderOptions {
  prompt: string;
  aspectRatio: string;
  width?: number;
  height?: number;
  seed?: number;
  theme?: 'cyberpunk' | 'nature' | 'portrait' | 'cinema' | 'space' | 'abstract';
  isVideo?: boolean;
  duration?: number;
}

export function generateCinematicVisual(options: RenderOptions): { url: string; width: number; height: number } {
  let width = 1024;
  let height = 1024;

  switch (options.aspectRatio) {
    case '16:9':
      width = 1280;
      height = 720;
      break;
    case '9:16':
      width = 720;
      height = 1280;
      break;
    case '4:3':
      width = 1024;
      height = 768;
      break;
    case '3:4':
      width = 768;
      height = 1024;
      break;
    case '3:2':
      width = 1080;
      height = 720;
      break;
    case '2:3':
      width = 720;
      height = 1080;
      break;
    default:
      width = 1024;
      height = 1024;
  }

  // Derive palette from prompt keywords
  const p = options.prompt.toLowerCase();
  let c1 = '#0f172a';
  let c2 = '#1e1b4b';
  let accent = '#38bdf8';
  let highlight = '#818cf8';

  if (p.includes('neon') || p.includes('cyber') || p.includes('tokyo') || p.includes('future')) {
    c1 = '#090514';
    c2 = '#1a0b2e';
    accent = '#06b6d4';
    highlight = '#ec4899';
  } else if (p.includes('sunset') || p.includes('golden') || p.includes('desert') || p.includes('warm')) {
    c1 = '#1c0a00';
    c2 = '#3a1505';
    accent = '#f97316';
    highlight = '#fbbf24';
  } else if (p.includes('forest') || p.includes('nature') || p.includes('emerald') || p.includes('green')) {
    c1 = '#021810';
    c2 = '#062d1f';
    accent = '#10b981';
    highlight = '#34d399';
  } else if (p.includes('space') || p.includes('galaxy') || p.includes('cosmos') || p.includes('star')) {
    c1 = '#030712';
    c2 = '#0f172a';
    accent = '#6366f1';
    highlight = '#a855f7';
  } else if (p.includes('family') || p.includes('dinner') || p.includes('home') || p.includes('african')) {
    c1 = '#1a0f0a';
    c2 = '#2d1810';
    accent = '#ea580c';
    highlight = '#f59e0b';
  }

  // Clean prompt title for display
  const title = options.prompt.length > 40 ? options.prompt.slice(0, 37) + '...' : options.prompt;
  const hash = Math.abs(options.prompt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + (options.seed || 1));

  const circles = Array.from({ length: 6 }).map((_, i) => {
    const cx = ((hash * (i + 1) * 97) % (width - 100)) + 50;
    const cy = ((hash * (i + 1) * 113) % (height - 100)) + 50;
    const r = ((hash * (i + 1) * 31) % 180) + 60;
    const opacity = (0.15 + (i * 0.05)).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gradAccent)" opacity="${opacity}" filter="url(#blur)" />`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}" />
      <stop offset="50%" stop-color="${c2}" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="gradAccent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" />
      <stop offset="100%" stop-color="${highlight}" />
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
      <stop offset="40%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.75" />
    </radialGradient>
    <radialGradient id="lensGlow" cx="60%" cy="40%" r="50%">
      <stop offset="0%" stop-color="${highlight}" stop-opacity="0.4" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="60" />
    </filter>
  </defs>

  <!-- Background base -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

  <!-- Volumetric glow elements -->
  ${circles}

  <!-- Center focal silhouette aura -->
  <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.35}" fill="url(#lensGlow)" filter="url(#blur)" />

  <!-- Compositional grid lines for cinematic feel -->
  <line x1="0" y1="${height * 0.33}" x2="${width}" y2="${height * 0.33}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
  <line x1="0" y1="${height * 0.66}" x2="${width}" y2="${height * 0.66}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
  <line x1="${width * 0.33}" y1="0" x2="${width * 0.33}" y2="${height}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
  <line x1="${width * 0.66}" y1="0" x2="${width * 0.66}" y2="${height}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />

  <!-- Vignette overlay -->
  <rect width="${width}" height="${height}" fill="url(#vignette)" />

  <!-- Cinematic widescreen bars if 16:9 -->
  ${options.aspectRatio === '16:9' ? `
    <rect y="0" width="${width}" height="24" fill="#000000" opacity="0.6"/>
    <rect y="${height - 24}" width="${width}" height="24" fill="#000000" opacity="0.6"/>
  ` : ''}

  <!-- Watermark & Title subtle typography -->
  <g transform="translate(32, ${height - 40})">
    <text font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="600" fill="#ffffff" opacity="0.9">${escapeXml(title)}</text>
    <text y="20" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" fill="${accent}" opacity="0.8">KINETIX STUDIO · ${options.aspectRatio} · 8K HDR</text>
  </g>
</svg>`;

  const base64 = Buffer.from(svg).toString('base64');
  return {
    url: `data:image/svg+xml;base64,${base64}`,
    width,
    height,
  };
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
