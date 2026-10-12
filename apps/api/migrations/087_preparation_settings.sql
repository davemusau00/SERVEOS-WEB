CREATE TABLE business_preparation_settings (
 business_id uuid PRIMARY KEY REFERENCES businesses(id),
 overdue_minutes jsonb NOT NULL CHECK (jsonb_typeof(overdue_minutes)='object'
  AND overdue_minutes ?& ARRAY['BAR','KITCHEN','ROOMS']
  AND overdue_minutes - ARRAY['BAR','KITCHEN','ROOMS'] = '{}'::jsonb
  AND jsonb_typeof(overdue_minutes->'BAR')='number'
  AND jsonb_typeof(overdue_minutes->'KITCHEN')='number'
  AND jsonb_typeof(overdue_minutes->'ROOMS')='number'
  AND (overdue_minutes->>'BAR')::integer BETWEEN 1 AND 240
  AND (overdue_minutes->>'KITCHEN')::integer BETWEEN 1 AND 240
  AND (overdue_minutes->>'ROOMS')::integer BETWEEN 1 AND 240),
 version bigint NOT NULL CHECK(version>0),
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE TABLE business_preparation_settings_events (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 source_command_id uuid NOT NULL,
 before_minutes jsonb,
 after_minutes jsonb NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_command_id)
);
CREATE TRIGGER preparation_settings_events_immutable BEFORE UPDATE OR DELETE ON business_preparation_settings_events
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
