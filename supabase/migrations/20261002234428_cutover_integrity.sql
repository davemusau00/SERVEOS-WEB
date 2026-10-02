-- Existing-terminal cutover: prove complete source membership, not totals alone.
begin;

create function servos_v2.cutover_canonical_json(value jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare result text;
begin
  case jsonb_typeof(value)
    when 'object' then
      select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||servos_v2.cutover_canonical_json(item),',' order by key collate "C"),'')||'}'
        into result from jsonb_each(value) as e(key,item);
    when 'array' then
      select '['||coalesce(string_agg(servos_v2.cutover_canonical_json(item),',' order by position),'')||']'
        into result from jsonb_array_elements(value) with ordinality as e(item,position);
    else result:=value::text;
  end case;
  return result;
end$$;

create function servos_v2.cutover_record_hash(collection_name text,record_id text,record_version bigint,data jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(convert_to(collection_name||chr(31)||record_id||chr(31)||record_version::text||chr(31)||servos_v2.cutover_canonical_json(data),'UTF8'),'sha256'),'hex');
$$;

create table servos_v2.cutover_record_evidence(
  cutover_id uuid not null references servos_v2.cutovers(id),
  collection text not null,
  id text not null,
  version bigint not null check(version>0),
  archived boolean not null,
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  source_data jsonb not null,
  primary key(cutover_id,collection,id)
);
alter table servos_v2.cutover_record_evidence enable row level security;
create trigger cutover_record_evidence_immutable before update or delete on servos_v2.cutover_record_evidence
for each row execute function servos_v2.cutover_evidence_immutable();
revoke all on servos_v2.cutover_record_evidence from public,anon,authenticated;

-- Preserve previous validators privately. Their public names must not bypass the new gates.
alter function public.servos_v2_begin_cutover(jsonb) set schema servos_v2;
alter function public.servos_v2_import_cutover_page(uuid,integer,text,jsonb) set schema servos_v2;
alter function public.servos_v2_verify_cutover(uuid) set schema servos_v2;
revoke all on function servos_v2.servos_v2_begin_cutover(jsonb),servos_v2.servos_v2_import_cutover_page(uuid,integer,text,jsonb),servos_v2.servos_v2_verify_cutover(uuid) from public,anon,authenticated;

create function public.servos_v2_begin_cutover(manifest jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck(); group_entry jsonb; entry jsonb; active_total bigint:=0; actual_hash text;
begin
  begin
    perform (manifest->>'terminalId')::uuid;
  exception when invalid_text_representation then
    raise exception 'VALIDATION_FAILED: source terminal id must be a UUID';
  end;
  if jsonb_typeof(manifest->'collections') is distinct from 'array' then raise exception 'VALIDATION_FAILED: manifest collections';end if;
  if manifest->>'manifestHash' is null or manifest->>'manifestHash' !~ '^[0-9a-f]{64}$' then raise exception 'VALIDATION_FAILED: manifest hash must be a SHA-256 digest';end if;
  actual_hash:=encode(extensions.digest(convert_to(servos_v2.cutover_canonical_json(manifest-'generatedAt'-'manifestHash'),'UTF8'),'sha256'),'hex');
  if actual_hash<>manifest->>'manifestHash' then raise exception 'MANIFEST_MISMATCH: manifest content hash';end if;
  if exists(select 1 from jsonb_array_elements(manifest->'collections') e group by e->>'collection' having count(*)>1) then
    raise exception 'VALIDATION_FAILED: duplicate manifest collection';
  end if;
  for group_entry in select value from jsonb_array_elements(manifest->'collections') loop
    if not coalesce(servos_v2.cutover_collection_allowed(group_entry->>'collection'),false)
      or jsonb_typeof(group_entry->'records') is distinct from 'array' then raise exception 'VALIDATION_FAILED: manifest collection';end if;
    if exists(select 1 from jsonb_array_elements(group_entry->'records') e group by e->>'id' having count(*)>1) then raise exception 'VALIDATION_FAILED: duplicate manifest record';end if;
    for entry in select value from jsonb_array_elements(group_entry->'records') loop
      if entry->>'id' is null or length(entry->>'id') not between 1 and 128
        or entry->>'hash' is null or entry->>'hash' !~ '^[0-9a-f]{64}$'
        or coalesce((entry->>'version')::bigint,0)<1 or jsonb_typeof(entry->'archived') is distinct from 'boolean' then
        raise exception 'VALIDATION_FAILED: manifest record identity';
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements(group_entry->'records') e where not (e->>'archived')::boolean)
       is distinct from (group_entry->>'activeCount')::bigint then raise exception 'VALIDATION_FAILED: manifest active count';end if;
    if (select count(*) from jsonb_array_elements(group_entry->'records') e where (e->>'archived')::boolean)
       is distinct from (group_entry->>'archivedCount')::bigint then raise exception 'VALIDATION_FAILED: manifest archived count';end if;
    active_total:=active_total+(group_entry->>'activeCount')::bigint;
  end loop;
  if active_total is distinct from (manifest->>'recordCount')::bigint then raise exception 'VALIDATION_FAILED: manifest record count';end if;
  return servos_v2.servos_v2_begin_cutover(manifest);
