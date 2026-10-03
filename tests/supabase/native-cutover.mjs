import { spawnSync } from 'node:child_process';

export function testNativeCutover(container) {
  const fixture = spawnSync('cargo', ['run', '--quiet', '--locked', '--manifest-path', 'native-tests/Cargo.toml', '--example', 'cutover-fixture'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (fixture.status !== 0) throw new Error(fixture.error?.message || fixture.stderr || 'Native cutover fixture failed');
  // Parse once for validation, but preserve Rust's serialized numeric values on the wire.
  JSON.parse(fixture.stdout);
  const encoded = Buffer.from(fixture.stdout).toString('hex');
  const source = `
begin;
insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
insert into servos_v2.staff_profiles(auth_user_id,staff_id,name,role,created_by,updated_by)
values('00000000-0000-4000-8000-000000000001','fixture-admin','Fixture Admin','Admin','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001')
on conflict(auth_user_id) do update set role='Admin',active=true;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.servos_v2_set_authority_mode('CUTOVER_PREP','Disposable native cutover fixture');
select public.servos_v2_register_device('10000000-0000-4000-8000-000000000001','Disposable fixture','DESKTOP');
do $$
declare fixture jsonb:=convert_from(decode('${encoded}','hex'),'UTF8')::jsonb;
  cut uuid; page jsonb; result jsonb; index integer:=0; tampered jsonb; refused boolean:=false;
begin
  result:=public.servos_v2_begin_cutover(fixture->'manifest');
  cut:=(result->>'cutoverId')::uuid;
  result:=public.servos_v2_verify_cutover(cut);
  if result->>'verified'<>'false' or (result->>'missingRecords')::int<>13 then raise exception 'native fixture must be incomplete before import: %',result;end if;
  page:=fixture->'pages'->0;
  tampered:=jsonb_set(page,'{records,0,data,name}','"Tampered name with unchanged totals"'::jsonb);
  begin
    perform public.servos_v2_import_cutover_page(cut,0,page->>'collection',tampered);
  exception when others then refused:=sqlerrm like '%MANIFEST_MISMATCH%';end;
  if not refused then raise exception 'record content tampering was accepted';end if;
  for page in select value from jsonb_array_elements(fixture->'pages') loop
    result:=public.servos_v2_import_cutover_page(cut,index,page->>'collection',page);
    result:=public.servos_v2_import_cutover_page(cut,index,page->>'collection',page);
    if result->>'replayed'<>'true' then raise exception 'native page replay was not idempotent';end if;
    index:=index+1;
  end loop;
  result:=public.servos_v2_verify_cutover(cut);
  if result->>'verified'<>'true' or result->>'completeManifest'<>'true' then
    raise exception 'cross-runtime verification failed: %, record differences: %',result,
      (select jsonb_agg(jsonb_build_object('collection',e.collection,'id',e.id,'source',e.source_data,'stored',r.data)) from servos_v2.cutover_record_evidence e
        left join servos_v2.records r on r.collection=e.collection and r.id=e.id where e.cutover_id=cut and r.data is distinct from
        case when servos_v2.cutover_collection_is_history(e.collection) then e.source_data||jsonb_build_object('source','LEGACY_SQLITE_CUTOVER','sourceCutoverId',cut::text,'sourceVersion',e.version) else e.source_data end);
  end if;
  if (result->'serverTotals'->>'stockQuantity')::numeric<>6.125002
    or (result->'serverTotals'->>'closedTillCashMinor')::bigint<>1234
    or (result->'serverTotals'->>'orderTotalMinor')::bigint<>125025 then raise exception 'fractional stock or legacy money control totals lost precision: %',result;end if;
  if not exists(select 1 from servos_v2.records where collection='customers' and id='archived' and archived and version=3) then raise exception 'archived source identity/version was lost';end if;
  if servos_v2.credit_balance('unicode')<>3000 or (result->'serverTotals'->>'creditOutstandingMinor')::bigint<>3000 then raise exception 'credit conservation failed';end if;
  if not exists(select 1 from servos_v2.customer_credit_accounts where id='credit-account' and status='SUSPENDED' and credit_limit_minor=100000)
    or not exists(select 1 from servos_v2.mpesa_receipts where id='manual-receipt' and received_amount_minor=5025 and allocated_amount_minor=2000 and reconciliation_status='DISCREPANCY')
    or not exists(select 1 from servos_v2.mpesa_discrepancies where id='manual-discrepancy' and variance_minor=-25 and status='OPEN')
    or not exists(select 1 from servos_v2.customer_credit_reconciliations where id='credit-reviewed' and status='MATCHED')
    or not exists(select 1 from servos_v2.customer_credit_discrepancies where id='credit-discrepancy' and variance_minor=-100 and status='OPEN') then raise exception 'financial source indexes were not reconstructed';end if;
  result:=public.servos_v2_verify_cutover(cut);
  if result->>'verified'<>'true' or servos_v2.credit_balance('unicode')<>3000 then raise exception 'repeated verification duplicated financial effects';end if;
  raise notice 'NATIVE_SNAPSHOT:%',jsonb_build_object('deviceId','10000000-0000-4000-8000-000000000001',
    'businessId',(select business_id from servos_v2.control where singleton),'cursor',(select cursor from servos_v2.control where singleton),
    'policyVersion',public.servos_v2_terminal_identity('10000000-0000-4000-8000-000000000001')->>'policyVersion',
    'records',(select jsonb_agg(jsonb_build_object('collection',collection,'id',id,'version',version,'archived',archived,'data',data) order by collection,id) from servos_v2.records));
  -- BASELINE_ATTESTATION
  update servos_v2.records set data=data||'{"name":"Changed after import"}' where collection='property' and id='property';
  result:=public.servos_v2_verify_cutover(cut);
  if result->>'verified'<>'false' or (result->>'changedRecords')::int<>1 then raise exception 'post-import content change did not block readiness: %',result;end if;
  update servos_v2.records r set data=e.source_data from servos_v2.cutover_record_evidence e
    where e.cutover_id=cut and e.collection='property' and r.collection=e.collection and r.id=e.id;
  perform public.servos_v2_verify_cutover(cut);
end$$;
commit;`;
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  const snapshotLine = result.stderr.split('\n').find(line=>line.includes('NATIVE_SNAPSHOT:'));
  if (!snapshotLine) throw new Error('PostgreSQL did not emit the disposable authorized snapshot');
  const snapshot=JSON.parse(snapshotLine.slice(snapshotLine.indexOf('NATIVE_SNAPSHOT:')+'NATIVE_SNAPSHOT:'.length));
  const baseline=spawnSync('cargo',['run','--quiet','--locked','--manifest-path','native-tests/Cargo.toml','--example','cutover-fixture','--','--baseline'],{input:JSON.stringify(snapshot),encoding:'utf8',maxBuffer:8*1024*1024});
  if(baseline.status!==0)throw new Error(baseline.stderr||'Rust baseline fixture failed');
  const report=JSON.parse(baseline.stdout);
  const attestation=`begin;
    select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
    do $$declare result jsonb;cut uuid;begin
    begin
      perform public.servos_v2_attest_cutover_baseline(jsonb_set(convert_from(decode('${Buffer.from(baseline.stdout).toString('hex')}','hex'),'UTF8')::jsonb,'{contentDigest}',to_jsonb(repeat('0',64))));
      raise exception 'tampered native baseline was accepted';
    exception when others then if sqlerrm not like '%BASELINE_MISMATCH%' then raise;end if;end;
    result:=public.servos_v2_attest_cutover_baseline(convert_from(decode('${Buffer.from(baseline.stdout).toString('hex')}','hex'),'UTF8')::jsonb);
    if result->>'verified'<>'true' then raise exception 'exact native installed baseline was not attested';end if;
    cut:=(result->>'cutoverId')::uuid;
    begin
      perform public.servos_v2_set_authority_mode('SHARED_V2','Baseline before commit');
      raise exception 'uncommitted cutover activated';
    exception when others then if sqlerrm not like '%committed cutover and current verified native baseline%' then raise;end if;end;
    perform public.servos_v2_commit_cutover(cut,true);
    result:=public.servos_v2_set_authority_mode('SHARED_V2','Disposable verified native baseline');
    if result->>'authorityMode'<>'SHARED_V2' then raise exception 'verified committed cutover failed activation';end if;
    end$$;
    rollback;`;
  const attested=spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],{input:attestation,encoding:'utf8',maxBuffer:8*1024*1024});
  if(attested.status!==0)throw new Error(attested.stderr||attested.stdout);
  if(!/^[0-9a-f]{64}$/.test(report.contentDigest))throw new Error('Native baseline omitted content evidence');
  console.log('Passed: exact Rust SQLite manifest/pages -> PostgreSQL import, hash, replay, archived records and money/stock reconciliation');
  console.log('Passed: exact PostgreSQL snapshot -> Rust installed baseline -> authenticated server content attestation; tampering refused');
}
