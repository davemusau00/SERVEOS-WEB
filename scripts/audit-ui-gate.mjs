import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {disabledOpacityFinding} from './ui-audit-rules.mjs';

if (process.argv.includes('--fixture')) {
  const fixture=fs.readFileSync('tests/fixtures/ui-audit/disabled-opacity.tsx','utf8');
  if (!disabledOpacityFinding(fixture)) {
    console.error('UI gate fixture failed: seeded disabled-opacity violation was not detected.');
    process.exit(1);
  }
  console.error('UI gate fixture correctly rejected a seeded disabled-opacity violation.');
  process.exit(1);
}

const audit = spawnSync(process.execPath, ['scripts/audit-ui.mjs'], { stdio: 'inherit' });
if (audit.status !== 0) process.exit(audit.status ?? 1);
const report = JSON.parse(fs.readFileSync('artifacts/ui-audit/OPERATOR_UX_AUDIT.full.json', 'utf8'));
const forbidden = (report.findings || []).filter(f => f.rule === 'native-browser-prompt');
if (forbidden.length) {
  console.error(`UI gate failed: ${forbidden.length} production browser prompt/confirm use(s) remain.`);
  process.exit(1);
}
if (!Number.isInteger(report.interactionCount) || !Array.isArray(report.interactions)) {
  console.error('UI gate failed: invalid operator audit schema.');
  process.exit(1);
}
console.log(`UI gate passed: ${report.interactionCount} interactions inventoried; no browser prompt/confirm findings.`);
