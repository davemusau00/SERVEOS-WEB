# Offline work

The PWA stores an authorized record projection, queued commands and work drafts in IndexedDB. A signed offline grant limits which command types a particular staff member and device may submit while the API is unreachable.

The browser coordinates synchronization across tabs. It keeps a stable command ID when a request outcome is unknown, checks the API outcome before retrying, and applies ordered change-feed pages. A version conflict or server rejection remains visible for review; the browser must not repeat an uncertain action with a new command identity.

Offline support depends on the PWA shell, browser storage, a valid grant and the operation's offline policy. Online only actions remain unavailable offline. A browser cache is not a backup of PostgreSQL.

See [API sessions](auth.md), [testing](testing.md) and the in app [offline recovery guide](user-guide/26-offline-sync.md).
