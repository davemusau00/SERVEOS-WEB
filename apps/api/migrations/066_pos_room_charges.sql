ALTER TABLE pos_orders
  DROP CONSTRAINT IF EXISTS pos_orders_settlement_total_check,
  ADD COLUMN room_charge_minor bigint NOT NULL DEFAULT 0 CHECK (room_charge_minor >= 0),
  ADD CONSTRAINT pos_orders_settlement_total_check
    CHECK (amount_paid_minor + amount_credited_minor + room_charge_minor <= grand_total_minor);

CREATE TABLE pos_order_room_charges (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  order_id uuid NOT NULL,
  folio_id uuid NOT NULL,
  folio_entry_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  net_minor bigint NOT NULL CHECK (net_minor >= 0),
  vat_minor bigint NOT NULL CHECK (vat_minor >= 0),
  levy_minor bigint NOT NULL CHECK (levy_minor >= 0),
  source_command_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,source_command_id),
  UNIQUE (business_id,folio_entry_id),
  FOREIGN KEY (business_id,order_id) REFERENCES pos_orders(business_id,id),
  FOREIGN KEY (business_id,folio_id) REFERENCES business_folios(business_id,id),
  FOREIGN KEY (business_id,folio_entry_id) REFERENCES business_folio_entries(business_id,id),
  CHECK (amount_minor = net_minor + vat_minor + levy_minor)
);
CREATE INDEX pos_order_room_charges_order_idx ON pos_order_room_charges(business_id,order_id,occurred_at,id);
CREATE INDEX pos_order_room_charges_folio_idx ON pos_order_room_charges(business_id,folio_id,occurred_at,id);

CREATE TABLE pos_order_room_charge_reversals (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  room_charge_id uuid NOT NULL,
  order_id uuid NOT NULL,
  folio_id uuid NOT NULL,
  folio_entry_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  net_minor bigint NOT NULL CHECK (net_minor >= 0),
  vat_minor bigint NOT NULL CHECK (vat_minor >= 0),
  levy_minor bigint NOT NULL CHECK (levy_minor >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  source_command_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,room_charge_id),
  UNIQUE (business_id,source_command_id),
  UNIQUE (business_id,folio_entry_id),
  FOREIGN KEY (business_id,room_charge_id) REFERENCES pos_order_room_charges(business_id,id),
  FOREIGN KEY (business_id,order_id) REFERENCES pos_orders(business_id,id),
  FOREIGN KEY (business_id,folio_id) REFERENCES business_folios(business_id,id),
  FOREIGN KEY (business_id,folio_entry_id) REFERENCES business_folio_entries(business_id,id),
  CHECK (amount_minor = net_minor + vat_minor + levy_minor)
);
CREATE INDEX pos_order_room_charge_reversals_order_idx ON pos_order_room_charge_reversals(business_id,order_id,occurred_at,id);

CREATE TRIGGER pos_order_room_charges_immutable
  BEFORE UPDATE OR DELETE ON pos_order_room_charges
  FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER pos_order_room_charge_reversals_immutable
  BEFORE UPDATE OR DELETE ON pos_order_room_charge_reversals
  FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
