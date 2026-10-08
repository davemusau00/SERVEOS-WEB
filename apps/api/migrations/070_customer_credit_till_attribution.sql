ALTER TABLE customer_credit_entries
 DROP CONSTRAINT customer_credit_entries_settlement_evidence_check;

ALTER TABLE customer_credit_entries
 ADD CONSTRAINT customer_credit_entries_settlement_evidence_check CHECK (
  (kind='SETTLEMENT' AND payment_account_id IS NOT NULL AND payment_account_snapshot IS NOT NULL
   AND payment_account_snapshot->>'id'=payment_account_id::text AND payment_account_snapshot->>'method'=payment_method
   AND ((payment_method='CASH' AND till_session_id IS NOT NULL AND received_at IS NULL AND normalized_reference IS NULL)
    OR (payment_method IN ('MPESA','CARD') AND till_session_id IS NULL AND received_at IS NOT NULL AND normalized_reference=upper(btrim(reference)) AND length(btrim(reference)) BETWEEN 1 AND 160)))
  OR (kind='SETTLEMENT_REVERSAL' AND payment_account_id IS NULL AND payment_account_snapshot IS NULL AND received_at IS NULL AND normalized_reference IS NULL
   AND ((payment_method='CASH' AND till_session_id IS NOT NULL) OR (payment_method IN ('MPESA','CARD') AND till_session_id IS NULL)))
  OR (kind='CHARGE' AND payment_account_id IS NULL AND payment_account_snapshot IS NULL AND received_at IS NULL AND normalized_reference IS NULL)
  OR (kind NOT IN ('SETTLEMENT','SETTLEMENT_REVERSAL','CHARGE') AND payment_account_id IS NULL AND payment_account_snapshot IS NULL AND till_session_id IS NULL AND received_at IS NULL AND normalized_reference IS NULL)
 );

CREATE INDEX customer_credit_entries_till_idx
 ON customer_credit_entries(business_id,till_session_id,occurred_at,id)
 WHERE till_session_id IS NOT NULL;
