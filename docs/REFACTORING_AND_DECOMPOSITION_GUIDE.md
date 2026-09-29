# Decomposition guide

The legacy ServOS context and component fixtures remain only in the browser preview. The installed runtime uses RuntimeProvider for enrollment/session/synchronization and NativeServOSProvider as the compatibility adapter for existing views.

Move each module to explicit asynchronous query/command hooks. Do not add new business effects to React setters. Command handlers own permissions, validation, version checks, derived records, audit and outbox transactions. Views own drafts, filters, selections and progress/error states.

The current native adapter still has synchronous compatibility signatures and explicit unavailable operations. Replace these with Promise-returning interfaces as each module is migrated. Never call a success toast or close a form before its command commits. Remove each legacy implementation only after its replacement passes persistence and workflow tests.

Keep platform integration outside domain commands. Do not expose a generic SQL execution IPC API. Split domain modules from the growing native store when extending inventory, accounting, reservations and staff.
