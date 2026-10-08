CREATE TABLE business_hospitality_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id),
  time_zone text NOT NULL DEFAULT 'Africa/Nairobi',
  nightly_checkout_time time NOT NULL DEFAULT '10:00',
  day_stay_cutoff_time time NOT NULL DEFAULT '18:00',
  room_stay_room_type_id uuid,
  room_stay_rate_plan_id uuid,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (nightly_checkout_time < day_stay_cutoff_time),
  CHECK ((room_stay_room_type_id IS NULL)=(room_stay_rate_plan_id IS NULL)),
  FOREIGN KEY (business_id,room_stay_room_type_id) REFERENCES business_room_types(business_id,id),
  FOREIGN KEY (business_id,room_stay_rate_plan_id) REFERENCES business_room_rate_plans(business_id,id)
);

ALTER TABLE business_room_reservations ADD COLUMN occupancy_starts_at timestamptz;
UPDATE business_room_reservations SET occupancy_starts_at=starts_at WHERE status='CHECKED_IN';

CREATE TABLE business_stays (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  room_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('CHECKED_IN','CHECKED_OUT')),
  checked_in_at timestamptz NOT NULL,
  checked_in_by uuid NOT NULL,
  checked_out_at timestamptz,
  checked_out_by uuid,
  version bigint NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,reservation_id),
  FOREIGN KEY (business_id,reservation_id) REFERENCES business_room_reservations(business_id,id),
  FOREIGN KEY (business_id,room_id) REFERENCES business_rooms(business_id,id),
  FOREIGN KEY (business_id,customer_id) REFERENCES business_customers(business_id,id),
  CHECK ((status='CHECKED_IN' AND checked_out_at IS NULL AND checked_out_by IS NULL) OR (status='CHECKED_OUT' AND checked_out_at IS NOT NULL AND checked_out_by IS NOT NULL))
);
CREATE UNIQUE INDEX business_stays_one_occupant_per_room ON business_stays(business_id,room_id) WHERE status='CHECKED_IN';

CREATE TABLE business_folios (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  currency char(3) NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
  balance_minor bigint NOT NULL DEFAULT 0 CHECK(balance_minor BETWEEN 0 AND 9007199254740991),
  deposit_minor bigint NOT NULL DEFAULT 0 CHECK(deposit_minor BETWEEN 0 AND 9007199254740991),
  status text NOT NULL CHECK(status IN ('OPEN','CLOSED')),
  version bigint NOT NULL CHECK(version > 0),
  opened_at timestamptz NOT NULL,
  opened_by uuid NOT NULL,
  closed_at timestamptz,
  closed_by uuid,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,reservation_id),
  FOREIGN KEY (business_id,reservation_id) REFERENCES business_room_reservations(business_id,id),
  FOREIGN KEY (business_id,customer_id) REFERENCES business_customers(business_id,id),
  CHECK ((status='OPEN' AND closed_at IS NULL AND closed_by IS NULL) OR (status='CLOSED' AND closed_at IS NOT NULL AND closed_by IS NOT NULL))
);

CREATE TABLE business_hotel_services (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  price_minor bigint NOT NULL CHECK(price_minor BETWEEN 0 AND 9007199254740991),
  tax_basis_points integer NOT NULL DEFAULT 0 CHECK(tax_basis_points BETWEEN 0 AND 10000),
  currency char(3) NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
  version bigint NOT NULL CHECK(version>0),
  archived_at timestamptz,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id)
);
CREATE UNIQUE INDEX business_hotel_services_active_code ON business_hotel_services(business_id,lower(code)) WHERE archived_at IS NULL;

CREATE TABLE business_folio_entries (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  folio_id uuid NOT NULL,
  source_key text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('CHARGE','PAYMENT','DEPOSIT','DEPOSIT_APPLIED','REVERSAL','ADJUSTMENT')),
  source_type text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 0 AND 9007199254740991),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor BETWEEN 0 AND amount_minor),
  balance_delta_minor bigint NOT NULL,
  deposit_delta_minor bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
  source_command_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  posted_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,folio_id,source_key),
  FOREIGN KEY (business_id,folio_id) REFERENCES business_folios(business_id,id),
  CHECK (abs(balance_delta_minor)<=9007199254740991 AND abs(deposit_delta_minor)<=9007199254740991)
);
CREATE INDEX business_folio_entries_history ON business_folio_entries(business_id,folio_id,posted_at,id);

