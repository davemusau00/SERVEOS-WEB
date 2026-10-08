ALTER TABLE till_cash_entries DROP CONSTRAINT IF EXISTS till_cash_entries_kind_check;
ALTER TABLE till_cash_entries DROP CONSTRAINT IF EXISTS till_cash_entries_check;
ALTER TABLE till_cash_entries DROP CONSTRAINT IF EXISTS till_cash_entries_direction_check;
ALTER TABLE till_cash_entries ADD CONSTRAINT till_cash_entries_kind_check
 CHECK(kind IN ('PAID_IN','PAID_OUT','SALE','REFUND','PAYMENT_REVERSAL','CREDIT_COLLECTION','CREDIT_COLLECTION_REVERSAL','EXPENSE'));
ALTER TABLE till_cash_entries ADD CONSTRAINT till_cash_entries_direction_check CHECK(
 (kind IN ('PAID_IN','SALE','CREDIT_COLLECTION') AND amount_delta_minor>0)
 OR (kind IN ('PAID_OUT','REFUND','PAYMENT_REVERSAL','CREDIT_COLLECTION_REVERSAL','EXPENSE') AND amount_delta_minor<0)
);

CREATE TABLE business_expense_categories (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 40),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 version bigint NOT NULL CHECK(version>0),
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 archived_at timestamptz,
 PRIMARY KEY(business_id,id),
  UNIQUE(business_id,id)
);
CREATE UNIQUE INDEX business_expense_categories_code_idx ON business_expense_categories(business_id,lower(code));

CREATE TABLE business_expenses (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 category_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('CASH','EXTERNAL')),
 status text NOT NULL CHECK(status IN ('DRAFT','POSTED','REJECTED')),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 240),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
 currency text NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
 occurred_at timestamptz NOT NULL,
 account_id uuid,
 account_snapshot jsonb,
 till_session_id uuid,
 external_reference text CHECK(external_reference IS NULL OR length(external_reference)<=160),
 manually_confirmed boolean NOT NULL DEFAULT false,
 confirmed_received_at timestamptz,
 asset_id uuid,
 work_order_id uuid,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 approval_id uuid,
 document_id uuid,
 version bigint NOT NULL CHECK(version>0),
 source_command_id uuid NOT NULL,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 posted_by uuid,
 posted_at timestamptz,
 rejected_by uuid,
 rejected_at timestamptz,
 rejection_reason text,
 PRIMARY KEY(business_id,id),
 FOREIGN KEY(business_id,category_id) REFERENCES business_expense_categories(business_id,id),
 FOREIGN KEY(business_id,account_id) REFERENCES payment_accounts(business_id,id),
 FOREIGN KEY(business_id,till_session_id) REFERENCES till_sessions(business_id,id),
 FOREIGN KEY(business_id,document_id) REFERENCES business_documents(business_id,id),
 CHECK((status='DRAFT' AND posted_by IS NULL AND posted_at IS NULL AND rejected_by IS NULL AND rejected_at IS NULL AND document_id IS NULL)
    OR (status='POSTED' AND posted_by IS NOT NULL AND posted_at IS NOT NULL AND rejected_by IS NULL AND rejected_at IS NULL AND document_id IS NOT NULL AND account_id IS NOT NULL AND account_snapshot IS NOT NULL)
    OR (status='REJECTED' AND rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND rejection_reason IS NOT NULL AND length(btrim(rejection_reason))>=3 AND posted_by IS NULL AND posted_at IS NULL AND document_id IS NULL)),
 CHECK((kind='CASH' AND external_reference IS NULL AND manually_confirmed=false AND confirmed_received_at IS NULL
        AND (status='DRAFT' OR till_session_id IS NOT NULL))
    OR (kind='EXTERNAL' AND till_session_id IS NULL
        AND (status='DRAFT' OR manually_confirmed=true AND confirmed_received_at IS NOT NULL)))
);
CREATE INDEX business_expenses_period_idx ON business_expenses(business_id,occurred_at DESC,id) WHERE status='POSTED';
CREATE INDEX business_expenses_category_idx ON business_expenses(business_id,category_id,occurred_at DESC) WHERE status='POSTED';

CREATE TABLE business_expense_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 expense_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('DRAFTED','POSTED','REJECTED')),
 event_data jsonb NOT NULL CHECK(jsonb_typeof(event_data)='object'),
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_command_id),
 FOREIGN KEY(business_id,expense_id) REFERENCES business_expenses(business_id,id)
);
CREATE INDEX business_expense_events_history_idx ON business_expense_events(business_id,expense_id,occurred_at,id);

