# Local database restore rehearsal

`rehearse-local.sh` verifies a PostgreSQL custom-format dump against a pre-created, empty disposable restore database. It writes the dump to a private temporary directory, restores with `pg_restore`, compares ServOS financial and inventory totals, and removes the temporary dump. It does not read `BACKUP_REMOTE`, delete the source database, or overwrite a target that contains user objects.

The source and restore databases must have the ServOS schema applied. Supply normal PostgreSQL client connection variables (`PGHOST`, `PGPORT`, `PGUSER`, and `PGPASSWORD` when needed), set `PGDATABASE` to the source, and set `RESTORE_DATABASE` to a different, already-created empty database. Keep both databases local and disposable for this rehearsal.

The real PostgreSQL browser acceptance can run this rehearsal at the end of its fresh-schema business flow. Set `TEST_PG_CONTAINER` to the name of that disposable PostgreSQL container in addition to the required `TEST_DATABASE_URL`. The test creates a random empty restore database, streams the checked-in script into the container, compares totals after restore, and removes the restore database in cleanup. No password is sent to the container process; the test uses the container's local PostgreSQL socket.

This proves local dump/restore compatibility for the exercised data. It does not establish encrypted remote backup delivery, retention, off-host recovery, or a production restore procedure.
