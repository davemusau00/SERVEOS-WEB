-- Cost accounting evidence only. No history is backfilled and no posting basis
-- is silently selected. Canonical financial journals remain the posting engine.
-- Capture must select the current command's immutable rows without rescanning
-- every historic consumption/return while holding the checkout transaction.
-- Index build/lock duration still requires the deferred staging rehearsal.
CREATE INDEX pos_consumptions_command_evidence_idx ON pos_stock_consumptions(business_id,command_id,order_id,line_id);
CREATE INDEX pos_void_returns_command_evidence_idx ON pos_void_stock_returns(business_id,command_id);
CREATE INDEX business_documents_cost_bill_order_idx ON business_documents(business_id,(snapshot->>'orderId'),issued_at,id) WHERE document_type IN ('SALES_RECEIPT','CUSTOMER_CREDIT_INVOICE');

CREATE TABLE business_cost_review_policy (
 business_id uuid PRIMARY KEY REFERENCES businesses(id),
 enabled boolean NOT NULL DEFAULT false,
 recognition_basis text NOT NULL DEFAULT 'UNAPPROVED' CHECK(recognition_basis='UNAPPROVED'),
 posting_enabled boolean NOT NULL DEFAULT false CHECK(NOT posting_enabled),
 version bigint NOT NULL CHECK(version>0),
 review_reference text,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL
);

CREATE TABLE business_historical_cost_sources (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('POS_CONSUMPTION','POS_BILL','PHYSICAL_RETURN','VOID_LOSS','WASTE','WASTE_REVERSAL')),
 source_key text NOT NULL,
 order_id uuid,
 line_id uuid,
 stock_item_id uuid,
 movement_id uuid,
 document_id uuid,
 original_source_id uuid,
 reference text NOT NULL,
 description text NOT NULL,
 amount_minor bigint CHECK(amount_minor BETWEEN 0 AND 9007199254740991),
 state text NOT NULL CHECK(state IN ('EVIDENCE_RECORDED','RECONCILIATION_REQUIRED')),
 coverage jsonb NOT NULL CHECK(jsonb_typeof(coverage)='array'),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 snapshot_hash char(64) NOT NULL,
 policy_version bigint NOT NULL,
 source_command_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,kind,source_key),
 FOREIGN KEY(business_id,order_id) REFERENCES pos_orders(business_id,id),
 FOREIGN KEY(business_id,movement_id) REFERENCES inventory_movements(business_id,id),
 FOREIGN KEY(business_id,document_id) REFERENCES business_documents(business_id,id),
 FOREIGN KEY(business_id,original_source_id) REFERENCES business_historical_cost_sources(business_id,id)
);
CREATE INDEX historical_cost_sources_history_idx ON business_historical_cost_sources(business_id,occurred_at DESC,id);
CREATE INDEX historical_cost_sources_order_idx ON business_historical_cost_sources(business_id,order_id,kind);
CREATE INDEX historical_cost_sources_command_idx ON business_historical_cost_sources(business_id,source_command_id);
CREATE TRIGGER historical_cost_sources_immutable BEFORE UPDATE OR DELETE ON business_historical_cost_sources FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();

CREATE TABLE business_historical_cost_reviews (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 cost_source_id uuid NOT NULL,
 disposition text NOT NULL CHECK(disposition IN ('EVIDENCE_REVIEWED','RECONCILIATION_REQUIRED')),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 accounting_reference text NOT NULL CHECK(length(btrim(accounting_reference)) BETWEEN 3 AND 160),
 proposed_journal jsonb NOT NULL CHECK(jsonb_typeof(proposed_journal)='object'),
 financial_journal_id uuid,
 source_command_id uuid NOT NULL,
 reviewed_by uuid NOT NULL,
 reviewed_by_name text NOT NULL,
 reviewed_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,cost_source_id) REFERENCES business_historical_cost_sources(business_id,id),
 FOREIGN KEY(business_id,financial_journal_id) REFERENCES financial_journals(business_id,id),
 CHECK(financial_journal_id IS NULL)
);
CREATE INDEX historical_cost_reviews_history_idx ON business_historical_cost_reviews(business_id,cost_source_id,reviewed_at DESC,id);
CREATE TRIGGER historical_cost_reviews_immutable BEFORE UPDATE OR DELETE ON business_historical_cost_reviews FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
