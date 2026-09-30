import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addBusinessDays, businessDateTimeInput, businessDateTimeToUtc, businessDate, businessDateStartUtc, formatBusinessDateTime } from '../src/utils/businessTime.ts';

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
});

test('reservation and manually recorded receipt flows use the property timezone contract', () => {
  const rooms = readFileSync('src/native/NativeRoomsView.tsx', 'utf8');
  const web = readFileSync('src/runtime/web/WebBusinessApp.tsx', 'utf8');
  const finance = readFileSync('src/runtime/web/WebFinancialControlsView.tsx', 'utf8');
  assert.match(rooms, /businessDateTimeToUtc\(v\.startsAt,timeZone\)/);
  assert.match(rooms, /data-business-timezone=\{timeZone\}/);
  assert.match(web, /businessDateTimeToUtc\(values\[field\.key\]||'',propertyTimeZone\)/);
  assert.match(finance, /businessDateTimeToUtc\(receipt\.receivedAt,timeZone\)/);
});

test('Terminal and Web Front Desk use property-local arrival/departure dates and show readiness blockers', () => {
  const terminalDesk = readFileSync('src/native/NativeFrontDeskView.tsx', 'utf8');
  const webDesk = readFileSync('src/runtime/web/WebHospitalityViews.tsx', 'utf8');
  assert.match(terminalDesk, /recordsOf\(s,'property'\)\[0\]/);
  assert.match(terminalDesk, /businessDate\(r\.startsAt,timeZone\)/);
  assert.match(terminalDesk, /overlapsDay\(r\.startsAt,[^,]+,d,timeZone\)/);
  assert.doesNotMatch(terminalDesk, /HOTEL_TZ|\+03:00/);
  assert.match(webDesk, /propertyTimeZone=String\(data\(active\(records,'property'\)\[0\]\)/);
  assert.match(webDesk, /housekeepingState==='CLEAN'/);
  assert.match(webDesk, /Check-in opens at the reservation arrival time/);
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
