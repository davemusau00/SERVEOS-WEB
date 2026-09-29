BEGIN IMMEDIATE;
CREATE TRIGGER IF NOT EXISTS receipt_document_no_update BEFORE UPDATE ON records
WHEN OLD.collection='receiptDocuments' OR NEW.collection='receiptDocuments'
BEGIN SELECT RAISE(ABORT,'Receipt documents are immutable'); END;
CREATE TRIGGER IF NOT EXISTS receipt_document_no_delete BEFORE DELETE ON records
WHEN OLD.collection='receiptDocuments'
BEGIN SELECT RAISE(ABORT,'Receipt documents are immutable'); END;
CREATE INDEX IF NOT EXISTS receipt_order_lookup ON records(json_extract(data,'$.orderId')) WHERE collection='receiptDocuments';
PRAGMA user_version=3;
COMMIT;
