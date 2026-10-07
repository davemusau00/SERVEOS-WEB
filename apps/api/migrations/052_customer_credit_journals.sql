ALTER TABLE financial_journals ALTER COLUMN payment_id DROP NOT NULL;
ALTER TABLE financial_journals ADD COLUMN customer_credit_entry_id uuid;
ALTER TABLE financial_journals ADD CONSTRAINT financial_journals_credit_entry_fk
 FOREIGN KEY (business_id,customer_credit_entry_id) REFERENCES customer_credit_entries(business_id,id);
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_source_type_check;
ALTER TABLE financial_journals DROP CONSTRAINT financial_journals_check;
ALTER TABLE financial_journals ADD CONSTRAINT financial_journals_source_type_check CHECK (source_type IN (
 'PAYMENT','REFUND','CUSTOMER_CREDIT_CHARGE','CUSTOMER_CREDIT_SETTLEMENT','CUSTOMER_CREDIT_WRITE_OFF','CUSTOMER_CREDIT_REVERSAL'
));
ALTER TABLE financial_journals ADD CONSTRAINT financial_journals_source_identity_check CHECK (
 (source_type='PAYMENT' AND source_id=payment_id AND payment_id IS NOT NULL AND refund_id IS NULL AND original_journal_id IS NULL AND customer_credit_entry_id IS NULL)
 OR (source_type='REFUND' AND source_id=refund_id AND payment_id IS NOT NULL AND refund_id IS NOT NULL AND original_journal_id IS NOT NULL AND customer_credit_entry_id IS NULL)
 OR (source_type IN ('CUSTOMER_CREDIT_CHARGE','CUSTOMER_CREDIT_SETTLEMENT','CUSTOMER_CREDIT_WRITE_OFF') AND source_id=customer_credit_entry_id AND payment_id IS NULL AND refund_id IS NULL AND original_journal_id IS NULL AND customer_credit_entry_id IS NOT NULL)
 OR (source_type='CUSTOMER_CREDIT_REVERSAL' AND source_id=customer_credit_entry_id AND payment_id IS NULL AND refund_id IS NULL AND original_journal_id IS NOT NULL AND customer_credit_entry_id IS NOT NULL)
);

ALTER TABLE financial_journal_lines DROP CONSTRAINT financial_journal_lines_account_code_check;
ALTER TABLE financial_journal_lines DROP CONSTRAINT financial_journal_lines_check;
ALTER TABLE financial_journal_lines ADD CONSTRAINT financial_journal_lines_account_code_check CHECK (account_code IN (
 'ASSET_TENDER','REVENUE_SALES','LIABILITY_VAT','LIABILITY_LEVY','ASSET_CUSTOMER_AR','EXPENSE_BAD_DEBT'
));
ALTER TABLE financial_journal_lines ADD CONSTRAINT financial_journal_lines_account_reference_check CHECK (
 (account_code='ASSET_TENDER' AND account_ref IS NOT NULL) OR (account_code<>'ASSET_TENDER' AND account_ref IS NULL)
);
ALTER TABLE financial_journal_lines ADD CONSTRAINT financial_journal_lines_direction_check CHECK (
 (debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0)
);

DROP TRIGGER financial_journal_balanced ON financial_journals;
DROP TRIGGER financial_journal_lines_balanced ON financial_journal_lines;

