ALTER TABLE pos_offline_cash_reconciliations ADD COLUMN revision bigint NOT NULL DEFAULT 1;
ALTER TABLE pos_offline_cash_reconciliations ADD COLUMN resolved_by uuid;
ALTER TABLE pos_offline_cash_reconciliations ADD COLUMN resolution_command_id uuid;
ALTER TABLE pos_offline_cash_reconciliations ADD COLUMN resolution_reason text;
INSERT INTO business_entity_versions(business_id,entity_type,entity_id,version)
 SELECT business_id,'offlineCashReconciliations',sale_id,revision FROM pos_offline_cash_reconciliations
 ON CONFLICT(business_id,entity_type,entity_id) DO NOTHING;
CREATE UNIQUE INDEX offline_cash_one_server_sale ON pos_offline_cash_reconciliations(business_id,server_order_id) WHERE server_order_id IS NOT NULL;
CREATE TABLE pos_checkout_handoffs (
 business_id uuid NOT NULL REFERENCES businesses(id), command_id uuid NOT NULL,
 previous_device_id uuid NOT NULL, next_device_id uuid NOT NULL, outlet_id uuid NOT NULL,
 approved_by uuid NOT NULL, reason text NOT NULL, occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,command_id)
);
