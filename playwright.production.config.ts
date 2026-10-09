import { defineConfig, devices } from '@playwright/test';

// Exercise only browser tests written for the API/PWA architecture. Historical
// native and Supabase fixtures are not production browser acceptance.
export default defineConfig({
  testDir: './tests/browser',
  testMatch: /(?:api-bootstrap-recovery|api-catalog-sync|web-storage)\.spec\.ts/,
  outputDir: './test-results/production',
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
      VITE_API_URL: 'https://servos-api.test',
    },
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
