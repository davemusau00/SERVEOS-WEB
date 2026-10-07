CREATE TABLE pos_orders (
 business_id uuid NOT NULL REFERENCES businesses(id),
 id uuid NOT NULL,
 outlet_id uuid NOT NULL,
 stock_location_id uuid NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 service_destination text NOT NULL CHECK(service_destination IN ('COUNTER','TAKEAWAY','TABLE','ROOM')),
 service_reference jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(service_reference)='object'),
 state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','FIRED','COMPLETED','VOIDED')),
 currency text NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
 grand_total_minor bigint NOT NULL DEFAULT 0 CHECK(grand_total_minor>=0),
 amount_paid_minor bigint NOT NULL DEFAULT 0 CHECK(amount_paid_minor>=0),
 version bigint NOT NULL CHECK(version>0),
 created_by uuid NOT NULL,
 device_id uuid NOT NULL,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 FOREIGN KEY(business_id,outlet_id) REFERENCES business_outlets(business_id,id),
 FOREIGN KEY(business_id,stock_location_id) REFERENCES stock_locations(business_id,id)
);
CREATE INDEX pos_orders_outlet_idx ON pos_orders(business_id,outlet_id,state,updated_at DESC,id);
CREATE INDEX pos_orders_location_idx ON pos_orders(business_id,stock_location_id);

CREATE TABLE pos_order_lines (
 business_id uuid NOT NULL,
 order_id uuid NOT NULL,
 id uuid NOT NULL,
 product_id uuid NOT NULL,
 product_version bigint NOT NULL CHECK(product_version>0),
 product_snapshot jsonb NOT NULL CHECK(jsonb_typeof(product_snapshot)='object'),
 portion_snapshot jsonb CHECK(portion_snapshot IS NULL OR jsonb_typeof(portion_snapshot)='object'),
 modifier_snapshots jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(modifier_snapshots)='array'),
 quantity numeric(18,6) NOT NULL CHECK(quantity>0),
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 line_total_minor bigint NOT NULL CHECK(line_total_minor>=0),
 state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','FIRED','VOIDED')),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,order_id,id),
 FOREIGN KEY(business_id,order_id) REFERENCES pos_orders(business_id,id),
 FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id)
);
CREATE INDEX pos_order_lines_product_idx ON pos_order_lines(business_id,product_id);

CREATE TABLE pos_order_events (
 business_id uuid NOT NULL,
 id uuid NOT NULL,
 order_id uuid NOT NULL,
 order_version bigint NOT NULL CHECK(order_version>0),
 event_type text NOT NULL,
 event_data jsonb NOT NULL CHECK(jsonb_typeof(event_data)='object'),
 command_id uuid NOT NULL,
 staff_id uuid NOT NULL,
 device_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id),
 UNIQUE(business_id,command_id),
 UNIQUE(business_id,order_id,order_version),
 FOREIGN KEY(business_id,order_id) REFERENCES pos_orders(business_id,id)
);
