CREATE SEQUENCE customer_credit_entry_sequence;
ALTER TABLE customer_credit_entries ADD COLUMN entry_sequence bigint;
WITH ordered AS (
 SELECT business_id,id,row_number() OVER(ORDER BY business_id,customer_id,occurred_at,id)::bigint AS sequence
 FROM customer_credit_entries
)
UPDATE customer_credit_entries e SET entry_sequence=o.sequence FROM ordered o WHERE e.business_id=o.business_id AND e.id=o.id;
SELECT setval('customer_credit_entry_sequence',COALESCE((SELECT max(entry_sequence) FROM customer_credit_entries),1),EXISTS(SELECT 1 FROM customer_credit_entries));
ALTER TABLE customer_credit_entries ALTER COLUMN entry_sequence SET DEFAULT nextval('customer_credit_entry_sequence');
ALTER TABLE customer_credit_entries ALTER COLUMN entry_sequence SET NOT NULL;
ALTER SEQUENCE customer_credit_entry_sequence OWNED BY customer_credit_entries.entry_sequence;
CREATE UNIQUE INDEX customer_credit_entries_sequence_idx ON customer_credit_entries(business_id,customer_id,entry_sequence);
