CREATE TABLE business_till_policy (
 business_id uuid PRIMARY KEY REFERENCES businesses(id),
 scope text NOT NULL CHECK(scope IN ('SINGLE_BUSINESS','OUTLET','OPERATOR_DEVICE')),
 variance_threshold_minor bigint NOT NULL DEFAULT 0 CHECK(variance_threshold_minor>=0),
 version bigint NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE TABLE till_sessions (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 outlet_id uuid NOT NULL,
 scope_key text NOT NULL,
 policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot)='object'),
 operator_id uuid NOT NULL,
 device_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('OPEN','REVIEW_REQUIRED','CLOSED')),
 opening_float_minor bigint NOT NULL CHECK(opening_float_minor>=0),
 counted_cash_minor bigint CHECK(counted_cash_minor>=0),
 expected_cash_minor bigint CHECK(expected_cash_minor>=0),
 variance_minor bigint,
 variance_reason text,
 version bigint NOT NULL CHECK(version>0),
 opened_at timestamptz NOT NULL,
 counted_at timestamptz,
 closed_at timestamptz,
 closed_by uuid,
 review_reason text,
 PRIMARY KEY(business_id,id),
 FOREIGN KEY(business_id,outlet_id) REFERENCES business_outlets(business_id,id)
);
CREATE UNIQUE INDEX till_active_scope_uq ON till_sessions(business_id,scope_key) WHERE status<>'CLOSED';
CREATE UNIQUE INDEX till_active_operator_uq ON till_sessions(business_id,operator_id) WHERE status<>'CLOSED';
CREATE UNIQUE INDEX till_active_device_uq ON till_sessions(business_id,device_id) WHERE status<>'CLOSED';
CREATE INDEX till_outlet_idx ON till_sessions(business_id,outlet_id,status);
CREATE TABLE till_cash_entries (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 till_session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('PAID_IN','PAID_OUT','SALE','REFUND','PAYMENT_REVERSAL')),
 amount_delta_minor bigint NOT NULL CHECK(amount_delta_minor<>0),
 CHECK((kind IN ('PAID_IN','SALE') AND amount_delta_minor>0) OR (kind IN ('PAID_OUT','REFUND','PAYMENT_REVERSAL') AND amount_delta_minor<0)),
 reason text NOT NULL,
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 FOREIGN KEY(business_id,till_session_id) REFERENCES till_sessions(business_id,id)
);
CREATE INDEX till_cash_entries_session_idx ON till_cash_entries(business_id,till_session_id,occurred_at,id);
CREATE TRIGGER till_cash_entries_immutable BEFORE UPDATE OR DELETE ON till_cash_entries
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
