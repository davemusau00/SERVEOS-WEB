import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile-layout', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  // Exercise the same production bundle built by CI. Vite's cold dev dependency
  // scan can leave the initial module graph blocked long enough to time out goto.
  webServer: { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 3000 --strictPort', env: { VITE_ENABLE_DEMO: 'true', VITE_ENABLE_WEB_V2:'true', VITE_SUPABASE_URL:'https://servos-cloud.test', VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-key' }, url: 'http://127.0.0.1:3000', reuseExistingServer: false, timeout: 240_000 },
});
