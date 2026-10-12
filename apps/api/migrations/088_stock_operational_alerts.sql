-- Expand-only, default off. No thresholds, policies or alerts are seeded.
-- Location minima are reviewed in base units; the item-wide reorder level is
-- never silently interpreted as a minimum for every store, bar or kitchen.
CREATE TABLE stock_operational_alert_policies (
 business_id uuid NOT NULL REFERENCES businesses(id), id uuid NOT NULL,
 stock_item_id uuid NOT NULL, location_id uuid NOT NULL, outlet_id uuid,
 enabled boolean NOT NULL DEFAULT false,
 minimum_quantity numeric(18,6) NOT NULL CHECK(minimum_quantity>=0),
 base_unit text NOT NULL, version bigint NOT NULL CHECK(version>0),
 configured_stock_version bigint NOT NULL CHECK(configured_stock_version>0),
 configured_location_version bigint NOT NULL CHECK(configured_location_version>0),
 updated_by uuid NOT NULL, updated_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,id), UNIQUE(business_id,stock_item_id,location_id),
 FOREIGN KEY(business_id,stock_item_id) REFERENCES stock_items(business_id,id),
 FOREIGN KEY(business_id,location_id) REFERENCES stock_locations(business_id,id),
 FOREIGN KEY(business_id,outlet_id) REFERENCES business_outlets(business_id,id)
);
CREATE TABLE stock_operational_alert_policy_events (
 business_id uuid NOT NULL, source_command_id uuid NOT NULL, policy_id uuid NOT NULL,
 before_policy jsonb, after_policy jsonb NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 500),
 staff_id uuid NOT NULL, device_id uuid NOT NULL, occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,source_command_id),
 FOREIGN KEY(business_id,policy_id) REFERENCES stock_operational_alert_policies(business_id,id)
);
CREATE TABLE stock_operational_alert_episodes (
 business_id uuid NOT NULL REFERENCES businesses(id), id uuid NOT NULL,
 policy_id uuid NOT NULL, policy_version bigint NOT NULL,
 stock_item_id uuid NOT NULL, location_id uuid NOT NULL, outlet_id uuid,
 stock_name text NOT NULL, stock_code text NOT NULL, location_name text NOT NULL,
 base_unit text NOT NULL, minimum_quantity numeric(18,6) NOT NULL CHECK(minimum_quantity>=0),
 status text NOT NULL CHECK(status IN ('OPEN','RESOLVED')),
 severity text NOT NULL CHECK(severity IN ('LOW','OUT')),
 highest_severity text NOT NULL CHECK(highest_severity IN ('LOW','OUT')),
 current_condition text NOT NULL CHECK(current_condition IN ('LOW','OUT','ABOVE_THRESHOLD','EVIDENCE_REQUIRED')),
 opened_quantity numeric(18,6) NOT NULL,
 opened_balance_version bigint NOT NULL CHECK(opened_balance_version>0),
 opened_source_command_id uuid NOT NULL, opened_at timestamptz NOT NULL,
 current_quantity numeric(18,6) NOT NULL,
 current_balance_version bigint NOT NULL CHECK(current_balance_version>0),
 current_stock_version bigint NOT NULL CHECK(current_stock_version>0),
 last_source_command_id uuid NOT NULL, last_observed_at timestamptz NOT NULL,
 resolved_source_command_id uuid, resolved_at timestamptz,
 resolved_quantity numeric(18,6), resolved_balance_version bigint,
 version bigint NOT NULL CHECK(version>0),
 PRIMARY KEY(business_id,id),
 FOREIGN KEY(business_id,policy_id) REFERENCES stock_operational_alert_policies(business_id,id),
 FOREIGN KEY(business_id,stock_item_id) REFERENCES stock_items(business_id,id),
 FOREIGN KEY(business_id,location_id) REFERENCES stock_locations(business_id,id),
 FOREIGN KEY(business_id,outlet_id) REFERENCES business_outlets(business_id,id),
 CHECK((status='OPEN' AND resolved_at IS NULL AND resolved_source_command_id IS NULL)
  OR (status='RESOLVED' AND resolved_at IS NOT NULL AND resolved_source_command_id IS NOT NULL
   AND resolved_quantity IS NOT NULL AND resolved_balance_version IS NOT NULL))
);
CREATE UNIQUE INDEX stock_operational_alert_episode_open
 ON stock_operational_alert_episodes(business_id,stock_item_id,location_id) WHERE status='OPEN';
CREATE INDEX stock_operational_alert_episode_recent
 ON stock_operational_alert_episodes(business_id,opened_at DESC,id);
CREATE TABLE stock_operational_alert_transitions (
 business_id uuid NOT NULL, episode_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('LOW','OUT','RESOLVED')),
 source_command_id uuid NOT NULL, event_id uuid,
 quantity numeric(18,6) NOT NULL, balance_version bigint NOT NULL,
 movement_ids uuid[] NOT NULL DEFAULT '{}', evidence jsonb NOT NULL,
 occurred_at timestamptz NOT NULL,
 PRIMARY KEY(business_id,episode_id,kind),
 UNIQUE(business_id,episode_id,source_command_id,kind),
 FOREIGN KEY(business_id,episode_id) REFERENCES stock_operational_alert_episodes(business_id,id),
 FOREIGN KEY(business_id,event_id) REFERENCES operational_events(business_id,id)
);
