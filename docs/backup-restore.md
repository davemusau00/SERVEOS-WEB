# Backup and restore

PostgreSQL backup policy and restore execution are managed outside this repository. Configure encrypted backups, retention and access in the hosting environment. A successful backup job is not restore evidence.

Before a release that changes schema, restore a recent backup into an isolated database, run the API migrations, and verify the restored business identity and representative totals. Keep production writes disabled during a rehearsal. Record the backup timestamp, migration head, restore result and reviewer outside the database being restored.

The Print Bridge has its own transport queue. It is not a backup of business records. Browser IndexedDB is also not a business backup. This repository currently has no automated PostgreSQL backup/restore acceptance gate; that release gate remains open.
