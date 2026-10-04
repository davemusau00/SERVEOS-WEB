# Obsolete print-job cancellation implementation plan

Date: 2026-10-04
Source: `print-queue.md`
Status: Planned; implementation and acceptance remain outstanding.

## Objective and current findings

Allow an authenticated Admin to cancel obsolete native receipt/test jobs individually or in a reviewed batch of up to 50. Preserve receipt history and delivery uncertainty while removing cancelled jobs from the unresolved queue and terminal acceptance count.

The source note describes completed behavior and preparation-environment validation. Inspection of this checkout does not establish those claims: `src-tauri/src/lib.rs` has retry/list commands but no cancellation command; queue and acceptance queries currently use `state!='SENT'`; `NativePOSView.tsx` offers retries but no cancellation dialog. Treat the note as the feature specification and rerun validation against the resulting revision.

The initial-send path inserts `QUEUED`, releases the database mutex, then claims `SENDING` inside `execute_printer_job`. Retry already claims before calling that helper, which unconditionally updates the state again. Both paths need a shared, explicit claim contract to prevent cancellation from being overwritten.

## Invariants

- Installed Tauri/SQLite remains the authority for these jobs.
- Only Admin can cancel, enforced in Rust as well as the UI. Manager and Cashier requests must fail.
- Only `QUEUED` and `DELIVERY_UNCERTAIN` jobs are cancellable. Reject `SENDING`, `SENT`, `CANCELLED`, missing jobs and stale selections atomically.
- Cancellation means no further send attempt by ServOS; it does not prove that an earlier attempt produced no paper or retract a Windows spooler job.
- Preserve the original payload, printer profile, order/receipt association, creation time and transport-error message.
- Persist `CANCELLED`, an updated timestamp, and immutable local audit evidence containing actor, timestamp, reason, job IDs and previous states.
- Do not change sales, payments, stock, journals, receipt documents, hardware evidence or cloud outbox rows.
- No SQLite schema migration is expected: job state is stored as text and the existing audit table carries cancellation metadata. Verify constraints and audit protections before implementation.

## 1. Implement the transactional cancellation domain

Files: `src-tauri/src/store.rs` or a dedicated shared printer-job module, `src-tauri/src/lib.rs`, `native-tests/src/lib.rs` if a shared module is introduced.

1. Add a testable cancellation helper and register a Tauri command, proposed name `runtime_printer_cancel`.
2. Accept a reason plus 1–50 unique selected jobs, each with its reviewed state and `updatedAt` token. Return cancelled IDs/count and cancellation timestamp.
3. Authenticate the current session and require the exact Admin role. Reject empty/whitespace reasons, duplicate IDs, empty batches and oversized batches; define a bounded reason length consistently in Rust and TypeScript.
4. In one SQLite transaction, load and validate every selected row against state and timestamp before updating any row. Use guarded updates and require exactly one affected row per selection.
5. Append one immutable batch audit record through the existing local audit conventions, including each prior state and timestamp. Keep `message`, `payload` and `profile` unchanged. Commit state and audit together; roll back all changes on any failure.
6. On repeated submission after a successful cancellation, report a stale selection and refresh; do not add duplicate audit records or silently report a new success.

Completion gate: authorization, validation, atomicity and audit/history preservation pass native domain tests.

## 2. Make send claims safe and align unresolved-job queries

Files: `src-tauri/src/lib.rs` and the shared helper/module chosen in step 1.

1. Make initial insertion and the `QUEUED → SENDING` claim occur under the same database lock/transaction before transport begins.
2. Keep retry authorization and duplicate-warning confirmation, then claim only the reviewed eligible state before releasing the lock.
3. Refactor execution to consume an already claimed job/profile/payload; it must never unconditionally turn a cancelled job back into `SENDING`. Guard transport-result writes with `state='SENDING'`.
4. Preserve startup recovery from `SENDING` to `DELIVERY_UNCERTAIN`. Never recover or retry `CANCELLED` jobs.
5. Exclude both `SENT` and `CANCELLED` from queue listing and acceptance counting. Retain a full-database acceptance count even though the UI displays only 50 jobs. Use deterministic queue ordering and return `updatedAt` for stale-selection checks.
6. Preserve retry's snapshotted profile. A new receipt-history reprint uses the current printer configuration and a new job; cancellation must not rewrite historical snapshots.

Completion gate: cancellation-first blocks a later claim; claim-first rejects cancellation; transport completion cannot resurrect cancellation. Queue and acceptance counts agree on terminal states.

