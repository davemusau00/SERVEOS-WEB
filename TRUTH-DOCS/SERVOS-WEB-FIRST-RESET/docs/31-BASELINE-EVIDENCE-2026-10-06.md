# 31 — Reset Baseline Evidence — 2026-10-06

## Repository

Working repository:

`davemusau00/SERVEOS-WEB`

Working branch:

`reset/vps-platform`

Reset baseline tag:

`pre-vps-reset-2026-10-06`

The branch was created from `main` and merged with `origin/V2` before the refactor.

## Build baseline

`npm ci`

- completed successfully;
- 125 packages installed in captured run;
- npm audit reported 0 vulnerabilities.

`npm run build`

- help index generated 40 offline help articles;
- operation parity ledger generated 94 operations;
- parity gate reported 88 shared Native mutations with complete V2 handlers;
- Vite transformed 2384 modules;
- build completed successfully;
- main JS output remained above the bundler's 500 kB warning threshold and is a web-first performance target.

## JavaScript/source tests

`npm test`

```text
tests     216
pass      216
fail      0
```

Important existing behavior to preserve/replace deliberately includes:

- atomic audit/outbox behavior;
- payment idempotency;
- room/folio conservation;
- procurement classification;
- inventory counts/corrections;
- device identity;
- web command result states;
- PWA safe update boundary;
- current printer transport validation.

Important current behavior that the reset intentionally changes:

- production Web V2 disabled by default;
- Web offline commands currently fail closed;
- QR has its own specialized preparation path;
- device-local `runtime.print_receipt` remains excluded from cloud parity;
- duplicated Native/Web views remain.

## Native/Rust baseline

`npm run test:native`

```text
106 passed
0 failed
```

Compiler warnings existed but did not fail the suite.

The native tests become behavioral evidence during migration. Do not delete them until equivalent API/PWA/domain tests cover the same invariants.

## Working tree note

Running build/test regenerates:

- `docs/generated/OPERATION_PARITY_LEDGER.json`;
- `docs/generated/OPERATION_PARITY_LEDGER.md`;
- `src/generated/help-index.json`.

The reset documentation directory was also untracked in the captured local state.

Before architectural refactor commits, decide intentionally whether generated outputs are committed artifacts and make the build reproducible/clean accordingly.

## VPS baseline

Pre-reset VPS audit observed:

- Ubuntu 24.04 LTS family;
- 4 vCPU;
- ~7.8 GiB RAM;
- ~142 GB root filesystem with ~115 GB free at that observation;
- Docker and Nginx active;
- public 80/443 owned by Nginx;
- localhost 3000 and 3001 already used by existing applications;
- existing unrelated PostgreSQL/Redis containers;
- no requirement for host-level Node/npm;
- pending system/kernel restart appeared during maintenance and must be rechecked before deployment.

This is sufficient for an initial colocated ServOS PWA/API/PostgreSQL deployment if monitored, but production deployment must rerun current resource checks.
