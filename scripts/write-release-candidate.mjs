import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalMigrations, migrationPath } from './canonical-migrations.mjs';

if (process.env.GITHUB_REF !== 'refs/heads/main' || !process.env.GITHUB_SHA) {
  throw new Error('Release-candidate evidence can only be created by the gated main-branch workflow.');
}

const ciEvidenceName = `servos-ci-evidence-${process.env.GITHUB_SHA}-${process.env.GITHUB_RUN_ATTEMPT}`;
const ciEvidencePath = path.join('artifacts', 'downloaded', ciEvidenceName, 'servos-ci-evidence.json');
if (!fs.existsSync(ciEvidencePath)) throw new Error('Same-run CI evidence artifact is missing; candidate creation is blocked.');
const ciEvidence = JSON.parse(fs.readFileSync(ciEvidencePath, 'utf8'));
if (ciEvidence.sha !== process.env.GITHUB_SHA || String(ciEvidence.run) !== String(process.env.GITHUB_RUN_ID) || String(ciEvidence.runAttempt) !== String(process.env.GITHUB_RUN_ATTEMPT)) {
  throw new Error('CI evidence SHA or run ID does not match this candidate run.');
}
if (ciEvidence.requiredChecksPassed !== true || ciEvidence.requiredArtifactsPresent !== true || ciEvidence.candidateRequirementsMet !== true) {
  throw new Error('Required engine checks or same-commit evidence artifacts are incomplete; candidate creation is blocked.');
}

// The canonical migration set is a single directory; hashing both roots would double-count the
// staged v2 chain now that it also lives under supabase/migrations.
const files = canonicalMigrations().map(migrationPath);
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
  ciEvidence: {
    artifact: ciEvidenceName,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(ciEvidencePath)).digest('hex'),
    requiredArtifacts: ciEvidence.artifacts.names,
    artifactChecksums: ciEvidence.artifactChecksums,
  },
  eligibleForReview: true,
  productionDeploymentAuthorized: false,
  note: 'All required same-commit CI jobs passed. This artifact marks candidate eligibility only; it is not staging, hardware, hosted-live, or production-cutover approval.',
};
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync('artifacts/servos-release-candidate.json', `${JSON.stringify(candidate, null, 2)}\n`);
console.log(JSON.stringify(candidate, null, 2));
