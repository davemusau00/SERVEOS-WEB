ALTER TABLE business_room_reservations ADD COLUMN reservation_number text
 CHECK(reservation_number IS NULL OR reservation_number ~ '^B-[0-9]{6,}$');
CREATE UNIQUE INDEX business_reservation_number_unique
 ON business_room_reservations(business_id,reservation_number)
 WHERE reservation_number IS NOT NULL;

CREATE FUNCTION servos_preserve_booking_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.reservation_number IS NOT NULL AND NEW.reservation_number IS DISTINCT FROM OLD.reservation_number THEN
  RAISE EXCEPTION 'Issued booking reference is immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER business_reservation_number_immutable BEFORE UPDATE ON business_room_reservations
 FOR EACH ROW EXECUTE FUNCTION servos_preserve_booking_number();
