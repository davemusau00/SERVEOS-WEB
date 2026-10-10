import {defineConfig,devices} from '@playwright/test';

if(!process.env.TEST_DATABASE_URL)throw new Error('Real API browser acceptance requires a disposable TEST_DATABASE_URL.');

export default defineConfig({
 testDir:'./tests/browser',testMatch:/api-postgres-(?:sync|setup)\.spec\.ts/,workers:1,
 timeout:60_000,outputDir:'test-results/api-postgres',
 reporter:[['list'],['html',{outputFolder:'playwright-report/api-postgres',open:'never'}]],
 use:{baseURL:'http://127.0.0.1:3020',trace:'retain-on-failure'},
 projects:[{name:'api-postgres',use:{...devices['Desktop Chrome']}}],
 webServer:{
  command:'npm run build -- --outDir dist-api-test && npm run preview -- --host 127.0.0.1 --port 3020 --strictPort --outDir dist-api-test',
  env:{VITE_API_URL:'http://127.0.0.1:4317'},
  url:'http://127.0.0.1:3020',reuseExistingServer:false,timeout:240_000,
 },
});
