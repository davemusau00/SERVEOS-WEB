-- Expand the existing availability holds without classifying historic records.
-- A legacy NULL kind must not be released as an operating hold by inference.
ALTER TABLE business_room_blocks
 ADD COLUMN block_kind text CHECK (block_kind IN ('OPERATING','MAINTENANCE')),
 ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
 ADD COLUMN inspection text,
 ADD COLUMN resolved_command_id uuid,
 ADD CONSTRAINT operating_room_hold_release_evidence CHECK (
  block_kind IS DISTINCT FROM 'OPERATING'
  OR (status='ACTIVE' AND inspection IS NULL AND resolved_command_id IS NULL)
  OR (status='RESOLVED' AND inspection IS NOT NULL AND length(btrim(inspection)) BETWEEN 3 AND 1000 AND resolved_command_id IS NOT NULL)
 );

CREATE INDEX business_operating_room_holds_idx
 ON business_room_blocks(business_id,room_id,starts_at,ends_at)
 WHERE block_kind='OPERATING' AND status='ACTIVE';
