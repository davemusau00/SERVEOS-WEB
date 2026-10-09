import React, { useEffect, useState } from 'react';
import { allowed, type BusinessRecord, type WebSession } from './session';
import { SearchCombobox } from '../../design-system/controls';
import { isCommandConfirmed, type CommandOutcome } from '../../types/transactions';
import { operatorError } from './operatorError';
import { WebActionDialog, type WebActionField } from './WebActionDialog';

type CommandFn = (operation: string, collection: string, id: string, payload: Record<string, unknown>) => Promise<CommandOutcome>;
type Device = { id: string; name: string; class: string; ownerId: string; active: boolean; lastSequence: number | null; lastSeenAt: string | null; telemetryAvailable: boolean; protocolVersion: number; createdAt: string };
type StaffAction = { kind: 'REVOKE_DEVICE'; device: Device; record: BusinessRecord } | { kind: 'DEACTIVATE_STAFF'; person: BusinessRecord };

const input = 'w-full rounded-lg border border-slate-600 bg-slate-950 p-2 text-white';
const button = 'rounded-lg border border-slate-600 px-3 py-2 disabled:opacity-40';
const roles = ['Admin', 'Manager', 'Cashier', 'Server', 'Chef', 'Housekeeper', 'Accountant', 'Custom'];
const roleGuidance: Record<string, string> = {
  Admin: 'Business setup, staff/device administration and broad operational access.',
  Manager: 'Shift oversight and approvals; sensitive actions remain permission- and approval-gated.',
  Cashier: 'Till, payment and sales tasks assigned to the cashier workflow.',
  Server: 'Guest service and order entry without administration tools.',
  Chef: 'Kitchen display and preparation workflows.',
  Housekeeper: 'Room readiness and housekeeping tasks.',
  Accountant: 'Finance, reconciliation and reporting tasks.',
  Custom: 'Use only when the business has explicitly configured a custom permission profile.',
};
const permissions = ['procurement.over_receive', 'order.discount', 'order.comp', 'order.void', 'payment.reverse', 'till.override_variance', 'folio.reverse', 'credit.write_off', 'credit.override_limit', 'mpesa.reconcile', 'finance.expense.approve'];
const outcomeText = (outcome: CommandOutcome) => {
  switch (outcome.kind) {
    case 'CONFIRMED': return 'Staff or device action confirmed and synchronized.';
    case 'DRAFT_SAVED': return 'Action saved as a draft; it has not taken effect.';
    case 'PENDING': return 'Action is waiting to synchronize. Do not submit it again.';
    case 'OUTCOME_UNKNOWN':
    case 'REJECTED':
    case 'CONFLICT':
    case 'BLOCKED': return outcome.message;
  }
};

