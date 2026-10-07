CREATE TABLE payment_accounts (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 40),
 method text NOT NULL CHECK(method IN ('CASH','MPESA','CARD','BANK')),
 currency text NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
 reference_required boolean NOT NULL DEFAULT false,
 mpesa_mode text CHECK(mpesa_mode IN ('TILL','PAYBILL')),
 mpesa_number text,
 mpesa_account_reference text,
 version bigint NOT NULL CHECK(version>0),
 archived_at timestamptz,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 CHECK((method='MPESA' AND mpesa_mode IS NOT NULL AND mpesa_number IS NOT NULL AND mpesa_number ~ '^[0-9]{5,10}$'
         AND (mpesa_mode='TILL' OR (mpesa_account_reference IS NOT NULL AND length(btrim(mpesa_account_reference)) BETWEEN 1 AND 100)))
       OR (method<>'MPESA' AND mpesa_mode IS NULL AND mpesa_number IS NULL AND mpesa_account_reference IS NULL))
);
CREATE UNIQUE INDEX payment_accounts_active_code_uq ON payment_accounts(business_id,lower(code)) WHERE archived_at IS NULL;
