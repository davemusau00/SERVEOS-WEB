ALTER TABLE products ADD COLUMN modifiers jsonb NOT NULL DEFAULT '[]'::jsonb
 CHECK(jsonb_typeof(modifiers)='array' AND jsonb_array_length(modifiers)<=50);
-- Referential index complements the frozen JSON definition used by order lines.
CREATE TABLE product_modifier_stock_refs (
 business_id uuid NOT NULL,
 product_id uuid NOT NULL,
 stock_item_id uuid NOT NULL,
 PRIMARY KEY(business_id,product_id,stock_item_id),
 FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id),
 FOREIGN KEY(business_id,stock_item_id) REFERENCES stock_items(business_id,id)
);
CREATE INDEX product_modifier_stock_lookup ON product_modifier_stock_refs(business_id,stock_item_id,product_id);
