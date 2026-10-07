CREATE TABLE close_day_reports (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 till_session_id uuid NOT NULL,
 document_id uuid NOT NULL,
 source_command_id uuid NOT NULL,
 generated_by uuid NOT NULL,
 generated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,till_session_id),
 UNIQUE(business_id,document_id),
 UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,till_session_id) REFERENCES till_sessions(business_id,id),
 FOREIGN KEY(business_id,document_id) REFERENCES business_documents(business_id,id)
);
CREATE INDEX close_day_reports_history_idx ON close_day_reports(business_id,generated_at DESC,id);
CREATE INDEX business_documents_sales_source_idx ON business_documents(business_id,source_command_id) WHERE document_type='SALES_RECEIPT';
CREATE FUNCTION servos_validate_close_day_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM till_sessions t JOIN business_documents d ON d.business_id=t.business_id AND d.id=NEW.document_id
 WHERE t.business_id=NEW.business_id AND t.id=NEW.till_session_id AND t.status='CLOSED'
  AND d.document_type='CLOSE_DAY_REPORT' AND d.source_command_id=NEW.source_command_id
  AND d.snapshot->>'tillSessionId'=NEW.till_session_id::text
  AND d.issued_by=NEW.generated_by AND d.issued_at=NEW.generated_at
 FOR SHARE OF t;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Close-day evidence must match a closed till and its issued document' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER close_day_reports_valid BEFORE INSERT ON close_day_reports
 FOR EACH ROW EXECUTE FUNCTION servos_validate_close_day_report();
CREATE TRIGGER close_day_reports_immutable BEFORE UPDATE OR DELETE ON close_day_reports
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
