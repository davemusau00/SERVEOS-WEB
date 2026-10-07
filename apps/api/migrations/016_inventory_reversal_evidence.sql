-- Existing ledger rows intentionally remain without restoration evidence.
CREATE TABLE inventory_movement_states (
 business_id uuid NOT NULL,
 movement_id uuid NOT NULL,
 before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state)='object'),
 after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state)='object'),
 base_unit text NOT NULL,
 average_unit_cost_minor bigint NOT NULL CHECK (average_unit_cost_minor >= 0),
 sealed_container_size numeric(18,6),
 PRIMARY KEY (business_id,movement_id),
 FOREIGN KEY (business_id,movement_id) REFERENCES inventory_movements(business_id,id)
);

CREATE TABLE inventory_reversals (
 business_id uuid NOT NULL REFERENCES businesses(id),
 original_command_id uuid NOT NULL,
 original_movement_id uuid NOT NULL,
 movement_ids uuid[] NOT NULL,
 reversal_command_id uuid NOT NULL,
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
 staff_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY (business_id,original_command_id),
 FOREIGN KEY (business_id,original_movement_id) REFERENCES inventory_movements(business_id,id),
 UNIQUE (business_id,reversal_command_id)
);
