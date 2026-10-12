-- Retain original whole-cent evidence for historical/older readers, and preserve
-- the actual weighted valuation rate separately on new supplier-return drafts.
ALTER TABLE procurement_supplier_return_lines ADD COLUMN unit_cost_rate_minor numeric(30,12)
 CHECK(unit_cost_rate_minor >= 0 AND unit_cost_rate_minor <= 9007199254740991);
