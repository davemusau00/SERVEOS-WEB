import { spawn } from 'node:child_process';

// Real independent PostgreSQL sessions; no mocked transport or process-local mutex.
const query = (container, sql) => new Promise((resolve, reject) => {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || stdout)));
  child.stdin.end(sql);
});

export async function testRoomConcurrency(container) {
  await query(container, `
    insert into servos_v2.members values('00000000-0000-4000-8000-000000000001',true,array['*']) on conflict(user_id) do update set active=true,permissions=array['*'];
    select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
    select public.servos_v2_register_device('10000000-0000-4000-8000-000000000001','Concurrent desktop','DESKTOP');
    select public.servos_v2_register_device('10000000-0000-4000-8000-000000000002','Concurrent web','WEB');
    update servos_v2.control set enabled=true;
    select servos_v2.put_record('roomTypes','race-type','{"name":"Double","maxGuests":2}');
    select servos_v2.put_record('customers','race-guest','{"name":"Guest"}');
    select servos_v2.put_record('rooms','race-room','{"number":"201","roomTypeId":"race-type","capacity":2,"turnaroundMinutes":30,"housekeepingState":"CLEAN","maintenanceState":"AVAILABLE"}');
    select servos_v2.put_record('ratePlans','race-rate','{"name":"Nightly","roomTypeId":"race-type","mode":"NIGHTLY","priceMinor":500000,"currency":"KES","taxBasisPoints":0}');
  `);
  const command = index => ({
    id: `20000000-0000-4000-8000-00000000000${index}`,
    schemaVersion: 2,
    deviceId: `10000000-0000-4000-8000-00000000000${index}`,
    actorId: '00000000-0000-4000-8000-000000000001',
    clientSequence: 1,
    operation: 'roomReservation.create',
    expectedVersions: [{ collection: 'roomReservations', id: `race-${index}`, version: 0 }],
    payload: { id: `race-${index}`, roomId: 'race-room', ratePlanId: 'race-rate', customerId: 'race-guest', guests: 1, startsAt: '2030-06-01T14:00:00+03:00', endsAt: '2030-06-02T10:00:00+03:00' },
  });
  const submit = (index, holdLock = false) => query(container, `
    begin;
    select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
    ${holdLock ? 'select cursor from servos_v2.control where singleton for update; select pg_sleep(2);' : ''}
    set local role authenticated;
    select public.servos_v2_execute('${JSON.stringify(command(index))}'::jsonb);
    commit;
  `);
  const results = await Promise.all([submit(1, true), submit(2)]);
  const outcomes = results.map(output => JSON.parse(output.split(/\r?\n/).find(line => line.startsWith('{'))));
  if (outcomes.filter(r => r.status === 'SYNCHRONIZED').length !== 1 || outcomes.filter(r => r.error?.code === 'ROOM_UNAVAILABLE').length !== 1) {
    throw new Error(`Concurrent booking did not serialize: ${JSON.stringify(outcomes)}`);
  }
  await query(container, `do $$begin
    if (select count(*) from servos_v2.records where collection='roomReservations')<>1 then raise exception 'Double booking persisted';end if;
    if (select count(*) from servos_v2.commands)<>2 or (select count(*) from servos_v2.audit)<>2 then raise exception 'Concurrent command/audit loss';end if;
    if (select count(*) from servos_v2.changes)<>1 then raise exception 'Rejected booking entered feed';end if;
  end$$;`);
  console.log('Passed: real two-connection room booking race');
}