CREATE TABLE business_hospitality_payments (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  folio_id uuid NOT NULL,
  account_id uuid NOT NULL,
  account_snapshot jsonb NOT NULL CHECK(jsonb_typeof(account_snapshot)='object'),
  purpose text NOT NULL CHECK(purpose IN ('DEPOSIT','SETTLEMENT')),
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
  cash_tendered_minor bigint,
  change_minor bigint,
  external_reference text,
  normalized_reference text,
  received_amount_minor bigint,
  external_received_at timestamptz,
  confirmation text NOT NULL CHECK(confirmation IN ('CASH_RECEIVED','MANUALLY_CONFIRMED')),
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  source_command_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,source_command_id),
  FOREIGN KEY (business_id,folio_id) REFERENCES business_folios(business_id,id),
  FOREIGN KEY (business_id,account_id) REFERENCES payment_accounts(business_id,id),
  CHECK ((confirmation='CASH_RECEIVED' AND cash_tendered_minor>=amount_minor AND change_minor=cash_tendered_minor-amount_minor AND external_reference IS NULL AND received_amount_minor IS NULL AND external_received_at IS NULL) OR (confirmation='MANUALLY_CONFIRMED' AND cash_tendered_minor IS NULL AND change_minor IS NULL)),
  CHECK (account_snapshot->>'method'<>'MPESA' OR (confirmation='MANUALLY_CONFIRMED' AND external_reference IS NOT NULL AND received_amount_minor=amount_minor AND external_received_at IS NOT NULL))
);
CREATE UNIQUE INDEX business_hospitality_external_reference ON business_hospitality_payments(business_id,account_id,normalized_reference) WHERE normalized_reference IS NOT NULL;

