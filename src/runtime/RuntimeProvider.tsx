import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { flushLocalWork } from './localWork';
import { Dialog } from '../design-system/controls';
import type { ReceiptResponse, ReceiptSummary } from '../types/receipt';
import type { ImportApplyPlan, ImportBatchDetail, ImportBatchSummary, StageImportInput } from '../types/imports';
import type { BusinessCommand, CommandResult, IntakeProfile, ManagerApproval, Permission, PrinterJobResult, ProductionHealthAudit, ReconciliationReport, RuntimeSession, RuntimeSnapshot, RuntimeStatus, TerminalAcceptanceStatus } from '../types/runtime';

export interface GuidanceProgress {
  guideId: string;
  guideVersion: number;
  state: 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
  currentStepId: string | null;
  completedStepIds: string[];
  updatedAt?: string;
}

export interface InventoryCountDraft {
  sessionId: string;
  revision: number;
  baseline: Record<string, { name: string; baseUnit: string; scanUnitQuantity: number; expectedQuantity: number }>;
  pendingCommand?: { id: string; payload: Record<string, unknown> };
  locationId: string;
  counts: Record<string, number>;
  scanCounts: Record<string, number>;
  unknownScans: { barcode: string; count: number }[];
  updatedAt?: string;
}

export const isNative = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface RuntimeContextValue {
  status: RuntimeStatus | null;
  session: RuntimeSession | null;
  snapshot: RuntimeSnapshot | null;
  error: string;
  syncing: boolean;
  busy: boolean;
  reloadStatus: () => Promise<void>;
  saveIntake: (profile: IntakeProfile) => Promise<void>;
  completeIntake: (profile: IntakeProfile) => Promise<void>;
  reopenIntake: () => Promise<void>;
  enroll: (input: { email: string; password: string; pin: string }) => Promise<void>;
  login: (staffId: string, pin: string, email: string, password: string) => Promise<void>;
  lock: () => Promise<void>;
  refresh: () => Promise<void>;
  command: (operation: string, payload?: Record<string, unknown>, targetVersion?: number, commandId?: string) => Promise<CommandResult>;
  guidanceProgress: () => Promise<GuidanceProgress[]>;
  saveGuidanceProgress: (progress: GuidanceProgress) => Promise<GuidanceProgress>;
  inventoryCountDraft: (locationId: string) => Promise<InventoryCountDraft | null>;
  saveInventoryCountDraft: (locationId: string, draft: InventoryCountDraft) => Promise<InventoryCountDraft>;
  clearInventoryCountDraft: (locationId: string) => Promise<void>;
  approve: (approverId: string, pin: string, permission: Permission, target?: string) => Promise<ManagerApproval>;
  sync: () => Promise<void>;
  installV2Snapshot: () => Promise<{ installed:boolean; records:number; cursor:number; policyVersion:string; pageCount:number }>;
  backup: () => Promise<string>;
  healthAudit: () => Promise<ProductionHealthAudit>;
  acceptanceStatus: () => Promise<TerminalAcceptanceStatus>;
  acceptanceAction: (action: string, payload?: Record<string, unknown>) => Promise<TerminalAcceptanceStatus>;
  importBatches: () => Promise<ImportBatchSummary[]>;
  importBatch: (id: string) => Promise<ImportBatchDetail>;
  stageImport: (input: StageImportInput) => Promise<ImportBatchDetail>;
  cancelImport: (id: string) => Promise<void>;
  planImport: (batchId: string) => Promise<ImportApplyPlan>;
  importPlan: (planId: string) => Promise<ImportApplyPlan>;
  applyImport: (planId: string) => Promise<ImportApplyPlan>;
  reconcile: () => Promise<ReconciliationReport>;
  receipt: (orderId: string, receiptId?: string) => Promise<ReceiptResponse>;
  receiptHistory: () => Promise<ReceiptSummary[]>;
  printReceipt: (input: { orderId: string; receiptId: string; reprint: boolean }) => Promise<PrinterJobResult>;
  testPrinter: () => Promise<PrinterJobResult>;
  retryPrinterJob: (jobId: string, confirmDuplicate?: boolean) => Promise<PrinterJobResult>;
  printerJobs: () => Promise<PrinterJobResult[]>;
  clearError: () => void;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);
export const useRuntime = () => {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error('RuntimeProvider is required');
  return value;
};

