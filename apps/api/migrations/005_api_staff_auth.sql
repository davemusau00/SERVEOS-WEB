CREATE TABLE IF NOT EXISTS api_staff_profiles (
  business_id uuid NOT NULL REFERENCES businesses(id),
  staff_id uuid NOT NULL,
  login_name text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  credential_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,staff_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS api_staff_profiles_login_idx ON api_staff_profiles(lower(login_name)) WHERE active;

CREATE TABLE IF NOT EXISTS api_auth_attempts (
  bucket_hash char(64) PRIMARY KEY,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  window_started_at timestamptz NOT NULL,
  blocked_until timestamptz
);

ALTER TABLE api_staff_sessions
  ADD CONSTRAINT api_staff_sessions_staff_fk
  FOREIGN KEY (business_id,staff_id) REFERENCES api_staff_profiles(business_id,staff_id);

ALTER TABLE api_staff_sessions
  ADD CONSTRAINT api_staff_sessions_device_fk
  FOREIGN KEY (business_id,device_id) REFERENCES api_enrolled_devices(business_id,id);

ALTER TABLE api_staff_permissions
  ADD CONSTRAINT api_staff_permissions_staff_fk
  FOREIGN KEY (business_id,staff_id) REFERENCES api_staff_profiles(business_id,staff_id) ON DELETE CASCADE;
