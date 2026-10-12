-- Opt-in policy for newly reviewed bookings; existing snapshots remain unchanged.
ALTER TABLE business_hospitality_settings
 ADD COLUMN cash_upfront_required boolean NOT NULL DEFAULT false;

-- Keep the original immutable payment evidence and link new drawer receipts.
ALTER TABLE business_hospitality_payments
 ADD COLUMN till_session_id uuid,
 ADD CONSTRAINT hospitality_payment_till_fk FOREIGN KEY(business_id,till_session_id)
  REFERENCES till_sessions(business_id,id);
CREATE INDEX hospitality_payment_till_idx
 ON business_hospitality_payments(business_id,till_session_id,recorded_at,id)
 WHERE till_session_id IS NOT NULL;
