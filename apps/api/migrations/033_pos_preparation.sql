ALTER TABLE pos_order_lines
 ADD COLUMN preparation_status text CHECK(preparation_status IN ('FIRED','PREPARING','READY','SERVED')),
 ADD COLUMN preparation_updated_at timestamptz,
 ADD COLUMN preparation_updated_by uuid;
UPDATE pos_order_lines SET preparation_status='FIRED' WHERE state='FIRED';
-- Old FIRED lines prove firing only; do not fabricate preparation actors/times.
