import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { addBusinessDays, businessDateTimeAfterBusinessDays, businessDateTimeInput, businessDateTimeToUtc, businessDate, businessDateStartUtc, formatBusinessDateTime } from '../src/utils/businessTime.ts';
import { roomReservationBlocker, stayCheckoutBlocker } from '../src/runtime/web/hospitalityAvailability.ts';

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

test('room reservation preview accounts for configured type, active blocks, bookings, and turnaround', () => {
  const base = { roomId:'r1',roomTypeId:'double',configuredRoomTypeId:'double',startsAt:'2030-01-02T10:30:00Z',endsAt:'2030-01-03T10:00:00Z',reservations:[],blocks:[] };
  assert.equal(roomReservationBlocker(base), null);
  assert.match(roomReservationBlocker({...base,configuredRoomTypeId:'suite'}), /configured room-stay type/);
  assert.match(roomReservationBlocker({...base,maintenanceState:'OUT_OF_ORDER'}), /out of service/);
  assert.match(roomReservationBlocker({...base,reservations:[{roomId:'r1',startsAt:'2030-01-01T10:00:00Z',endsAt:'2030-01-02T10:00:00Z',blockedUntil:'2030-01-02T11:00:00Z',status:'RESERVED'}]}), /turnaround/);
  assert.match(roomReservationBlocker({...base,blocks:[{roomId:'r1',startsAt:'2030-01-02T10:00:00Z',endsAt:'2030-01-02T12:00:00Z',status:'ACTIVE'}]}), /room block/);
});

