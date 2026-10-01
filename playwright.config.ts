import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  outputDir: 'artifacts/test-results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/test-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'simulation', testMatch: /(?:simulation|clock|renderer|rural|rural-assets|environment|npcs|living|district|district-assets|district-npcs|tail|streaming|residency|preparation|city|city-render|city-streaming)\.spec\.ts/ },
    { name: 'browser', testMatch: '**/browser.spec.ts', use: {
      channel: process.env.VOXARRIUM_BROWSER ?? 'chrome',
      headless: process.env.VOXARRIUM_HEADED !== '1',
    } },
    { name: 'rural-browser', testMatch: '**/rural-browser.spec.ts', use: {
      channel: process.env.VOXARRIUM_BROWSER ?? 'chrome',
      headless: process.env.VOXARRIUM_HEADED !== '1',
    } },
    { name: 'living-browser', testMatch: '**/living-browser.spec.ts', use: {
      channel: process.env.VOXARRIUM_BROWSER ?? 'chrome',
      headless: process.env.VOXARRIUM_HEADED !== '1',
    } },
    { name: 'district-browser', testMatch: '**/district-browser.spec.ts', use: {
      channel: process.env.VOXARRIUM_BROWSER ?? 'chrome',
      headless: process.env.VOXARRIUM_HEADED !== '1',
    } },
    { name: 'streaming-browser', testMatch: '**/streaming-browser.spec.ts', use: {
      channel: process.env.VOXARRIUM_BROWSER ?? 'chrome',
      headless: process.env.VOXARRIUM_HEADED !== '1',
    } },
    { name: 'city-browser', testMatch: '**/city-browser.spec.ts', use: {
      channel: process.env.VOXARRIUM_BROWSER ?? 'chrome',
      headless: process.env.VOXARRIUM_HEADED !== '1',
    } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