## 3. Add the Admin review workflow

Files: `src/types/runtime.ts`, `src/runtime/RuntimeProvider.tsx`, `src/native/NativePOSView.tsx`; optionally extract a focused dialog component.

1. Extend `PrinterJobState` with `CANCELLED`, add typed selection/result contracts and expose cancellation through the runtime provider.
2. Show **Clear obsolete print jobs…** to Admin in native POS. List the current reviewed jobs with order/test label, state, timestamp and transport error; disable selection for `SENDING` jobs.
3. Support individual selection and **Select all displayed eligible jobs**, bounded to the displayed 50. Explicitly state that additional jobs may require another refreshed batch.
4. Require a reason and explicit acknowledgement that uncertain jobs may already have printed. Show selected count and require final confirmation before invoking cancellation.
5. Explain that customers still needing receipts should retain the job or receive a receipt-history reprint using the working configuration. Existing retry uses the original profile.
6. Disable repeat submission while saving. On success, refresh the queue and clear selection. On stale-selection failure, refresh and require fresh review and confirmation; surface refresh errors visibly.
7. Ensure Business Admin obtains fresh acceptance counts when opened or refreshed. Do not infer that cancellation satisfies physical printer acceptance or closes an active till.
8. Verify keyboard navigation, labelled checkboxes, dialog focus, readable warnings and narrow-screen scrolling.

Completion gate: Admin can review and cancel one/batch; non-Admin cannot access the action; stale selections cannot silently apply.

## 4. Verify behavior at the correct layers

Add Rust regression coverage using the production helper, rather than duplicated test logic:

- Admin success and Cashier/Manager/expired-session denial.
- Empty reason, invalid batch size and duplicate IDs.
- Mixed eligible states; missing, already cancelled, sent, sending and timestamp-stale selections reject the entire batch.
- Audit failure rolls back state changes; successful audit contains actor/reason/previous states.
- Payload, profile, error message and business/outbox row counts remain unchanged.
- Cancellation persists after database reopen; cancelled jobs stay non-retryable.
- Both send/cancel interleavings, retry duplicate confirmation and restart recovery.
- Queue excludes cancelled jobs and acceptance counts unresolved rows beyond the displayed 50.

Run `npm run lint`, `npm test`, `npm run build`, `npm run test:native`, `npm run test:desktop`, and `npm run check:desktop`, then `npm run native:build` on the Windows build machine. The native harness currently imports store/printer modules, not Tauri command wrappers: shared-helper tests alone do not prove command registration or desktop compilation. If the documented tsx IPC issue recurs, record it and use the note's direct ledger-build workaround with help generation and Vite; do not label that workaround an unmodified build-script pass.

Add focused browser/component coverage where the existing native-runtime harness supports it. Record source checks, native tests, desktop build and installed-terminal evidence separately. Missing tooling or hardware is a blocker, never a pass. This plan has not run these checks.

## 5. Document, package and accept the installed upgrade

Files: `docs/user-guide/40-terminal-acceptance.md`, relevant printer guide, `docs/CURRENT_RELEASE_STATE.md`, `docs/RELEASE_0.2_ACCEPTANCE.md`, and the newly generated release upgrade runbook/manifest.

1. Document cancellation, uncertain delivery, profile snapshots and the required queue/acceptance refresh.
2. Record the implementation revision and actual verification results. Generate a new installer, manifest and checksums; preserve the existing release folder as historical evidence.
3. Follow the existing-terminal upgrade procedure: verified checkpoint backup, same Windows user/application identity, no repeat Intake/enrollment, and preserved business/audit/outbox history. This feature adds no schema migration to the existing release migration chain.
4. Rehearse on isolated application data before upgrading the working terminal. Do not synchronize a cloned terminal identity concurrently with production.
5. On the installed build, verify individual and batch cancellation, Cashier denial, restart persistence and stale-selection rejection. Verify a current receipt physically prints and receipt-history reprint uses the working profile.
6. Refresh Business Admin: only unresolved jobs remain counted. Close the active till through normal close-day flow and complete the existing physical acceptance requirements.

## Delivery order and definition of done

Execute steps 1–5 in order. Cancellation domain and send claiming must ship together; the UI depends on both. The feature is source-complete when backend, runtime, UI and regression checks pass. It is release-ready only after desktop compilation/build and upgrade rehearsal pass. Installed-terminal acceptance remains outstanding until physical printing, restart persistence, queue-count refresh and the existing acceptance requirements are evidenced on the actual terminal.
