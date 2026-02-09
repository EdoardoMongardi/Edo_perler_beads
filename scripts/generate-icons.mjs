/**
 * Generate PWA icons for PerlerBeads.
 * Run with: node scripts/generate-icons.mjs
 *
 * Uses a Canvas-based approach (via sharp to render an SVG).
 */
import { writeFileSync } from 'fs';
import sharp from 'sharp';

const sizes = [192, 256, 384, 512];

const svgTemplate = (size) => {
  const fontSize = Math.round(size * 0.32);
  const subFontSize = Math.round(size * 0.08);
  return `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F472B6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FB7185;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="url(#bg)" />
  <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif" font-weight="800"
        font-size="${fontSize}" fill="white" letter-spacing="${Math.round(size * 0.01)}">PB</text>
  <text x="50%" y="72%" dominant-baseline="middle" text-anchor="middle"
        font-family="system-ui, -apple-system, sans-serif" font-weight="500"
        font-size="${subFontSize}" fill="rgba(255,255,255,0.85)">PERLER</text>
</svg>`;
};

for (const size of sizes) {
  const svg = svgTemplate(size);
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(`public/icon-${size}x${size}.png`, buffer);
  console.log(`Generated icon-${size}x${size}.png`);
}

console.log('All icons generated.');