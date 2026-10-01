-- STAGED V2 ONLY. Additive M-Pesa Till payment QR settings + immutable receipt snapshot.
-- This migration follows the already-shipped 043_receipt_branding_snapshots.sql and only extends it.
--
-- The QR is an operator-uploaded image supplied by the M-Pesa Till provider. ServOS never generates a
-- Safaricom/M-Pesa payload from a Till number. It is a payment convenience on the customer copy only and
-- must never be presented as proof that funds were received or provider-confirmed.
begin;

create function servos_v2.guard_business_till_qr()
returns trigger language plpgsql set search_path='' as $$
declare receipt jsonb:=coalesce(new.data->'receipt','{}'::jsonb);
        qr jsonb; raster jsonb; image_value text; encoded text;
        width integer; height integer; expected_bytes integer; changed boolean:=false; old_version bigint;
begin
  if new.collection<>'organization' or new.id<>'business' then return new;end if;
  qr:=receipt->'mpesaTillQr';
  if qr is not null and jsonb_typeof(qr)<>'null' then
    if jsonb_typeof(qr)<>'object' then raise exception 'VALIDATION_FAILED: M-Pesa Till QR must be an object';end if;
    if jsonb_typeof(qr->'enabled')<>'boolean' then raise exception 'VALIDATION_FAILED: M-Pesa Till QR requires an explicit enabled flag';end if;
    if qr ? 'label' and jsonb_typeof(qr->'label')<>'null' and length(qr->>'label')>60 then
      raise exception 'VALIDATION_FAILED: M-Pesa Till QR label cannot exceed 60 characters';
    end if;
    if qr ? 'tillNumber' and jsonb_typeof(qr->'tillNumber')<>'null' and length(qr->>'tillNumber')>32 then
      raise exception 'VALIDATION_FAILED: M-Pesa Till number cannot exceed 32 characters';
    end if;
    if qr->>'enabled'='true' and coalesce(qr->'thermalRaster','null'::jsonb)='null'::jsonb then
      -- An enabled QR that Web can display must also carry a printable thermal raster, otherwise the
      -- XP-80T path would silently omit it while the customer copy showed one.
      raise exception 'VALIDATION_FAILED: an enabled M-Pesa Till QR requires a thermal raster';
    end if;
    if qr ? 'thermalRaster' and jsonb_typeof(qr->'thermalRaster')<>'null' then
      raster:=qr->'thermalRaster';
      if jsonb_typeof(raster)<>'object' then raise exception 'VALIDATION_FAILED: M-Pesa Till QR thermal raster';end if;
      width:=(raster->>'width')::integer;height:=(raster->>'height')::integer;encoded:=raster->>'base64';
      -- Square, bounded to the printer dot profile, and never cropped to fit.
      if width<1 or width>320 or height<>width or encoded is null or encoded !~ '^[A-Za-z0-9+/]+={0,2}$' then
        raise exception 'VALIDATION_FAILED: M-Pesa Till QR must be a square raster no wider than 320 dots';
      end if;
      expected_bytes:=ceil((ceil(width::numeric/8)*height)::numeric/3)::integer*4;
      if length(encoded)<>expected_bytes or length(encoded)>24000 then raise exception 'VALIDATION_FAILED: M-Pesa Till QR raster size';end if;
    end if;
    image_value:=qr->>'dataUrl';
    if image_value is null or image_value !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' or length(image_value)>240000 then
      raise exception 'VALIDATION_FAILED: M-Pesa Till QR must be a bounded normalized PNG';
    end if;
  end if;

  if tg_op='INSERT' then
    if qr is not null and jsonb_typeof(qr)<>'null' then new.data:=jsonb_set(new.data,'{receipt,version}',to_jsonb(1),true);end if;
  else
    old_version:=coalesce((old.data->'receipt'->>'version')::bigint,0);
    changed:=(new.data->'receipt'->'mpesaTillQr') is distinct from (old.data->'receipt'->'mpesaTillQr');
    if changed then new.data:=jsonb_set(new.data,'{receipt,version}',to_jsonb(old_version+1),true);end if;
  end if;
  return new;
end$$;

drop trigger if exists business_till_qr_guard on servos_v2.records;
create trigger business_till_qr_guard
  before insert or update of data on servos_v2.records
  for each row when (new.collection='organization' and new.id='business')
  execute function servos_v2.guard_business_till_qr();

-- Extend the shipped 043 snapshot trigger to carry the QR. Replaced in place so new receipts capture it;
-- existing receipt rows keep whatever they were written with and are never rewritten.
create or replace function servos_v2.capture_receipt_branding()
returns trigger language plpgsql set search_path='' as $$
declare identity_data jsonb; receipt_settings jsonb; order_data jsonb; customer_data jsonb;
        branding_version bigint; customer_name text; receipt_no text; payment_snapshot jsonb;
        till_qr jsonb;
begin
  if new.collection<>'receiptDocuments' then return new;end if;
  select data into identity_data from servos_v2.records where collection='organization' and id='business';
  select data into order_data from servos_v2.records where collection='orders' and id=(new.data->>'orderId');
  select data into customer_data from servos_v2.records where collection='customers' and id=order_data->>'customerId';
  receipt_settings:=coalesce(identity_data->'receipt','{}'::jsonb);
  branding_version:=greatest(coalesce((identity_data->'branding'->>'version')::bigint,0),coalesce((receipt_settings->>'version')::bigint,0));
  customer_name:=coalesce(nullif(trim(new.data->>'customerName'),''),nullif(trim(order_data->>'customerName'),''),nullif(trim(customer_data->>'name'),''));
  receipt_no:=new.data->>'number';
  if receipt_no like 'V2-%' then receipt_no:='R-'||right(receipt_no,8);end if;
  select coalesce(jsonb_agg(
    case when replace(replace(replace(upper(coalesce(payment->>'tenderType',payment->>'method','')),'-',''),'_',''),' ','') like '%MPESA%'
      then payment else payment-'reference' end
    order by ordinality
  ),'[]'::jsonb) into payment_snapshot
  from jsonb_array_elements(coalesce(new.data->'payments','[]'::jsonb)) with ordinality as receipt_payments(payment,ordinality);
  -- Snapshot the QR exactly as configured now. Changing, disabling or deleting it affects future receipts only.
  till_qr:=case
    when jsonb_typeof(receipt_settings->'mpesaTillQr')='object'
      and receipt_settings->'mpesaTillQr'->>'enabled'='true'
      and coalesce(receipt_settings->'mpesaTillQr'->>'dataUrl','') ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'
    then receipt_settings->'mpesaTillQr'||jsonb_build_object('enabled',true)
    else null end;
  new.data:=new.data||jsonb_build_object(
    'schemaVersion',2,
    'number',receipt_no,
    'customerName',customer_name,
    'payments',payment_snapshot,
    'brandingSnapshot',jsonb_build_object(
      'version',branding_version,
      'footerLines',jsonb_build_array('Built By KINGSFORGE','info@kingsforge.co.ke','info@davemusau.co.ke','0746157440'),
      'receiptLogoDataUrl',receipt_settings->'logoDataUrl',
      'thermalLogo',receipt_settings->'thermalLogo',
      'mpesaTillQr',till_qr
    )
  );
  return new;
end$$;

revoke all on function servos_v2.guard_business_till_qr() from public,anon,authenticated;
commit;
