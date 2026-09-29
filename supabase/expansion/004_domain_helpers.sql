begin;
create function servos_v2.required_text(value jsonb,key text) returns text language plpgsql immutable set search_path='' as $$
declare result text:=trim(value->>key);begin
 if jsonb_typeof(value->key) is distinct from 'string' or result='' or length(result)>2000 then raise exception 'VALIDATION_FAILED: % is required text',key;end if;
 return result;
end$$;
create function servos_v2.minor(value jsonb,key text) returns bigint language plpgsql immutable set search_path='' as $$
declare result numeric;begin
 if jsonb_typeof(value->key) is distinct from 'number' then raise exception 'VALIDATION_FAILED: % must be minor-unit money',key;end if;
 result:=(value->>key)::numeric;
 if result<0 or result>100000000000 or trunc(result)<>result then raise exception 'VALIDATION_FAILED: % must be nonnegative whole minor units',key;end if;
 return result::bigint;
end$$;
create function servos_v2.read_record(collection_name text,record_key text) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;begin
 select data into result from servos_v2.records where collection=collection_name and id=record_key and not archived;
 if not found then raise exception 'VALIDATION_FAILED: active % record % missing',collection_name,record_key;end if;
 return result;
end$$;
create function servos_v2.assert_version(command jsonb,collection_name text,record_key text) returns void language plpgsql set search_path='' as $$
declare expected bigint;actual bigint;entries jsonb:=command->'expectedVersions';begin
 if jsonb_typeof(entries) is distinct from 'array' then raise exception 'VALIDATION_FAILED: expectedVersions';end if;
 if (select count(*) from jsonb_array_elements(entries) v where v->>'collection'=collection_name and v->>'id'=record_key)<>1 then raise exception 'VALIDATION_FAILED: one baseline required for %/%',collection_name,record_key;end if;
 select (v->>'version')::bigint into expected from jsonb_array_elements(entries) v where v->>'collection'=collection_name and v->>'id'=record_key;
 select version into actual from servos_v2.records where collection=collection_name and id=record_key;
 if expected is null or expected<>coalesce(actual,0) then raise exception 'VERSION_CONFLICT: %/% changed',collection_name,record_key;end if;
end$$;
create function servos_v2.put_record(collection_name text,record_key text,value jsonb,is_archived boolean default false) returns jsonb language plpgsql set search_path='' as $$
declare result jsonb;begin
 if record_key is null or length(record_key) not between 1 and 128 or jsonb_typeof(value) is distinct from 'object' then raise exception 'VALIDATION_FAILED: record';end if;
 insert into servos_v2.records(collection,id,version,data,archived) values(collection_name,record_key,1,value||jsonb_build_object('id',record_key),is_archived)
 on conflict(collection,id) do update set version=servos_v2.records.version+1,data=excluded.data,archived=excluded.archived;
 select jsonb_build_object('collection',collection,'id',id,'version',version,'data',data,'archived',archived) into result from servos_v2.records where collection=collection_name and id=record_key;
 return jsonb_build_array(result);
end$$;
create function servos_v2.assert_ownership(kind_name text,resource_key text,device_key uuid,interval_start timestamptz default null,interval_end timestamptz default null) returns void language plpgsql set search_path='' as $$
begin
 if exists(select 1 from servos_v2.allocations a where a.kind=kind_name and a.resource_id=resource_key and a.state<>'RETURNED' and a.device_id<>device_key and (kind_name<>'ROOM' or tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(interval_start,interval_end,'[)'))) then raise exception 'RESOURCE_OWNED: % reserved for another device',kind_name;end if;
 if exists(select 1 from servos_v2.allocations a where a.kind=kind_name and a.resource_id=resource_key and a.device_id=device_key and a.state='QUARANTINED') then raise exception 'RESOURCE_OWNED: allocation quarantined';end if;
end$$;
create function servos_v2.protect_ledger_records() returns trigger language plpgsql set search_path='' as $$
begin
 if old.collection in ('journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions','stockMovements','receiptDocuments','payments') then raise exception 'Immutable business history';end if;
 if tg_op='UPDATE' and new.collection in ('journalEntries','folioEntries','assetEvents','stayEvents','stayExtensions','stockMovements','receiptDocuments','payments') then raise exception 'Immutable business history';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
create trigger protect_business_history before update or delete on servos_v2.records for each row execute function servos_v2.protect_ledger_records();

create function servos_v2.post_journal(command jsonb,journal_key text,source_kind text,source_key text,memo text,lines jsonb) returns jsonb language plpgsql set search_path='' as $$
declare line jsonb;debits bigint:=0;credits bigint:=0;debit bigint;credit bigint;
begin
 if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines)<2 then raise exception 'VALIDATION_FAILED: journal lines';end if;
 for line in select value from jsonb_array_elements(lines) loop
  perform servos_v2.required_text(line,'accountCode');debit:=servos_v2.minor(line,'debitMinor');credit:=servos_v2.minor(line,'creditMinor');
  if debit>0 and credit>0 then raise exception 'VALIDATION_FAILED: one side per journal line';end if;
  debits:=debits+debit;credits:=credits+credit;
 end loop;
 if debits<>credits or debits=0 then raise exception 'VALIDATION_FAILED: unbalanced or empty journal';end if;
 return servos_v2.put_record('journalEntries',journal_key,jsonb_build_object('sourceCommandId',command->>'id','sourceType',source_kind,'sourceId',source_key,'memo',memo,'lines',lines,'totalDebitMinor',debits,'totalCreditMinor',credits,'postedAt',now(),'actorId',auth.uid()));
end$$;
revoke all on all functions in schema servos_v2 from public,anon,authenticated;
commit;
