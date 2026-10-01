-- STAGED V2 ONLY. Validate bounded business branding and snapshot it atomically
-- into each immutable receipt. No browser write path is introduced here.
begin;

create sequence servos_v2.order_public_number_seq start with 1;
select setval(
  'servos_v2.order_public_number_seq',
  coalesce(max((substring(data->>'orderNumber' from 5))::bigint), 0) + 1,
  false
)
from servos_v2.records
where collection='orders' and data->>'orderNumber' ~ '^ORD-[0-9]{6,}$';

create function servos_v2.assign_public_order_number()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.collection='orders' then
    new.data:=jsonb_set(new.data,'{orderNumber}',to_jsonb('ORD-'||lpad(nextval('servos_v2.order_public_number_seq')::text,6,'0')),true);
  end if;
  return new;
end$$;
create trigger public_order_number
before insert on servos_v2.records
for each row when (new.collection='orders')
execute function servos_v2.assign_public_order_number();

create function servos_v2.guard_business_branding()
returns trigger language plpgsql set search_path='' as $$
declare branding jsonb:=coalesce(new.data->'branding','{}'::jsonb);
        receipt jsonb:=coalesce(new.data->'receipt','{}'::jsonb);
        image_value text; raster jsonb; width integer; height integer; expected_bytes integer;
        encoded text; key text; changed boolean:=false; old_version bigint;
begin
  if new.collection<>'organization' or new.id<>'business' then return new;end if;
  if jsonb_typeof(branding)<>'object' or jsonb_typeof(receipt)<>'object' then
    raise exception 'VALIDATION_FAILED: business branding settings must be objects';
  end if;
  if length(branding::text)>500000 or length(receipt::text)>300000 then raise exception 'VALIDATION_FAILED: branding settings exceed the safe storage limit';end if;
  foreach key in array array['appEmblemDataUrl'] loop
    if branding ? key and jsonb_typeof(branding->key)<>'null' then
      image_value:=branding->>key;
      if image_value !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' or length(image_value)>240000 then
        raise exception 'VALIDATION_FAILED: app emblem must be a bounded normalized JPEG';
      end if;
    end if;
  end loop;
  if receipt ? 'logoDataUrl' and jsonb_typeof(receipt->'logoDataUrl')<>'null' then
    image_value:=receipt->>'logoDataUrl';
    if image_value !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' or length(image_value)>240000 then
      raise exception 'VALIDATION_FAILED: receipt logo must be a bounded normalized JPEG';
    end if;
  end if;
  if receipt ? 'thermalLogo' and jsonb_typeof(receipt->'thermalLogo')<>'null' then
    raster:=receipt->'thermalLogo';
    if jsonb_typeof(raster)<>'object' then raise exception 'VALIDATION_FAILED: thermal logo raster';end if;
    width:=(raster->>'width')::integer;height:=(raster->>'height')::integer;encoded:=raster->>'base64';
    if width<1 or width>576 or height<1 or height>220 or encoded is null or encoded !~ '^[A-Za-z0-9+/]+={0,2}$' then
      raise exception 'VALIDATION_FAILED: thermal logo dimensions or encoding';
    end if;
    expected_bytes:=ceil((ceil(width::numeric/8)*height)::numeric/3)::integer*4;
    if length(encoded)<>expected_bytes or length(encoded)>24000 then raise exception 'VALIDATION_FAILED: thermal logo raster size';end if;
  end if;

  if tg_op='INSERT' then
    if branding ? 'appEmblemDataUrl' then new.data:=jsonb_set(new.data,'{branding,version}',to_jsonb(1),true);end if;
    if receipt ? 'logoDataUrl' or receipt ? 'thermalLogo' then new.data:=jsonb_set(new.data,'{receipt,version}',to_jsonb(1),true);end if;
  else
    old_version:=coalesce((old.data->'branding'->>'version')::bigint,0);
    changed:=(new.data->'branding'->'appEmblemDataUrl') is distinct from (old.data->'branding'->'appEmblemDataUrl');
    if changed then new.data:=jsonb_set(new.data,'{branding,version}',to_jsonb(old_version+1),true);end if;
    old_version:=coalesce((old.data->'receipt'->>'version')::bigint,0);
    changed:=(new.data->'receipt'->'logoDataUrl') is distinct from (old.data->'receipt'->'logoDataUrl')
      or (new.data->'receipt'->'thermalLogo') is distinct from (old.data->'receipt'->'thermalLogo');
    if changed then new.data:=jsonb_set(new.data,'{receipt,version}',to_jsonb(old_version+1),true);end if;
  end if;
  return new;
end$$;

create trigger business_branding_guard
before insert or update of data on servos_v2.records
for each row when (new.collection='organization' and new.id='business')
execute function servos_v2.guard_business_branding();

create function servos_v2.capture_receipt_branding()
returns trigger language plpgsql set search_path='' as $$
declare identity_data jsonb; receipt_settings jsonb; order_data jsonb; customer_data jsonb;
        branding_version bigint; customer_name text; receipt_no text; payment_snapshot jsonb;
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
  new.data:=new.data||jsonb_build_object(
    'schemaVersion',2,
    'number',receipt_no,
    'customerName',customer_name,
    'payments',payment_snapshot,
    'brandingSnapshot',jsonb_build_object(
      'version',branding_version,
      'footerLines',jsonb_build_array('Built By KINGSFORGE','info@kingsforge.co.ke','info@davemusau.co.ke','0746157440'),
      'receiptLogoDataUrl',receipt_settings->'logoDataUrl',
      'thermalLogo',receipt_settings->'thermalLogo'
    )
  );
  return new;
end$$;

create trigger receipt_branding_snapshot
before insert on servos_v2.records
for each row when (new.collection='receiptDocuments')
execute function servos_v2.capture_receipt_branding();

revoke all on function servos_v2.assign_public_order_number(),servos_v2.guard_business_branding(),servos_v2.capture_receipt_branding() from public,anon,authenticated;
commit;
