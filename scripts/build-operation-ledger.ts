import fs from 'node:fs';
import { WEB_OPERATION_MANIFEST } from '../src/runtime/operationManifest.ts';

const required = ['operation','domain','permission','native','backend','web','offlineEligibility','approval','versioning','auditEffect','stockEffect','financialEffect','acceptanceTest','operatorUxStatus'] as const;
const names = new Set<string>();
for (const item of WEB_OPERATION_MANIFEST) {
  for (const field of required) if (!item[field]) throw new Error(`Parity ledger operation ${item.operation} is missing ${field}`);
  if (names.has(item.operation)) throw new Error(`Duplicate parity-ledger operation ${item.operation}`);
  names.add(item.operation);
}

const ledger = {
  schemaVersion: 1,
  source: 'src/runtime/operationManifest.ts',
  operations: WEB_OPERATION_MANIFEST.map(item => ({ ...item })),
};
const markdown = [
  '# Cross-client operation parity ledger',
  '',
  'Generated from `src/runtime/operationManifest.ts`. `backend` denotes the staged PostgreSQL dispatcher. Status describes source coverage, not deployment or acceptance evidence.',
  '',
  '| Operation | Domain | Permission | Native | Staged PostgreSQL | Web | Offline | Approval | Version | Audit | Stock | Financial | Operator UX | Acceptance evidence |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...WEB_OPERATION_MANIFEST.map(item => `| ${item.operation} | ${item.domain} | ${item.permission} | ${item.native} | ${item.backend} | ${item.web} | ${item.offlineEligibility} | ${item.approval} | ${item.versioning} | ${item.auditEffect} | ${item.stockEffect} | ${item.financialEffect} | ${item.operatorUxStatus} | ${item.acceptanceTest.replaceAll('|','\\|')} |`),
  '',
].join('\n');

fs.mkdirSync('docs/generated', { recursive: true });
fs.writeFileSync('docs/generated/OPERATION_PARITY_LEDGER.json', `${JSON.stringify(ledger,null,2)}\n`);
fs.writeFileSync('docs/generated/OPERATION_PARITY_LEDGER.md', markdown);

// Mandatory production Native cutover gate.
//
// Forcing the terminal through v2 turns any Native business mutation the Cloud v2
// dispatcher does not implement into a runtime PROTOCOL_UNSUPPORTED failure at
// the till. This gate fails the build rather than discovering that on hardware.
//
// Device-local operations (raw ESC/POS printing, SQLite backup) are excluded:
// they must never route through v2, and having no server handler is correct.
const sharedNativeMutations = WEB_OPERATION_MANIFEST.filter(
  item => item.native === 'implemented' && item.v2Routing === 'shared',
);
const localOnlyNative = WEB_OPERATION_MANIFEST.filter(
  item => item.native === 'implemented' && item.v2Routing === 'local-only',
);
const blockers = sharedNativeMutations.filter(item => item.backend !== 'implemented');
if (blockers.length) {
  console.error(
    `Native -> Cloud parity gate FAILED. ${blockers.length} Native business mutation(s) have no complete v2 handler:\n` +
      blockers.map(item => `  - ${item.operation} (backend: ${item.backend})`).join('\n') +
      `\nEvery shared operation the Native production UI emits must reach servos_v2 with the same meaning before SHARED_V2.`,
  );
  process.exit(1);
}

console.log(`Generated parity ledger for ${names.size} operations.`);
console.log(
  `Native -> Cloud parity gate passed: ${sharedNativeMutations.length} shared Native mutations have a complete v2 handler; ` +
  `${localOnlyNative.length} device-local operations (${localOnlyNative.map(item => item.operation).join(', ')}) are correctly excluded.`,
);
