INSERT INTO business_entity_versions(business_id,entity_type,entity_id,version)
SELECT business_id,'employees',staff_id::text,1 FROM api_staff_profiles
ON CONFLICT(business_id,entity_type,entity_id) DO NOTHING;

CREATE TABLE api_staff_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 staff_id uuid NOT NULL,
 staff_version bigint NOT NULL CHECK(staff_version>0),
 event_type text NOT NULL CHECK(event_type IN ('CREATED','UPDATED','DEACTIVATED')),
 before_state jsonb,
 after_state jsonb,
 reason text NOT NULL,
 command_id uuid NOT NULL,
 actor_staff_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,staff_id,staff_version),
 UNIQUE(business_id,command_id),
 FOREIGN KEY(business_id,staff_id) REFERENCES api_staff_profiles(business_id,staff_id),
 FOREIGN KEY(business_id,actor_staff_id) REFERENCES api_staff_profiles(business_id,staff_id)
);
