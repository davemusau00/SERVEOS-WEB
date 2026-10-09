# Database

PostgreSQL is the durable business database. The API owns its schema under `apps/api/migrations/`; the runner sorts numbered SQL files, records applied names in `api_schema_migrations`, and serializes migration transactions with a PostgreSQL advisory lock.

The current migration set ends at `070_customer_credit_till_attribution.sql`. Add new schema changes as a forward numbered migration. Do not edit an applied migration to repair production data; create a reviewed corrective migration.

Business mutations run through the API command kernel and a PostgreSQL transaction. Command outcome, audit evidence, entity versions and change-feed records follow the handler's declared contract. Browser IndexedDB is a recoverable projection and command queue, not the durable server database.

The Print Bridge has a separate local SQLite queue for printer delivery state. That database contains print transport jobs only and is not a business authority.
