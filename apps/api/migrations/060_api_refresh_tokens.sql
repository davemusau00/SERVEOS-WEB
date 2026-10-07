CREATE TABLE IF NOT EXISTS api_access_tokens (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES api_staff_sessions(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);

INSERT INTO api_access_tokens(id,business_id,staff_id,session_id,token_hash,issued_at,expires_at)
SELECT gen_random_uuid(),business_id,staff_id,id,token_hash,created_at,expires_at
FROM api_staff_sessions
ON CONFLICT(token_hash) DO NOTHING;

CREATE INDEX IF NOT EXISTS api_access_tokens_session_idx
  ON api_access_tokens(session_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS api_refresh_families (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES api_staff_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS api_refresh_families_session_idx
  ON api_refresh_families(session_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS api_refresh_tokens (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES api_refresh_families(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS api_refresh_tokens_family_idx
  ON api_refresh_tokens(family_id,issued_at DESC);
