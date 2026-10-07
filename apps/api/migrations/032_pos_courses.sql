ALTER TABLE pos_order_lines
 ADD COLUMN course_name text NOT NULL DEFAULT '' CHECK(length(course_name)<=80),
 ADD COLUMN fired_at timestamptz;
-- Historical fired times remain unknown; never infer them from mutable updated_at.
