CREATE TABLE business_floor_tables (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 80),
  capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 1000),
  section text NOT NULL CHECK(length(btrim(section)) BETWEEN 1 AND 60),
  state text NOT NULL DEFAULT 'AVAILABLE' CHECK(state IN ('AVAILABLE','CLEANING')),
  ready_after_order_id uuid,
  shape text NOT NULL DEFAULT 'SQUARE' CHECK(shape IN ('SQUARE','RECTANGLE','ROUND','BAR_TOP')),
  pos_x numeric(5,2) NOT NULL CHECK(pos_x BETWEEN 0 AND 100),
  pos_y numeric(5,2) NOT NULL CHECK(pos_y BETWEEN 0 AND 100),
  minimum_spend_minor bigint NOT NULL DEFAULT 0 CHECK(minimum_spend_minor BETWEEN 0 AND 9007199254740991),
  is_joinable boolean NOT NULL DEFAULT true,
  assigned_server_id uuid,
  assigned_server_name text NOT NULL DEFAULT 'Unassigned' CHECK(length(btrim(assigned_server_name)) BETWEEN 1 AND 120),
  version bigint NOT NULL CHECK(version > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  FOREIGN KEY (business_id,outlet_id) REFERENCES business_outlets(business_id,id),
  FOREIGN KEY (business_id,assigned_server_id) REFERENCES api_staff_profiles(business_id,staff_id),
  FOREIGN KEY (business_id,ready_after_order_id) REFERENCES pos_orders(business_id,id)
);

CREATE UNIQUE INDEX business_floor_tables_active_label_idx
  ON business_floor_tables(business_id,outlet_id,lower(label)) WHERE archived_at IS NULL;
CREATE INDEX business_floor_tables_outlet_idx
  ON business_floor_tables(business_id,outlet_id,lower(label),id) WHERE archived_at IS NULL;

CREATE UNIQUE INDEX pos_orders_one_active_table_idx
  ON pos_orders(business_id,(service_reference->>'tableId'))
  WHERE service_destination='TABLE' AND state IN ('OPEN','FIRED') AND service_reference ? 'tableId';
