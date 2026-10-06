ALTER TABLE offline_grants
  ADD COLUMN policy_version integer NOT NULL DEFAULT 1 CHECK (policy_version > 0),
  ADD COLUMN key_version text NOT NULL DEFAULT 'offline-2026-10' CHECK (length(key_version) BETWEEN 1 AND 80),
  ADD COLUMN signature text CHECK (signature IS NULL OR length(signature) BETWEEN 80 AND 100),
  ADD COLUMN scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object');

ALTER TABLE offline_grants
  ADD CONSTRAINT offline_grants_device_fk FOREIGN KEY (business_id, device_id)
    REFERENCES api_enrolled_devices(business_id, id),
  ADD CONSTRAINT offline_grants_staff_fk FOREIGN KEY (business_id, staff_id)
    REFERENCES api_staff_profiles(business_id, staff_id);

CREATE INDEX offline_grants_business_staff_idx
  ON offline_grants (business_id, device_id, staff_id, issued_at DESC);