export const RuntimeProvider = ({ children }: { children: React.ReactNode }) => {
  const [closeFailure, setCloseFailure] = useState<string | null>(null);
  const [closeRetrying, setCloseRetrying] = useState(false);
  const allowClose = useRef(false);
  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    const registered = Promise.resolve().then(() => getCurrentWindow().onCloseRequested(async event => {
      if (allowClose.current) return;
      event.preventDefault();
      try { await flushLocalWork(); allowClose.current = true; await getCurrentWindow().close(); }
      catch (cause) { allowClose.current = false; setCloseFailure(String(cause)); }
    }));
    void registered.then(unlisten => { if (disposed) unlisten(); }).catch(() => {});
    return () => { disposed = true; void registered.then(unlisten => { if (!disposed) return; unlisten(); }).catch(() => {}); };
  }, []);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [session, setSession] = useState<RuntimeSession | null>(null);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastActivity = useRef(Date.now());
  const inFlight = useRef(false);
  const nextSync = useRef(0);
  const nextAuthRefresh = useRef(0);
  const failures = useRef(0);

  const retryClose = async () => {
    setCloseRetrying(true);
    try { await flushLocalWork(); allowClose.current = true; await getCurrentWindow().close(); }
    catch (cause) { allowClose.current = false; setCloseFailure(String(cause)); }
    finally { setCloseRetrying(false); }
  };

  const report = useCallback((e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    setError(message);
    if (message.includes('SESSION_EXPIRED')) { setSession(null); setSnapshot(null); }
  }, []);

  const reloadStatus = useCallback(async () => {
    if (!isNative) return;
    const next = await invoke<RuntimeStatus>('runtime_status');
    setStatus(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!session || !isNative) return;
    const next = await invoke<RuntimeSnapshot>('runtime_snapshot', { token: session.token });
    setSnapshot(next);
    setStatus(current => current ? { ...current, installationStage: next.installationStage } : current);
  }, [session]);

  useEffect(() => { if (isNative) void reloadStatus().catch(report); }, [reloadStatus, report]);

  const saveIntake = async (profile: IntakeProfile) => {
    setBusy(true); setError('');
    try { await invoke('runtime_intake_save', { profile }); await reloadStatus(); }
    catch (e) { report(e); throw e; } finally { setBusy(false); }
  };
  const completeIntake = async (profile: IntakeProfile) => {
    setBusy(true); setError('');
    try { await invoke('runtime_intake_complete', { profile }); await reloadStatus(); }
    catch (e) { report(e); throw e; } finally { setBusy(false); }
  };
  const reopenIntake = async () => {
    setBusy(true); setError('');
    try { await invoke('runtime_intake_reopen'); await reloadStatus(); }
    catch (e) { report(e); throw e; } finally { setBusy(false); }
  };
  const enroll = async ({ email, password, pin }: { email: string; password: string; pin: string }) => {
    setBusy(true); setError('');
    try {
      if (!status?.intakeProfile) throw new Error('Complete terminal Intake before enrollment.');
      const url = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !publishableKey) throw new Error('This installation has no business server configured. Configure .env.local before enrollment.');
      const response = await fetch(`${url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const auth = await response.json();
      if (!response.ok || !auth.access_token) throw new Error(auth?.msg || auth?.error_description || 'Owner sign-in failed');
      await invoke('runtime_enroll', { url, publishableKey, accessToken: auth.access_token, pin });
      await reloadStatus();
    } catch (e) { report(e); throw e; } finally { setBusy(false); }
  };
  const login = async (staffId: string, pin: string, email: string, password: string) => {
    setBusy(true); setError('');
    try {
      const next = email.trim() && password ? await invoke<RuntimeSession>('runtime_login', { staffId, pin, email, password }) : await invoke<RuntimeSession>('runtime_login_offline',{staffId,pin});
      setSession(next); setSnapshot(await invoke<RuntimeSnapshot>('runtime_snapshot', { token: next.token }));
    }
    catch (e) { report(e); throw e; } finally { setBusy(false); }
  };
  const lock = useCallback(async () => {
    let failure:unknown=null;
    try { await flushLocalWork(); } catch(error) { failure=error; }
    try { if (session) await invoke('runtime_lock', { token: session.token }); }
    catch(error) { failure ??= error; }
    finally { setSession(null); setSnapshot(null); try{await reloadStatus();}catch(error){failure ??=error;} }
    if(failure) report(failure);
  }, [session, reloadStatus, report]);
  const command = useCallback(async (operation: string, payload: Record<string, unknown> = {}, targetVersion?: number, commandId?: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    const request: BusinessCommand = { id: commandId || crypto.randomUUID(), schemaVersion: 1, operation, payload, targetVersion };
    let result: CommandResult;
    try { result = await invoke<CommandResult>('runtime_command', { token: session.token, command: request }); }
    catch (e) { report(e); throw e; }
    // The write has committed. A failed reload must not invite a second payment.
    try { await refresh(); if (operation.startsWith('staff.')) await reloadStatus(); setError(''); }
    catch (e) { setError(`Saved locally, but refresh failed. Reload before making another change. ${String(e)}`); }
    nextSync.current = 0;
    window.dispatchEvent(new Event('servos:local-commit'));
    window.dispatchEvent(new CustomEvent('servos:command-committed', { detail: { operation, result, payload: Object.fromEntries(['orderId', 'locationId', 'supplierId', 'purchaseOrderId'].filter(key => typeof payload[key] === 'string').map(key => [key, payload[key]])) } }));
    return result;
  }, [session, refresh, report, reloadStatus]);
  const guidanceProgress = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<GuidanceProgress[]>('runtime_guidance_progress', { token: session.token });
  };
  const saveGuidanceProgress = async (progress: GuidanceProgress) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<GuidanceProgress>('runtime_guidance_save_progress', { token: session.token, progress });
  };
  const inventoryCountDraft = async (locationId: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<InventoryCountDraft | null>('runtime_inventory_count_draft', { token: session.token, locationId });
  };
  const saveInventoryCountDraft = async (locationId: string, draft: InventoryCountDraft) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<InventoryCountDraft>('runtime_save_inventory_count_draft', { token: session.token, locationId, draft });
  };
  const clearInventoryCountDraft = async (locationId: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    await invoke('runtime_clear_inventory_count_draft', { token: session.token, locationId });
  };
  const approve = async (approverId: string, pin: string, permission: Permission, target?: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    try { return await invoke<ManagerApproval>('runtime_manager_approve', { token: session.token, approverId, pin, permission, target: target || null }); }
    catch (e) { report(e); throw e; }
  };
  const sync = useCallback(async () => {
    if (!session || inFlight.current) return;
    inFlight.current = true; setSyncing(true);
    try { await invoke('runtime_sync', { token: session.token }); failures.current = 0; nextSync.current = Date.now() + 15_000; await refresh(); setError(''); }
    catch (e) { failures.current += 1; nextSync.current = Date.now() + Math.min(300_000, 5_000 * 2 ** Math.min(failures.current - 1, 6)); report(e); throw e; }
    finally { inFlight.current = false; setSyncing(false); }
  }, [session, refresh, report]);
  const installV2Snapshot = async () => {
    try { return await invoke<{ installed:boolean; records:number; cursor:number; policyVersion:string; pageCount:number }>('runtime_v2_install_snapshot'); }
    catch (e) { report(e); throw e; }
  };
  const backup = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    try { const path = await invoke<string>('runtime_backup', { token: session.token }); await refresh(); return path; }
    catch (e) { report(e); throw e; }
  };
  const healthAudit = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    try { return await invoke<ProductionHealthAudit>('runtime_health_audit', { token: session.token }); }
    catch (e) { report(e); throw e; }
  };
  // SERVOS_PATCH_10_TERMINAL_ACCEPTANCE
  const acceptanceStatus = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    try { return await invoke<TerminalAcceptanceStatus>('runtime_acceptance_status', { token: session.token }); }
    catch (e) { report(e); throw e; }
  };
  const acceptanceAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!session) throw new Error('Unlock the terminal first');
    try { return await invoke<TerminalAcceptanceStatus>('runtime_acceptance_action', { token: session.token, action, payload }); }
    catch (e) { report(e); throw e; }
  };
  // SERVOS_PATCH_02A_RECONCILIATION
  const reconcile = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    try { return await invoke<ReconciliationReport>('runtime_reconciliation_compare', { token: session.token }); }
    catch (e) { report(e); throw e; }
  };
  // SERVOS_PATCH_03_IMPORT_CENTER
  const importBatches = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<ImportBatchSummary[]>('runtime_import_list', { token: session.token });
  };
  const importBatch = async (id: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<ImportBatchDetail>('runtime_import_detail', { token: session.token, batchId: id });
  };
  const stageImport = async (input: StageImportInput) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<ImportBatchDetail>('runtime_import_stage', { token: session.token, templateKey: input.templateKey, fileName: input.fileName, csvText: input.csvText });
  };
  const cancelImport = async (id: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    await invoke('runtime_import_cancel', { token: session.token, batchId: id });
  };
  // SERVOS_PATCH_04_CONTROLLED_IMPORT
  const planImport = async (batchId: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<ImportApplyPlan>('runtime_import_plan', { token: session.token, batchId });
  };
  const importPlan = async (planId: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<ImportApplyPlan>('runtime_import_plan_detail', { token: session.token, planId });
  };
  const applyImport = async (planId: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    const result=await invoke<ImportApplyPlan>('runtime_import_apply', { token: session.token, planId });
    await refresh();
    return result;
  };
  const receipt = async (orderId: string, receiptId?: string) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<ReceiptResponse>('runtime_receipt', { token: session.token, orderId, receiptId: receiptId || null });
  };
  const receiptHistory = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<ReceiptSummary[]>('runtime_receipt_history', { token: session.token });
  };
  const printReceipt = async (input: { orderId: string; receiptId: string; reprint: boolean }) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<PrinterJobResult>('runtime_print_receipt', { token: session.token, jobId: crypto.randomUUID(), ...input });
  };
  const testPrinter = async () => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<PrinterJobResult>('runtime_printer_test', { token: session.token });
  };
  const retryPrinterJob = async (jobId: string, confirmDuplicate = false) => {
    if (!session) throw new Error('Unlock the terminal first');
    return invoke<PrinterJobResult>('runtime_printer_retry', { token: session.token, jobId, confirmDuplicate });
  };
  const printerJobs = async () => {
    if (!session) return [];
    return invoke<PrinterJobResult[]>('runtime_printer_jobs', { token: session.token });
  };

  useEffect(() => {
    if (!session) return;
    lastActivity.current = Date.now();
    const active = () => { lastActivity.current = Date.now(); };
    nextAuthRefresh.current=Date.now()+30*60_000;
    const renewAuth = (forceRefresh=false) => { if(navigator.onLine) void invoke<boolean>('runtime_refresh_operator_auth',{forceRefresh}).catch(report); };
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) { renewAuth(true); void sync().catch(() => undefined); } };
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= 900_000) { void lock(); return; }
      if(Date.now()>=nextAuthRefresh.current){nextAuthRefresh.current=Date.now()+30*60_000;renewAuth();}
      if (Date.now() >= nextSync.current && navigator.onLine && document.visibilityState === 'visible') void sync().catch(() => undefined);
    }, 15_000);
    window.addEventListener('pointerdown', active); window.addEventListener('keydown', active); window.addEventListener('online', resume); window.addEventListener('servos:local-commit', resume); document.addEventListener('visibilitychange', resume);
    return () => { clearInterval(timer); window.removeEventListener('pointerdown', active); window.removeEventListener('keydown', active); window.removeEventListener('online', resume); window.removeEventListener('servos:local-commit', resume); document.removeEventListener('visibilitychange', resume); };
  }, [session, sync, lock, report]);

  return <RuntimeContext.Provider value={{ status, session, snapshot, error, syncing, busy, reloadStatus, saveIntake, completeIntake, reopenIntake, enroll, login, lock, refresh, command, guidanceProgress, saveGuidanceProgress, inventoryCountDraft, saveInventoryCountDraft, clearInventoryCountDraft, approve, sync, installV2Snapshot, backup, healthAudit, acceptanceStatus, acceptanceAction, importBatches, importBatch, stageImport, cancelImport, planImport, importPlan, applyImport, reconcile, receipt, receiptHistory, printReceipt, testPrinter, retryPrinterJob, printerJobs, clearError: () => setError('') }}>{children}{closeFailure && <Dialog title="Local work could not be saved" onClose={() => setCloseFailure(null)} footer={<><button type="button" className="px-3 py-2 text-sm text-slate-300" disabled={closeRetrying} onClick={() => setCloseFailure(null)}>Keep working</button><button type="button" className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-60" disabled={closeRetrying} onClick={() => void retryClose()}>{closeRetrying ? 'Retrying…' : 'Retry save and close'}</button></>}><p className="text-sm text-slate-200">ServOS could not finish saving local work before closing. Keep the terminal open and retry, or choose Keep working to return to the current session.</p><p className="mt-3 break-words text-xs text-rose-300" role="alert">{closeFailure}</p></Dialog>}</RuntimeContext.Provider>;
};