end$$;

create function public.servos_v2_import_cutover_page(p_cutover_id uuid,p_page_index integer,collection_name text,page jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck(); cut servos_v2.cutovers; entry jsonb; expected jsonb; digest text; result jsonb;
begin
  select * into cut from servos_v2.cutovers c where c.id=p_cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  -- Existing validator retains replay mismatch, credential, size and duplicate checks.
  -- It is atomic with the evidence below: any later failure rolls back the entire page.
  result:=servos_v2.servos_v2_import_cutover_page(p_cutover_id,p_page_index,collection_name,page);
  if (result->>'replayed')::boolean then return result;end if;
  for entry in select value from jsonb_array_elements(page->'records') loop
    select r into expected from jsonb_array_elements(cut.source_manifest->'collections') g,
      lateral jsonb_array_elements(g->'records') r where g->>'collection'=collection_name and r->>'id'=entry->>'id';
    digest:=servos_v2.cutover_record_hash(collection_name,entry->>'id',(entry->>'version')::bigint,entry->'data');
    if expected is null or expected->>'hash' is distinct from digest
      or (expected->>'version')::bigint is distinct from (entry->>'version')::bigint
      or (expected->>'archived')::boolean is distinct from coalesce((entry->>'archived')::boolean,false) then
      raise exception 'MANIFEST_MISMATCH: record %/% differs from frozen source',collection_name,entry->>'id';
    end if;
    insert into servos_v2.cutover_record_evidence values(p_cutover_id,collection_name,entry->>'id',(entry->>'version')::bigint,
      coalesce((entry->>'archived')::boolean,false),digest,entry->'data');
  end loop;
  return result;
end$$;

create function public.servos_v2_verify_cutover(cutover_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid:=servos_v2.cutover_precheck(); cut servos_v2.cutovers; missing bigint; differences bigint; result jsonb;
begin
  select * into cut from servos_v2.cutovers c where c.id=cutover_id for update;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  select count(*) into missing from jsonb_array_elements(cut.source_manifest->'collections') g,
    lateral jsonb_array_elements(g->'records') r where not exists(
      select 1 from servos_v2.cutover_record_evidence e where e.cutover_id=cut.id and e.collection=g->>'collection' and e.id=r->>'id' and e.source_hash=r->>'hash');
  select count(*) into differences from servos_v2.cutover_record_evidence e
    left join servos_v2.records r on r.collection=e.collection and r.id=e.id
    where e.cutover_id=cut.id and (r.id is null or r.version<>e.version or r.archived<>e.archived or r.data is distinct from
      case when servos_v2.cutover_collection_is_history(e.collection) then e.source_data||jsonb_build_object('source','LEGACY_SQLITE_CUTOVER','sourceCutoverId',cut.id::text,'sourceVersion',e.version) else e.source_data end);
  if missing>0 or differences>0 then
    update servos_v2.cutovers set status='VERIFYING',verification_hash=null where id=cut.id;
    return jsonb_build_object('cutoverId',cut.id,'status','VERIFYING','verified',false,'missingRecords',missing,'changedRecords',differences);
  end if;
  result:=servos_v2.servos_v2_verify_cutover(cutover_id);
  return result||jsonb_build_object('completeManifest',true,'sourceManifestHash',cut.source_manifest_hash,'sourceTerminalId',cut.source_terminal_id);
end$$;

-- Read-only authenticated evidence used by the native transition boundary.
create function public.servos_v2_cutover_status(cutover_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cut servos_v2.cutovers; mode text;
begin
  if auth.uid() is null or not exists(select 1 from servos_v2.staff_profiles s where s.auth_user_id=auth.uid() and s.active and s.role='Admin') then
    raise exception 'PERMISSION_DENIED: Admin staff profile required' using errcode='42501';
  end if;
  select c.* into cut from servos_v2.cutovers c join servos_v2.control state on state.business_id=c.business_id and state.singleton where c.id=cutover_id;
  if not found then raise exception 'VALIDATION_FAILED: unknown cutover';end if;
  select authority_mode into mode from servos_v2.control where singleton;
  return jsonb_build_object('cutoverId',cut.id,'status',cut.status,'businessId',cut.business_id,'sourceTerminalId',cut.source_terminal_id,
    'sourceManifestHash',cut.source_manifest_hash,'verificationHash',cut.verification_hash,'authorityMode',mode);
end$$;

revoke all on function servos_v2.cutover_canonical_json(jsonb),servos_v2.cutover_record_hash(text,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.servos_v2_begin_cutover(jsonb),public.servos_v2_import_cutover_page(uuid,integer,text,jsonb),public.servos_v2_verify_cutover(uuid),public.servos_v2_cutover_status(uuid) from public,anon;
grant execute on function public.servos_v2_begin_cutover(jsonb),public.servos_v2_import_cutover_page(uuid,integer,text,jsonb),public.servos_v2_verify_cutover(uuid),public.servos_v2_cutover_status(uuid) to authenticated;
commit;
