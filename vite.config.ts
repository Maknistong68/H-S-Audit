import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// GitHub Pages serves the app under /h-s-audit/; Vercel (which sets VERCEL=1 at build time) at the root.
const base = process.env.BASE_PATH ?? (process.env.VERCEL ? '/' : '/h-s-audit/');

export default defineConfig({
  base,
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['templates/hs-audit-template.xlsx'],
      workbox: {
        clientsClaim: true, // the first service worker controls the page immediately, so an offline reload works
        globPatterns: ['**/*.{js,css,html,svg,png,xlsx,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
      },
      manifest: {
        name: 'HSE Audit',
        short_name: 'HSE Audit',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0F3D3E',
        background_color: '#FFFFFF',
        description: 'Offline Health & Safety inspection checklist for site audits',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
