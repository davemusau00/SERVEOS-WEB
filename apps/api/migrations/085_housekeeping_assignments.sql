ALTER TABLE business_rooms
 ADD COLUMN housekeeping_assigned_staff_id uuid,
 ADD COLUMN housekeeping_assigned_name text,
 ADD COLUMN housekeeping_assigned_at timestamptz,
 ADD COLUMN housekeeping_assigned_by uuid,
 ADD CONSTRAINT room_housekeeping_assigned_staff_fk FOREIGN KEY(business_id,housekeeping_assigned_staff_id) REFERENCES api_staff_profiles(business_id,staff_id),
 ADD CONSTRAINT room_housekeeping_assignment_complete CHECK (
  (housekeeping_assigned_staff_id IS NULL AND housekeeping_assigned_name IS NULL AND housekeeping_assigned_at IS NULL AND housekeeping_assigned_by IS NULL)
  OR (housekeeping_assigned_staff_id IS NOT NULL AND housekeeping_assigned_name IS NOT NULL AND length(btrim(housekeeping_assigned_name))>0 AND housekeeping_assigned_at IS NOT NULL AND housekeeping_assigned_by IS NOT NULL)
 );
CREATE INDEX business_rooms_housekeeping_assignee_idx
 ON business_rooms(business_id,housekeeping_assigned_staff_id) WHERE housekeeping_assigned_staff_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX business_room_history_page_idx ON business_room_events(business_id,room_id,occurred_at DESC,id DESC);