CREATE TABLE business_expense_journals (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 expense_id uuid NOT NULL,
 currency text NOT NULL CHECK(currency='KES'),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 9007199254740991),
 account_id uuid NOT NULL,
 basis_snapshot jsonb NOT NULL CHECK(jsonb_typeof(basis_snapshot)='object'),
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,expense_id),
 FOREIGN KEY(business_id,expense_id) REFERENCES business_expenses(business_id,id),
 FOREIGN KEY(business_id,account_id) REFERENCES payment_accounts(business_id,id)
);
CREATE TABLE business_expense_journal_lines (
 business_id uuid NOT NULL,
 journal_id uuid NOT NULL,
 line_number smallint NOT NULL CHECK(line_number BETWEEN 1 AND 2),
 account_code text NOT NULL CHECK(account_code IN ('EXPENSE_OPERATING','ASSET_TENDER')),
 account_ref uuid,
 debit_minor bigint NOT NULL CHECK(debit_minor BETWEEN 0 AND 9007199254740991),
 credit_minor bigint NOT NULL CHECK(credit_minor BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(business_id,journal_id,line_number),
 UNIQUE(business_id,journal_id,account_code),
 FOREIGN KEY(business_id,journal_id) REFERENCES business_expense_journals(business_id,id),
 FOREIGN KEY(business_id,account_ref) REFERENCES payment_accounts(business_id,id),
 CHECK((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0)),
 CHECK((account_code='ASSET_TENDER' AND account_ref IS NOT NULL) OR (account_code='EXPENSE_OPERATING' AND account_ref IS NULL))
);

CREATE FUNCTION servos_check_expense_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_key uuid; header business_expense_journals%ROWTYPE; debits numeric; credits numeric; expense_row business_expenses%ROWTYPE;
BEGIN
 journal_key:=CASE WHEN TG_TABLE_NAME='business_expense_journals' THEN NEW.id ELSE NEW.journal_id END;
 SELECT * INTO STRICT header FROM business_expense_journals WHERE business_id=NEW.business_id AND id=journal_key;
 SELECT * INTO STRICT expense_row FROM business_expenses WHERE business_id=header.business_id AND id=header.expense_id;
 SELECT COALESCE(sum(debit_minor),0),COALESCE(sum(credit_minor),0) INTO debits,credits FROM business_expense_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key;
 IF expense_row.status<>'POSTED' OR expense_row.amount_minor<>header.amount_minor OR expense_row.account_id<>header.account_id
   OR debits<>header.amount_minor OR credits<>header.amount_minor
   OR (SELECT count(*) FROM business_expense_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key)<>2
   OR NOT EXISTS(SELECT 1 FROM business_expense_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key AND account_code='EXPENSE_OPERATING' AND debit_minor=header.amount_minor AND credit_minor=0 AND account_ref IS NULL)
   OR NOT EXISTS(SELECT 1 FROM business_expense_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key AND account_code='ASSET_TENDER' AND account_ref=header.account_id AND debit_minor=0 AND credit_minor=header.amount_minor) THEN
  RAISE EXCEPTION 'Expense posting does not balance to its source or tender account' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER expense_journal_balanced AFTER INSERT ON business_expense_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_expense_journal();
CREATE CONSTRAINT TRIGGER expense_journal_lines_balanced AFTER INSERT ON business_expense_journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_expense_journal();

CREATE TRIGGER business_expense_journals_immutable BEFORE UPDATE OR DELETE ON business_expense_journals FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER business_expense_journal_lines_immutable BEFORE UPDATE OR DELETE ON business_expense_journal_lines FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER business_expense_events_immutable BEFORE UPDATE OR DELETE ON business_expense_events FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE OR REPLACE FUNCTION servos_guard_posted_expense() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expenses cannot be deleted' USING ERRCODE='23514'; END IF;
 IF OLD.status<>'DRAFT' OR (NEW.status NOT IN ('DRAFT','POSTED','REJECTED')) THEN
  RAISE EXCEPTION 'Posted or rejected expenses cannot be changed' USING ERRCODE='23514';
 END IF;
 IF NEW.id<>OLD.id OR NEW.business_id<>OLD.business_id OR NEW.category_id<>OLD.category_id OR NEW.kind<>OLD.kind OR NEW.description<>OLD.description OR NEW.amount_minor<>OLD.amount_minor OR NEW.currency<>OLD.currency OR NEW.occurred_at<>OLD.occurred_at OR NEW.reason<>OLD.reason OR NEW.created_by<>OLD.created_by OR NEW.created_at<>OLD.created_at OR NEW.source_command_id<>OLD.source_command_id OR NEW.asset_id IS DISTINCT FROM OLD.asset_id OR NEW.work_order_id IS DISTINCT FROM OLD.work_order_id THEN
  RAISE EXCEPTION 'Expense draft facts are immutable; reject and create a corrected draft' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER business_expense_state_guard BEFORE UPDATE OR DELETE ON business_expenses FOR EACH ROW EXECUTE FUNCTION servos_guard_posted_expense();

CREATE TABLE business_asset_categories (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 40),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 version bigint NOT NULL CHECK(version>0),
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 archived_at timestamptz,
 PRIMARY KEY(business_id,id),
  UNIQUE(business_id,id)
 );
 CREATE UNIQUE INDEX business_asset_categories_code_idx ON business_asset_categories(business_id,lower(code));
