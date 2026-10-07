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
CREATE TRIGGER close_day_reports_immutable BEFORE UPDATE OR DELETE ON close_day_reports
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
