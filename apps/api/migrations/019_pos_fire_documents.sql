CREATE TABLE pos_stock_consumptions (
 business_id uuid NOT NULL,
 order_id uuid NOT NULL,
 line_id uuid NOT NULL,
 stock_item_id uuid NOT NULL,
 location_id uuid NOT NULL,
 movement_id uuid NOT NULL,
 quantity numeric(18,6) NOT NULL CHECK(quantity>0),
 unit_cost_minor numeric(30,12) NOT NULL CHECK(unit_cost_minor>=0),
 cost_minor bigint NOT NULL CHECK(cost_minor>=0),
 physical_snapshot jsonb NOT NULL CHECK(jsonb_typeof(physical_snapshot)='object'),
 command_id uuid NOT NULL,
 PRIMARY KEY(business_id,order_id,line_id,stock_item_id),
 FOREIGN KEY(business_id,order_id,line_id) REFERENCES pos_order_lines(business_id,order_id,id),
 FOREIGN KEY(business_id,stock_item_id) REFERENCES stock_items(business_id,id),
 FOREIGN KEY(business_id,location_id) REFERENCES stock_locations(business_id,id),
 FOREIGN KEY(business_id,movement_id) REFERENCES inventory_movements(business_id,id)
);
CREATE INDEX pos_consumptions_stock_idx ON pos_stock_consumptions(business_id,stock_item_id);
CREATE INDEX pos_consumptions_location_idx ON pos_stock_consumptions(business_id,location_id);
CREATE INDEX pos_consumptions_movement_idx ON pos_stock_consumptions(business_id,movement_id);

CREATE TABLE business_documents (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 document_type text NOT NULL,
 document_number text NOT NULL,
 layout_version integer NOT NULL CHECK(layout_version>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 snapshot_hash char(64) NOT NULL,
 source_command_id uuid NOT NULL,
 issued_by uuid NOT NULL,
 issued_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,document_number),
 UNIQUE(business_id,source_command_id,document_type)
);
CREATE INDEX business_documents_history_idx ON business_documents(business_id,issued_at DESC,id);

CREATE TABLE document_print_jobs (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 document_id uuid NOT NULL,
 printer_role text NOT NULL CHECK(printer_role IN ('KITCHEN','BAR','RECEIPT','OFFICE')),
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','CLAIMED','SENT','CONFIRMED','FAILED','UNKNOWN','CANCELLED')),
 copies integer NOT NULL DEFAULT 1 CHECK(copies BETWEEN 1 AND 10),
 requested_by uuid NOT NULL,
 requested_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,document_id,printer_role),
 FOREIGN KEY(business_id,document_id) REFERENCES business_documents(business_id,id)
);
CREATE INDEX document_print_jobs_queue_idx ON document_print_jobs(business_id,state,requested_at,id);

-- Issued documents, order events and stock-consumption evidence are append-only.
CREATE FUNCTION servos_reject_evidence_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Issued business evidence cannot be updated or deleted' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER business_documents_immutable BEFORE UPDATE OR DELETE ON business_documents
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER pos_order_events_immutable BEFORE UPDATE OR DELETE ON pos_order_events
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER pos_consumptions_immutable BEFORE UPDATE OR DELETE ON pos_stock_consumptions
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
