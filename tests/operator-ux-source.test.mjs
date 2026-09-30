import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { addBusinessDays, businessDateTimeAfterBusinessDays, businessDateTimeInput, businessDateTimeToUtc, businessDate, businessDateStartUtc, formatBusinessDateTime } from '../src/utils/businessTime.ts';

test('business time conversion round-trips property wall time independently of host timezone', () => {
  const instant = businessDateTimeToUtc('2026-09-30T10:15', 'Africa/Nairobi');
  assert.equal(instant, '2026-09-30T07:15:00.000Z');
  assert.equal(businessDateTimeInput(instant, 'Africa/Nairobi'), '2026-09-30T10:15');
  assert.equal(businessDate(instant, 'Africa/Nairobi'), '2026-09-30');
});

test('business time conversion rejects invalid dates and DST gaps or repeated wall times', () => {
  assert.throws(() => businessDateTimeToUtc('2026-02-30T10:00', 'Africa/Nairobi'), /valid business date/);
  assert.throws(() => businessDateTimeToUtc('2026-03-08T02:30', 'America/New_York'), /does not exist/);
  assert.throws(() => businessDateTimeToUtc('2026-11-01T01:30', 'America/New_York'), /occurs twice/);
  assert.throws(() => businessDateTimeToUtc('2026-09-30T10:00', 'Not/A_Timezone'), /Unknown business timezone/);
});

test('hospitality calendar helpers use property dates rather than the host timezone', () => {
  assert.equal(addBusinessDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addBusinessDays('2028-02-28', 1), '2028-02-29');
  assert.throws(() => addBusinessDays('2026-02-30', 1), /valid business date/);
  assert.equal(businessDateStartUtc('2026-09-30', 'Pacific/Kiritimati'), '2026-09-29T10:00:00.000Z');
  assert.match(formatBusinessDateTime('2026-09-30T10:15:00.000Z', 'Pacific/Kiritimati'), /1 Oct 2026/);
  const departure = businessDateTimeAfterBusinessDays('2026-09-30T20:00:00.000Z', 1, '10:00', 'Pacific/Kiritimati');
  assert.equal(businessDateTimeInput(departure, 'Pacific/Kiritimati'), '2026-10-02T10:00');
});

test('reservation and manually recorded receipt flows use the property timezone contract', () => {
  const rooms = readFileSync('src/native/NativeRoomsView.tsx', 'utf8');
  const web = readFileSync('src/runtime/web/WebBusinessApp.tsx', 'utf8');
  const finance = readFileSync('src/runtime/web/WebFinancialControlsView.tsx', 'utf8');
  assert.match(rooms, /businessDateTimeToUtc\(v\.startsAt,timeZone\)/);
  assert.match(rooms, /data-business-timezone=\{timeZone\}/);
  assert.match(web, /businessDateTimeToUtc\(values\[field\.key\]||'',propertyTimeZone\)/);
  assert.match(web, /businessDateTimeAfterBusinessDays\(arrival,1,checkout,propertyTimeZone\)/);
  assert.match(finance, /businessDateTimeToUtc\(receipt\.receivedAt,timeZone\)/);
});

test('Terminal and Web Front Desk use property-local arrival/departure dates and show readiness blockers', () => {
  const terminalDesk = readFileSync('src/native/NativeFrontDeskView.tsx', 'utf8');
  const webDesk = readFileSync('src/runtime/web/WebHospitalityViews.tsx', 'utf8');
  assert.match(terminalDesk, /recordsOf\(s,'property'\)\[0\]/);
  assert.match(terminalDesk, /businessDate\(r\.startsAt,timeZone\)/);
  assert.match(terminalDesk, /overlapsDay\(r\.startsAt,[^,]+,d,timeZone\)/);
  assert.doesNotMatch(terminalDesk, /HOTEL_TZ|\+03:00/);
  assert.match(webDesk, /session\.propertyContext\?\.timeZone/);
  assert.match(webDesk, /housekeepingState==='CLEAN'/);
  assert.match(webDesk, /Check-in opens at the reservation arrival time/);
});

test('staged Web session exposes only whitelisted hospitality property policy fields', () => {
  const contract = readFileSync('src/runtime/web/session.ts', 'utf8');
  const migration = readFileSync('supabase/expansion/023_hospitality_property_context.sql', 'utf8');
  const sqlTest = readFileSync('tests/supabase/web-session.sql', 'utf8');
  assert.match(contract, /propertyContext\?:\{timeZone:string;nightlyCheckoutTime:string;dayStayCutoffTime:string\}/);
  for (const field of ['timeZone', 'nightlyCheckoutTime', 'dayStayCutoffTime']) assert.match(migration, new RegExp(`'${field}'`));
  assert.match(migration, /property_data->>'timezone'/);
  assert.match(sqlTest, /SENSITIVE-TEST-VALUE/);
});

