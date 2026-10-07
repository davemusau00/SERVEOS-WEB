ALTER TABLE pos_orders
 ADD COLUMN customer_id uuid,
 ADD COLUMN customer_name_snapshot text,
 ADD COLUMN amount_credited_minor bigint NOT NULL DEFAULT 0 CHECK (amount_credited_minor >= 0),
 ADD CONSTRAINT pos_orders_customer_snapshot_check CHECK (
  (customer_id IS NULL AND customer_name_snapshot IS NULL)
  OR (customer_id IS NOT NULL AND customer_name_snapshot IS NOT NULL AND length(btrim(customer_name_snapshot)) BETWEEN 1 AND 160)
 ),
 ADD CONSTRAINT pos_orders_customer_fk FOREIGN KEY (business_id,customer_id)
  REFERENCES business_customers(business_id,id),
 ADD CONSTRAINT pos_orders_settlement_total_check CHECK (amount_paid_minor + amount_credited_minor <= grand_total_minor);

CREATE INDEX pos_orders_customer_history_idx
 ON pos_orders (business_id,customer_id,updated_at DESC,id)
 WHERE customer_id IS NOT NULL;

CREATE TABLE customer_credit_entries (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 customer_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('CHARGE','SETTLEMENT','WRITE_OFF','CHARGE_REVERSAL','SETTLEMENT_REVERSAL','WRITE_OFF_REVERSAL')),
 balance_delta_minor bigint NOT NULL CHECK (balance_delta_minor <> 0),
 amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 9007199254740991),
 order_id uuid,
 due_at timestamptz,
 payment_method text CHECK (payment_method IS NULL OR payment_method IN ('CASH','MPESA','CARD')),
 reference text NOT NULL DEFAULT '' CHECK (length(reference) <= 160),
 allocations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allocations)='array'),
 reverses_entry_id uuid,
 reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
 actor_id uuid NOT NULL,
 device_id uuid NOT NULL,
 source_command_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,id),
 UNIQUE (business_id,source_command_id),
 FOREIGN KEY (business_id,customer_id) REFERENCES customer_credit_accounts(business_id,customer_id),
 FOREIGN KEY (business_id,order_id) REFERENCES pos_orders(business_id,id),
 FOREIGN KEY (business_id,reverses_entry_id) REFERENCES customer_credit_entries(business_id,id),
 CHECK (
  (kind='CHARGE' AND balance_delta_minor=amount_minor AND order_id IS NOT NULL AND due_at IS NOT NULL AND payment_method IS NULL AND reverses_entry_id IS NULL)
  OR (kind='SETTLEMENT' AND balance_delta_minor=-amount_minor AND order_id IS NULL AND due_at IS NULL AND payment_method IS NOT NULL AND reverses_entry_id IS NULL)
  OR (kind='WRITE_OFF' AND balance_delta_minor=-amount_minor AND order_id IS NULL AND due_at IS NULL AND payment_method IS NULL AND reverses_entry_id IS NULL)
  OR (kind IN ('CHARGE_REVERSAL','SETTLEMENT_REVERSAL','WRITE_OFF_REVERSAL') AND order_id IS NULL AND due_at IS NULL AND reverses_entry_id IS NOT NULL)
 )
);

CREATE INDEX customer_credit_entries_statement_idx
 ON customer_credit_entries (business_id,customer_id,occurred_at,id);
CREATE INDEX customer_credit_entries_order_idx
 ON customer_credit_entries (business_id,order_id)
 WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX customer_credit_entries_reversal_idx
 ON customer_credit_entries (business_id,reverses_entry_id)
 WHERE reverses_entry_id IS NOT NULL;

CREATE TRIGGER customer_credit_entries_immutable
 BEFORE UPDATE OR DELETE ON customer_credit_entries
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
