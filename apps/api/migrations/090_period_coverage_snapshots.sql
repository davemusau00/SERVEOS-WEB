-- Additive, internal diagnostic evidence ONLY. Does not implement financial close.
CREATE TABLE business_period_coverage_snapshots (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 source_job_id uuid NOT NULL REFERENCES async_jobs(id),
 from_date date NOT NULL,
 to_date date NOT NULL,
 time_zone text NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 snapshot_sha256 char(64) NOT NULL CHECK(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,id), UNIQUE(business_id,source_job_id),
 CHECK(to_date>=from_date)
);
CREATE INDEX business_period_coverage_snapshots_period_idx
 ON business_period_coverage_snapshots(business_id,from_date,to_date,recorded_at DESC);
CREATE TRIGGER business_period_coverage_snapshots_immutable BEFORE UPDATE OR DELETE
 ON business_period_coverage_snapshots FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
