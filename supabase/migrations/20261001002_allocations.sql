-- Private allocation primitives. Domain command handlers must call these within
-- their business transaction; clients cannot consume resources directly.
begin;
create table servos_v2.resources(
 kind text not null check(kind in ('STOCK','ROOM','ORDER','TABLE','FOLIO','CREDIT','POINTS','TICKET','ASSET')),
 id text not null,capacity numeric(24,6) not null check(capacity>=0),used numeric(24,6) not null default 0 check(used>=0 and used<=capacity),primary key(kind,id)
);
create table servos_v2.allocations(
 id uuid primary key,kind text not null,resource_id text not null,device_id uuid not null references servos_v2.devices(id),
 quantity numeric(24,6) not null check(quantity>0),consumed numeric(24,6) not null default 0 check(consumed>=0 and consumed<=quantity),
 starts_at timestamptz,ends_at timestamptz,not_before timestamptz not null,expires_at timestamptz not null,
 state text not null default 'ACTIVE' check(state in ('ACTIVE','RETURN_REQUESTED','RETURNED','QUARANTINED')),
 version bigint not null default 1,foreign key(kind,resource_id) references servos_v2.resources(kind,id),
 check(expires_at>not_before),check((starts_at is null and ends_at is null) or (starts_at is not null and ends_at>starts_at))
);
create index allocation_resource on servos_v2.allocations(kind,resource_id,state);
create table servos_v2.allocation_effects(id uuid primary key,allocation_id uuid not null references servos_v2.allocations(id),device_id uuid not null,quantity numeric(24,6) not null,occurred_at timestamptz not null,recorded_at timestamptz not null default now());
create trigger allocation_effects_immutable before update or delete on servos_v2.allocation_effects for each row execute function servos_v2.immutable();

create function servos_v2.reserve(allocation_id uuid,resource_kind text,resource_key text,target_device uuid,amount numeric,valid_from timestamptz,valid_until timestamptz,interval_start timestamptz default null,interval_end timestamptz default null) returns uuid language plpgsql set search_path='' as $$
declare resource servos_v2.resources;prior servos_v2.allocations;reserved numeric;
begin
 if amount is null or amount<=0 or amount::text in ('NaN','Infinity','-Infinity') or round(amount,6)<>amount or valid_from is null or valid_until is null or valid_until<=valid_from then raise exception 'VALIDATION_FAILED: allocation';end if;
 if not exists(select 1 from servos_v2.devices where id=target_device and active) then raise exception 'DEVICE_REVOKED';end if;
 -- Serialize all budget calculations on the resource row, not an expiring client lease.
 select * into resource from servos_v2.resources where kind=resource_kind and id=resource_key for update;
 if not found then raise exception 'VALIDATION_FAILED: resource';end if;
 select * into prior from servos_v2.allocations where id=allocation_id;
 if found then
  if prior.kind<>resource_kind or prior.resource_id<>resource_key or prior.device_id<>target_device or prior.quantity<>amount or prior.not_before<>valid_from or prior.expires_at<>valid_until or prior.starts_at is distinct from interval_start or prior.ends_at is distinct from interval_end then raise exception 'REPLAY_MISMATCH';end if;
  return prior.id;
 end if;
 if resource_kind='ROOM' then
  if interval_start is null or interval_end is null or interval_end<=interval_start or amount<>1 then raise exception 'VALIDATION_FAILED: room interval';end if;
  if exists(select 1 from servos_v2.allocations a where a.kind=resource_kind and a.resource_id=resource_key and a.state<>'RETURNED' and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(interval_start,interval_end,'[)')) then raise exception 'RESOURCE_OWNED: room interval';end if;
 else
  if interval_start is not null or interval_end is not null then raise exception 'VALIDATION_FAILED: unexpected interval';end if;
  select coalesce(sum(a.quantity-a.consumed),0) into reserved from servos_v2.allocations a where a.kind=resource_kind and a.resource_id=resource_key and a.state<>'RETURNED';
  if resource.capacity-resource.used-reserved<amount then raise exception 'ALLOCATION_EXHAUSTED';end if;
  if resource_kind in ('ORDER','TABLE','FOLIO','TICKET','ASSET') and (amount<>1 or exists(select 1 from servos_v2.allocations a where a.kind=resource_kind and a.resource_id=resource_key and a.state<>'RETURNED')) then raise exception 'RESOURCE_OWNED';end if;
 end if;
 insert into servos_v2.allocations(id,kind,resource_id,device_id,quantity,not_before,expires_at,starts_at,ends_at) values(allocation_id,resource_kind,resource_key,target_device,amount,valid_from,valid_until,interval_start,interval_end);
 return allocation_id;