CREATE TABLE business_hospitality_journals (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  folio_id uuid NOT NULL,
  source_key text NOT NULL,
  source_command_id uuid NOT NULL,
  currency char(3) NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
  total_minor bigint NOT NULL CHECK(total_minor BETWEEN 1 AND 9007199254740991),
  description text NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  UNIQUE (business_id,source_key),
  FOREIGN KEY (business_id,folio_id) REFERENCES business_folios(business_id,id)
);
CREATE TABLE business_hospitality_journal_lines (
  business_id uuid NOT NULL,
  journal_id uuid NOT NULL,
  line_number smallint NOT NULL CHECK(line_number BETWEEN 1 AND 4),
  account_code text NOT NULL CHECK(account_code IN ('ASSET_TENDER','GUEST_RECEIVABLE','GUEST_DEPOSITS','REVENUE_ACCOMMODATION','REVENUE_SERVICE','REVENUE_ADJUSTMENT','LIABILITY_TAX')),
  account_ref uuid,
  debit_minor bigint NOT NULL CHECK(debit_minor BETWEEN 0 AND 9007199254740991),
  credit_minor bigint NOT NULL CHECK(credit_minor BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY (business_id,journal_id,line_number),
  FOREIGN KEY (business_id,journal_id) REFERENCES business_hospitality_journals(business_id,id),
  FOREIGN KEY (business_id,account_ref) REFERENCES payment_accounts(business_id,id),
  CHECK ((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0)),
  CHECK ((account_code='ASSET_TENDER' AND account_ref IS NOT NULL) OR (account_code<>'ASSET_TENDER' AND account_ref IS NULL))
);

CREATE TABLE business_stay_events (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  stay_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  room_id uuid NOT NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL CHECK(jsonb_typeof(event_data)='object'),
  source_command_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (business_id,id),
  FOREIGN KEY (business_id,stay_id) REFERENCES business_stays(business_id,id),
  FOREIGN KEY (business_id,reservation_id) REFERENCES business_room_reservations(business_id,id),
  FOREIGN KEY (business_id,room_id) REFERENCES business_rooms(business_id,id)
);
CREATE INDEX business_stay_events_history ON business_stay_events(business_id,stay_id,occurred_at,id);

CREATE TABLE business_stay_extensions (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  stay_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  rate_snapshot jsonb NOT NULL CHECK(jsonb_typeof(rate_snapshot)='object'),
  units integer NOT NULL CHECK(units BETWEEN 1 AND 366),
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
  payment_id uuid NOT NULL,
  source_command_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY(business_id,id),
  UNIQUE(business_id,source_command_id),
  FOREIGN KEY(business_id,stay_id) REFERENCES business_stays(business_id,id),
  FOREIGN KEY(business_id,reservation_id) REFERENCES business_room_reservations(business_id,id),
  FOREIGN KEY(business_id,payment_id) REFERENCES business_hospitality_payments(business_id,id)
);
CREATE TRIGGER business_stay_extensions_immutable BEFORE UPDATE OR DELETE ON business_stay_extensions FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();

CREATE TABLE business_room_blocks (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  room_id uuid NOT NULL,
  work_order_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  reason text NOT NULL,
  status text NOT NULL CHECK(status IN ('ACTIVE','RESOLVED')),
  source_command_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  PRIMARY KEY (business_id,id),
  FOREIGN KEY (business_id,room_id) REFERENCES business_rooms(business_id,id),
  CHECK (ends_at IS NULL OR ends_at>starts_at),
  CHECK ((status='ACTIVE' AND resolved_by IS NULL AND resolved_at IS NULL) OR (status='RESOLVED' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX business_room_blocks_active_idx ON business_room_blocks(business_id,room_id,starts_at,ends_at) WHERE status='ACTIVE';

CREATE TABLE business_maintenance_work_orders (
  business_id uuid NOT NULL REFERENCES businesses(id),
  id uuid NOT NULL,
  room_id uuid NOT NULL,
  block_id uuid NOT NULL,
  title text NOT NULL,
  fault text NOT NULL,
  status text NOT NULL CHECK(status IN ('OPEN','RESOLVED')),
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text,
  version bigint NOT NULL CHECK(version>0),
  PRIMARY KEY (business_id,id),
  FOREIGN KEY (business_id,room_id) REFERENCES business_rooms(business_id,id),
  FOREIGN KEY (business_id,block_id) REFERENCES business_room_blocks(business_id,id),
  CHECK ((status='OPEN' AND resolved_by IS NULL AND resolved_at IS NULL AND resolution IS NULL) OR (status='RESOLVED' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND length(btrim(resolution))>=3))
);

CREATE FUNCTION servos_check_hospitality_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE key uuid; header business_hospitality_journals%ROWTYPE; debits numeric; credits numeric; tender_count integer;
BEGIN
 IF TG_TABLE_NAME='business_hospitality_journals' THEN key:=NEW.id; ELSE key:=NEW.journal_id; END IF;
 SELECT * INTO STRICT header FROM business_hospitality_journals WHERE business_id=NEW.business_id AND id=key;
 SELECT COALESCE(sum(debit_minor),0),COALESCE(sum(credit_minor),0),count(*) FILTER(WHERE account_code='ASSET_TENDER') INTO debits,credits,tender_count FROM business_hospitality_journal_lines WHERE business_id=NEW.business_id AND journal_id=key;
 IF debits<>header.total_minor OR credits<>header.total_minor OR tender_count>1 THEN RAISE EXCEPTION 'Hospitality journal does not balance' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER hospitality_journal_header_balanced AFTER INSERT ON business_hospitality_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_hospitality_journal();
CREATE CONSTRAINT TRIGGER hospitality_journal_lines_balanced AFTER INSERT ON business_hospitality_journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_hospitality_journal();

CREATE TRIGGER business_folio_entries_immutable BEFORE UPDATE OR DELETE ON business_folio_entries FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER business_hospitality_payments_immutable BEFORE UPDATE OR DELETE ON business_hospitality_payments FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER business_hospitality_journals_immutable BEFORE UPDATE OR DELETE ON business_hospitality_journals FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER business_hospitality_journal_lines_immutable BEFORE UPDATE OR DELETE ON business_hospitality_journal_lines FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER business_stay_events_immutable BEFORE UPDATE OR DELETE ON business_stay_events FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
