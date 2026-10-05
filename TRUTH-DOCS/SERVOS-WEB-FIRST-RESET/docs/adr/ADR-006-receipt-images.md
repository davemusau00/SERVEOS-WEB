# ADR-006 — One Receipt Image Pipeline

**Status:** Accepted

## Decision

Business logo and uploaded payment QR PNG use the same image normalization and thermal-raster preparation pipeline.

The receipt logo prints at the top. Customer payment QR prints near the bottom below the exact text `Scan to Pay via One app`.

## Reason

The separate QR module-detection/reconstruction pipeline is unnecessary and has failed in practice, while logo raster printing is proven.

## Consequences

- QR content is treated as a trusted uploaded print asset;
- no QR decoding/rebuilding;
- historic receipt snapshot remains immutable.
