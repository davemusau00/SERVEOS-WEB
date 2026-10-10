# Database

PostgreSQL is the durable business database. The API owns its schema under `apps/api/migrations/`; the runner sorts numbered SQL files, records applied names in `api_schema_migrations`, and serializes migration transactions with a PostgreSQL advisory lock.

The current migration set ends at `071_business_setup.sql`. Add new schema changes as a forward numbered migration. Do not edit an applied migration to repair production data; create a reviewed corrective migration.

Business mutations run through the API command kernel and a PostgreSQL transaction. Command outcome, audit evidence, entity versions and change-feed records follow the handler's declared contract. Browser IndexedDB is a recoverable projection and command queue, not the durable server database.

`business_setup` stores first-run status, the current step, selected business profile and stable IDs for the initial outlet, storage and payment plan. It is created in the same transaction as the first administrator. Its projection is versioned through `business_entity_versions`; browser storage is only a cache of the server state. Existing businesses are not backfilled into this table, so the new first-run gate does not block their current operation.

Print job state and operator delivery confirmation are recorded through the API. Browser IndexedDB may retain a local projection, but it is not proof of physical paper delivery and is not a business backup.
