-- Existing properties retain legacy pricing until explicitly configured by a manager.
ALTER TABLE business_hospitality_settings
 ADD COLUMN standard_room_rate_enabled boolean NOT NULL DEFAULT false;
