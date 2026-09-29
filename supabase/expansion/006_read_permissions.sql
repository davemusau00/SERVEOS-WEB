begin;
-- Collection grants are explicit. Unknown future collections default to deny.
create function servos_v2.can_read_collection(collection_name text) returns boolean language plpgsql stable set search_path='' as $$
declare grants text[];needed text[];
begin
 select permissions into grants from servos_v2.members where user_id=auth.uid() and active;
 if grants is null then return false;end if;
 if '*'=any(grants) then return true;end if;
 needed:=case
  when collection_name in ('customers','suppliers','roomTypes','assetCategories','stockLocations') then array['records.view']
  when collection_name in ('assets','assetEvents') then array['assets.view','assets.manage','assets.operate']
  when collection_name='maintenanceOrders' then array['maintenance.view','maintenance.manage']
  when collection_name in ('rooms','ratePlans','roomBlocks') then array['rooms.view','rooms.manage','rooms.operate']
  when collection_name in ('roomReservations','stays','stayEvents','stayExtensions') then array['rooms.guests.view','rooms.operate']
  when collection_name in ('folios','folioEntries') then array['folio.view','folio.manage']
  when collection_name in ('hotelServices','paymentAccounts') then array['folio.view','folio.manage','payment.record','business.configure']
  when collection_name in ('stockItems','stockMovements') then array['stock.view','stock.manage']
  when collection_name='journalEntries' then array['accounting.view','accounting.manage']
  when collection_name='supplierPayables' then array['procurement.view','procurement.manage','accounting.view','accounting.manage']
  when collection_name='employees' then array['staff.view','staff.manage']
  when collection_name in ('payments','receiptDocuments') then array['payments.view','payments.manage']
  else array[]::text[] end;
 return grants&&needed;
end$$;
create or replace function public.servos_v2_pull(after_sequence bigint default 0,page_size integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare upper_cursor bigint;page jsonb;
begin
 perform servos_v2.require_permission('records.view');
 if after_sequence is null or page_size is null or after_sequence<0 or page_size not between 1 and 500 then raise exception 'VALIDATION_FAILED: cursor/page';end if;
 -- Keep filtered sequence slots: clients can advance through invisible changes safely.
 select coalesce(jsonb_agg(jsonb_build_object('sequence',c.sequence,'commandId',c.command_id,'occurredAt',c.occurred_at,'records',coalesce((select jsonb_agg(v) from jsonb_array_elements(c.records) v where servos_v2.can_read_collection(v->>'collection')),'[]')) order by c.sequence),'[]'),coalesce(max(c.sequence),after_sequence)
 into page,upper_cursor from (select * from servos_v2.changes where sequence>after_sequence order by sequence limit page_size) c;
 return jsonb_build_object('cursor',upper_cursor,'changes',page,'hasMore',exists(select 1 from servos_v2.changes where sequence>upper_cursor));
end$$;
revoke all on function servos_v2.can_read_collection(text) from public,anon,authenticated;
commit;
