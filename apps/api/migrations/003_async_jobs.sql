CREATE TABLE IF NOT EXISTS async_jobs (
  id uuid PRIMARY KEY,
  business_id uuid,
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CHECK (
    (state = 'PROCESSING' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state <> 'PROCESSING' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS async_jobs_claim_idx
  ON async_jobs (available_at, created_at)
  WHERE state IN ('PENDING', 'PROCESSING');
