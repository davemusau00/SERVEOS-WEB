CREATE TABLE financial_journals (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 source_type text NOT NULL CHECK(source_type IN ('PAYMENT','REFUND')),
 source_id uuid NOT NULL,
 payment_id uuid NOT NULL,
 refund_id uuid,
 original_journal_id uuid,
 currency text NOT NULL CHECK(currency='KES'),
 total_debit_minor bigint NOT NULL CHECK(total_debit_minor BETWEEN 1 AND 9007199254740991),
 total_credit_minor bigint NOT NULL CHECK(total_credit_minor=total_debit_minor),
 basis_snapshot jsonb NOT NULL CHECK(jsonb_typeof(basis_snapshot)='object'),
 source_command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,source_type,source_id),
 FOREIGN KEY(business_id,payment_id) REFERENCES order_payments(business_id,id),
 FOREIGN KEY(business_id,refund_id) REFERENCES payment_refunds(business_id,id),
 FOREIGN KEY(business_id,original_journal_id) REFERENCES financial_journals(business_id,id),
 CHECK((source_type='PAYMENT' AND source_id=payment_id AND refund_id IS NULL AND original_journal_id IS NULL)
    OR (source_type='REFUND' AND source_id=refund_id AND refund_id IS NOT NULL AND original_journal_id IS NOT NULL))
);
CREATE INDEX financial_journals_payment_idx ON financial_journals(business_id,payment_id);
CREATE INDEX financial_journals_refund_idx ON financial_journals(business_id,refund_id) WHERE refund_id IS NOT NULL;
CREATE INDEX financial_journals_original_idx ON financial_journals(business_id,original_journal_id) WHERE original_journal_id IS NOT NULL;
CREATE INDEX financial_journals_history_idx ON financial_journals(business_id,occurred_at DESC,id);

CREATE TABLE financial_journal_lines (
 business_id uuid NOT NULL,
 journal_id uuid NOT NULL,
 line_number smallint NOT NULL CHECK(line_number BETWEEN 1 AND 4),
 account_code text NOT NULL CHECK(account_code IN ('ASSET_TENDER','REVENUE_SALES','LIABILITY_VAT','LIABILITY_LEVY')),
 account_ref uuid,
 debit_minor bigint NOT NULL CHECK(debit_minor BETWEEN 0 AND 9007199254740991),
 credit_minor bigint NOT NULL CHECK(credit_minor BETWEEN 0 AND 9007199254740991),
 PRIMARY KEY(business_id,journal_id,line_number),
 UNIQUE(business_id,journal_id,account_code),
 FOREIGN KEY(business_id,journal_id) REFERENCES financial_journals(business_id,id),
 FOREIGN KEY(business_id,account_ref) REFERENCES payment_accounts(business_id,id),
 CHECK((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0)),
 CHECK((account_code='ASSET_TENDER' AND account_ref IS NOT NULL) OR (account_code<>'ASSET_TENDER' AND account_ref IS NULL))
);
CREATE INDEX financial_journal_lines_account_idx ON financial_journal_lines(business_id,account_ref) WHERE account_ref IS NOT NULL;
CREATE TRIGGER financial_journals_immutable BEFORE UPDATE OR DELETE ON financial_journals
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();
CREATE TRIGGER financial_journal_lines_immutable BEFORE UPDATE OR DELETE ON financial_journal_lines
 FOR EACH ROW EXECUTE FUNCTION servos_reject_evidence_mutation();

-- Deferred checks allow header/lines to be inserted in one transaction, but never
-- allow an incomplete or unbalanced journal to survive commit.
CREATE FUNCTION servos_check_financial_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal_key uuid; header financial_journals%ROWTYPE; debits numeric; credits numeric; tender_count integer; source_amount bigint; tender_account uuid;
BEGIN
 IF TG_TABLE_NAME='financial_journals' THEN
  journal_key := NEW.id;
 ELSE
  journal_key := NEW.journal_id;
 END IF;
 SELECT * INTO STRICT header FROM financial_journals WHERE business_id=NEW.business_id AND id=journal_key;
 SELECT COALESCE(sum(debit_minor),0),COALESCE(sum(credit_minor),0),count(*) FILTER(WHERE account_code='ASSET_TENDER')
 INTO debits,credits,tender_count FROM financial_journal_lines WHERE business_id=NEW.business_id AND journal_id=journal_key;
 IF debits<>header.total_debit_minor OR credits<>header.total_credit_minor OR tender_count<>1 THEN
  RAISE EXCEPTION 'Financial journal does not balance' USING ERRCODE='23514';
 END IF;
 SELECT amount_minor,account_id INTO STRICT source_amount,tender_account FROM order_payments
 WHERE business_id=header.business_id AND id=header.payment_id;
 IF header.source_type='REFUND' THEN
  SELECT amount_minor INTO STRICT source_amount FROM payment_refunds
  WHERE business_id=header.business_id AND id=header.refund_id AND payment_id=header.payment_id;
  IF NOT EXISTS(SELECT 1 FROM financial_journals j WHERE j.business_id=header.business_id AND j.id=header.original_journal_id
    AND j.source_type='PAYMENT' AND j.payment_id=header.payment_id AND j.currency=header.currency) THEN
   RAISE EXCEPTION 'Refund journal must reference its original payment journal' USING ERRCODE='23514';
  END IF;
 END IF;
 IF source_amount<>header.total_debit_minor OR EXISTS(
  SELECT 1 FROM financial_journal_lines l WHERE l.business_id=header.business_id AND l.journal_id=journal_key AND (
   (l.account_code='ASSET_TENDER' AND l.account_ref<>tender_account)
   OR (header.source_type='PAYMENT' AND ((l.account_code='ASSET_TENDER' AND l.credit_minor<>0) OR (l.account_code<>'ASSET_TENDER' AND l.debit_minor<>0)))
   OR (header.source_type='REFUND' AND ((l.account_code='ASSET_TENDER' AND l.debit_minor<>0) OR (l.account_code<>'ASSET_TENDER' AND l.credit_minor<>0)))
  )) THEN
  RAISE EXCEPTION 'Financial journal does not match its source or posting direction' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER financial_journal_balanced AFTER INSERT ON financial_journals
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_financial_journal();
CREATE CONSTRAINT TRIGGER financial_journal_lines_balanced AFTER INSERT ON financial_journal_lines
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_financial_journal();
