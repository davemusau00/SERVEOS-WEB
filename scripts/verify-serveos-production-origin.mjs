import { chromium } from 'playwright';

const base = 'https://serveos.davemusau.co.ke';
const api = 'https://serveosapi.davemusau.co.ke';
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  context.on('serviceworker', worker => {
    console.log(`serviceworker=${worker.url()}`);
    worker.on('console', message => console.log(`serviceworker-console=${message.type()}:${message.text()}`));
  });
  context.on('requestfailed', request => console.log(`request-failed=${request.url()}:${request.failure()?.errorText}`));
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  const observed = await page.evaluate(async apiOrigin => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const sw = await fetch('/sw.js', { cache: 'no-store' });
    const swText = await sw.clone().text();
    const assets = JSON.parse(swText.match(/const ASSETS=(\[[\s\S]*?\]);/)[1]);
    const assetStatuses = await Promise.all(assets.map(async path => {
      try { return { path, status: (await fetch(path, { cache: 'no-store' })).status }; }
      catch (error) { return { path, error: String(error) }; }
    }));
    await new Promise(resolve => setTimeout(resolve, 12000));
    const finalRegistrations = await navigator.serviceWorker.getRegistrations();
    const finalCacheNames = await caches.keys();
    const cachedShellCount = finalCacheNames.length
      ? (await (await caches.open(finalCacheNames[0])).keys()).length
      : 0;
    let apiHealth;
    try {
      const health = await fetch(`${apiOrigin}/health/ready`, { cache: 'no-store' });
      apiHealth = { status: health.status, ok: health.ok };
    } catch (error) {
      apiHealth = { error: String(error) };
    }
    return {
      title: document.title,
      secureContext: isSecureContext,
      serviceWorkerSupported: 'serviceWorker' in navigator,
      serviceWorkerControlled: navigator.serviceWorker.controller !== null,
      cacheNames: await caches.keys(),
      cachedShellCount,
      serviceWorkerRegistrations: registrations.map(item => ({
        scope: item.scope,
        active: item.active?.state ?? null,
        waiting: item.waiting?.state ?? null,
        installing: item.installing?.state ?? null,
      })),
      serviceWorkerFinal: finalRegistrations.map(item => ({
        active: item.active?.state ?? null,
        waiting: item.waiting?.state ?? null,
        installing: item.installing?.state ?? null,
      })),
      swStatus: sw.status,
      swCacheControl: sw.headers.get('cache-control'),
      shellAssetCount: assets.length,
      failedShellAssets: assetStatuses.filter(item => item.status !== 200),
      apiHealth,
      loginFields: document.querySelectorAll('input').length,
    };
  }, api);
  const controlledPage = await context.newPage();
  await controlledPage.goto(base, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const onlineController = await controlledPage.evaluate(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  const offlineResponse = await controlledPage.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  const offlineShell = await controlledPage.evaluate(() => ({
    title: document.title,
    serviceWorkerControlled: navigator.serviceWorker.controller !== null,
    loginFields: document.querySelectorAll('input').length,
  }));
  await context.setOffline(false);
  const result = { pwaStatus: response?.status(), ...observed, pageErrors };
  result.reloadStatus = offlineResponse?.status();
  result.onlineController = onlineController;
  result.offlineShell = offlineShell;
  console.log(JSON.stringify(result, null, 2));
  if (result.pwaStatus !== 200 || !result.secureContext || result.swStatus !== 200 || result.failedShellAssets.length || result.cachedShellCount !== result.shellAssetCount || result.serviceWorkerFinal[0]?.active !== 'activated' || !onlineController || offlineShell.serviceWorkerControlled !== true || offlineShell.title !== result.title || offlineShell.loginFields < 2 || result.apiHealth?.status !== 200 || pageErrors.length) {
    process.exitCode = 1;
  }
  await context.close();
} finally {
  await browser.close();
}