end$$;

create function servos_v2.consume(allocation_id uuid,origin_device uuid,amount numeric,effect_id uuid,occurred_at timestamptz) returns void language plpgsql set search_path='' as $$
declare allocation servos_v2.allocations;prior servos_v2.allocation_effects;
begin
 if amount is null or amount<=0 or amount::text in ('NaN','Infinity','-Infinity') or round(amount,6)<>amount or occurred_at is null then raise exception 'VALIDATION_FAILED: consumption';end if;
 select * into allocation from servos_v2.allocations a where a.id=allocation_id;
 if not found then raise exception 'ALLOCATION_REQUIRED';end if;
 -- Same lock order as reserve: resource, then allocation.
 perform 1 from servos_v2.resources r where r.kind=allocation.kind and r.id=allocation.resource_id for update;
 select * into allocation from servos_v2.allocations a where a.id=allocation_id for update;
 select * into prior from servos_v2.allocation_effects e where e.id=effect_id;
 if found then
  if prior.allocation_id<>allocation_id or prior.device_id<>origin_device or prior.quantity<>amount or prior.occurred_at<>occurred_at then raise exception 'REPLAY_MISMATCH';end if;
  return;
 end if;
 if allocation.device_id<>origin_device then raise exception 'RESOURCE_OWNED';end if;
 if allocation.state<>'ACTIVE' then raise exception 'ALLOCATION_REQUIRED: not active';end if;
 if occurred_at<allocation.not_before or occurred_at>=allocation.expires_at or occurred_at>now()+interval '1 minute' then raise exception 'GRANT_EXPIRED or invalid time';end if;
 if allocation.kind in ('ROOM','ORDER','TABLE','FOLIO','ASSET') then raise exception 'VALIDATION_FAILED: exclusive ownership is not a quantity debit';end if;
 if allocation.quantity-allocation.consumed<amount then raise exception 'ALLOCATION_EXHAUSTED';end if;
 update servos_v2.allocations a set consumed=a.consumed+amount,version=a.version+1 where a.id=allocation_id;
 update servos_v2.resources r set used=r.used+amount where r.kind=allocation.kind and r.id=allocation.resource_id;
 insert into servos_v2.allocation_effects values(effect_id,allocation_id,origin_device,amount,occurred_at,now());
end$$;

-- Only a verified handover workflow can release capacity. No expiry cleanup job.
create function servos_v2.return_allocation(allocation_id uuid,origin_device uuid,acknowledged_sequence bigint) returns void language plpgsql set search_path='' as $$
declare allocation servos_v2.allocations;
begin
 select * into allocation from servos_v2.allocations a where a.id=allocation_id;
 if not found then raise exception 'ALLOCATION_REQUIRED';end if;
 perform 1 from servos_v2.resources r where r.kind=allocation.kind and r.id=allocation.resource_id for update;
 select * into allocation from servos_v2.allocations a where a.id=allocation_id for update;
 if allocation.device_id<>origin_device then raise exception 'RESOURCE_OWNED';end if;
 if allocation.state='RETURNED' then return;end if;
 if allocation.state<>'RETURN_REQUESTED' or not exists(select 1 from servos_v2.devices d where d.id=origin_device and d.active and d.last_sequence=acknowledged_sequence) then raise exception 'HANDOVER_REQUIRED';end if;
 update servos_v2.allocations a set state='RETURNED',version=version+1 where a.id=allocation_id;
end$$;
revoke all on all functions in schema servos_v2 from public,anon,authenticated;
commit;