test('operation parity manifest includes acceptance and operator audit metadata', () => {
  const manifest = readFileSync('src/runtime/operationManifest.ts', 'utf8');
  for (const field of ['offlineEligibility', 'approval', 'versioning', 'auditEffect', 'stockEffect', 'financialEffect', 'acceptanceTest', 'operatorUxStatus']) assert.match(manifest, new RegExp(field));
  assert.match(manifest, /Unknown is intentional until a workflow has evidence/);
});

test('shared design controls and generated operator audit are part of the P0/P1 contract', () => {
  const controls = readFileSync('src/design-system/controls.tsx', 'utf8');
  const audit = readFileSync('scripts/audit-ui.mjs', 'utf8');
  for (const name of ['Dialog', 'Drawer', 'FormField', 'SearchCombobox', 'MoneyInput', 'QuantityInput', 'BusinessDateTimeField', 'BusyButton', 'BlockerCard', 'RecoveryAction', 'ConflictNotice', 'SyncState']) assert.match(controls, new RegExp(`export function ${name}`));
  assert.match(audit, /OPERATOR_UX_AUDIT\.json/);
  assert.match(audit, /window\\\./);
  for (const rule of ['raw-technical-error-review', 'excessive-required-fields', 'disabled-action-explanation-review', 'custom-overlay-review', 'form-busy-state-review', 'business-time-input']) assert.match(audit, new RegExp(rule));
});

test('UI gate detects a seeded disabled-opacity violation',()=>{
  const result=spawnSync(process.execPath,['scripts/audit-ui-gate.mjs','--fixture'],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(`${result.stdout}${result.stderr}`,/seeded disabled-opacity violation/);
});

test('legacy catalog and outlet actions use typed in-app dialogs instead of browser prompts',()=>{
  const catalog = readFileSync('src/components/catalog/CatalogStudioView.tsx','utf8');
  const settings = readFileSync('src/components/settings/SettingsCenterView.tsx','utf8');
  const staff = readFileSync('src/components/staff/StaffCashView.tsx','utf8');
  const inventory = readFileSync('src/components/inventory/InventoryView.tsx','utf8');
  assert.doesNotMatch(catalog, /\bconfirm\s*\(/);
  assert.doesNotMatch(settings, /\bprompt\s*\(/);
  assert.doesNotMatch(staff, /\bconfirm\s*\(/);
  assert.doesNotMatch(inventory, /\bconfirm\s*\(/);
  assert.match(catalog, /deleteCandidate/);
  assert.match(settings, /renameCandidate/);
  assert.match(staff, /deleteCandidate/);
  assert.match(inventory, /deleteCandidate/);
});

test('native close-save failure remains recoverable in an in-app dialog',()=>{
  const runtime = readFileSync('src/runtime/RuntimeProvider.tsx','utf8');
  assert.doesNotMatch(runtime, /window\.alert\s*\(/);
  assert.match(runtime, /Local work could not be saved/);
  assert.match(runtime, /Retry save and close/);
  assert.match(runtime, /Keep working/);
  assert.match(runtime, /allowClose\.current/);
});

test('SearchCombobox exposes an accessible identity-bearing selector contract',()=>{
  const controls = readFileSync('src/design-system/controls.tsx','utf8');
  assert.match(controls, /export interface SearchComboboxOption/);
  for (const attribute of ['role="combobox"', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'role="listbox"', 'role="option"']) assert.match(controls, new RegExp(attribute.replace(/["\\]/g, '\\$&')));
  for (const state of ['loading', 'error', 'emptyLabel', 'onCreate', 'onValueChange']) assert.match(controls, new RegExp(state));
});

test('shared Drawer traps focus and restores it after Escape or close',()=>{
  const controls = readFileSync('src/design-system/controls.tsx','utf8');
  const drawer = controls.slice(controls.indexOf('export function Drawer'), controls.indexOf('export function FormField'));
  assert.match(drawer, /role="dialog" aria-modal="true" aria-labelledby=/);
  assert.match(drawer, /event\.key === 'Escape'/);
  assert.match(drawer, /document\.addEventListener\('keydown'/);
  assert.match(drawer, /previous\?\.focus\(\)/);
  assert.match(drawer, /event\.key !== 'Tab'/);
});
