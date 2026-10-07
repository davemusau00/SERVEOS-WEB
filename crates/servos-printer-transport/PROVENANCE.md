# Native transport provenance

Source: `src-tauri/src/printer.rs` in the ServOS reset checkout.

SHA-256 of original source bytes used for `src/native_transport.rs`:

`c76712f9815a46039de66d5627520fee35314de51470a5e6a13a55c7bd632dab`

The native source remains frozen. In the imported module only `append_logo`, `append_qr` and `wrap_line` visibility is widened to `pub(super)` for the generic renderer; algorithms and inherited tests are retained. The standalone crate retains its Windows RAW and private-LAN TCP transport, bounded profiles, image handling, cutter/feed behavior, uncertainty classification and existing tests. No business authority or Tauri dependency is included.

`encode_document` adds a bounded single-copy text entry point using the same native wrapping/raster functions. The generic renderer emits one copy, logo at the top, QR before any fixed footer (or at the end), the required QR caption, then feed/cut. It rejects embedded control codes and unsupported rasters. The source snapshot still exposes its legacy internal receipt terminology; this is not a new receipt business engine.

Compilation and inherited tests have not been run during the deferred-verification sprint. This crate is not an installed Print Bridge: trusted local HTTPS, pairing, signed typed jobs, canonical document rendering, durable duplicate/uncertainty handling, installer integration and hardware acceptance remain outstanding. Do not expose this transport directly as a permissive HTTP endpoint.


Standalone wrapper additions during bridge development: `encode_document_at_footer` accepts an
explicit validated footer boundary for immutable custom footers. ASCII fallback now runs before
legacy byte-indexed wrapping to avoid splitting UTF-8 characters. Imported native wrapping and
transport algorithms, original Tauri source and inherited tests remain unchanged. These wrapper
changes are source-only and await deferred verification.
