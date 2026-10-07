import {defineConfig,devices} from '@playwright/test';

if(!process.env.TEST_DATABASE_URL)throw new Error('Real API browser acceptance requires a disposable TEST_DATABASE_URL.');

export default defineConfig({
 testDir:'./tests/browser',testMatch:'api-postgres-sync.spec.ts',workers:1,
 timeout:60_000,outputDir:'test-results/api-postgres',
 reporter:[['list'],['html',{outputFolder:'playwright-report/api-postgres',open:'never'}]],
 use:{baseURL:'http://127.0.0.1:3020',trace:'retain-on-failure'},
 projects:[{name:'api-postgres',use:{...devices['Desktop Chrome']}}],
 webServer:{
  command:'npm run build -- --outDir dist-api-test && npm run preview -- --host 127.0.0.1 --port 3020 --strictPort --outDir dist-api-test',
  env:{VITE_ENABLE_DEMO:'false',VITE_ENABLE_WEB_V2:'true',VITE_API_URL:'http://127.0.0.1:4317',VITE_SUPABASE_URL:'https://servos-cloud.test',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-key'},
  url:'http://127.0.0.1:3020',reuseExistingServer:false,timeout:240_000,
 },
});
