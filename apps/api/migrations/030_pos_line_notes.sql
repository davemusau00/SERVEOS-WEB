-- Preparation instructions belong to the reviewed line, then to the immutable fired ticket.
ALTER TABLE pos_order_lines
 ADD COLUMN notes text NOT NULL DEFAULT ''
 CHECK(length(notes)<=500);
