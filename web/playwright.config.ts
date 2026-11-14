// Real-browser tests of the production build (ADR 0017). `npm run test:e2e` builds the site and
// adds the synthetic fixtures first; this config only serves dist/site and runs the specs.
import { defineConfig, devices } from '@playwright/test';

// ---- constants ---------------------------------------------------------------------------------

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const IS_CI = Boolean(process.env.CI);

// ---- config ------------------------------------------------------------------------------------

export default defineConfig({
  testDir: 'e2e/tests',
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  reporter: IS_CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // The pulse line is still for readers who ask for less motion; the tests choose explicitly.
    contextOptions: { reducedMotion: 'no-preference' },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    // Runs in this folder (web/): vite reads vite.config.ts and serves its outDir, dist/site.
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !IS_CI,
  },
});
