import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['supabase/migrations', 'supabase/expansion'];
const files = roots.flatMap(root => fs.existsSync(root)
  ? fs.readdirSync(root).filter(name => name.endsWith('.sql')).sort().map(name => path.join(root, name))
  : []);
const hash = crypto.createHash('sha256');
for (const file of files) hash.update(`\n-- ${file}\n${fs.readFileSync(file)}`);
const evidence = {
  sha: process.env.GITHUB_SHA || 'local',
  workflow: process.env.GITHUB_WORKFLOW || 'local',
  run: process.env.GITHUB_RUN_ID || null,
  profile: process.env.SERVOS_RELEASE_PROFILE || 'CI_PREVIEW_AND_STAGED_V2',
  generatedAt: new Date().toISOString(),
  schema: { files, sha256: hash.digest('hex') },
  note: 'Metadata evidence only; individual job results and artifacts remain authoritative for engine acceptance.',
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/servos-ci-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
