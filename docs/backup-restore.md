# Backup and restore

PostgreSQL backup policy and restore execution are managed outside this repository. Configure encrypted backups, retention and access in the hosting environment. A successful backup job is not restore evidence.

Before a release that changes schema, restore a recent backup into an isolated database, run the API migrations, and verify the restored business identity and representative totals. Keep production writes disabled during a rehearsal. Record the backup timestamp, migration head, restore result and reviewer outside the database being restored.

Browser IndexedDB is not a business backup. The local PostgreSQL rehearsal is separate from hosted backup status. A successful local restore does not prove remote encryption, offsite retention or disaster recovery.

The web workspace's System health panel currently reports backup status as “Not reported.” Verify backup creation and restoration through the configured backup service; the panel does not infer success from the presence of backup scripts.