test('Web Housekeeping uses queued, permission-gated room block and maintenance workflows', () => {
  const web = readFileSync('src/runtime/web/WebHospitalityViews.tsx', 'utf8');
  const manifest = readFileSync('src/runtime/operationManifest.ts', 'utf8');
  assert.match(web, /run\('room\.block','roomBlocks'/);
  assert.match(web, /run\('room\.unblock','roomBlocks'/);
  assert.match(web, /run\('maintenance\.report','maintenanceOrders'/);
  assert.match(web, /businessDateTimeToUtc\(blockStart,timeZone\)/);
  assert.match(web, /allowed\(session,'rooms\.manage'\)/);
  assert.match(web, /allowed\(session,'maintenance\.manage'\)/);
  assert.match(manifest, /operation: 'maintenance\.report'.*web: 'implemented'/);
});

test('checkout preview explains accommodation, balance, deposit, and stay-state blockers', () => {
  const ready={stayStatus:'CHECKED_IN',reservationStatus:'CHECKED_IN',folioStatus:'OPEN',balanceMinor:0,depositMinor:0,units:2,accommodationPeriods:[0,1]};
  assert.equal(stayCheckoutBlocker(ready),null);
  assert.match(stayCheckoutBlocker({...ready,accommodationPeriods:[0]}),/Post all booked accommodation periods/);
  assert.match(stayCheckoutBlocker({...ready,balanceMinor:1250}),/Settle the remaining guest-account balance/);
  assert.match(stayCheckoutBlocker({...ready,depositMinor:100}),/Apply or refund the remaining deposit/);
  assert.match(stayCheckoutBlocker({...ready,folioStatus:'CLOSED'}),/not open for checkout/);
  const web = readFileSync('src/runtime/web/WebHospitalityViews.tsx', 'utf8');
  assert.match(web, /const checkoutBlocker=\(record:BusinessRecord\)=>\{[\s\S]*?stayCheckoutBlocker/);
  assert.match(web, /Queue title="Checkout readiness"/);
  assert.match(web, /if\(blocker\)\{setNotice\(blocker\);return\}/);
});

test('staged Web session exposes only whitelisted hospitality property policy fields', () => {
  const contract = readFileSync('src/runtime/web/session.ts', 'utf8');
  const migration = readFileSync('supabase/expansion/023_hospitality_property_context.sql', 'utf8');
  const sqlTest = readFileSync('tests/supabase/web-session.sql', 'utf8');
  assert.match(contract, /propertyContext\?:\{timeZone:string;nightlyCheckoutTime:string;dayStayCutoffTime:string;roomTypeId:string\|null;ratePlanId:string\|null\}/);
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

test('staged Web modal consumers use the shared Dialog boundary',()=>{
  for (const file of ['src/runtime/web/WebCatalogInventory.tsx', 'src/runtime/web/WebProcurementView.tsx', 'src/runtime/web/WebRefundsView.tsx', 'src/runtime/web/WebPosView.tsx', 'src/runtime/web/WebFinancialControlsView.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /import \{Dialog\}/);
    assert.match(source, /<Dialog title=\{title\} onClose=\{onClose\}>/);
    assert.doesNotMatch(source, /<section role="dialog" aria-modal="true"/);
  }
});

test('WebBusinessApp editor keeps actions in the shared footer and associates them with its form',()=>{
  const source = readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  assert.match(source, /<Dialog title=\{editor\.title\}/);
  assert.match(source, /id="workflow-editor-form"/);
  assert.match(source, /form="workflow-editor-form"/);
  assert.match(source, /onClose=\{\(\)=>\{if\(!busy\)setEditor\(null\)\}\}/);
  assert.doesNotMatch(source, /<form role="dialog" aria-modal="true"/);
});

test('WebBusinessApp entity select fields use SearchCombobox IDs',()=>{
  const source = readFileSync('src/runtime/web/WebBusinessApp.tsx','utf8');
  assert.match(source, /import \{Dialog,SearchCombobox\}/);
  assert.match(source, /<SearchCombobox options=\{\[/);
  assert.match(source, /onValueChange=\{value=>setValues/);
  assert.match(source, /id:option\.value/);
});

test('Web staff role controls use searchable labels while preserving role IDs',()=>{
  const source = readFileSync('src/runtime/web/WebStaffAdminView.tsx','utf8');
  assert.match(source, /import \{SearchCombobox\}/);
  assert.match(source, /options=\{roles\.map\(value=>\(\{id:value,label:value\}\)\)\}/);
  assert.match(source, /onValueChange=\{role=>void run\('staff\.update'/);
  assert.doesNotMatch(source, /<select[^>]+Change \$\{String\(person\.data\.name\)\}/);
});

test('contextual help uses the shared Drawer accessibility boundary',()=>{
  const source = readFileSync('src/runtime/web/ContextHelpDrawer.tsx','utf8');
  assert.match(source, /import \{ Drawer \}/);
  assert.match(source, /<Drawer title=\{`\$\{workspace\} contextual help`\}/);
  assert.doesNotMatch(source, /<aside role="dialog"/);
});

test('RemoteManager selected-record panel uses the shared Drawer boundary',()=>{
  const source = readFileSync('src/runtime/RemoteManagerApp.tsx','utf8');
  assert.match(source, /import \{ Drawer \}/);
  assert.match(source, /<Drawer title=\{recordName\(selected\)\}/);
  assert.doesNotMatch(source, /<section className="absolute inset-y-0 right-0/);
});

test('Native manager approval uses the shared ActionDialog and busy dismissal guard',()=>{
  const source = readFileSync('src/native/ManagerApprovalDialog.tsx','utf8');
  assert.match(source, /import \{ ActionDialog \}/);
  assert.match(source, /<ActionDialog title="Manager approval"/);
  assert.match(source, /busy=\{busy\}/);
  assert.match(source, /footer=\{<><button type="button"/);
  assert.match(source, /onClick=\{approve\}/);
  assert.doesNotMatch(source, /mt-5 flex justify-end gap-2/);
  assert.match(source, /if\(!busy\)onClose\(\)/);
  assert.doesNotMatch(source, /fixed inset-0 z-\[200\].*role="dialog"/s);
});
