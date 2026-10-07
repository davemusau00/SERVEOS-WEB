ALTER TABLE document_print_jobs DROP CONSTRAINT document_print_jobs_state_check;
UPDATE document_print_jobs SET state=CASE state WHEN 'CLAIMED' THEN 'SENDING' WHEN 'SENT' THEN 'SENT_TO_SPOOLER' WHEN 'UNKNOWN' THEN 'DELIVERY_UNCERTAIN' ELSE state END;
ALTER TABLE document_print_jobs
 ADD CONSTRAINT document_print_jobs_state_check CHECK(state IN ('QUEUED','SENDING','SENT_TO_SPOOLER','CONFIRMED','FAILED','DELIVERY_UNCERTAIN','CANCELLED')),
 ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),
 ADD COLUMN claimed_by uuid,
 ADD COLUMN claimed_device_id uuid,
 ADD COLUMN claimed_at timestamptz,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
INSERT INTO business_entity_versions(business_id,entity_type,entity_id,version)
 SELECT business_id,'printJobs',id::text,version FROM document_print_jobs
 ON CONFLICT(business_id,entity_type,entity_id) DO NOTHING;
CREATE TABLE document_print_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 job_id uuid NOT NULL,
 job_version bigint NOT NULL,
 event_type text NOT NULL,
 reason text NOT NULL,
 possible_duplicate_acknowledged boolean NOT NULL DEFAULT false,
 command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,command_id),
 UNIQUE(business_id,job_id,job_version),
 FOREIGN KEY(business_id,job_id) REFERENCES document_print_jobs(business_id,id)
);
CREATE TRIGGER document_print_events_immutable BEFORE UPDATE OR DELETE ON document_print_events
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
