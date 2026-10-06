CREATE TABLE IF NOT EXISTS api_staff_profiles (
  business_id uuid NOT NULL REFERENCES businesses(id),
  staff_id uuid NOT NULL,
  login_name text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL,
  credential_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,staff_id),
  UNIQUE (business_id,lower(login_name))
);

CREATE INDEX IF NOT EXISTS api_staff_profiles_login_idx ON api_staff_profiles(lower(login_name)) WHERE active;

ALTER TABLE api_staff_sessions
  ADD CONSTRAINT api_staff_sessions_staff_fk
  FOREIGN KEY (business_id,staff_id) REFERENCES api_staff_profiles(business_id,staff_id);

ALTER TABLE api_staff_permissions
  ADD CONSTRAINT api_staff_permissions_staff_fk
  FOREIGN KEY (business_id,staff_id) REFERENCES api_staff_profiles(business_id,staff_id) ON DELETE CASCADE;
