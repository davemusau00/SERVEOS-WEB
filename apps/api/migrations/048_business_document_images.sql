ALTER TABLE business_receipt_settings
 ADD COLUMN logo_png_data_url text,
 ADD COLUMN payment_qr_png_data_url text,
 ADD COLUMN payment_qr_enabled boolean NOT NULL DEFAULT false,
 ADD CONSTRAINT business_receipt_logo_png_bounded CHECK (
  logo_png_data_url IS NULL OR (
   length(logo_png_data_url) <= 240000 AND
   logo_png_data_url ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
  )
 ),
 ADD CONSTRAINT business_receipt_payment_qr_png_bounded CHECK (
  payment_qr_png_data_url IS NULL OR (
   length(payment_qr_png_data_url) <= 240000 AND
   payment_qr_png_data_url ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
  )
 ),
 ADD CONSTRAINT business_receipt_payment_qr_enabled_has_image CHECK (
  NOT payment_qr_enabled OR payment_qr_png_data_url IS NOT NULL
 );
