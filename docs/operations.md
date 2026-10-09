# Operations

The API exposes liveness and database readiness health routes. Monitor API availability, database connections, failed commands, unresolved command outcomes, migration head, async job backlog and print delivery uncertainty.

Use the API activity and recovery surfaces to investigate queued or unknown browser commands. Preserve their original command IDs until the API returns a durable outcome. Do not solve an uncertain print job by sending it repeatedly; check the printer first.

The worker supports leased jobs, retry delay, heartbeats and terminal failure state, but the current registration has no job handlers. Monitor that it remains idle until a supported handler is added. Production runbooks must state who responds to API, database and printer incidents.
