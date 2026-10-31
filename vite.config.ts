import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base: '/h-s-audit/',
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
        globPatterns: ['**/*.{js,css,html,svg,png,xlsx,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/h-s-audit/index.html',
      },
      manifest: {
        name: 'HSE Audit',
        short_name: 'HSE Audit',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0F3D3E',
        background_color: '#FFFFFF',
        icons: [],
      },
    }),
  ],
});
