# ADR-011 — Optional Local Print Bridge for Guaranteed ESC/POS

## Status
Accepted — 2026-10-06

## Context
Standard browsers cannot universally guarantee silent raw Windows queue/TCP ESC/POS access. Keeping the full Tauri application only for printer access would preserve unnecessary duplicate business runtimes.

## Decision
Provide three printing levels: browser print, validated kiosk/default-printer mode, and an optional ServOS Print Bridge for dedicated terminals requiring deterministic silent raw ESC/POS.

The bridge is loopback-only, paired/signed, and contains printer transport/spooling only. It has no business database and no shared mutation authority.

Existing tested Rust Windows RAW/LAN printer code should be extracted and generalized into this component.

## Consequences
The core product remains web-only while dedicated POS hardware can retain robust raw printing. Bridge versioning/security becomes an explicit operational responsibility.
