import {supplierCreditApplicationCommandRegistry} from './supplier-credit-application-commands.mjs';
import {supplierCreditCommandRegistry} from './supplier-credit-commands.mjs';
import {customerCommandRegistry} from './customer-commands.mjs';
import {customerCreditCommandRegistry} from './customer-credit-commands.mjs';
import {customerCreditReconciliationCommandRegistry} from './customer-credit-reconciliation-commands.mjs';
import {managerApprovalCommandRegistry} from './manager-approvals.mjs';
import {staffCommandRegistry} from './staff-commands.mjs';
import {deviceCommandRegistry} from './device-commands.mjs';
import {supplierReturnCommandRegistry} from './supplier-return-commands.mjs';
import {supplierPaymentCommandRegistry} from './supplier-payment-commands.mjs';
import {supplierInvoiceCommandRegistry} from './supplier-invoice-commands.mjs';
import {goodsReceiptCommandRegistry} from './goods-receipt-commands.mjs';
import {purchaseOrderCommandRegistry} from './purchase-order-commands.mjs';
import {supplierCommandRegistry} from './supplier-commands.mjs';
import {checkBridgeClaim} from './bridge-authorization.mjs';
import {refundCommandRegistry} from './refund-commands.mjs';
import {closeDayCommandRegistry} from './close-day-commands.mjs';
import {outletCommandRegistry} from './outlet-commands.mjs';
import {printCommandRegistry} from './print-commands.mjs';
import {businessTaxCommandRegistry} from './business-tax.mjs';
import {paymentCommandRegistry} from './payment-commands.mjs';
import {paymentAccountCommandRegistry} from './payment-accounts.mjs';
import {tillCommandRegistry} from './till-commands.mjs';
import {filterRecords,filterChangePage} from './projection-access.mjs';
import {posCommandRegistry} from './pos-commands.mjs';
import {offlinePosCommandRegistry} from './offline-pos-commands.mjs';
import {roomCommandRegistry} from './room-commands.mjs';
import {hospitalityCommandRegistry,hospitalityWalkInHandler} from './hospitality-commands.mjs';
import {financeAssetCommandRegistry} from './finance-asset-commands.mjs';
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {ApiProblem, executeCommand, normalizeActor} from './command-kernel.mjs';
import {PostgresStore} from './postgres-store.mjs';
import {createHash, createHmac, createPrivateKey, createPublicKey, randomBytes, randomUUID, scrypt as scryptCallback, sign as signBytes, timingSafeEqual, verify as verifySignature} from 'node:crypto';
import {promisify} from 'node:util';
import {catalogCommandRegistry} from './catalog-commands.mjs';
import {readConfig} from './config.mjs';
import {floorplanCommandRegistry} from './floorplan-commands.mjs';
import {applyImport,cancelImport,getImportBatch,getImportPlan,importTemplates,listImportBatches,planImport,stageImport} from './csv-import.mjs';

