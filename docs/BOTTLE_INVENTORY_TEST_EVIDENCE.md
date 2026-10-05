# Bottle inventory verification — 2026-10-04

Status: verification in progress. Final commands and failures are recorded here before delivery.

The initial Windows MSVC native suite passed 103 tests. Added cases cover immutable linked movement reversal, replay, later-activity rejection and consumed/paid receipt rejection. TypeScript checking passed after the new dialogs and contracts. The disposable PostgreSQL migration and existing suite passed earlier; the new fixture revealed missing contract fields in its own test inputs, which were corrected. Docker Desktop subsequently became unavailable and was restarted; unavailable runs are not passes.

Browser tests mock the Tauri command boundary and exercise real production UI; native tests verify SQLite behavior; disposable PostgreSQL verifies shared handlers. None establishes hardware, installed-terminal, hosted or restored-business-data acceptance. Those remain pending in `BOTTLE_INVENTORY_DELIVERY.md`.
