// Usage: node scripts/make-icons.mjs
// Renders the app icon (dark teal rounded square, "HSE" wordmark, check mark) to the PNG sizes the
// manifest and iOS need, using the Chromium that ships with Playwright.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

// `pad` is the fraction of the canvas kept clear around the mark; maskable icons need ~20%.
function svg(size, { rounded, pad }) {
  const r = rounded ? size * 0.22 : 0;
  const inset = size * pad;
  const inner = size - inset * 2;
  const fontSize = inner * 0.34;
  const textY = inset + inner * 0.56;
  const tick = `M ${inset + inner * 0.14} ${inset + inner * 0.83} l ${inner * 0.1} ${inner * 0.1} l ${inner * 0.2} -${inner * 0.22}`;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${r}" fill="#0F3D3E"/>
      <text x="${size / 2}" y="${textY}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            font-weight="800" font-size="${fontSize}" fill="#FFFFFF" letter-spacing="${fontSize * 0.02}">HSE</text>
      <path d="${tick}" fill="none" stroke="#7FD1C7" stroke-width="${inner * 0.07}" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="${inset + inner * 0.5}" y="${inset + inner * 0.78}" width="${inner * 0.36}" height="${inner * 0.07}" rx="${inner * 0.035}" fill="#7FD1C7"/>
    </svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true, pad: 0.1 },
  { file: 'icon-512.png', size: 512, rounded: true, pad: 0.1 },
  { file: 'maskable-512.png', size: 512, rounded: false, pad: 0.2 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, pad: 0.12 },
];

const browser = await chromium.launch();
for (const t of targets) {
  const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(t.size, t)}</body>`);
  await page.screenshot({ path: `${OUT}/${t.file}`, type: 'png', omitBackground: true });
  await page.close();
  console.log(`wrote ${OUT}/${t.file}`);
}
await browser.close();
