ALTER TABLE pos_orders ADD COLUMN current_round_no integer NOT NULL DEFAULT 1 CHECK(current_round_no BETWEEN 1 AND 1000000);
ALTER TABLE pos_order_lines ADD COLUMN round_no integer CHECK(round_no BETWEEN 1 AND 1000000);
-- Begin a new tracked sequence. Existing fired history has no trustworthy round identity.
UPDATE pos_order_lines SET round_no=1 WHERE state='DRAFT';
