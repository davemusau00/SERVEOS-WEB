ALTER TABLE customer_credit_entries
 ADD COLUMN payment_account_id uuid,
 ADD COLUMN payment_account_snapshot jsonb,
 ADD COLUMN till_session_id uuid,
 ADD COLUMN received_at timestamptz,
 ADD COLUMN normalized_reference text,
 ADD CONSTRAINT customer_credit_entries_payment_account_fk FOREIGN KEY (business_id,payment_account_id) REFERENCES payment_accounts(business_id,id),
 ADD CONSTRAINT customer_credit_entries_till_fk FOREIGN KEY (business_id,till_session_id) REFERENCES till_sessions(business_id,id),
 ADD CONSTRAINT customer_credit_entries_payment_snapshot_check CHECK (payment_account_snapshot IS NULL OR jsonb_typeof(payment_account_snapshot)='object'),
 ADD CONSTRAINT customer_credit_entries_settlement_evidence_check CHECK (
  (kind='SETTLEMENT' AND payment_account_id IS NOT NULL AND payment_account_snapshot IS NOT NULL
   AND payment_account_snapshot->>'id'=payment_account_id::text AND payment_account_snapshot->>'method'=payment_method
   AND ((payment_method='CASH' AND till_session_id IS NOT NULL AND received_at IS NULL AND normalized_reference IS NULL)
    OR (payment_method IN ('MPESA','CARD') AND till_session_id IS NULL AND received_at IS NOT NULL AND normalized_reference=upper(btrim(reference)) AND length(btrim(reference)) BETWEEN 1 AND 160)))
  OR (kind='SETTLEMENT_REVERSAL' AND payment_account_id IS NULL AND payment_account_snapshot IS NULL AND received_at IS NULL AND normalized_reference IS NULL
   AND ((payment_method='CASH' AND till_session_id IS NOT NULL) OR (payment_method IN ('MPESA','CARD') AND till_session_id IS NULL)))
  OR (kind NOT IN ('SETTLEMENT','SETTLEMENT_REVERSAL') AND payment_account_id IS NULL AND payment_account_snapshot IS NULL AND till_session_id IS NULL AND received_at IS NULL AND normalized_reference IS NULL)
 );

CREATE UNIQUE INDEX customer_credit_settlement_reference_idx
 ON customer_credit_entries(business_id,payment_method,normalized_reference)
 WHERE normalized_reference IS NOT NULL;

CREATE UNIQUE INDEX customer_credit_settlement_return_reference_idx
 ON customer_credit_entries(business_id,payment_method,upper(reference))
 WHERE kind='SETTLEMENT_REVERSAL' AND payment_method IN ('MPESA','CARD') AND reference IS NOT NULL;

ALTER TABLE till_cash_entries DROP CONSTRAINT till_cash_entries_kind_check;
ALTER TABLE till_cash_entries DROP CONSTRAINT till_cash_entries_check;
ALTER TABLE till_cash_entries ADD CONSTRAINT till_cash_entries_kind_check CHECK(kind IN ('PAID_IN','PAID_OUT','SALE','REFUND','PAYMENT_REVERSAL','CREDIT_COLLECTION','CREDIT_COLLECTION_REVERSAL'));
ALTER TABLE till_cash_entries ADD CONSTRAINT till_cash_entries_direction_check CHECK(
 (kind IN ('PAID_IN','SALE','CREDIT_COLLECTION') AND amount_delta_minor>0)
 OR (kind IN ('PAID_OUT','REFUND','PAYMENT_REVERSAL','CREDIT_COLLECTION_REVERSAL') AND amount_delta_minor<0)
);