CREATE FUNCTION servos_check_financial_journal_v2() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
 journal_key uuid;
 header financial_journals%ROWTYPE;
 debits numeric;
 credits numeric;
 tender_count integer;
 source_amount bigint;
 tender_account uuid;
 entry customer_credit_entries%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='financial_journals' THEN journal_key:=NEW.id; ELSE journal_key:=NEW.journal_id; END IF;
 SELECT * INTO STRICT header FROM financial_journals WHERE business_id=NEW.business_id AND id=journal_key;
 SELECT COALESCE(sum(debit_minor),0),COALESCE(sum(credit_minor),0),count(*) FILTER(WHERE account_code='ASSET_TENDER')
  INTO debits,credits,tender_count FROM financial_journal_lines WHERE business_id=NEW.business_id AND journal_id=journal_key;
 IF debits<>header.total_debit_minor OR credits<>header.total_credit_minor THEN
  RAISE EXCEPTION 'Financial journal does not balance' USING ERRCODE='23514';
 END IF;

 IF header.source_type IN ('PAYMENT','REFUND') THEN
  IF tender_count<>1 THEN RAISE EXCEPTION 'Payment journal requires one tender line' USING ERRCODE='23514'; END IF;
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
   )) THEN RAISE EXCEPTION 'Financial journal does not match its source or posting direction' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;

 SELECT * INTO STRICT entry FROM customer_credit_entries WHERE business_id=header.business_id AND id=header.customer_credit_entry_id;
 IF entry.amount_minor<>header.total_debit_minor OR header.currency<>'KES' THEN
  RAISE EXCEPTION 'Customer credit journal does not match its ledger entry' USING ERRCODE='23514';
 END IF;
 IF header.source_type='CUSTOMER_CREDIT_CHARGE' THEN
  IF entry.kind<>'CHARGE' OR tender_count<>0
   OR (SELECT COALESCE(sum(debit_minor),0) FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key AND account_code='ASSET_CUSTOMER_AR')<>entry.amount_minor
   OR (SELECT COALESCE(sum(credit_minor),0) FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key AND account_code IN ('REVENUE_SALES','LIABILITY_VAT','LIABILITY_LEVY'))<>entry.amount_minor
   OR EXISTS(SELECT 1 FROM financial_journal_lines l WHERE l.business_id=header.business_id AND l.journal_id=journal_key AND ((l.account_code='ASSET_CUSTOMER_AR' AND (l.credit_minor<>0 OR l.debit_minor<=0)) OR (l.account_code<>'ASSET_CUSTOMER_AR' AND l.debit_minor<>0))) THEN
   RAISE EXCEPTION 'Customer credit charge journal does not reconcile to AR and sales' USING ERRCODE='23514';
  END IF;
 ELSIF header.source_type='CUSTOMER_CREDIT_SETTLEMENT' THEN
  IF entry.kind<>'SETTLEMENT' OR tender_count<>1
   OR NOT EXISTS(SELECT 1 FROM financial_journal_lines l JOIN payment_accounts a ON a.business_id=l.business_id AND a.id=l.account_ref WHERE l.business_id=header.business_id AND l.journal_id=journal_key AND l.account_code='ASSET_TENDER' AND a.method=entry.payment_method AND l.debit_minor=entry.amount_minor AND l.credit_minor=0)
   OR (SELECT COALESCE(sum(credit_minor),0) FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key AND account_code='ASSET_CUSTOMER_AR')<>entry.amount_minor
   OR EXISTS(SELECT 1 FROM financial_journal_lines l WHERE l.business_id=header.business_id AND l.journal_id=journal_key AND ((l.account_code='ASSET_CUSTOMER_AR' AND (l.debit_minor<>0 OR l.credit_minor<=0)) OR (l.account_code NOT IN ('ASSET_CUSTOMER_AR','ASSET_TENDER') AND (l.debit_minor<>0 OR l.credit_minor<>0)))) THEN
   RAISE EXCEPTION 'Customer credit settlement journal does not reconcile to tender and AR' USING ERRCODE='23514';
  END IF;
 ELSIF header.source_type='CUSTOMER_CREDIT_WRITE_OFF' THEN
  IF entry.kind<>'WRITE_OFF' OR tender_count<>0
   OR (SELECT COALESCE(sum(debit_minor),0) FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key AND account_code='EXPENSE_BAD_DEBT')<>entry.amount_minor
   OR (SELECT COALESCE(sum(credit_minor),0) FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key AND account_code='ASSET_CUSTOMER_AR')<>entry.amount_minor
   OR EXISTS(SELECT 1 FROM financial_journal_lines l WHERE l.business_id=header.business_id AND l.journal_id=journal_key AND ((l.account_code='EXPENSE_BAD_DEBT' AND (l.credit_minor<>0 OR l.debit_minor<=0)) OR (l.account_code='ASSET_CUSTOMER_AR' AND (l.debit_minor<>0 OR l.credit_minor<=0)) OR l.account_code NOT IN ('EXPENSE_BAD_DEBT','ASSET_CUSTOMER_AR'))) THEN
   RAISE EXCEPTION 'Customer credit write-off journal does not reconcile' USING ERRCODE='23514';
  END IF;
 ELSIF header.source_type='CUSTOMER_CREDIT_REVERSAL' THEN
  IF entry.kind NOT IN ('CHARGE_REVERSAL','SETTLEMENT_REVERSAL','WRITE_OFF_REVERSAL') OR tender_count>1
   OR NOT EXISTS(SELECT 1 FROM customer_credit_entries original_entry JOIN financial_journals original_journal ON original_journal.business_id=original_entry.business_id AND original_journal.customer_credit_entry_id=original_entry.id WHERE original_entry.business_id=entry.business_id AND original_entry.id=entry.reverses_entry_id AND original_journal.id=header.original_journal_id AND original_journal.currency=header.currency)
   OR EXISTS((SELECT account_code,account_ref,debit_minor,credit_minor FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key)
    EXCEPT (SELECT account_code,account_ref,credit_minor,debit_minor FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=header.original_journal_id))
   OR EXISTS((SELECT account_code,account_ref,credit_minor,debit_minor FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=header.original_journal_id)
    EXCEPT (SELECT account_code,account_ref,debit_minor,credit_minor FROM financial_journal_lines WHERE business_id=header.business_id AND journal_id=journal_key)) THEN
   RAISE EXCEPTION 'Customer credit reversal journal does not exactly reverse its source' USING ERRCODE='23514';
  END IF;
 ELSE
  RAISE EXCEPTION 'Unsupported customer credit journal source' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER financial_journal_balanced_v2 AFTER INSERT ON financial_journals
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_financial_journal_v2();
CREATE CONSTRAINT TRIGGER financial_journal_lines_balanced_v2 AFTER INSERT ON financial_journal_lines
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION servos_check_financial_journal_v2();
