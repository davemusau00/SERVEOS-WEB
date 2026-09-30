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
console.log(`Generated parity ledger for ${names.size} operations.`);
