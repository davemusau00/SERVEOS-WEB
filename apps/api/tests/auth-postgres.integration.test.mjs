import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,randomUUID,sign as signBytes} from 'node:crypto';
import {createServer as createNetServer} from 'node:net';
import {once} from 'node:events';
import {Pool} from 'pg';
import {createApiServer,authenticateSession,retireInitialAdminSetupSecret} from '../src/server.mjs';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {executeCommand} from '../src/command-kernel.mjs';
import {staffCommandRegistry} from '../src/staff-commands.mjs';
import {deviceCommandRegistry} from '../src/device-commands.mjs';

const databaseUrl=process.env.AUTH_TEST_DATABASE_URL||process.env.TEST_DATABASE_URL;
const authRegistry=new Map([...staffCommandRegistry,...deviceCommandRegistry]);

test('PostgreSQL staff setup, device enrollment, sessions, refresh, and staff lifecycle', {skip:!databaseUrl}, async t=>{
  const adminPool=new Pool({connectionString:databaseUrl,max:2});
  const schema=`auth_acceptance_${randomUUID().replaceAll('-','')}`;
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  const pool=new Pool({connectionString:databaseUrl,max:8,options:`-c search_path=${schema},public`});
  const priorSecret=process.env.INITIAL_ADMIN_SETUP_SECRET;
  let api,base,origin;
  try{
    await migrate(pool);
    const store=new PostgresStore(pool);
    const reservation=createNetServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
    const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
    origin=`http://127.0.0.1:${port}`;base=origin;
    api=createApiServer({store,registry:authRegistry,authenticate:req=>authenticateSession(req,store),origin});
    api.listen(port,'127.0.0.1');await once(api,'listening');

    const call=async(path,{method='GET',body,token,deviceId,cookie,sendOrigin,setupSecret}={})=>{
      const headers=new Headers();if(body!==undefined)headers.set('content-type','application/json');if(token)headers.set('authorization',`Bearer ${token}`);if(deviceId)headers.set('x-serveos-device-id',deviceId);if(cookie)headers.set('cookie',cookie);if(sendOrigin)headers.set('origin',origin);if(setupSecret)headers.set('x-serveos-setup-secret',setupSecret);
      const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
      const text=await response.text();let value={};try{value=text?JSON.parse(text):{}}catch{value={raw:text}}
      return {status:response.status,value,cookie:response.headers.get('set-cookie')?.split(';',1)[0]};
    };
    const enroll=async({token,businessId,staffId,deviceId,keyPair})=>{
      const challenge=await call('/v1/devices/enrollment-challenges',{method:'POST',token});
      assert.equal(challenge.status,201,JSON.stringify(challenge.value));
      const publicKey=keyPair.publicKey.export({format:'jwk'});
      const signed=`${challenge.value.challengeId}\n${businessId}\n${staffId}\n${deviceId}\n${challenge.value.challenge}`;
      const signature=signBytes('sha256',Buffer.from(signed),{key:keyPair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
      return {challenge:challenge.value,publicKey,signature,result:await call('/v1/devices/enroll',{method:'POST',token,body:{challengeId:challenge.value.challengeId,deviceId,publicKey,signature}})};
    };
    const login=async(loginName,password)=>{
      const result=await call('/v1/auth/login',{method:'POST',body:{loginName,password}});
      assert.equal(result.status,200,JSON.stringify(result.value));
      assert.equal(typeof result.value.accessToken,'string');assert.ok(result.cookie?.startsWith(`servos_refresh_${result.value.sessionId}=`));
      return {...result.value,cookie:result.cookie};
    };
    const command=async({token,deviceId,name,payload,expectedVersions={}})=>call('/v1/commands',{method:'POST',token,deviceId,body:{commandId:randomUUID(),name,payload,expectedVersions}});

    const businessId=randomUUID(),adminId=randomUUID(),loginName=`admin-${adminId}@example.invalid`;
    const initialPassword='Setup-password-For-acceptance-2026';
    const setupSecret=`setup-${randomUUID()}-${randomUUID()}`;process.env.INITIAL_ADMIN_SETUP_SECRET=setupSecret;
    const setupBody={businessId,staffId:adminId,businessName:'Disposable Auth Acceptance',displayName:'Acceptance Admin',loginName,password:initialPassword};
    const setupRequest=()=>call('/v1/setup/initial-admin',{method:'POST',body:setupBody,setupSecret});
    const race=await Promise.all([setupRequest(),setupRequest()]);
    assert.equal(race.filter(result=>result.status===201).length,1,'exactly one concurrent initial Admin setup may win');
    assert.equal(race.filter(result=>result.status===409||result.status===404).length,1,'the competing setup must be closed');
    process.env.INITIAL_ADMIN_SETUP_SECRET=`restart-${randomUUID()}`;
    assert.equal(await retireInitialAdminSetupSecret(store),true,'startup detects an existing setup and retires any restored setup secret');
    assert.equal((await call('/v1/setup/initial-admin',{method:'POST',body:setupBody,setupSecret})).status,404,'successful setup retires the setup secret');
    assert.equal(process.env.INITIAL_ADMIN_SETUP_SECRET,undefined);

    const admin=await login(loginName,initialPassword);
    assert.equal(admin.mustChangePassword,true);
    assert.equal(JSON.stringify(admin).includes(initialPassword),false);
    assert.equal((await call('/v1/devices/enrollment-challenges',{method:'POST',token:admin.accessToken})).value.error.code,'PASSWORD_CHANGE_REQUIRED');
    const firstPassword='Admin-password-Changed-2026';
    assert.equal((await call('/v1/auth/password',{method:'POST',token:admin.accessToken,body:{currentPassword:'wrong password',newPassword:firstPassword}})).status,401);
    assert.equal((await call('/v1/auth/password',{method:'POST',token:admin.accessToken,body:{currentPassword:initialPassword,newPassword:firstPassword}})).status,200);
    assert.equal((await call('/v1/auth/session',{token:admin.accessToken})).value.mustChangePassword,false);

    const deviceA=randomUUID(),keyA=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    const enrolledA=await enroll({token:admin.accessToken,businessId,staffId:adminId,deviceId:deviceA,keyPair:keyA});
    assert.equal(enrolledA.result.status,201,JSON.stringify(enrolledA.result.value));
    const second=await login(loginName,firstPassword);
    assert.equal((await call('/v1/devices/enroll',{method:'POST',token:second.accessToken,body:{challengeId:enrolledA.challenge.challengeId,deviceId:deviceA,publicKey:enrolledA.publicKey,signature:enrolledA.signature}})).value.error.code,'ENROLLMENT_CHALLENGE_INVALID','an enrollment proof cannot be replayed');
    const repeated=await enroll({token:second.accessToken,businessId,staffId:adminId,deviceId:deviceA,keyPair:keyA});
    assert.equal(repeated.result.status,201,'the same owner and device key may rebind a new session');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_enrolled_devices WHERE business_id=$1 AND id=$2',[businessId,deviceA])).rows[0].count,1,'repeat enrollment does not duplicate the device');
    assert.equal((await call('/v1/auth/sessions',{token:admin.accessToken})).value.sessions.length,2);
    assert.equal((await call(`/v1/auth/sessions/${second.sessionId}/revoke`,{method:'POST',token:second.accessToken})).value.error.code,'CURRENT_SESSION_REVOKE');
    assert.equal((await call(`/v1/auth/sessions/${second.sessionId}/revoke`,{method:'POST',token:admin.accessToken})).status,200,'a staff member can revoke another one of their own sessions');
    assert.equal((await call('/v1/auth/session',{token:second.accessToken})).status,401);

    const third=await login(loginName,firstPassword),deviceB=randomUUID(),keyB=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    assert.equal((await enroll({token:third.accessToken,businessId,staffId:adminId,deviceId:deviceB,keyPair:keyB})).result.status,201);
    const revokeDevice=await command({token:admin.accessToken,deviceId:deviceA,name:'device.revoke',payload:{id:deviceB,deviceId:deviceB,reason:'Device revocation acceptance'},expectedVersions:{[`enrolledDevices:${deviceB}`]:1}});
    assert.equal(revokeDevice.value.kind,'CONFIRMED',JSON.stringify(revokeDevice.value));
    assert.equal((await call('/v1/auth/session',{token:third.accessToken})).status,401,'revoking a device immediately refuses its sessions');
    const revokedFamilies=await pool.query('SELECT count(*)::int AS count FROM api_refresh_families WHERE session_id=$1 AND revoked_at IS NOT NULL',[third.sessionId]);
    assert.equal(revokedFamilies.rows[0].count,1,'device revocation revokes the refresh family');

    const workerId=randomUUID(),workerLoginName=`worker-${workerId}@example.invalid`,workerInitial='Worker-initial-password-2026';
    const workerCreate=await command({token:admin.accessToken,deviceId:deviceA,name:'staff.create',payload:{id:workerId,staffId:workerId,loginName:workerLoginName,displayName:'Pilot Server',role:'Server',initialPassword:workerInitial,permissions:[],reason:'Phase 1 staff-create acceptance'},expectedVersions:{[`employees:${workerId}`]:0}});
    assert.equal(workerCreate.value.kind,'CONFIRMED',JSON.stringify(workerCreate.value));
    assert.equal(JSON.stringify(workerCreate.value).includes(workerInitial),false,'staff-create outcome never includes the initial password');
    const storedCommand=await pool.query('SELECT request::text AS request,outcome::text AS outcome FROM api_commands WHERE business_id=$1 AND command_id=$2',[businessId,workerCreate.value.commandId]);
    assert.equal(`${storedCommand.rows[0].request}${storedCommand.rows[0].outcome}`.includes(workerInitial),false,'persisted command evidence redacts the initial password');
    const limitedStaffId=randomUUID(),limitedTargetId=randomUUID();
    await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,'Limited staff creator','Custom','test-hash',false)",[businessId,limitedStaffId,`limited-${limitedStaffId}@example.invalid`]);
    const ceiling=await executeCommand({db:store,registry:staffCommandRegistry,actor:{businessId,staffId:limitedStaffId,deviceId:deviceA,permissions:['staff.create','devices.register','records.view']},command:{commandId:randomUUID(),name:'staff.create',expectedVersions:{[`employees:${limitedTargetId}`]:0},payload:{id:limitedTargetId,loginName:`ceiling-${limitedTargetId}@example.invalid`,displayName:'Ceiling target',role:'Custom',initialPassword:'Ceiling-target-password-2026',permissions:[],reason:'Verify staff grant ceiling'}}});
    assert.equal(ceiling.kind,'REJECTED');
    assert.equal(ceiling.error.code,'PERMISSION_CEILING','staff creators cannot grant permissions they do not hold');
    const workerSession=await login(workerLoginName,workerInitial);
    assert.equal(workerSession.mustChangePassword,true);
    assert.equal((await call('/v1/devices/enrollment-challenges',{method:'POST',token:workerSession.accessToken})).value.error.code,'PASSWORD_CHANGE_REQUIRED');
    const workerPassword='Worker-new-password-2026';
    assert.equal((await call('/v1/auth/password',{method:'POST',token:workerSession.accessToken,body:{currentPassword:workerInitial,newPassword:workerPassword}})).status,200);
    assert.equal((await call('/v1/auth/login',{method:'POST',body:{loginName:workerLoginName,password:workerInitial}})).status,401);
    const workerDeviceCollision=await enroll({token:workerSession.accessToken,businessId,staffId:workerId,deviceId:deviceA,keyPair:generateKeyPairSync('ec',{namedCurve:'prime256v1'})});
    assert.equal(workerDeviceCollision.result.status,409);
    assert.equal(workerDeviceCollision.result.value.error.code,'DEVICE_ID_OWNED_BY_ANOTHER_STAFF');
    const workerDevice=randomUUID(),workerKey=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
    assert.equal((await enroll({token:workerSession.accessToken,businessId,staffId:workerId,deviceId:workerDevice,keyPair:workerKey})).result.status,201);
    const workerSecond=await login(workerLoginName,workerPassword);
    assert.equal((await enroll({token:workerSecond.accessToken,businessId,staffId:workerId,deviceId:workerDevice,keyPair:workerKey})).result.status,201);

    const roleUpdate=await command({token:admin.accessToken,deviceId:deviceA,name:'staff.update',payload:{id:workerId,staffId:workerId,displayName:'Pilot Cashier',role:'Cashier',permissions:[],reason:'Role change acceptance'},expectedVersions:{[`employees:${workerId}`]:1}});
    assert.equal(roleUpdate.value.kind,'CONFIRMED',JSON.stringify(roleUpdate.value));
    assert.equal(roleUpdate.value.result.version,2);
    const reservedAdminId=randomUUID();
    const adminRoleAttempt=await command({token:admin.accessToken,deviceId:deviceA,name:'staff.create',payload:{id:reservedAdminId,loginName:`reserved-${reservedAdminId}@example.invalid`,displayName:'Forbidden Admin',role:'Admin',initialPassword:'Forbidden-initial-password-2026',permissions:[],reason:'Verify Admin grant is refused'},expectedVersions:{[`employees:${reservedAdminId}`]:0}});
    assert.equal(adminRoleAttempt.value.kind,'REJECTED');
    assert.equal(adminRoleAttempt.value.error.code,'ADMIN_ROLE_RESERVED');

    const deactivate=await command({token:admin.accessToken,deviceId:deviceA,name:'staff.deactivate',payload:{id:workerId,staffId:workerId,reason:'Deactivate acceptance account'},expectedVersions:{[`employees:${workerId}`]:2}});
    assert.equal(deactivate.value.kind,'CONFIRMED',JSON.stringify(deactivate.value));
    assert.equal((await call('/v1/auth/session',{token:workerSession.accessToken})).status,401);
    assert.equal((await call('/v1/auth/login',{method:'POST',body:{loginName:workerLoginName,password:workerPassword}})).status,401,'deactivated staff cannot start another session');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_staff_sessions WHERE staff_id=$1 AND revoked_at IS NOT NULL',[workerId])).rows[0].count,2);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_refresh_families WHERE staff_id=$1 AND revoked_at IS NOT NULL',[workerId])).rows[0].count,2);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_enrolled_devices WHERE staff_id=$1 AND revoked_at IS NOT NULL',[workerId])).rows[0].count,1);

    const temporaryBusiness=randomUUID(),tempAdminA=randomUUID(),tempAdminB=randomUUID();
    await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[temporaryBusiness,'Last Admin Concurrency Fixture']);
    const tempDeviceA=randomUUID(),tempDeviceB=randomUUID();
    for(const [staffId,deviceId] of [[tempAdminA,tempDeviceA],[tempAdminB,tempDeviceB]]){
      await pool.query("INSERT INTO api_staff_profiles(business_id,staff_id,login_name,display_name,role,credential_hash,must_change_password) VALUES($1,$2,$3,'Concurrent Admin','Admin','test-hash',false)",[temporaryBusiness,staffId,`last-admin-${staffId}@example.invalid`]);
      await pool.query("INSERT INTO api_staff_permissions(business_id,staff_id,permission) VALUES($1,$2,'*')",[temporaryBusiness,staffId]);
      await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4::jsonb,now())',[deviceId,temporaryBusiness,staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);
      await pool.query("INSERT INTO business_entity_versions(business_id,entity_type,entity_id,version) VALUES($1,'employees',$2,1)",[temporaryBusiness,staffId]);
    }
    const demote=(targetId,actorId,deviceId)=>executeCommand({db:store,registry:staffCommandRegistry,actor:{businessId:temporaryBusiness,staffId:actorId,deviceId,permissions:['*']},command:{commandId:randomUUID(),name:'staff.update',expectedVersions:{[`employees:${targetId}`]:1},payload:{id:targetId,staffId:targetId,displayName:'Concurrent Admin',role:'Manager',permissions:[],reason:'Last Admin concurrency acceptance'}}});
    const concurrent=await Promise.all([demote(tempAdminA,tempAdminB,tempDeviceB),demote(tempAdminB,tempAdminA,tempDeviceA)]);
    assert.equal(concurrent.filter(value=>value.kind==='CONFIRMED').length,1,'only one competing final-Admin demotion may commit');
    assert.equal(concurrent.filter(value=>value.kind==='CONFLICT'&&value.error.code==='LAST_ADMIN').length,1,'the other final-Admin demotion must be durably blocked');
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM api_staff_profiles WHERE business_id=$1 AND role='Admin' AND active",[temporaryBusiness])).rows[0].count,1);

    const adminFourth=await login(loginName,firstPassword),nextPassword='Admin-password-Changed-again-2026';
    assert.equal((await call('/v1/auth/password',{method:'POST',token:admin.accessToken,body:{currentPassword:firstPassword,newPassword:nextPassword}})).status,200);
    assert.equal((await call('/v1/auth/session',{token:adminFourth.accessToken})).status,401,'password change revokes other active sessions');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_refresh_families WHERE session_id=$1 AND revoked_at IS NOT NULL',[adminFourth.sessionId])).rows[0].count,1);

    const originalExpiry=await pool.query('SELECT issued_at,expires_at FROM api_access_tokens WHERE token_hash=$1',[createHash('sha256').update(admin.accessToken).digest('hex')]);
    assert.equal(originalExpiry.rows.length,1);
    assert.ok(Math.abs(originalExpiry.rows[0].expires_at-originalExpiry.rows[0].issued_at-15*60_000)<1000,'access tokens are issued for 15 minutes');
    await pool.query('UPDATE api_access_tokens SET issued_at=now()-interval \'2 seconds\',expires_at=now()-interval \'1 second\' WHERE token_hash=$1',[createHash('sha256').update(admin.accessToken).digest('hex')]);
    assert.equal((await call('/v1/auth/session',{token:admin.accessToken})).status,401,'expired access tokens are refused');
    const refresh=async(cookie)=>call(`/v1/auth/sessions/${admin.sessionId}/refresh`,{method:'POST',cookie,sendOrigin:true});
    const refreshedPair=await refresh(admin.cookie);
    assert.equal(refreshedPair.status,200,JSON.stringify(refreshedPair.value));
    assert.equal(typeof refreshedPair.value.accessToken,'string');
    assert.equal(JSON.stringify(refreshedPair.value).includes(admin.cookie.split('=',2)[1]),false,'refresh credentials are never returned in JSON');
    assert.equal((await call('/v1/auth/session',{token:refreshedPair.value.accessToken})).status,200);
    const refreshRetry=await refresh(admin.cookie);
    assert.equal(refreshRetry.status,200,'response-loss retry in the recovery window succeeds');
    assert.equal(refreshRetry.cookie,refreshedPair.cookie,'retry recovers the same rotated refresh cookie');
    const oldRefreshValue=admin.cookie.slice(admin.cookie.indexOf('=')+1);
    await pool.query("UPDATE api_refresh_tokens SET used_at=now()-interval '31 seconds' WHERE token_hash=$1",[createHash('sha256').update(oldRefreshValue).digest('hex')]);
    const replay=await refresh(admin.cookie);
    assert.equal(replay.status,401);
    assert.equal(replay.value.error.code,'REFRESH_REPLAY');
    assert.equal((await call('/v1/auth/session',{token:refreshedPair.value.accessToken})).status,401,'replay outside recovery revokes the session');
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM api_refresh_families WHERE session_id=$1 AND revoked_at IS NOT NULL',[admin.sessionId])).rows[0].count,1);

    const logoutLogin=await login(loginName,nextPassword);
    assert.equal((await call('/v1/auth/logout',{method:'POST',token:logoutLogin.accessToken})).value.revoked,true);
    assert.equal((await call('/v1/auth/session',{token:logoutLogin.accessToken})).status,401,'logout refuses the current access credential');
    await t.diagnostic('AUTH, STAFF, DEVICE, SESSION, REFRESH, REPLAY, and CONCURRENCY PostgreSQL acceptance passed.');
  }finally{
    if(api){api.closeAllConnections();await new Promise(resolve=>api.close(resolve));}
    await pool.end();
    if(priorSecret===undefined)delete process.env.INITIAL_ADMIN_SETUP_SECRET;else process.env.INITIAL_ADMIN_SETUP_SECRET=priorSecret;
    await adminPool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adminPool.end();
  }
});
