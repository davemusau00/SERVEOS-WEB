CREATE TABLE business_setup (
  business_id uuid PRIMARY KEY REFERENCES businesses(id),
  status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  current_step smallint NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 3),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration)='object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (business_id, updated_by) REFERENCES api_staff_profiles(business_id, staff_id)
);
