CREATE TABLE api_manager_approvals (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 token_hash char(64) NOT NULL,
 issuer_staff_id uuid NOT NULL,
 recipient_staff_id uuid NOT NULL,
 permission text NOT NULL,
 target_id text NOT NULL,
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 consumed_by uuid,
 consumed_command_id uuid,
 PRIMARY KEY(business_id,id),
 UNIQUE(token_hash),
 FOREIGN KEY(business_id,issuer_staff_id) REFERENCES api_staff_profiles(business_id,staff_id),
 FOREIGN KEY(business_id,recipient_staff_id) REFERENCES api_staff_profiles(business_id,staff_id),
 CHECK(issuer_staff_id<>recipient_staff_id),
 CHECK(expires_at>issued_at),
 CHECK((consumed_at IS NULL AND consumed_by IS NULL AND consumed_command_id IS NULL) OR (consumed_at IS NOT NULL AND consumed_by IS NOT NULL AND consumed_command_id IS NOT NULL))
);
CREATE INDEX api_manager_approvals_recipient_idx ON api_manager_approvals(business_id,recipient_staff_id,expires_at) WHERE consumed_at IS NULL;

CREATE TABLE api_manager_approval_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 approval_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('ISSUED','CONSUMED')),
 staff_id uuid NOT NULL,
 command_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,command_id),
 FOREIGN KEY(business_id,approval_id) REFERENCES api_manager_approvals(business_id,id),
 FOREIGN KEY(business_id,staff_id) REFERENCES api_staff_profiles(business_id,staff_id)
);
