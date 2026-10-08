CREATE TABLE business_room_types (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  max_guests integer NOT NULL CHECK (max_guests BETWEEN 1 AND 1000),
  version integer NOT NULL CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  PRIMARY KEY (business_id,id)
);

CREATE UNIQUE INDEX business_room_types_active_code_uq
  ON business_room_types (business_id,lower(code)) WHERE archived_at IS NULL;

CREATE TABLE business_rooms (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  number text NOT NULL,
  room_type_id uuid NOT NULL,
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 1000),
  turnaround_minutes integer NOT NULL DEFAULT 30 CHECK (turnaround_minutes BETWEEN 0 AND 10080),
  floor text NOT NULL DEFAULT '',
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(amenities)='array'),
  notes text NOT NULL DEFAULT '',
  housekeeping_state text NOT NULL DEFAULT 'READY' CHECK (housekeeping_state IN ('DIRTY','CLEANING','INSPECTED','READY','OUT_OF_SERVICE')),
  maintenance_state text NOT NULL DEFAULT 'AVAILABLE' CHECK (maintenance_state IN ('AVAILABLE','OUT_OF_SERVICE')),
  housekeeping_at timestamptz,
  housekeeping_by uuid,
  version integer NOT NULL CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  PRIMARY KEY (business_id,id),
  FOREIGN KEY (business_id,room_type_id) REFERENCES business_room_types(business_id,id)
);

CREATE UNIQUE INDEX business_rooms_active_number_uq
  ON business_rooms (business_id,lower(number)) WHERE archived_at IS NULL;
CREATE INDEX business_rooms_type_idx ON business_rooms (business_id,room_type_id,number);

CREATE TABLE business_room_rate_plans (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  name text NOT NULL,
  room_type_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('NIGHTLY','DAY_USE')),
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'KES' CHECK (currency='KES'),
  tax_basis_points integer NOT NULL DEFAULT 0 CHECK (tax_basis_points BETWEEN 0 AND 10000),
  duration_minutes integer CHECK (duration_minutes BETWEEN 30 AND 1440),
  notes text NOT NULL DEFAULT '',
  version integer NOT NULL CHECK (version > 0),
  created_by uuid NOT NULL,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  PRIMARY KEY (business_id,id),
  FOREIGN KEY (business_id,room_type_id) REFERENCES business_room_types(business_id,id),
  CHECK ((mode='NIGHTLY' AND duration_minutes IS NULL) OR (mode='DAY_USE' AND duration_minutes IS NOT NULL))
);

CREATE UNIQUE INDEX business_room_rate_plans_active_name_uq
  ON business_room_rate_plans (business_id,room_type_id,lower(name)) WHERE archived_at IS NULL;

CREATE TABLE business_room_reservations (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  room_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  guests integer NOT NULL CHECK (guests BETWEEN 1 AND 1000),
  stay_type text NOT NULL CHECK (stay_type IN ('NIGHTLY','DAY')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  blocked_until timestamptz NOT NULL,
  turnaround_minutes integer NOT NULL CHECK (turnaround_minutes BETWEEN 0 AND 10080),
  status text NOT NULL CHECK (status IN ('RESERVED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW')),
  rate_snapshot jsonb NOT NULL CHECK (jsonb_typeof(rate_snapshot)='object'),
  units integer NOT NULL CHECK (units BETWEEN 1 AND 10000),
  quoted_amount_minor bigint NOT NULL CHECK (quoted_amount_minor >= 0),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  version integer NOT NULL CHECK (version > 0),
  created_by uuid NOT NULL,
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  PRIMARY KEY (business_id,id),
  FOREIGN KEY (business_id,room_id) REFERENCES business_rooms(business_id,id),
  FOREIGN KEY (business_id,rate_plan_id) REFERENCES business_room_rate_plans(business_id,id),
  FOREIGN KEY (business_id,customer_id) REFERENCES business_customers(business_id,id),
  CHECK (ends_at > starts_at),
  CHECK (blocked_until >= ends_at)
);

CREATE INDEX business_room_reservations_room_window_idx
  ON business_room_reservations (business_id,room_id,starts_at,blocked_until)
  WHERE archived_at IS NULL AND status IN ('RESERVED','CHECKED_IN');
CREATE INDEX business_room_reservations_customer_idx
  ON business_room_reservations (business_id,customer_id,starts_at DESC);

CREATE TABLE business_room_events (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  reservation_id uuid,
  room_id uuid,
  entity_type text NOT NULL CHECK (entity_type IN ('ROOM_TYPE','ROOM','RATE_PLAN','RESERVATION')),
  entity_id uuid NOT NULL,
  entity_version integer NOT NULL CHECK (entity_version > 0),
  event_type text NOT NULL,
  event_data jsonb NOT NULL CHECK (jsonb_typeof(event_data)='object'),
  command_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id)
);

CREATE INDEX business_room_events_reservation_idx
  ON business_room_events (business_id,reservation_id,occurred_at,id);
