import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.GITHUB_REF !== 'refs/heads/main' || !process.env.GITHUB_SHA) {
  throw new Error('Release-candidate evidence can only be created by the gated main-branch workflow.');
}

const roots = ['supabase/migrations', 'supabase/expansion'];
const files = roots.flatMap(root => fs.existsSync(root)
  ? fs.readdirSync(root).filter(name => name.endsWith('.sql')).sort().map(name => path.join(root, name))
  : []);
const hash = crypto.createHash('sha256');
for (const file of files) hash.update(`\n-- ${file}\n${fs.readFileSync(file)}`);
const candidate = {
  sha: process.env.GITHUB_SHA || 'local',
  workflowRun: process.env.GITHUB_RUN_ID || null,
  runUrl: process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  profile: 'CI_PREVIEW_AND_STAGED_V2',
  schema: { files, sha256: hash.digest('hex') },
  eligibleForReview: true,
  productionDeploymentAuthorized: false,
  note: 'All required same-commit CI jobs passed. This artifact marks candidate eligibility only; it is not staging, hardware, hosted-live, or production-cutover approval.',
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/servos-release-candidate.json', `${JSON.stringify(candidate, null, 2)}\n`);
console.log(JSON.stringify(candidate, null, 2));
