# Offline work

The PWA stores an authorized record projection, queued commands and work drafts in IndexedDB. A signed offline grant limits which command types a particular staff member and device may submit while the API is unreachable.

The browser coordinates synchronization across tabs. It keeps a stable command ID when a request outcome is unknown, checks the API outcome before retrying, and applies ordered change-feed pages. A version conflict or server rejection remains visible for review; the browser must not repeat an uncertain action with a new command identity.

Offline support depends on the PWA shell, browser storage, a valid grant and the operation's offline policy. Online only actions remain unavailable offline. A browser cache is not a backup of PostgreSQL.

The POS2 pilot uses a separate signed V2 capability for the single enrolled checkout terminal and its open shift. Provision it online, secure reopening with a kiosk PIN, and keep the full cash catalogue available within the capability's validity. V2 has no per-sale quota; the existing one-sale, 30-minute V1 command remains unchanged for older PWAs. These capabilities are disabled by default and require the server-authorized pilot cohort and a browser that passes storage and cryptography checks.

A local cash commit writes sale, cash, provisional stock, slip evidence, sequence and original-ID outbox atomically. Cash received locally is provisional for central reporting. Reconciliation preserves the original sale and price snapshot; an exception does not cancel received cash. Local cash Activity exports the associated cash, stock, outbox, shift, reconciliation and print facts for private review, excluding the signed authorization capability. Export files are evidence, not replay or import files. Keep them private and retain the original terminal ledger.

End a pilot shift by stopping local creation, synchronizing every local sale, resolving exceptions and ending the signed capability before using ordinary till reconciliation. Expiry alone does not prove a drained ledger. Never clear storage or switch checkout devices to bypass this check. Local and server print retries do not repeat the sale, and only operator confirmation establishes physical paper delivery.

See [API sessions](auth.md), [testing](testing.md) and the in app [offline recovery guide](user-guide/26-offline-sync.md).
