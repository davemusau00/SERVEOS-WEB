import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

test('PWA manifest references real any and maskable icon assets',()=>{
  const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
  assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512','512x512']);
  assert.equal(manifest.icons[2].purpose,'maskable');
  for(const icon of manifest.icons){assert.ok(existsSync(`public${icon.src}`),`missing ${icon.src}`)}
  const html=readFileSync('index.html','utf8');
  assert.match(html,/rel="icon" href="\/icons\/servos-192\.svg"/);
  assert.match(html,/rel="apple-touch-icon" href="\/icons\/servos-192\.svg"/);
});

test('offline shell updates only at an explicit safe application boundary',()=>{
  const plugin=readFileSync('scripts/web-shell-plugin.ts','utf8');
  const registration=readFileSync('src/runtime/web/registerShell.ts','utf8');
  const app=readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  assert.match(plugin,/req\.method!==['"]GET['"]/);
  assert.match(plugin,/req\.headers\.has\(['"]Authorization['"]\)/);
  assert.match(plugin,/type==='SERVOS_ACTIVATE_UPDATE'/);
  assert.doesNotMatch(plugin,/skipWaiting\(\)\);\s*\}\);\s*self\.addEventListener\(['"]activate/);
  assert.doesNotMatch(registration,/VITE_ENABLE_WEB_OFFLINE/);
  assert.match(registration,/updateViaCache:'none'/);
  assert.match(registration,/servos:sw-update-ready/);
  assert.match(app,/if\(busy\|\|syncing\|\|submitInFlight\.current\)return/);
  assert.match(app,/SERVOS_ACTIVATE_UPDATE/);
});
