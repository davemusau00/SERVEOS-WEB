BEGIN IMMEDIATE;

DROP TRIGGER IF EXISTS financial_history_no_update;
DROP TRIGGER IF EXISTS financial_history_no_delete;

CREATE TRIGGER financial_history_no_update
BEFORE UPDATE ON records
WHEN OLD.collection IN (
  'folioEntries','stayEvents','stayExtensions','payments','journalEntries',
  'customerCreditEntries','customerCreditReconciliations'
)
OR NEW.collection IN (
  'folioEntries','stayEvents','stayExtensions','payments','journalEntries',
  'customerCreditEntries','customerCreditReconciliations'
)
BEGIN SELECT RAISE(ABORT,'Immutable financial history'); END;

CREATE TRIGGER financial_history_no_delete
BEFORE DELETE ON records
WHEN OLD.collection IN (
  'folioEntries','stayEvents','stayExtensions','payments','journalEntries',
  'customerCreditEntries','customerCreditReconciliations'
)
BEGIN SELECT RAISE(ABORT,'Immutable financial history'); END;

CREATE INDEX IF NOT EXISTS customer_credit_entry_customer
ON records(json_extract(data,'$.customerId'), json_extract(data,'$.occurredAt'))
WHERE collection='customerCreditEntries';

CREATE INDEX IF NOT EXISTS customer_credit_entry_order
ON records(json_extract(data,'$.orderId'))
WHERE collection='customerCreditEntries';

CREATE INDEX IF NOT EXISTS customer_credit_entry_kind
ON records(json_extract(data,'$.kind'))
WHERE collection='customerCreditEntries';

CREATE INDEX IF NOT EXISTS customer_credit_reconciliation_customer
ON records(json_extract(data,'$.customerId'), json_extract(data,'$.reviewedAt'))
WHERE collection='customerCreditReconciliations';

PRAGMA user_version=13;
COMMIT;
