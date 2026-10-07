ALTER TABLE pos_order_lines
 ADD COLUMN gross_minor bigint,
 ADD COLUMN discount_basis_points integer NOT NULL DEFAULT 0 CHECK(discount_basis_points BETWEEN 0 AND 10000),
 ADD COLUMN discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0),
 ADD COLUMN comped boolean NOT NULL DEFAULT false,
 ADD COLUMN pricing_reason text,
 ADD COLUMN comp_reason text;
-- Existing API lines predate price adjustments. Keep their recorded gross;
-- never recalculate historical prices from current product configuration.
UPDATE pos_order_lines SET gross_minor=line_total_minor;
ALTER TABLE pos_order_lines ALTER COLUMN gross_minor SET NOT NULL;
ALTER TABLE pos_order_lines
 ADD CONSTRAINT pos_line_discount_conservation CHECK(gross_minor BETWEEN 0 AND 9007199254740991 AND line_total_minor+discount_minor=gross_minor),
 ADD CONSTRAINT pos_line_comp_evidence CHECK((NOT comped AND comp_reason IS NULL) OR (comped AND line_total_minor=0 AND comp_reason IS NOT NULL AND length(btrim(comp_reason)) BETWEEN 3 AND 500));