const json = (res, status, value) => {
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  res.end(JSON.stringify(value));
};
const scrypt=promisify(scryptCallback);
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const calendarDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const ACCESS_TOKEN_TTL=15*60_000,REFRESH_TOKEN_TTL=30*24*60*60_000,REFRESH_FAMILY_TTL=90*24*60*60_000,REFRESH_COOKIE_PREFIX='servos_refresh_';
const refreshCookieName=sessionId=>`${REFRESH_COOKIE_PREFIX}${sessionId}`;
const deriveRotatedRefreshToken=(parentToken,childTokenId)=>createHmac('sha256',Buffer.from(parentToken,'base64url')).update(`serveos-refresh-rotation:${childTokenId}`).digest('base64url');
const cookieValue=(req,name)=>String(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`))?.slice(name.length+1)||'';
const refreshCookie=(token,maxAge,secure,sessionId)=>`${refreshCookieName(sessionId)}=${token}; HttpOnly; SameSite=Strict; Path=/v1/auth/sessions/${sessionId}/refresh; Max-Age=${Math.max(0,Math.floor(maxAge/1000))}${secure?'; Secure':''}`;
const clearRefreshCookie=(secure,sessionId)=>refreshCookie('',0,secure,sessionId);
const secureRequest=req=>process.env.NODE_ENV==='production'||Boolean(req.socket.encrypted)||req.headers['x-forwarded-proto']==='https';
const encodeCreditStatementCursor=value=>Buffer.from(JSON.stringify({v:1,h:value.highWater,b:value.before}),'utf8').toString('base64url');
function decodeCreditStatementCursor(value){
 if(typeof value!=='string'||value.length>512||! /^[A-Za-z0-9_-]+$/.test(value))throw new ApiProblem(400,'VALIDATION_FAILED','Statement cursor is invalid.');
 let parsed;try{parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'))}catch{throw new ApiProblem(400,'VALIDATION_FAILED','Statement cursor is invalid.')}
 if(!parsed||parsed.v!==1||typeof parsed.h!=='string'||typeof parsed.b!=='string'||!/^\d{1,19}$/.test(parsed.h)||!/^\d{1,19}$/.test(parsed.b)||BigInt(parsed.h)>9223372036854775807n||BigInt(parsed.b)>9223372036854775807n||BigInt(parsed.h)<BigInt(parsed.b)||BigInt(parsed.b)<1n)throw new ApiProblem(400,'VALIDATION_FAILED','Statement cursor is invalid.');
 return {highWater:parsed.h,before:parsed.b};
}
const dummyCredentialHash='scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const stableJson=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
async function hashPassword(password){const salt=randomBytes(16);const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;}
async function verifyPassword(password,encoded){
  const [scheme,nRaw,rRaw,pRaw,saltRaw,hashRaw]=String(encoded||'').split('$');
  if(scheme!=='scrypt'||nRaw!=='16384'||rRaw!=='8'||pRaw!=='1'||!saltRaw||!hashRaw)return false;
  try{const expected=Buffer.from(hashRaw,'base64url');const actual=Buffer.from(await scrypt(password,Buffer.from(saltRaw,'base64url'),expected.length,{N:16384,r:8,p:1,maxmem:64*1024*1024}));return actual.length===expected.length&&timingSafeEqual(actual,expected)}catch{return false}
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new ApiProblem(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the allowed size.');
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw new ApiProblem(400, 'VALIDATION_FAILED', 'Request body must be valid JSON.'); }
}

export async function authenticateSession(req, store, now = new Date()) {
  const authorization = req.headers.authorization;
  const deviceId = req.headers['x-serveos-device-id'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || typeof deviceId !== 'string' || !uuid.test(deviceId)) {
    throw new ApiProblem(401, 'AUTH_REQUIRED', 'A valid staff session and enrolled device are required.');
  }
  const token = authorization.slice(7);
  if (token.length < 32 || token.length > 4096) throw new ApiProblem(401, 'AUTH_REQUIRED', 'A valid staff session and enrolled device are required.');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return normalizeActor(await store.authenticateSession(tokenHash, deviceId, now));
}

async function authenticateStaffSession(req, store, now = new Date()) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new ApiProblem(401, 'AUTH_REQUIRED', 'A valid staff session is required.');
  const token = authorization.slice(7);
  if (token.length < 32 || token.length > 4096) throw new ApiProblem(401, 'AUTH_REQUIRED', 'A valid staff session is required.');
  const actor = await store.authenticateStaffSession(createHash('sha256').update(token).digest('hex'), now);
  if (!actor || typeof actor.businessId !== 'string' || typeof actor.staffId !== 'string') throw new ApiProblem(401, 'AUTH_REQUIRED', 'A valid staff session is required.');
  return actor;
}

async function authenticateUnenrolledStaffSession(req,store,now=new Date()){
  const authorization=req.headers.authorization;
  if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))throw new ApiProblem(401,'AUTH_REQUIRED','A staff session is required.');
  const token=authorization.slice(7);if(token.length<32||token.length>4096)throw new ApiProblem(401,'AUTH_REQUIRED','A staff session is required.');
  const actor=await store.authenticateStaffSession(createHash('sha256').update(token).digest('hex'),now);
  if(!actor||actor.deviceId)throw new ApiProblem(401,'AUTH_REQUIRED','An unbound staff session is required for device enrollment.');
  return actor;
}

export function createApiServer({store, registry = new Map(), authenticate, origin = process.env.WEB_ORIGIN}) {
  if (typeof authenticate !== 'function') throw new Error('An explicit session authenticator is required.');
  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        if (!origin || req.headers.origin !== origin) return json(res, 403, {error: {code: 'ORIGIN_DENIED', message: 'Origin is not allowed.'}});
        res.writeHead(204, {'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization, x-serveos-device-id', 'access-control-allow-credentials': 'true', vary: 'Origin'});
        return res.end();
      }
      if (req.headers.origin && origin && req.headers.origin !== origin) return json(res, 403, {error: {code: 'ORIGIN_DENIED', message: 'Origin is not allowed.'}});
      if (req.headers.origin && origin) res.setHeader('access-control-allow-origin', origin), res.setHeader('access-control-allow-credentials', 'true'), res.setHeader('vary', 'Origin');

      const url = new URL(req.url ?? '/', 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health/live') return json(res, 200, {status: 'ok'});
      if (req.method === 'GET' && url.pathname === '/health/ready') {
        const {rows} = await store.pool.query("SELECT to_regclass('public.api_schema_migrations') IS NOT NULL AS ready");
        if (!rows[0]?.ready) return json(res, 503, {status: 'not_ready', reason: 'database_migrations_pending'});
        return json(res, 200, {status: 'ready'});
      }
      if(req.method==='POST'&&url.pathname==='/v1/auth/login'){
        const input=await readJson(req);const loginName=typeof input.loginName==='string'?input.loginName.trim():'';const password=typeof input.password==='string'?input.password:'';
        if(!loginName||loginName.length>200||password.length<8||password.length>1024)throw new ApiProblem(400,'VALIDATION_FAILED','Enter a valid staff login and password.');
        const now=new Date();const ip=String(req.socket.remoteAddress||'unknown');const buckets=[loginName.toLowerCase(),ip].map(value=>createHash('sha256').update(value).digest('hex'));
        if(!await store.checkLoginThrottle(buckets,now))throw new ApiProblem(429,'RATE_LIMITED','Too many sign-in attempts. Try again later.');
        const token=randomBytes(32).toString('base64url'),refreshToken=randomBytes(32).toString('base64url'),sessionId=randomUUID(),refreshFamilyId=randomUUID(),accessExpiresAt=new Date(now.getTime()+ACCESS_TOKEN_TTL),refreshExpiresAt=new Date(now.getTime()+REFRESH_TOKEN_TTL),sessionExpiresAt=new Date(now.getTime()+REFRESH_FAMILY_TTL);const result=await store.authenticatePassword({loginName,password,at:now,verifyPassword,dummyCredentialHash,sessionId,accessTokenId:randomUUID(),accessTokenHash:createHash('sha256').update(token).digest('hex'),accessExpiresAt,refreshFamilyId,refreshTokenId:randomUUID(),refreshTokenHash:createHash('sha256').update(refreshToken).digest('hex'),refreshExpiresAt,sessionExpiresAt});
        if(!result){await store.recordLoginFailure(buckets,now);throw new ApiProblem(401,'AUTH_INVALID','The staff login or password is not valid.');}
        await store.clearLoginFailures(buckets);
        res.setHeader('set-cookie',refreshCookie(refreshToken,REFRESH_TOKEN_TTL,secureRequest(req),sessionId));
        return json(res,200,{accessToken:token,...result});
      }
      const refreshPath=url.pathname.match(/^\/v1\/auth\/sessions\/([0-9a-f-]{36})\/refresh$/i);
      if(req.method==='POST'&&refreshPath){
        if(!origin||req.headers.origin!==origin)throw new ApiProblem(403,'ORIGIN_DENIED','Refresh requires the registered application origin.');
        const refreshSessionId=refreshPath[1];if(!uuidPattern.test(refreshSessionId))throw new ApiProblem(400,'VALIDATION_FAILED','The refresh session ID is invalid.');
        const oldRefreshToken=cookieValue(req,refreshCookieName(refreshSessionId));if(!/^[A-Za-z0-9_-]{40,100}$/.test(oldRefreshToken)){res.setHeader('set-cookie',clearRefreshCookie(secureRequest(req),refreshSessionId));throw new ApiProblem(401,'REFRESH_REQUIRED','Sign in again to continue.');}
        const now=new Date(),accessToken=randomBytes(32).toString('base64url'),nextRefreshTokenId=randomUUID(),nextRefreshToken=deriveRotatedRefreshToken(oldRefreshToken,nextRefreshTokenId);const rotated=await store.rotateRefreshToken({expectedSessionId:refreshSessionId,tokenHash:createHash('sha256').update(oldRefreshToken).digest('hex'),nextRefreshTokenId,nextRefreshTokenHash:createHash('sha256').update(nextRefreshToken).digest('hex'),nextRefreshExpiresAt:new Date(now.getTime()+REFRESH_TOKEN_TTL),nextAccessTokenId:randomUUID(),nextAccessTokenHash:createHash('sha256').update(accessToken).digest('hex'),nextAccessExpiresAt:new Date(now.getTime()+ACCESS_TOKEN_TTL),at:now});
        if(rotated.kind!=='ROTATED'&&rotated.kind!=='RETRIED'){res.setHeader('set-cookie',clearRefreshCookie(secureRequest(req),refreshSessionId));throw new ApiProblem(401,rotated.kind==='REPLAY'?'REFRESH_REPLAY':'REFRESH_INVALID','Your sign-in session ended. Sign in again.');}
        const responseRefreshToken=rotated.refreshTokenId===nextRefreshTokenId?nextRefreshToken:deriveRotatedRefreshToken(oldRefreshToken,rotated.refreshTokenId);
        res.setHeader('set-cookie',refreshCookie(responseRefreshToken,rotated.refreshExpiresAt.getTime()-now.getTime(),secureRequest(req),refreshSessionId));
        return json(res,200,{accessToken,sessionId:rotated.sessionId,businessId:rotated.businessId,staffId:rotated.staffId,displayName:rotated.displayName,permissions:rotated.permissions,mustChangePassword:rotated.mustChangePassword,expiresAt:rotated.accessExpiresAt.toISOString()});
      }
      if(req.method==='POST'&&url.pathname==='/v1/setup/initial-admin'){
        const setupSecret=req.headers['x-serveos-setup-secret'];
        if(typeof setupSecret!=='string'||!process.env.INITIAL_ADMIN_SETUP_SECRET)throw new ApiProblem(404,'NOT_FOUND','Setup is not available.');
        const input=await readJson(req);const businessId=input.businessId;const staffId=input.staffId;const businessName=typeof input.businessName==='string'?input.businessName.trim():'';const displayName=typeof input.displayName==='string'?input.displayName.trim():'';const loginName=typeof input.loginName==='string'?input.loginName.trim():'';const password=typeof input.password==='string'?input.password:'';
        if(!uuidPattern.test(String(businessId))||!uuidPattern.test(String(staffId))||!businessName||businessName.length>200||!displayName||displayName.length>200||!loginName||loginName.length>200||password.length<12||password.length>1024)throw new ApiProblem(400,'VALIDATION_FAILED','Initial Admin details are incomplete or invalid.');
        const secretHash=createHash('sha256').update(setupSecret).digest('hex');const expectedSetupSecretHash=createHash('sha256').update(process.env.INITIAL_ADMIN_SETUP_SECRET).digest('hex');
        const {timingSafeEqual:constantTimeEqual}=await import('node:crypto');
        if(!constantTimeEqual(Buffer.from(secretHash,'hex'),Buffer.from(expectedSetupSecretHash,'hex')))throw new ApiProblem(404,'NOT_FOUND','Setup is not available.');
        const credentialHash=await hashPassword(password);const permissions=['*','business.view','business.configure','catalog.view','catalog.manage','inventory.view','inventory.count','inventory.adjust','devices.manage','devices.register','records.view','staff.view','staff.create','staff.update','staff.deactivate','staff.reset_pin','staff.change_role','pos.sell','payment.record','till.view','till.open','procurement.view','procurement.manage','procurement.receive','rooms.view','rooms.manage','reports.view','audit.view','system.configure'];
        const created=await store.createInitialAdmin({setupSecretHash:secretHash,expectedSetupSecretHash,businessId,businessName,staffId,loginName,displayName,credentialHash,permissions,at:new Date()});
        if(!created)throw new ApiProblem(409,'SETUP_CLOSED','Initial setup has already been completed.');
        delete process.env.INITIAL_ADMIN_SETUP_SECRET;
        return json(res,201,{created:true});
      }
      if(req.method==='POST'&&url.pathname==='/v1/auth/logout'){
        const authorization=req.headers.authorization;if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))throw new ApiProblem(401,'AUTH_REQUIRED','A staff session is required.');
        const result=await store.revokeSession(createHash('sha256').update(authorization.slice(7)).digest('hex'));
        if(result.sessionId)res.setHeader('set-cookie',clearRefreshCookie(secureRequest(req),result.sessionId));
        return json(res,200,{revoked:result.revoked});
      }
      if(req.method==='POST'&&url.pathname==='/v1/auth/password'){
        const actor=await authenticateStaffSession(req,store);const input=await readJson(req);
        if(typeof input.currentPassword!=='string'||typeof input.newPassword!=='string'||input.newPassword.length<12||input.newPassword.length>1024)throw new ApiProblem(400,'VALIDATION_FAILED','The new password must contain at least 12 characters.');
        const profile=await store.staffCredential(actor.businessId,actor.staffId);
        if(!profile||!await verifyPassword(input.currentPassword,profile.credentialHash))throw new ApiProblem(401,'AUTH_INVALID','The current password is not valid.');
        const changed=await store.changePassword({businessId:actor.businessId,staffId:actor.staffId,currentSessionId:actor.sessionId,actorDeviceId:actor.deviceId,currentHash:profile.credentialHash,newHash:await hashPassword(input.newPassword),at:new Date()});
        if(!changed)throw new ApiProblem(409,'PASSWORD_CHANGED','The password changed in another session. Sign in again before trying once more.');
        return json(res,200,{changed:true});
      }
      if(req.method==='GET'&&url.pathname==='/v1/auth/session'){
        const actor=await authenticateStaffSession(req,store);const profile=await store.staffCredential(actor.businessId,actor.staffId);
        return json(res,200,{businessId:actor.businessId,staffId:actor.staffId,deviceId:actor.deviceId??null,displayName:profile?.displayName,permissions:actor.permissions,mustChangePassword:profile?.mustChangePassword===true});
      }
      if(req.method==='GET'&&url.pathname==='/v1/auth/sessions'){
        const actor=await authenticateStaffSession(req,store);return json(res,200,{sessions:await store.ownSessions({businessId:actor.businessId,staffId:actor.staffId,currentSessionId:actor.sessionId})});
      }
      const revokeSessionPath=url.pathname.match(/^\/v1\/auth\/sessions\/([0-9a-f-]{36})\/revoke$/i);
      if(req.method==='POST'&&revokeSessionPath){
        const actor=await authenticateStaffSession(req,store);if(!uuidPattern.test(revokeSessionPath[1]))throw new ApiProblem(400,'VALIDATION_FAILED','Choose a valid session.');
        const revoked=await store.revokeOwnSession({businessId:actor.businessId,staffId:actor.staffId,sessionId:revokeSessionPath[1],currentSessionId:actor.sessionId,actorDeviceId:actor.deviceId||null,at:new Date()});
        if(!revoked)throw new ApiProblem(404,'SESSION_UNAVAILABLE','This staff session is no longer available.');res.setHeader('set-cookie',clearRefreshCookie(secureRequest(req),revokeSessionPath[1]));return json(res,200,{revoked:true});
      }
      if (req.method === 'POST' && url.pathname === '/v1/devices/enrollment-challenges') {
        const actor = await authenticateUnenrolledStaffSession(req, store);
        if(actor.mustChangePassword)throw new ApiProblem(403,'PASSWORD_CHANGE_REQUIRED','Change the initial password before enrolling this device.');
        if (!actor.permissions?.includes('*')&&!actor.permissions?.includes('devices.manage')&&!actor.permissions?.includes('devices.register')) throw new ApiProblem(403, 'PERMISSION_DENIED', 'You are not allowed to enroll this device.');
        const issuedAt = new Date();
        const challengeId = randomUUID();
        const challenge = randomBytes(32).toString('hex');
        return json(res, 201, await store.issueDeviceEnrollmentChallenge({challengeId, challenge, businessId: actor.businessId, staffId: actor.staffId, issuedAt, expiresAt: new Date(issuedAt.getTime() + 5 * 60_000)}));
      }
      if (req.method === 'POST' && url.pathname === '/v1/devices/enroll') {
        const actor = await authenticateUnenrolledStaffSession(req, store);
        if(actor.mustChangePassword)throw new ApiProblem(403,'PASSWORD_CHANGE_REQUIRED','Change the initial password before enrolling this device.');
        if (!actor.permissions?.includes('*')&&!actor.permissions?.includes('devices.manage')&&!actor.permissions?.includes('devices.register')) throw new ApiProblem(403, 'PERMISSION_DENIED', 'You are not allowed to enroll this device.');
        const input = await readJson(req);
        const {challengeId, deviceId, publicKey, signature} = input;
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (typeof challengeId !== 'string' || !uuid.test(challengeId) || typeof deviceId !== 'string' || !uuid.test(deviceId)
          || !publicKey || publicKey.kty !== 'EC' || publicKey.crv !== 'P-256' || typeof publicKey.x !== 'string' || typeof publicKey.y !== 'string' || 'd' in publicKey
          || typeof signature !== 'string' || signature.length > 256) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Enrollment request is malformed.');
        const challenge = await store.deviceEnrollmentChallenge(challengeId, actor.businessId, actor.staffId);
        if (!challenge || challenge.consumedAt || new Date(challenge.expiresAt) <= new Date()) throw new ApiProblem(409, 'ENROLLMENT_CHALLENGE_INVALID', 'Enrollment challenge is expired or already used.');
        const signed = `${challengeId}\n${actor.businessId}\n${actor.staffId}\n${deviceId}\n${challenge.challenge}`;
        let valid = false;
        try { valid = verifySignature('sha256', Buffer.from(signed), {key: createPublicKey({key: publicKey, format: 'jwk'}), dsaEncoding: 'ieee-p1363'}, Buffer.from(signature, 'base64url')); }
        catch { valid = false; }
        if (!valid) throw new ApiProblem(401, 'DEVICE_PROOF_INVALID', 'Device key proof could not be verified.');
        const enrolled = await store.enrollDevice({challengeId, businessId: actor.businessId, staffId: actor.staffId, deviceId, publicKey, sessionId:actor.sessionId, at: new Date()});
        return json(res, 201, {deviceId: enrolled.id, businessId: enrolled.businessId, createdAt: enrolled.createdAt});
      }
      if(req.method==='POST'&&url.pathname==='/v1/offline-grants'){
        const actor=await authenticate(req);
        if(!process.env.OFFLINE_GRANT_PRIVATE_JWK)throw new ApiProblem(503,'OFFLINE_GRANTS_UNAVAILABLE','Offline grant signing is not configured.');
        let privateJwk;try{privateJwk=JSON.parse(process.env.OFFLINE_GRANT_PRIVATE_JWK)}catch{throw new ApiProblem(503,'OFFLINE_GRANTS_UNAVAILABLE','Offline grant signing is not configured.')}
        if(privateJwk.kty!=='EC'||privateJwk.crv!=='P-256'||typeof privateJwk.d!=='string')throw new ApiProblem(503,'OFFLINE_GRANTS_UNAVAILABLE','Offline grant signing key is invalid.');
        const input=await readJson(req);const requested=input.allowedCommands;
        const hasPermission=permission=>actor.permissions?.includes('*')||actor.permissions?.includes(permission);
        const eligible=[...registry].filter(([,definition])=>definition.offlinePolicy==='GRANTED_ONLY'&&(definition.permissionAny??[definition.permission]).some(hasPermission)&&(definition.offlineRequiredPermissions??[]).every(hasPermission)).map(([name])=>name);
        const allowedCommands=requested===undefined?eligible.filter(name=>name!=='order.offlineCashSale'):requested;
        if(!Array.isArray(allowedCommands)||!allowedCommands.length||allowedCommands.some(name=>!eligible.includes(name))||new Set(allowedCommands).size!==allowedCommands.length)throw new ApiProblem(400,'VALIDATION_FAILED','Choose one or more supported offline operations.');
        const maxCommands=input.maxCommands??10;const durationMinutes=input.durationMinutes??60;
        if(!Number.isInteger(maxCommands)||maxCommands<1||maxCommands>20||!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>120)throw new ApiProblem(400,'VALIDATION_FAILED','Offline grant limits exceed policy.');
        if(allowedCommands.includes('order.offlineCashSale')&&(allowedCommands.length!==1||maxCommands!==1||durationMinutes>30))throw new ApiProblem(400,'VALIDATION_FAILED','Offline cash sale grants authorize one sale for at most 30 minutes.');
        const issuedAt=new Date();const expiresAt=new Date(issuedAt.getTime()+durationMinutes*60_000);const grant={grantId:randomUUID(),businessId:actor.businessId,deviceId:actor.deviceId,staffId:actor.staffId,issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString(),policyVersion:1,allowedCommands,maxCommands,keyVersion:process.env.OFFLINE_GRANT_KEY_VERSION||'offline-2026-10',scope:{}};
        const signature=signBytes('sha256',Buffer.from(stableJson(grant)),{key:createPrivateKey({key:privateJwk,format:'jwk'}),dsaEncoding:'ieee-p1363'}).toString('base64url');
        await store.issueOfflineGrant({...grant,issuedAt,expiresAt,signature});
        return json(res,201,{...grant,signature});
      }
      if (req.method === 'GET' && url.pathname === '/v1/sync/changes') {
        const actor = await authenticate(req);
        const afterRaw = url.searchParams.get('after') ?? '0';
        const limitRaw = url.searchParams.get('limit') ?? '200';
        if (!/^\d+$/.test(afterRaw) || !/^\d+$/.test(limitRaw)) throw new ApiProblem(400, 'VALIDATION_FAILED', 'after and limit must be whole numbers.');
        const after = Number(afterRaw);
        const limit = Number(limitRaw);
        if (!Number.isSafeInteger(after) || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
          throw new ApiProblem(400, 'VALIDATION_FAILED', 'Cursor must be non-negative and limit must be between 1 and 500.');
        }
        const page = await store.changesAfter(actor.businessId, after, limit);
        if (after > page.highWater) throw new ApiProblem(409, 'CURSOR_AHEAD', 'The requested cursor is ahead of this business change feed.');
        return json(res, 200, {protocolVersion: 1, ...filterChangePage(actor,page)});
      }
      if (req.method === 'GET' && url.pathname === '/v1/sync/stream') {
        const actor = await authenticate(req);
        const afterRaw = url.searchParams.get('after') ?? '0';
        if (!/^\d+$/.test(afterRaw) || !Number.isSafeInteger(Number(afterRaw))) throw new ApiProblem(400, 'VALIDATION_FAILED', 'after must be a non-negative whole number.');
        let cursor = Number(afterRaw);
        const initial = await store.changesAfter(actor.businessId, cursor, 1);
        if (cursor > initial.highWater) throw new ApiProblem(409, 'CURSOR_AHEAD', 'The requested cursor is ahead of this business change feed.');
        res.writeHead(200, {'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', ...(req.headers.origin && origin ? {'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'Origin'} : {})});
        res.write(': connected\n\n');
        let closed=false;let polling=false;
        const heartbeat = setInterval(() => {if(!closed&&!res.writableNeedDrain)res.write(': keepalive\n\n')}, 20_000);
        const poll = setInterval(async () => {
          if(closed||polling||res.writableNeedDrain)return;
          polling=true;
          try {
            const currentActor=await authenticate(req);
            if(currentActor.businessId!==actor.businessId||currentActor.staffId!==actor.staffId||currentActor.deviceId!==actor.deviceId)throw new ApiProblem(401,'AUTH_REQUIRED','The stream session changed.');
            if(closed)return;
            const page = await store.changesAfter(actor.businessId, cursor, 1);
            if(closed)return;
            if (page.highWater>cursor) {
              cursor = page.highWater;
              res.write(`event: changes\ndata: ${JSON.stringify({cursor})}\n\n`);
            }
          } catch {
            if(closed)return;
            res.write('event: unavailable\ndata: {}\n\n');
            res.end();
          }finally{polling=false}
        }, 2_000);
        res.on('close', () => { closed=true;clearInterval(heartbeat); clearInterval(poll); });
        return;
      }
      if(req.method==='POST'&&url.pathname==='/v1/print-bridge/check-claim'){res.setHeader('cache-control','no-store');return json(res,200,await checkBridgeClaim(store.pool,await readJson(req)));}
      if(url.pathname==='/v1/import/templates'&&req.method==='GET'){
        const actor=await authenticate(req);return json(res,200,await importTemplates(actor));
      }
      if(url.pathname==='/v1/import/batches'&&req.method==='GET'){
        const actor=await authenticate(req);return json(res,200,await listImportBatches(store.pool,actor));
      }
      if(url.pathname==='/v1/import/batches'&&req.method==='POST'){
        const actor=await authenticate(req);return json(res,201,await stageImport(store.pool,actor,await readJson(req)));
      }
      const importBatchMatch=url.pathname.match(/^\/v1\/import\/batches\/([0-9a-f-]{36})(?:\/(plan|cancel))?$/i);
      if(importBatchMatch&&req.method==='GET'&&!importBatchMatch[2]){
        const actor=await authenticate(req);return json(res,200,await getImportBatch(store.pool,actor,importBatchMatch[1]));
      }
      if(importBatchMatch&&req.method==='POST'&&importBatchMatch[2]==='plan'){
        const actor=await authenticate(req);return json(res,200,await planImport({store,registry,actor,batchId:importBatchMatch[1]}));
      }
      if(importBatchMatch&&req.method==='POST'&&importBatchMatch[2]==='cancel'){
        const actor=await authenticate(req);const input=await readJson(req);return json(res,200,await cancelImport(store.pool,actor,importBatchMatch[1],input.reason));
      }
      const importPlanMatch=url.pathname.match(/^\/v1\/import\/plans\/([0-9a-f-]{36})(?:\/(apply))?$/i);
      if(importPlanMatch&&req.method==='GET'&&!importPlanMatch[2]){
        const actor=await authenticate(req);return json(res,200,await getImportPlan(store.pool,actor,importPlanMatch[1]));
      }
      if(importPlanMatch&&req.method==='POST'&&importPlanMatch[2]==='apply'){
        const actor=await authenticate(req);return json(res,200,await applyImport({store,registry,actor,planId:importPlanMatch[1]}));
      }
      if (req.method === 'GET' && url.pathname === '/v1/catalog/items') {
        const actor = await authenticate(req);
        if (!actor.permissions?.includes('*') && !actor.permissions?.includes('catalog.view') && !actor.permissions?.includes('catalog.manage')) {
          throw new ApiProblem(403, 'PERMISSION_DENIED', 'You are not allowed to view the catalog.');
        }
        const search = (url.searchParams.get('search') ?? '').trim();
        if (search.length > 100) throw new ApiProblem(400, 'VALIDATION_FAILED', 'Search text is too long.');
        return json(res, 200, {items: await store.listCatalogItems(actor.businessId, search)});
      }
      if(req.method==='GET'&&url.pathname==='/v1/finance/summary'){
        const actor=await authenticate(req);if(!['*','accounting.view','reports.view','finance.expense.view'].some(permission=>actor.permissions?.includes(permission)))throw new ApiProblem(403,'PERMISSION_DENIED','You are not allowed to view Finance reports.');
        const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';if(!calendarDate(from)||!calendarDate(to)||from>to||(Date.parse(`${to}T00:00:00Z`)-Date.parse(`${from}T00:00:00Z`))/86_400_000>366)throw new ApiProblem(400,'VALIDATION_FAILED','Choose a valid Finance report range of at most 367 calendar days.');
        return json(res,200,await store.financeSummary(actor.businessId,from,to));
      }
      if(req.method==='GET'&&url.pathname==='/v1/hospitality/availability'){
        const actor=await authenticate(req);if(!['*','rooms.view','rooms.manage','rooms.operate'].some(permission=>actor.permissions?.includes(permission)))throw new ApiProblem(403,'PERMISSION_DENIED','You are not allowed to search room availability.');
        const startsAt=url.searchParams.get('startsAt')||'',endsAt=url.searchParams.get('endsAt')||'',guestsRaw=url.searchParams.get('guests')||'';const starts=new Date(startsAt),ends=new Date(endsAt),guests=Number(guestsRaw);
        if(!/(Z|[+-]\d{2}:\d{2})$/u.test(startsAt)||!/(Z|[+-]\d{2}:\d{2})$/u.test(endsAt)||!Number.isFinite(starts.getTime())||!Number.isFinite(ends.getTime())||ends<=starts||ends.getTime()-starts.getTime()>366*24*60*60_000||!/^[1-9]\d{0,3}$/.test(guestsRaw)||!Number.isSafeInteger(guests)||guests>1000)throw new ApiProblem(400,'VALIDATION_FAILED','Enter a valid stay interval of up to 366 days and a guest count from 1 to 1,000.');
        return json(res,200,{rooms:await store.roomAvailability(actor.businessId,starts.toISOString(),ends.toISOString(),guests)});
      }
      const creditStatementMatch=req.method==='GET'&&url.pathname.match(/^\/v1\/customer-credit\/accounts\/([0-9a-f-]{36})\/statement$/i);
      if(creditStatementMatch){
        const actor=await authenticate(req),customerId=creditStatementMatch[1];
        if(!uuidPattern.test(customerId))throw new ApiProblem(400,'VALIDATION_FAILED','Customer identity is invalid.');
        if(!['*','credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off'].some(permission=>actor.permissions?.includes(permission)))throw new ApiProblem(403,'PERMISSION_DENIED','You are not allowed to view customer credit statements.');
        const limitRaw=url.searchParams.get('limit')??'100';if(!/^\d+$/.test(limitRaw))throw new ApiProblem(400,'VALIDATION_FAILED','Statement page size must be a whole number.');const limit=Number(limitRaw);if(!Number.isSafeInteger(limit)||limit<1||limit>250)throw new ApiProblem(400,'VALIDATION_FAILED','Statement page size must be between 1 and 250.');
        const encodedCursor=url.searchParams.get('cursor'),cursor=encodedCursor?decodeCreditStatementCursor(encodedCursor):null;
        const page=await store.customerCreditStatementPage(actor.businessId,customerId,{...cursor,limit});
        return json(res,200,{protocolVersion:1,customerId,items:filterRecords(actor,page.items),hasMore:page.hasMore,nextCursor:page.hasMore&&page.before?encodeCreditStatementCursor(page):null});
      }
      const bootstrapPageMatch=req.method==='GET'&&url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})\/pages$/i);
      const bootstrapSnapshotMatch=req.method==='GET'&&url.pathname.match(/^\/v1\/bootstrap\/catalog\/([0-9a-f-]{36})$/i);
      if (req.method === 'GET' && (url.pathname === '/v1/bootstrap/catalog'||bootstrapSnapshotMatch||bootstrapPageMatch)) {
        const actor = await authenticate(req);
        if (!['*','procurement.view','procurement.manage','procurement.receive','procurement.pay','suppliers.manage','catalog.view','catalog.manage','pos.sell','pos.open_tab','pos.manage_table','floorplan.view','floorplan.manage','order.fire','order.void','order.discount','order.comp','payment.record','till.open','till.close','till.view','till.override_variance','kds.view','kds.update','business.configure','order.refund','payment.reverse','reports.view','accounting.view','audit.view','credit.view','credit.manage','credit.charge','credit.settle','credit.reconcile','credit.write_off','rooms.view','rooms.manage','rooms.operate','rooms.guests.view','folio.view','folio.manage','finance.expense.view','finance.expense.record','finance.expense.approve','assets.view','assets.manage','assets.operate','maintenance.view','maintenance.manage'].some(permission=>actor.permissions?.includes(permission))) throw new ApiProblem(403,'PERMISSION_DENIED','You are not allowed to load this business workspace.');
        const authorizationHash=createHash('sha256').update(stableJson([...actor.permissions].sort())).digest('hex');
        if(bootstrapPageMatch){
          const snapshotId=bootstrapPageMatch[1],afterRaw=url.searchParams.get('after')??'0';
          if(!uuidPattern.test(snapshotId)||!/^\d+$/.test(afterRaw)||!Number.isSafeInteger(Number(afterRaw)))throw new ApiProblem(400,'VALIDATION_FAILED','Bootstrap page cursor is invalid.');
          const page=await store.catalogBootstrapPage({snapshotId,businessId:actor.businessId,staffId:actor.staffId,deviceId:actor.deviceId,sessionId:actor.sessionId,authorizationHash,after:Number(afterRaw),at:new Date()});
          if(!page)throw new ApiProblem(404,'BOOTSTRAP_SNAPSHOT_EXPIRED','This business snapshot expired or its authorization changed. Start a new snapshot.');
          return json(res,200,{protocolVersion:2,...page});
        }
        if(bootstrapSnapshotMatch){
          const snapshotId=bootstrapSnapshotMatch[1];
          if(!uuidPattern.test(snapshotId))throw new ApiProblem(400,'VALIDATION_FAILED','Bootstrap snapshot identity is invalid.');
          const manifest=await store.catalogBootstrapManifest({snapshotId,businessId:actor.businessId,staffId:actor.staffId,deviceId:actor.deviceId,sessionId:actor.sessionId,authorizationHash,at:new Date()});
          if(!manifest)throw new ApiProblem(404,'BOOTSTRAP_SNAPSHOT_EXPIRED','This business snapshot expired or its authorization changed. Start a new snapshot.');
          return json(res,200,{protocolVersion:2,snapshotId,expiresAt:manifest.expiresAt,cursor:manifest.highWaterCursor,manifest});
        }
        const bootstrap=await store.catalogBootstrap(actor.businessId);
        const records=JSON.parse(JSON.stringify(filterRecords(actor,bootstrap.records).sort((left,right)=>left.collection===right.collection?(left.id<right.id?-1:left.id>right.id?1:0):(left.collection<right.collection?-1:1))));
        const pageSize=25,pageHashes=[];
        for(let offset=0;offset<records.length;offset+=pageSize)pageHashes.push(createHash('sha256').update(stableJson({afterOrdinal:offset,nextOrdinal:Math.min(offset+pageSize,records.length),records:records.slice(offset,offset+pageSize)})).digest('hex'));
        const collectionCounts=Object.fromEntries([...records.reduce((counts,record)=>counts.set(record.collection,(counts.get(record.collection)||0)+1),new Map()).entries()].sort(([left],[right])=>left<right?-1:left>right?1:0));
        const snapshotId=randomUUID(),createdAt=new Date(),expiresAt=new Date(createdAt.getTime()+10*60_000).toISOString(),core={protocolVersion:2,snapshotId,expiresAt,schemaVersion:2,highWaterCursor:bootstrap.cursor,recordCount:records.length,collectionCounts,pageSize,pageCount:pageHashes.length,pageHashes};
        const manifest={...core,sha256:createHash('sha256').update(stableJson(core)).digest('hex')};
        await store.createCatalogBootstrapSnapshot({snapshotId,businessId:actor.businessId,staffId:actor.staffId,deviceId:actor.deviceId,sessionId:actor.sessionId,authorizationHash,manifest,records,createdAt,expiresAt:new Date(expiresAt)});
        return json(res,200,{protocolVersion:2,snapshotId,expiresAt,cursor:bootstrap.cursor,manifest});
      }
      if (req.method === 'POST' && url.pathname === '/v1/commands') {
        const actor = await authenticate(req);
        const outcome = await executeCommand({db: store, command: await readJson(req), actor, registry});
        return json(res, 200, outcome);
      }
      const match = req.method === 'GET' && url.pathname.match(/^\/v1\/commands\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
      if (match) {
        const actor = await authenticate(req);
        const outcome = await store.commandStatus(actor.businessId, match[1],actor.permissions?.includes('*')||actor.permissions?.includes('audit.view')?null:actor.staffId);
        return outcome ? json(res, 200, {commandId:match[1],status:outcome.status,outcome:outcome.outcome,error:outcome.error,receivedAt:outcome.receivedAt,updatedAt:outcome.updatedAt}) : json(res, 404, {error: {code: 'COMMAND_NOT_FOUND', message: 'No command with this ID exists.'}});
      }
      return json(res, 404, {error: {code: 'NOT_FOUND', message: 'Route not found.'}});
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : error.code === '23505' ? 409 : error.code === '22P02' ? 400 : 500;
      const code = error.code === '23505' ? 'DUPLICATE_REFERENCE' : error.code === '22P02' ? 'VALIDATION_FAILED' : error.code ?? 'INTERNAL_ERROR';
      if (status >= 500) console.error(JSON.stringify({event: 'request_error', code, errorType: error.constructor?.name ?? 'Error'}));
      const safeDatabaseError = error.code === '23505' || error.code === '22P02';
      const message = status >= 500 ? 'The request could not be completed.' : safeDatabaseError ? 'A submitted value conflicts with the current data.' : error.message;
      return json(res, status, {error: {code, message, ...(error.details ? {details: error.details} : {})}});
    }
  });
}

async function main() {
  const config = readConfig();
  const {Pool} = await import('pg');
  const pool = new Pool({connectionString: config.databaseUrl, max: config.poolMax});
  const {rows} = await pool.query('SELECT 1');
  if (!rows.length) throw new Error('Database readiness check returned no row.');
  const store = new PostgresStore(pool);
  await retireInitialAdminSetupSecret(store);
  const hospitalityRegistry=new Map(hospitalityCommandRegistry);
  const baseWalkIn=roomCommandRegistry.get('roomReservation.walkIn');
  if(baseWalkIn)hospitalityRegistry.set('roomReservation.walkIn',{...baseWalkIn,handler:hospitalityWalkInHandler(baseWalkIn.handler)});
  const server = createApiServer({store, registry: new Map([...catalogCommandRegistry,...customerCommandRegistry,...customerCreditCommandRegistry,...customerCreditReconciliationCommandRegistry,...staffCommandRegistry,...deviceCommandRegistry,...managerApprovalCommandRegistry,...supplierCommandRegistry,...purchaseOrderCommandRegistry,...goodsReceiptCommandRegistry,...supplierInvoiceCommandRegistry,...supplierPaymentCommandRegistry,...supplierReturnCommandRegistry,...supplierCreditCommandRegistry,...supplierCreditApplicationCommandRegistry,...posCommandRegistry,...offlinePosCommandRegistry,...floorplanCommandRegistry,...roomCommandRegistry,...hospitalityRegistry,...financeAssetCommandRegistry,...tillCommandRegistry,...paymentAccountCommandRegistry,...paymentCommandRegistry,...businessTaxCommandRegistry,...printCommandRegistry,...outletCommandRegistry,...refundCommandRegistry,...closeDayCommandRegistry]), authenticate: req => authenticateSession(req, store), origin: config.webOrigin});
  server.listen(config.port, config.host, () => console.log(JSON.stringify({event: 'api_started', port: config.port, environment: config.nodeEnv, logLevel: config.logLevel})));
  const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export async function retireInitialAdminSetupSecret(store){
  if(!await store.initialSetupComplete())return false;
  delete process.env.INITIAL_ADMIN_SETUP_SECRET;
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({event: 'startup_failed', errorType: error.constructor?.name ?? 'Error'})); process.exit(1); });
}
