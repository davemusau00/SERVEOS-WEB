-- Supplier identity only. Payables and purchase orders retain their own domain ledgers.
CREATE TABLE procurement_suppliers (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 80),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 contact_name text CHECK(contact_name IS NULL OR length(contact_name)<=160),
 phone text CHECK(phone IS NULL OR length(phone)<=80),
 email text CHECK(email IS NULL OR length(email)<=254),
 address text CHECK(address IS NULL OR length(address)<=2000),
 tax_pin text CHECK(tax_pin IS NULL OR length(tax_pin)<=80),
 payment_terms_days integer NOT NULL DEFAULT 0 CHECK(payment_terms_days BETWEEN 0 AND 365),
 notes text CHECK(notes IS NULL OR length(notes)<=2000),
 version bigint NOT NULL CHECK(version>0),
 archived_at timestamptz,
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id)
);
CREATE UNIQUE INDEX procurement_suppliers_active_code_uq
 ON procurement_suppliers(business_id,lower(code)) WHERE archived_at IS NULL;
