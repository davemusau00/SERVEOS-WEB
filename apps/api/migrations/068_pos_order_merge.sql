ALTER TABLE pos_orders DROP CONSTRAINT pos_orders_state_check;
ALTER TABLE pos_orders ADD CONSTRAINT pos_orders_state_check
 CHECK(state IN ('OPEN','FIRED','COMPLETED','VOIDED','MERGED'));

ALTER TABLE pos_orders
 ADD COLUMN merged_into_order_id uuid,
 ADD CONSTRAINT pos_order_merged_target_fk
  FOREIGN KEY (business_id,merged_into_order_id) REFERENCES pos_orders(business_id,id),
 ADD CONSTRAINT pos_order_merged_evidence CHECK(
  (state='MERGED' AND merged_into_order_id IS NOT NULL AND merged_into_order_id<>id
   AND amount_paid_minor=0 AND amount_credited_minor=0 AND room_charge_minor=0 AND refunded_amount_minor=0)
  OR (state<>'MERGED' AND merged_into_order_id IS NULL)
 );

DROP INDEX pos_orders_closed_history;
CREATE INDEX pos_orders_closed_history ON pos_orders(business_id,updated_at DESC,id)
 WHERE state IN ('COMPLETED','VOIDED','MERGED');
