ALTER TABLE api_enrolled_devices
  ADD COLUMN IF NOT EXISTS device_name text NOT NULL DEFAULT 'ServOS browser device',
  ADD COLUMN IF NOT EXISTS device_class text NOT NULL DEFAULT 'BROWSER',
  ADD COLUMN IF NOT EXISTS assigned_outlet_id uuid,
  ADD COLUMN IF NOT EXISTS approved_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_permissions jsonb;

CREATE TABLE IF NOT EXISTS api_device_access_requests (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id),
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  public_key jsonb NOT NULL,
  device_name text NOT NULL,
  device_class text NOT NULL,
  requested_outlet_id uuid,
  requested_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_reason text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','APPROVED','DENIED','ENROLLED','EXPIRED')),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  decided_by uuid,
  decision_reason text,
  enrolled_at timestamptz,
  approved_outlet_id uuid,
  approved_permissions jsonb
);

CREATE INDEX IF NOT EXISTS api_device_access_requests_admin_idx
  ON api_device_access_requests (business_id, status, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS api_device_access_requests_active_identity_idx
  ON api_device_access_requests (business_id, staff_id, device_id) WHERE status IN ('PENDING','APPROVED');
