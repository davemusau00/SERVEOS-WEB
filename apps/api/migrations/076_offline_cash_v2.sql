CREATE TABLE pos_offline_capabilities (
 business_id uuid NOT NULL REFERENCES businesses(id), lease_id uuid NOT NULL,
 device_id uuid NOT NULL, staff_id uuid NOT NULL, outlet_id uuid NOT NULL,
 till_session_id uuid NOT NULL, signed_lease jsonb NOT NULL, issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 PRIMARY KEY (business_id,lease_id)
);
CREATE TABLE pos_offline_cash_reconciliations (
 business_id uuid NOT NULL REFERENCES businesses(id), sale_id uuid NOT NULL,
 device_id uuid NOT NULL, staff_id uuid NOT NULL, checkout_sequence bigint NOT NULL CHECK(checkout_sequence>0),
 local_reference text NOT NULL, local_snapshot jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('SERVER_CONFIRMED','RECONCILIATION_REQUIRED')),
 reason text, server_order_id uuid, server_document_ids jsonb NOT NULL DEFAULT '[]',
 source_command_id uuid NOT NULL, recorded_at timestamptz NOT NULL, reconciled_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,sale_id), UNIQUE(business_id,device_id,checkout_sequence),
 UNIQUE(business_id,source_command_id), UNIQUE(business_id,local_reference)
);
