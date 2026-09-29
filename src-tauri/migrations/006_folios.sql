BEGIN IMMEDIATE;

CREATE TRIGGER IF NOT EXISTS financial_history_no_update
BEFORE UPDATE ON records
WHEN OLD.collection IN ('folioEntries','stayEvents','stayExtensions','payments','journalEntries')
   OR NEW.collection IN ('folioEntries','stayEvents','stayExtensions','payments','journalEntries')
BEGIN SELECT RAISE(ABORT,'Immutable financial history'); END;

CREATE TRIGGER IF NOT EXISTS financial_history_no_delete
BEFORE DELETE ON records
WHEN OLD.collection IN ('folioEntries','stayEvents','stayExtensions','payments','journalEntries')
BEGIN SELECT RAISE(ABORT,'Immutable financial history'); END;

CREATE INDEX IF NOT EXISTS folio_entry_lookup
ON records(json_extract(data,'$.folioId')) WHERE collection='folioEntries';

CREATE INDEX IF NOT EXISTS stay_event_lookup
ON records(json_extract(data,'$.stayId')) WHERE collection='stayEvents';

CREATE INDEX IF NOT EXISTS payment_folio_lookup
ON records(json_extract(data,'$.folioId')) WHERE collection='payments';

PRAGMA user_version=6;
COMMIT;