CREATE TABLE business_assets (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 asset_tag text NOT NULL CHECK(length(btrim(asset_tag)) BETWEEN 1 AND 80),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 category_id uuid NOT NULL,
 room_id uuid,
 location_id uuid,
 area text NOT NULL DEFAULT '' CHECK(length(area)<=120),
 condition text NOT NULL CHECK(condition IN ('NEW','GOOD','FAIR','POOR','DAMAGED')),
 status text NOT NULL CHECK(status IN ('ACTIVE','IN_REPAIR','DISPOSED')),
 custodian_staff_id uuid,
 serial_number text NOT NULL DEFAULT '' CHECK(length(serial_number)<=120),
 acquired_at date,
 acquisition_cost_minor bigint NOT NULL DEFAULT 0 CHECK(acquisition_cost_minor BETWEEN 0 AND 9007199254740991),
 maintenance_cost_minor bigint NOT NULL DEFAULT 0 CHECK(maintenance_cost_minor BETWEEN 0 AND 9007199254740991),
 currency text NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 version bigint NOT NULL CHECK(version>0),
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 archived_at timestamptz,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,id),
 FOREIGN KEY(business_id,category_id) REFERENCES business_asset_categories(business_id,id),
 FOREIGN KEY(business_id,room_id) REFERENCES business_rooms(business_id,id),
 FOREIGN KEY(business_id,location_id) REFERENCES stock_locations(business_id,id),
 FOREIGN KEY(business_id,custodian_staff_id) REFERENCES api_staff_profiles(business_id,staff_id)
);
CREATE UNIQUE INDEX business_assets_tag_idx ON business_assets(business_id,lower(asset_tag));
CREATE INDEX business_assets_active_name_idx ON business_assets(business_id,lower(name),id) WHERE archived_at IS NULL;
CREATE TABLE business_asset_work_orders (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 asset_id uuid NOT NULL,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 fault text NOT NULL CHECK(length(btrim(fault)) BETWEEN 3 AND 1000),
 priority text NOT NULL CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
 status text NOT NULL CHECK(status IN ('OPEN','RESOLVED','CANCELLED')),
 cost_minor bigint NOT NULL DEFAULT 0 CHECK(cost_minor BETWEEN 0 AND 9007199254740991),
 opened_by uuid NOT NULL,
 opened_at timestamptz NOT NULL,
 resolved_by uuid,
 resolved_at timestamptz,
 resolution text,
 version bigint NOT NULL CHECK(version>0),
 PRIMARY KEY(business_id,id),
 FOREIGN KEY(business_id,asset_id) REFERENCES business_assets(business_id,id),
 CHECK((status='OPEN' AND resolved_by IS NULL AND resolved_at IS NULL AND resolution IS NULL) OR (status IN ('RESOLVED','CANCELLED') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND resolution IS NOT NULL AND length(btrim(resolution))>=3))
);
CREATE INDEX business_asset_work_orders_open_idx ON business_asset_work_orders(business_id,asset_id,opened_at DESC) WHERE status='OPEN';
CREATE TABLE business_asset_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 asset_id uuid NOT NULL,
 work_order_id uuid,
 event_type text NOT NULL CHECK(event_type IN ('REGISTERED','UPDATED','STATUS_CHANGED','MAINTENANCE_OPENED','MAINTENANCE_RESOLVED','COST_RECORDED')),
 event_data jsonb NOT NULL CHECK(jsonb_typeof(event_data)='object'),
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
  FOREIGN KEY(business_id,asset_id) REFERENCES business_assets(business_id,id),
 FOREIGN KEY(business_id,work_order_id) REFERENCES business_asset_work_orders(business_id,id)
);
CREATE INDEX business_asset_events_history_idx ON business_asset_events(business_id,asset_id,occurred_at DESC,id);
CREATE TRIGGER business_asset_events_immutable BEFORE UPDATE OR DELETE ON business_asset_events FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
ALTER TABLE business_expenses ADD CONSTRAINT business_expenses_asset_fk FOREIGN KEY(business_id,asset_id) REFERENCES business_assets(business_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE business_expenses ADD CONSTRAINT business_expenses_work_order_fk FOREIGN KEY(business_id,work_order_id) REFERENCES business_asset_work_orders(business_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION servos_guard_asset_work_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Asset work orders cannot be deleted' USING ERRCODE='23514'; END IF;
 IF NEW.business_id<>OLD.business_id OR NEW.id<>OLD.id OR NEW.asset_id<>OLD.asset_id OR NEW.title<>OLD.title OR NEW.fault<>OLD.fault OR NEW.priority<>OLD.priority OR NEW.opened_by<>OLD.opened_by OR NEW.opened_at<>OLD.opened_at OR NEW.cost_minor<OLD.cost_minor THEN
  RAISE EXCEPTION 'Asset work order facts cannot be rewritten' USING ERRCODE='23514';
 END IF;
 IF OLD.status<>'OPEN' OR NEW.status NOT IN ('OPEN','RESOLVED') THEN
  RAISE EXCEPTION 'Resolved asset work orders cannot be changed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER business_asset_work_order_guard BEFORE UPDATE OR DELETE ON business_asset_work_orders FOR EACH ROW EXECUTE FUNCTION servos_guard_asset_work_order();
