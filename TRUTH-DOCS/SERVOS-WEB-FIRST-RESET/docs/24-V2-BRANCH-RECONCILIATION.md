# 24 — `SERVEOS-WEB/V2` Branch Reconciliation and Salvage Plan

## 1. Baseline

At the October 5, 2026 audit point:

```text
Repository: davemusau00/SERVEOS-WEB
main: dc1af9248d161ca6a874d6f32b8119cd1b7fece0
V2 branch: 48d37769f1d049aa1c776fe8030fc9df8fa836d0
```

GitHub comparison reports:

```text
V2 is 7 commits ahead of main
V2 is 2 commits behind main
status: diverged
```

Therefore `V2` must not be deleted merely because a V2 pull request was previously merged into `main`.

It contains additional work produced after the merge.

---

## 2. V2-only commits reviewed

The branch contains the following post-merge work themes:

1. bottle-inventory tests and SQL acceptance;
2. archive protection when open PO quantities exist;
3. selected/physical count refinements;
4. reviewed command identity handling;
5. maintenance-cost probe scripts;
6. light/dark theme and semantic token work;
7. dialog/drawer styling/accessibility refinement.

---

## 3. New operation identities in V2

`contracts/operations.json` on `main` has 90 transitional operation IDs.

`V2` has 94.

V2 adds:

```text
inventory.countSelected
procurement.reverseUnusedReceipt
record.reactivate
inventory.reverseMovement
```

These should be explicitly classified during the new API contract design.

### 3.1 `inventory.countSelected`

**Keep concept. Rewrite implementation against new backend.**

Business value:

- spot counts;
- cycle counts;
- selected high-risk items;
- physical correction review.

It must remain semantically distinct from `inventory.countLocation`, which represents a whole-location reviewed count.

### 3.2 `procurement.reverseUnusedReceipt`

**Keep concept as guarded correction. Do not confuse with supplier return.**

Useful V2 behavior:

- requires exact reviewed versions;
- only permits an unused duplicate/recording mistake;
- preserves original records;
- creates linked reversing evidence;
- blocks reversal after later PO/stock/payable activity.

New backend must still add the missing real-world cases:

- physical supplier return;
- wrong received price after later movement;
- supplier credit note;
- matched/paid invoice correction.

### 3.3 `record.reactivate`

**Keep concept, restrict domain use.**

Do not expose one magical generic record operation across every entity.

Preferred API:

```text
catalog.item.reactivate
supplier.reactivate
room.reactivate
```

or a typed domain command mapped internally to a shared lifecycle helper.

### 3.4 `inventory.reverseMovement`

**Keep only as a narrowly defined recording correction.**

The V2 UI correctly warns that consumed stock, real-world physical movement and later cost activity may prevent exact reversal.

The new backend should model:

- recording correction;
- current-balance correction;
- real transfer/return;

as separate concepts.

---

# 4. V2 bottle-state logic

V2 has meaningful improvements around sealed/open inventory:

- explicit `sealedContainerSize`;
- sealed container + open quantity conservation;
- physical transfer disposition;
- whole-bottle-only guards;
- reviewed physical counts;
- source/destination state checks;
- later-activity conflict protection.

## Decision

**Preserve business invariants and tests.**

Move them into shared framework-neutral domain tests and the new VPS inventory service.

Do not preserve dependence on SQLite record JSON shapes or Supabase migration handlers.

---

# 5. PO archive guard

V2 adds a useful rule:

> A stock item cannot be archived while unresolved purchase-order quantities still reference it.

Keep this.

Improve UX so the operator sees the blocker and direct recovery action:

```text
Cannot archive Jameson 750ml.

Open purchasing:
PO-2026-00112 · 3 bottles outstanding
PO-2026-00118 · 1 case outstanding

[ View purchase orders ]
```

---

# 6. Web physical-count implementation warning

V2 adds `WebPhysicalCountDialog`, but its browser persistence currently uses `localStorage` keys such as:

```text
servos-web-physical-count:...
```

This is useful proof of UI behavior but is **not** the final reset architecture.

New implementation:

```text
IndexedDB BusinessStore
    ↓
CountDraft repository
    ↓
review command persisted
    ↓
new API command
```

Requirements:

- business/operator scoping;
- schema/version migration;
- logout privacy clearing/partitioning;
- atomic persistence of baseline + counts + unknown scans + review command;
- no unbounded JSON values in localStorage.

---

# 7. Web linked correction warning

V2's `WebLinkedCorrectionDialog` demonstrates an important idea:

- persist the exact correction command ID before dispatch;
- retry the same ID;
- do not silently create another reversal.

Keep that rule.

Replace raw `localStorage` status strings with the new Web command/outbox repository and backend `/commands/{id}` status endpoint.

---

# 8. Design system/theme work

V2 adds semantic token/theme improvements and dialog/drawer accessibility refinements.

**Salvage selectively.**

Before porting:

- confirm contrast in both themes;
- test 1024×600;
- test touch targets;
- test focus trap/escape;
- ensure terminal dark/light preference cannot reduce high-speed POS legibility;
- retain semantic tokens instead of feature-local color literals.

Theme switching is polish. It must not delay core workflow convergence.

---

# 9. Do not merge these V2 artifacts

Exclude from production refactor:

```text
.pc.txt
.probe_chain.txt
probe-run.ps1
ad-hoc maintenance probe SQL
```

Probe tooling belongs in controlled test scripts with no credentials/secrets committed.

Rotate/remove any secrets if those artifacts ever contained live credentials.

---

# 10. SQL migrations

V2 adds large bottle/cost migrations.

Do not port them wholesale to the new VPS schema.

Instead extract:

- invariants;
- input validation;
- concurrency expectations;
- conservation equations;
- correction rules;
- test fixtures.

Reimplement those in the new relational domain model and backend transaction service.

---

# 11. Branch reconciliation sequence

Before deleting V2:

```text
1. tag main baseline
2. tag V2 baseline
3. create V2 salvage checklist
4. port pure tests/invariants first
5. port operation concepts to new contracts
6. port design-system improvements selectively
7. explicitly reject probe/debug artifacts
8. record replacement commit for every accepted V2 change
9. run old + new acceptance suites
10. archive V2 branch read-only/tag
11. delete long-lived active branch only after evidence is complete
```

Do not perform a blanket merge into the new architecture.

---

# 12. Required salvage checklist

| V2 item | Decision | Destination |
|---|---|---|
| bottleInventory math/tests | KEEP/PORT | `packages/domain-inventory` |
| selected count concept | KEEP | canonical inventory API |
| receipt/movement correction command identity | KEEP/REDESIGN | correction domain |
| PO archive blocker | KEEP | catalog/procurement invariant |
| reviewed exact command ID | KEEP | shared command client |
| theme semantic tokens | KEEP SELECTIVELY | design system |
| dialog/drawer accessibility | KEEP SELECTIVELY | design system |
| localStorage count persistence | REPLACE | IndexedDB store |
| localStorage correction status | REPLACE | command/outbox repository |
| Supabase bottle SQL dispatcher | REIMPLEMENT | VPS backend/domain |
| probe files/scripts | DISCARD/CLEAN | controlled diagnostics only |
| `.pc.txt` / `.probe_chain.txt` | DISCARD | none |

---

# 13. Exit condition

`V2` is reconciled only when every V2-only file is accounted for as:

```text
PORTED
REIMPLEMENTED
INTENTIONALLY DISCARDED
ARCHIVED AS HISTORICAL EVIDENCE
```

No unclassified branch-only business rule may disappear.
