import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalMigrations, migrationPath } from './canonical-migrations.mjs';

// Hash the canonical migration set only; supabase/expansion is the historic review source and
// would double-count the staged v2 chain now that it also lives under supabase/migrations.
const files = canonicalMigrations().map(migrationPath);
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
    // The Windows RAW spooler FFI only compiles on windows-latest. Recording it
    // here makes it a release gate rather than an optional extra job.
    windowsPrinter: process.env.SERVOS_JOB_WINDOWS_PRINTER || 'not-reported',
  },
  note: 'Evidence index only. Same-run job conclusions, schema inventory, artifact checksums, and required-artifact presence are recorded; underlying logs and artifacts remain authoritative for acceptance.',
};
const requiredJobs = Object.values(evidence.jobs);
evidence.requiredChecksPassed = requiredJobs.every(result => result === 'success');
const artifactRunTag = `${evidence.sha}-${evidence.runAttempt || 'local'}`;
const expectedArtifactNames = Object.values({
  uiAudit: `ui-audit-${artifactRunTag}`,
  browserPreview: `browser-preview-${artifactRunTag}`,
  browserProduction: `browser-production-${artifactRunTag}`,
  native: `native-domain-${artifactRunTag}`,
  cloudBase: `cloud-base-${artifactRunTag}`,
  cloudV2: `cloud-v2-${artifactRunTag}`,
  desktop: `desktop-shell-${artifactRunTag}`,
  windowsPrinter: `windows-printer-${artifactRunTag}`,
});
const downloadedRoot = 'artifacts/downloaded';
const downloadedNames = fs.existsSync(downloadedRoot)
  ? fs.readdirSync(downloadedRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  : [];
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
});
const downloadedFiles = fs.existsSync(downloadedRoot) ? walk(downloadedRoot).sort() : [];
const artifactChecksums = [];
const nativeToolchainVersions = new Set();
for (const file of downloadedFiles) {
  if (/\/(?:native-domain|desktop-shell)\.log$/.test(file.replaceAll('\\', '/'))) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (/^(?:rustc|cargo) /.test(line)) nativeToolchainVersions.add(line.trim());
    }
  }
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  artifactChecksums.push({
    artifact: path.relative(downloadedRoot, file).split(path.sep)[0],
    file: path.relative(downloadedRoot, file).replaceAll('\\', '/'),
    bytes: fs.statSync(file).size,
    sha256: digest.digest('hex'),
  });
}
evidence.runtime.rust = [...nativeToolchainVersions].sort();
evidence.artifactChecksums = artifactChecksums;
evidence.missingRequiredArtifacts = expectedArtifactNames.filter(name => !downloadedNames.includes(name));
evidence.requiredArtifactsPresent = evidence.missingRequiredArtifacts.length === 0 && artifactChecksums.length > 0;
evidence.candidateRequirementsMet = evidence.requiredChecksPassed && evidence.requiredArtifactsPresent;
evidence.artifacts = {
  runUrl: evidence.runUrl,
  names: expectedArtifactNames,
  missingRequired: evidence.missingRequiredArtifacts,
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/servos-ci-evidence.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
