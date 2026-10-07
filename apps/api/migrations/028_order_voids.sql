ALTER TABLE pos_orders
 ADD COLUMN void_reason text,
 ADD COLUMN void_disposition text,
 ADD COLUMN voided_by uuid,
 ADD COLUMN voided_at timestamptz,
 ADD CONSTRAINT pos_order_void_evidence CHECK(
  (void_reason IS NULL AND void_disposition IS NULL AND voided_by IS NULL AND voided_at IS NULL) OR
  (state='VOIDED' AND amount_paid_minor=0 AND void_reason IS NOT NULL AND length(btrim(void_reason)) BETWEEN 3 AND 500
   AND void_disposition IS NOT NULL AND void_disposition IN ('NOT_FIRED','RETURN_SEALED','WASTE','CONSUMED','MANAGER_ADJUSTMENT') AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
 );
ALTER TABLE pos_order_lines ADD COLUMN void_previous_state text CHECK(void_previous_state IN ('DRAFT','FIRED')),
 ADD CONSTRAINT pos_line_void_origin CHECK(void_previous_state IS NULL OR state='VOIDED');
CREATE TABLE pos_void_stock_returns (
 business_id uuid NOT NULL,
 order_id uuid NOT NULL,
 line_id uuid NOT NULL,
 stock_item_id uuid NOT NULL,
 original_movement_id uuid NOT NULL,
 return_movement_id uuid NOT NULL,
 quantity numeric(18,6) NOT NULL CHECK(quantity>0),
 cost_minor bigint NOT NULL CHECK(cost_minor>=0),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 command_id uuid NOT NULL,
 PRIMARY KEY(business_id,order_id,line_id,stock_item_id),
 FOREIGN KEY(business_id,order_id,line_id,stock_item_id) REFERENCES pos_stock_consumptions(business_id,order_id,line_id,stock_item_id),
 FOREIGN KEY(business_id,original_movement_id) REFERENCES inventory_movements(business_id,id),
 FOREIGN KEY(business_id,return_movement_id) REFERENCES inventory_movements(business_id,id)
);
CREATE INDEX pos_void_returns_original_idx ON pos_void_stock_returns(business_id,original_movement_id);
CREATE INDEX pos_void_returns_movement_idx ON pos_void_stock_returns(business_id,return_movement_id);
CREATE INDEX business_documents_preparation_order_idx ON business_documents(business_id,(snapshot->>'orderId')) WHERE document_type IN ('KOT','BOT');
CREATE TRIGGER pos_void_returns_immutable BEFORE UPDATE OR DELETE ON pos_void_stock_returns
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
