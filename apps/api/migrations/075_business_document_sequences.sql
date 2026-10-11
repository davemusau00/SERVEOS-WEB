CREATE TABLE business_document_sequences (
 business_id uuid NOT NULL REFERENCES businesses(id),
 document_type text NOT NULL,
 last_value bigint NOT NULL CHECK(last_value>0),
 PRIMARY KEY(business_id,document_type)
);
