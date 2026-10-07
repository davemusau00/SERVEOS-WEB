import { defineConfig, devices } from '@playwright/test';

// Production acceptance must never inherit the demo/preview bundle. Preview-only
// tests stay on playwright.config.ts because they intentionally exercise sample data.
export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results/production',
  testIgnore: ['**/preview.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/production', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3010', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'pos-terminal', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 600 } } },
    { name: 'aio-terminal', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'mobile-layout', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run build -- --outDir dist-production && npm run preview -- --host 127.0.0.1 --port 3010 --strictPort --outDir dist-production',
    env: {
      VITE_ENABLE_DEMO: 'false',
      VITE_ENABLE_WEB_V2: 'true',
      VITE_API_URL: 'https://servos-api.test',
      VITE_SUPABASE_URL: 'https://servos-cloud.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-public-key',
    },
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
