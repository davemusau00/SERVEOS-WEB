-- Expand-only period review foundation. Existing businesses start disabled.
CREATE TABLE business_accounting_period_policy (
 business_id uuid PRIMARY KEY REFERENCES businesses(id),
 enabled boolean NOT NULL DEFAULT false,
 version bigint NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL
);

CREATE TABLE business_accounting_periods (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 from_date date NOT NULL,
 to_date date NOT NULL,
 time_zone text NOT NULL,
 status text NOT NULL CHECK(status IN ('OPEN','REVIEW_REQUIRED','CLOSED')),
 version bigint NOT NULL CHECK(version>0),
 current_review_id uuid,
 last_closed_review_id uuid,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 closed_by uuid,
 closed_at timestamptz,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,from_date,to_date),
 CHECK(from_date<=to_date AND to_date-from_date<=366),
 CHECK((status='CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND last_closed_review_id IS NOT NULL)
    OR (status<>'CLOSED' AND closed_by IS NULL AND closed_at IS NULL))
);
CREATE INDEX business_accounting_periods_dates_idx ON business_accounting_periods(business_id,from_date,to_date,status);

CREATE TABLE business_accounting_period_reviews (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 period_id uuid NOT NULL,
 period_version bigint NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('REVIEW','CLOSE_REQUEST','CLOSED')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 assessment jsonb NOT NULL CHECK(jsonb_typeof(assessment)='object'),
 statement_snapshot jsonb NOT NULL CHECK(jsonb_typeof(statement_snapshot)='object'),
 snapshot_hash char(64) NOT NULL,
 source_command_id uuid NOT NULL,
 recorded_by uuid NOT NULL,
 recorded_by_name text NOT NULL,
 recorded_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,period_id) REFERENCES business_accounting_periods(business_id,id)
);
CREATE INDEX business_accounting_period_reviews_history_idx ON business_accounting_period_reviews(business_id,period_id,recorded_at DESC,id);
ALTER TABLE business_accounting_periods ADD FOREIGN KEY(business_id,current_review_id) REFERENCES business_accounting_period_reviews(business_id,id);
ALTER TABLE business_accounting_periods ADD FOREIGN KEY(business_id,last_closed_review_id) REFERENCES business_accounting_period_reviews(business_id,id);

CREATE TABLE business_accounting_period_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 period_id uuid,
 event_type text NOT NULL CHECK(event_type IN ('POLICY_CHANGED','REVIEWED','CLOSE_REQUIRES_REVIEW','CLOSED','REOPENED')),
 before_state jsonb NOT NULL CHECK(jsonb_typeof(before_state)='object'),
 after_state jsonb NOT NULL CHECK(jsonb_typeof(after_state)='object'),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,period_id) REFERENCES business_accounting_periods(business_id,id)
);
CREATE INDEX business_accounting_period_events_history_idx ON business_accounting_period_events(business_id,period_id,occurred_at DESC,id);
CREATE TRIGGER business_accounting_period_reviews_immutable BEFORE UPDATE OR DELETE ON business_accounting_period_reviews FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER business_accounting_period_events_immutable BEFORE UPDATE OR DELETE ON business_accounting_period_events FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();

CREATE FUNCTION servos_guard_accounting_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accounting period history cannot be deleted' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('accounting-period:'||NEW.business_id::text,0));
 IF TG_OP='UPDATE' AND (NEW.business_id<>OLD.business_id OR NEW.id<>OLD.id OR NEW.from_date<>OLD.from_date OR NEW.to_date<>OLD.to_date OR NEW.time_zone<>OLD.time_zone OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at) THEN
  RAISE EXCEPTION 'Accounting period identity and dates are immutable' USING ERRCODE='23514';
 END IF;
 IF EXISTS(SELECT 1 FROM business_accounting_periods p WHERE p.business_id=NEW.business_id AND p.id<>NEW.id AND p.from_date<=NEW.to_date AND p.to_date>=NEW.from_date) THEN
  RAISE EXCEPTION 'Accounting period dates overlap another period' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER business_accounting_periods_guard BEFORE INSERT OR UPDATE OR DELETE ON business_accounting_periods FOR EACH ROW EXECUTE FUNCTION servos_guard_accounting_period();

-- Guard every existing journal writer, including old binaries and procurement
-- handlers that insert journal headers directly. Disabling new period creation
-- never removes protection from a period already closed.
CREATE FUNCTION servos_guard_closed_accounting_posting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('accounting-period:'||NEW.business_id::text,0));
 IF EXISTS(SELECT 1 FROM business_accounting_periods p WHERE p.business_id=NEW.business_id AND p.status='CLOSED' AND (NEW.occurred_at AT TIME ZONE p.time_zone)::date BETWEEN p.from_date AND p.to_date) THEN
  RAISE EXCEPTION 'Posting date belongs to a closed accounting period; authorised reopening is required' USING ERRCODE='23514', CONSTRAINT='servos_accounting_period_closed';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER financial_journals_accounting_period BEFORE INSERT ON financial_journals FOR EACH ROW EXECUTE FUNCTION servos_guard_closed_accounting_posting();
CREATE TRIGGER hospitality_journals_accounting_period BEFORE INSERT ON business_hospitality_journals FOR EACH ROW EXECUTE FUNCTION servos_guard_closed_accounting_posting();
CREATE TRIGGER expense_journals_accounting_period BEFORE INSERT ON business_expense_journals FOR EACH ROW EXECUTE FUNCTION servos_guard_closed_accounting_posting();
