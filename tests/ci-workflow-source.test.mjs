import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('CI names every active engine and uploads failure evidence',()=>{
  const workflow=readFileSync('.github/workflows/ci.yml','utf8');
  const evidence=readFileSync('scripts/write-ci-evidence.mjs','utf8');
  const candidate=readFileSync('scripts/write-release-candidate.mjs','utf8');
  const preview=readFileSync('playwright.config.ts','utf8');
  const production=readFileSync('playwright.production.config.ts','utf8');
  for(const job of ['frontend:','browser-preview:','browser-production:','native-domain:','cloud-protocol-base:','cloud-protocol-v2:','desktop-shell:','windows-printer-shell:','release-candidate:'])assert.match(workflow,new RegExp(`\\n  ${job}`));
  // The XP-80T USB transport is Windows-only FFI, so it needs a real Windows job
  // rather than the Linux stub.
  assert.match(workflow,/windows-printer-shell:[\s\S]*?runs-on: windows-latest/);
  assert.match(workflow,/cargo test --locked --manifest-path src-tauri\/Cargo\.toml --lib/);
  assert.match(workflow,/SERVOS_JOB_WINDOWS_PRINTER: \$\{\{ needs\.windows-printer-shell\.result \}\}/);
  assert.match(evidence,/windowsPrinter: process\.env\.SERVOS_JOB_WINDOWS_PRINTER/);
  assert.match(evidence,/windows-printer-\$\{artifactRunTag\}/);
  for(const command of ['npm run test:cloud:base','npm run test:cloud:v2','cargo test --locked --manifest-path native-tests/Cargo.toml','npm run check:desktop','npm run test:desktop','npm run test:browser:production'])assert.match(workflow,new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.ok((workflow.match(/name: Upload [^\n]+ evidence/g)||[]).length>=5);
  assert.ok((workflow.match(/if: always\(\)/g)||[]).length>=5);
  assert.match(workflow,/name: Install preview browser prerequisites[\s\S]*run: npx playwright install --with-deps chromium[\s\S]*name: Run preview browser suite/);
  assert.match(workflow,/name: Install production browser prerequisites[\s\S]*run: npx playwright install --with-deps chromium[\s\S]*name: Run production acceptance browser suite/);
  assert.match(workflow,/evidence-summary:[\s\S]*if: always\(\)[\s\S]*needs: \[frontend, browser-preview, browser-production, native-domain, cloud-protocol-base, cloud-protocol-v2, desktop-shell, windows-printer-shell\]/);
  assert.match(workflow,/release-candidate:[\s\S]*if: github\.ref == 'refs\/heads\/main'[\s\S]*needs: \[frontend, browser-preview, browser-production, native-domain, cloud-protocol-base, cloud-protocol-v2, desktop-shell, windows-printer-shell, evidence-summary\]/);
  for(const marker of ['SERVOS_JOB_FRONTEND','SERVOS_JOB_BROWSER_PREVIEW','SERVOS_JOB_BROWSER_PRODUCTION','SERVOS_JOB_NATIVE','SERVOS_JOB_CLOUD_BASE','SERVOS_JOB_CLOUD_V2','SERVOS_JOB_DESKTOP','SERVOS_JOB_WINDOWS_PRINTER'])assert.ok(workflow.includes(marker),marker);
  assert.match(evidence,/requiredChecksPassed/);
  assert.match(evidence,/runUrl/);
  assert.match(evidence,/browserProduction/);
  assert.match(workflow,/actions\/download-artifact@v4/);
  assert.match(evidence,/artifactChecksums/);
  assert.match(evidence,/missingRequiredArtifacts/);
  assert.match(evidence,/requiredArtifactsPresent/);
  assert.match(evidence,/artifactRunTag/);
  assert.match(workflow,/\$\{\{ github\.run_attempt \}\}/);
  assert.match(workflow,/native-domain\.log/);
  assert.match(workflow,/if-no-files-found: error/);
  assert.match(preview,/outputFolder: 'playwright-report\/preview'/);
  assert.match(production,/outputFolder: 'playwright-report\/production'/);
  assert.match(candidate,/Same-run CI evidence artifact is missing/);
  assert.match(candidate,/GITHUB_RUN_ATTEMPT/);
  assert.match(candidate,/requiredArtifactsPresent !== true/);
  assert.match(candidate,/artifactChecksums: ciEvidence\.artifactChecksums/);
  assert.match(candidate,/productionDeploymentAuthorized: false/);
  assert.match(candidate,/GITHUB_REF !== 'refs\/heads\/main'/);
});
