import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// The cloud dev container ships browsers for exactly this Playwright version here.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('/opt/pw-browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
}

const base = process.env.BASE_PATH ?? '/h-s-audit/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:4173${base}`,
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'VITE_FAKE_REMOTE=1 npm run build && npm run preview',
    url: `http://localhost:4173${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