export function WebStaffAdminView({ records, session, disabled, command, currentDeviceId }: {
  records: BusinessRecord[];
  session: WebSession;
  disabled: boolean;
  command: CommandFn;
  currentDeviceId: string;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [outcome, setOutcome] = useState<CommandOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [staffAction, setStaffAction] = useState<StaffAction | null>(null);
  const [staffId, setStaffId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [role, setRole] = useState('Server');
  const [loginName, setLoginName] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [customPermissions, setCustomPermissions] = useState('');
  const [initiatorId, setInitiatorId] = useState('');
  const [approvalPermission, setApprovalPermission] = useState(permissions[0]);
  const [approvalTarget, setApprovalTarget] = useState('');
  const staff = records.filter(record => record.collection === 'employees');

  const loadDevices = async () => {
    setDevices(records.filter(row => row.collection === 'enrolledDevices').map(row => ({
      id: row.id,
      name: String(row.data.name || row.id),
      class: String(row.data.class || 'BROWSER'),
      ownerId: String(row.data.staffId || ''),
      active: row.archived !== true,
      lastSequence: Number.isSafeInteger(row.data.lastSequence) ? Number(row.data.lastSequence) : null,
      lastSeenAt: typeof row.data.lastSeenAt === 'string' ? row.data.lastSeenAt : null,
      telemetryAvailable: row.data.telemetryAvailable === true,
      protocolVersion: Number(row.data.protocolVersion || 1),
      createdAt: String(row.data.createdAt || ''),
    })));
  };

  useEffect(() => { void loadDevices(); }, [session.actorId, session.policyVersion, records]);

  const run = async (operation: string, id: string, payload: Record<string, unknown>, collection = 'employees'): Promise<CommandOutcome> => {
    if (disabled || busy) {
      const blocked: CommandOutcome = { kind: 'BLOCKED', message: 'Wait for the current staff or device action before submitting another.' };
      setOutcome(blocked);
      return blocked;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setOutcome(null);
    try {
      const result = await command(operation, collection, id, payload);
      setOutcome(result);
      if (isCommandConfirmed(result)) await loadDevices();
      return result;
    } catch (cause) {
      const blocked: CommandOutcome = { kind: 'BLOCKED', message: `The action could not be confirmed. ${operatorError(cause)} Review Activity before retrying.` };
      setOutcome(blocked);
      return blocked;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const stableStaffId = staffId.trim();
    const staffName = name.trim();
    const login = loginName.trim();
    if (!stableStaffId || !staffName) { setError('Enter the stable staff ID and staff name.'); return; }
    if (!login || initialPassword.length < 12) { setError('Enter an API login name and an initial password of at least 12 characters.'); return; }
    const grants = customPermissions.split(',').map(value => value.trim()).filter(Boolean);
    const result = await run('staff.create', stableStaffId, {
      id: stableStaffId,
      staffId: stableStaffId,
      loginName: login,
      displayName: staffName,
      role,
      initialPassword,
      permissions: grants,
      reason: 'Created by staff administrator',
      expectedVersions: [{ collection: 'employees', id: stableStaffId, version: 0 }],
    });
    if (isCommandConfirmed(result)) {
      setStaffId(crypto.randomUUID());
      setName('');
      setLoginName('');
      setInitialPassword('');
      setCustomPermissions('');
    }
  };

  const approve = async () => {
    if (!initiatorId.trim() || !approvalTarget.trim()) return;
    const token = crypto.randomUUID();
    const result = await run('managerApproval.issue', token, {
      id: token,
      recipientStaffId: initiatorId.trim(),
      permission: approvalPermission,
      target: approvalTarget.trim(),
      approvalToken: token,
    });
    if (isCommandConfirmed(result)) {
      setNotice(`Approval token (expires in 5 minutes): ${token}. Share it directly with the named operator; it is single-use and action/target bound.`);
      await navigator.clipboard?.writeText(token).catch(() => undefined);
    }
  };

  const revoke = async (device: Device) => {
    if (device.id === currentDeviceId) { setError('This browser cannot revoke its own active device. Use a different trusted device.'); return; }
    const record = records.find(item => item.collection === 'enrolledDevices' && item.id === device.id);
    if (record) setStaffAction({ kind: 'REVOKE_DEVICE', device, record });
  };

  const changeRole = async (person: BusinessRecord, nextRole: string) => {
    const result = await run('staff.update', person.id, {
      id: person.id,
      staffId: person.id,
      displayName: String(person.data.name || person.data.displayName || ''),
      role: nextRole,
      permissions: [],
      reason: 'Role changed by staff administrator',
      expectedVersions: [{ collection: 'employees', id: person.id, version: person.version }],
    });
    if (!isCommandConfirmed(result)) setError('The API staff role change needs review.');
  };

  const staffActionFields: WebActionField[] = staffAction ? [{
    name: 'reason',
    label: staffAction.kind === 'REVOKE_DEVICE' ? 'Reason for revoking this device' : 'Reason for deactivating this staff account',
    multiline: true,
    minLength: 3,
    maxLength: 500,
  }] : [];

  const submitStaffAction = async (values: Record<string, string>) => {
    const action = staffAction;
    if (!action) return;
    if (action.kind === 'REVOKE_DEVICE') {
      const result = await run('device.revoke', action.device.id, {
        id: action.device.id,
        deviceId: action.device.id,
        reason: values.reason.trim(),
        expectedVersions: [{ collection: 'enrolledDevices', id: action.device.id, version: action.record.version }],
      }, 'enrolledDevices');
      if (isCommandConfirmed(result)) setNotice('API device revoked; its active sessions can no longer use it.');
      return;
    }
    const result = await run('staff.deactivate', action.person.id, {
      id: action.person.id,
      staffId: action.person.id,
      reason: values.reason.trim(),
      expectedVersions: [{ collection: 'employees', id: action.person.id, version: action.person.version }],
    });
    if (!isCommandConfirmed(result)) setError('The API staff deactivation needs review.');
  };

  return <section className="space-y-6" aria-label="Staff and device administration">
    <header><h2 className="text-xl font-bold">Staff, approvals and devices</h2><p className="mt-1 text-sm text-slate-400">API staff sign-ins and server permissions are managed by ServOS. New staff must change their initial password at first sign-in.</p></header>
    {outcome && <p role={['OUTCOME_UNKNOWN', 'REJECTED', 'CONFLICT', 'BLOCKED'].includes(outcome.kind) ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${outcome.kind === 'CONFIRMED' ? 'border-emerald-800 bg-emerald-950' : 'border-amber-800 bg-amber-950'}`}>{outcomeText(outcome)}</p>}
    {error && <p role="alert" className="rounded-lg border border-rose-800 bg-rose-950 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="break-all rounded-lg border border-emerald-800 p-3 text-sm">{notice}</p>}
    {allowed(session, 'staff.create') && <form className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void create(); }}>
      <h3 className="font-semibold sm:col-span-2">Create API staff sign-in</h3>
      <label className="text-sm">API login name<input required maxLength={120} autoComplete="off" className={input} value={loginName} onChange={event => setLoginName(event.target.value)} /></label>
      <label className="text-sm">Initial password (12 characters minimum)<input required minLength={12} type="password" autoComplete="new-password" className={input} value={initialPassword} onChange={event => setInitialPassword(event.target.value)} /></label>
      <div className="text-sm"><label htmlFor="generated-staff-id">Stable staff ID</label><input id="generated-staff-id" required className={`${input} font-mono text-xs`} value={staffId} onChange={event => setStaffId(event.target.value)} /><p className="mt-1 text-xs text-slate-400">For an existing employee, enter their exact Staff ID; this is not a password or device credential.</p><button type="button" className={`${button} mt-2`} onClick={() => setStaffId(crypto.randomUUID())}>Generate staff ID</button></div>
      <label className="text-sm">Name<input required className={input} value={name} onChange={event => setName(event.target.value)} /></label>
      <div className="text-sm"><label>Role template<SearchCombobox options={roles.filter(value => value !== 'Admin').map(value => ({ id: value, label: value }))} value={role === 'Admin' ? 'Manager' : role} onValueChange={setRole} /></label><p className="mt-1 text-xs text-slate-400">{roleGuidance[role]}</p></div>
      {role === 'Custom' && <label className="text-sm sm:col-span-2">Custom permission grants (comma separated)<textarea className={input} value={customPermissions} onChange={event => setCustomPermissions(event.target.value)} /></label>}
      <button disabled={disabled || busy} className={`${button} sm:col-span-2`}>Create staff sign-in</button>
    </form>}
    <div className="space-y-2"><h3 className="font-semibold">Staff profiles</h3>{staff.map(person => <article key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-3"><div><b>{String(person.data.name || person.id)}</b><p className="text-xs text-slate-400">{String(person.data.role)} · {person.archived ? 'Inactive' : 'Active'} · {String(person.data.loginName || 'Login not configured')}</p></div><div className="flex flex-wrap gap-2">{!person.archived && allowed(session, 'staff.change_role') && <SearchCombobox aria-label={`Change ${String(person.data.name)} role`} className="min-w-36" options={roles.filter(value => value !== 'Admin').map(value => ({ id: value, label: value }))} value={String(person.data.role)} disabled={disabled || busy} onValueChange={nextRole => void changeRole(person, nextRole)} />}{allowed(session, 'staff.deactivate') && !person.archived && <button disabled={disabled || busy || person.id === session.actorId} className={button} onClick={() => setStaffAction({ kind: 'DEACTIVATE_STAFF', person })}>Deactivate</button>}</div></article>)}{!staff.length && <p className="text-sm text-slate-500">No staff profiles are visible to this role.</p>}</div>
    {allowed(session, 'staff.update') && <form className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void approve(); }}>
      <h3 className="font-semibold sm:col-span-2">Issue manager approval</h3>
      <label className="text-sm">Recipient<select required className={input} value={initiatorId} onChange={event => setInitiatorId(event.target.value)}><option value="">Choose staff member</option>{staff.filter(person => !person.archived && person.id !== session.actorId).map(person => <option key={person.id} value={person.id}>{String(person.data.name)} · {String(person.data.role)}</option>)}</select></label>
      <label className="text-sm">Action<select className={input} value={approvalPermission} onChange={event => setApprovalPermission(event.target.value)}>{permissions.map(permission => <option key={permission}>{permission}</option>)}</select></label>
      <label className="text-sm sm:col-span-2">Exact target ID<input required className={input} value={approvalTarget} onChange={event => setApprovalTarget(event.target.value)} /></label>
      <button disabled={disabled || busy} className={`${button} sm:col-span-2`}>Issue five-minute one-time approval</button>
    </form>}
    {allowed(session, 'devices.manage') && <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-semibold">API enrolled devices</h3><button className={button} onClick={() => void loadDevices()}>Refresh</button></div>{devices.map(device => <article key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-3"><div className="min-w-0"><b>{device.name}</b><p className="break-all font-mono text-xs text-slate-400">{device.id} · {device.class} · protocol {device.protocolVersion}</p><p className="text-xs text-slate-500">Owner {device.ownerId} · sequence {device.lastSequence ?? 'not tracked'} · last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : device.telemetryAvailable ? 'not yet' : 'not tracked'}</p></div><div className="flex items-center gap-2"><span>{device.active ? 'Active' : 'Revoked'}</span>{device.active && <button disabled={disabled || busy || device.id === currentDeviceId} className={button} onClick={() => void revoke(device)}>Revoke</button>}</div></article>)}</div>}
    {staff.some(person => person.data.role === 'Admin' && person.data.active !== false) && !staff.some(person => person.data.role === 'Admin' && !person.archived) && <p className="text-sm text-amber-300">An Admin profile is marked inactive; verify that another active Admin remains before continuing.</p>}
    {staffAction && <WebActionDialog title={staffAction.kind === 'REVOKE_DEVICE' ? `Revoke ${staffAction.device.name}?` : `Deactivate ${String(staffAction.person.data.name || staffAction.person.id)}?`} description={staffAction.kind === 'REVOKE_DEVICE' ? 'The device and its linked active sessions will lose access. Record why it is being revoked.' : 'The staff account will lose access and its active sessions and devices will be revoked.'} fields={staffActionFields} confirmLabel={staffAction.kind === 'REVOKE_DEVICE' ? 'Revoke device' : 'Deactivate staff'} danger disabled={disabled || busy} onClose={() => setStaffAction(null)} onConfirm={submitStaffAction} />}
  </section>;
}
