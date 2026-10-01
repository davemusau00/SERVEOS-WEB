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
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  runUrl: process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  event: process.env.GITHUB_EVENT_NAME || null,
  ref: process.env.GITHUB_REF || null,
  profile: process.env.SERVOS_RELEASE_PROFILE || 'CI_PREVIEW_AND_STAGED_V2',
  generatedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  schema: { files, sha256: hash.digest('hex') },
  jobs: {
    frontend: process.env.SERVOS_JOB_FRONTEND || 'not-reported',
    browserPreview: process.env.SERVOS_JOB_BROWSER_PREVIEW || 'not-reported',
    browserProduction: process.env.SERVOS_JOB_BROWSER_PRODUCTION || 'not-reported',
    native: process.env.SERVOS_JOB_NATIVE || 'not-reported',
    cloudBase: process.env.SERVOS_JOB_CLOUD_BASE || 'not-reported',
    cloudV2: process.env.SERVOS_JOB_CLOUD_V2 || 'not-reported',
    desktop: process.env.SERVOS_JOB_DESKTOP || 'not-reported',
  },
  note: 'Evidence index only. Job statuses and named artifacts are recorded; job logs and artifacts remain authoritative for acceptance.',
};
const requiredJobs = Object.values(evidence.jobs);
evidence.requiredChecksPassed = requiredJobs.every(result => result === 'success');
evidence.artifacts = {
  runUrl: evidence.runUrl,
  uiAudit: `ui-audit-${evidence.sha}`,
  browserPreview: `browser-preview-${evidence.sha}`,
  browserProduction: `browser-production-${evidence.sha}`,
  native: `native-domain-${evidence.sha}`,
  cloudBase: `cloud-base-${evidence.sha}`,
  cloudV2: `cloud-v2-${evidence.sha}`,
  desktop: `desktop-shell-${evidence.sha}`,
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/servos-ci-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
