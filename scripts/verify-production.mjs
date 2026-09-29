import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const required=['src/native/NativeRoot.tsx','src/native/NativeBarShell.tsx','src-tauri/migrations/002_bar_v2.sql','docs/BAR_PRODUCTION_ACCEPTANCE.md'];
for(const f of required)if(!fs.existsSync(f))throw new Error(`Missing production file: ${f}`);
const checks=[['node',['scripts/build-help-index.mjs']],['node',['scripts/docs-check.mjs']],['node',['scripts/audit-ui.mjs']],['node',['--test','tests/*.test.mjs']]];
let failed=false;
for(const [cmd,args] of checks){console.log(`\n> ${cmd} ${args.join(' ')}`);const r=spawnSync(cmd,args,{stdio:'inherit',shell:true});if(r.status!==0)failed=true;}
if(failed)process.exit(1);
console.log('\nDependency-independent ServOS source verification passed.');
console.log('Run npm ci && npm run verify on the target development machine for the full frontend/browser/native gate.');
