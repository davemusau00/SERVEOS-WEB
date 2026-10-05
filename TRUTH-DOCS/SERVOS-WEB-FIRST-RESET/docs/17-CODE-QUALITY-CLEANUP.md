# 17 — Code Quality, Enhancement and Cleanup Standard

## 1. Purpose

The reset must improve maintainability, not simply relocate existing complexity from Supabase SQL to Node.js.

## 2. Maximum responsibility rule

A file/component/service should have one understandable reason to change.

Large pages are composed from workflows; route handlers are thin; domain services own decisions.

## 3. Route handlers

A route should mostly:

```text
parse auth/request
validate schema
call application service
map result/error
return response
```

Do not put 300 lines of business mutation logic inside HTTP routes.

## 4. Domain services

Name by action:

```text
checkInGuest()
receivePurchaseOrder()
recordPayment()
closeTill()
countStockLocation()
```

Inputs are typed.
Outputs are typed.
Transaction context is explicit.

## 5. Avoid boolean soup

Replace calls like:

```text
saveItem(true,false,true,false)
```

with explicit objects/enums.

## 6. No silent catch

Exceptions/errors must be:

- handled into a known domain result;
- logged with request/command context;
- or propagated to the API error boundary.

Never `catch {}` a transactional failure.

## 7. No browser primitives for serious workflows

Do not use:

- `window.prompt`;
- `window.confirm`;
- `alert()`

for approvals, money, stock, refunds or other real workflows.

Use shared components.

## 8. Data mutations

No direct mutation from React component to database.

No feature-specific hidden fetch contract.

Every business mutation calls the shared command client.

## 9. Transactional invariants

Use database transaction + row/version locks where required.

Do not simulate transaction safety with multiple sequential API calls from the UI.

## 10. Money and quantity helpers

One shared exact arithmetic library/API.

Ban ad hoc:

```text
parseFloat(price) * quantity
```

for authoritative money calculations.

## 11. Time

One business-time package.

No scattered `new Date(string)` assumptions for room checkout/business-day logic.

## 12. Error codes

Stable enum/registry.

No components parsing raw database error strings.

## 13. Feature flags

Use explicit typed feature flags/capabilities.

Do not create hidden environment branches across many files.

## 14. Dead code policy

After replacement passes acceptance:

- remove old implementation;
- do not leave two "just in case" production paths;
- retain historical code through Git tags/archives.

## 15. TODO policy

TODOs affecting correctness must link to tracked issue/work item and must not be buried inside released critical paths without documented acceptance limitation.

## 16. Code review checklist

Every business mutation review asks:

- What command is this?
- What permission protects it?
- What exact rows/resources does it depend on?
- Is it idempotent?
- What happens on response loss?
- What happens on concurrent edit?
- What audit is created?
- What change feed is created?
- Is it allowed offline?
- What does the operator see on rejection?

## 17. UI review checklist

- Is this the simplest path?
- Is Advanced hiding technical complexity appropriately?
- Does it fit 1024×600?
- Does it work with touch and keyboard?
- Does failure preserve input?
- Is permission/disabled reason understandable?
- Does role need to see this workspace?

## 18. Database review checklist

- correct FK/unique/check constraints;
- index for query pattern;
- money exact;
- timezone clear;
- mutation transaction atomic;
- audit/history retained;
- deletion/archive semantics defined;
- migration forward compatible.

## 19. Test review checklist

Every bug fix gets a regression test at the lowest useful layer and, for critical workflow bugs, an end-to-end acceptance scenario.

## 20. Definition of clean

The codebase is considered substantially cleaned when:

- current architecture can be explained without legacy exceptions;
- one command vocabulary exists;
- one permission matrix exists;
- one migration chain exists;
- one receipt pipeline exists;
- one sync protocol exists;
- old writers are impossible to invoke in production;
- critical files are decomposed into testable workflows;
- CI automatically catches protocol drift.

## Web-first cleanup additions

- Delete duplicate Native/Web feature implementations only after PWA/API replacement has equivalent acceptance coverage.
- Do not add new Tauri business-domain operations.
- No production PWA code imports Supabase clients or direct database RPC helpers.
- IndexedDB access goes through typed repositories; no business workflow stores durable truth in `localStorage`.
- Service Worker caches application assets, not mutable business truth.
- Print Bridge is a hardware adapter with an explicit dependency boundary; it cannot import inventory/hospitality/finance domain modules.
- Route/domain code splitting is required to reduce the current oversized startup bundle.
- Browser multi-tab sync leadership must be deterministic and testable.

