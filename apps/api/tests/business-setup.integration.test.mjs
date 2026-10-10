import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {PostgresStore} from '../src/postgres-store.mjs';
import {executeCommand} from '../src/command-kernel.mjs';
import {createApiCommandRegistry} from '../src/command-registry.mjs';

const databaseUrl=process.env.TEST_DATABASE_URL;

test('PostgreSQL first-run setup resumes and provisions stable defaults once',{skip:!databaseUrl,timeout:120_000},async t=>{
 const adminPool=new Pool({connectionString:databaseUrl,max:2});
 const schema=`business_setup_${randomUUID().replaceAll('-','')}`;
 await adminPool.query(`CREATE SCHEMA "${schema}"`);
 const pool=new Pool({connectionString:databaseUrl,max:8,options:`-c search_path=${schema},public`});
 t.after(async()=>{await pool.end();await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()});
 await migrate(pool);

 const store=new PostgresStore(pool),businessId=randomUUID(),staffId=randomUUID(),deviceId=randomUUID();
 const actor={businessId,staffId,deviceId,permissions:['*']},registry=createApiCommandRegistry();
 const bootstrap={setupSecretHash:'setup-secret-hash',expectedSetupSecretHash:'setup-secret-hash',businessId,businessName:'Unfinished business',staffId,loginName:`setup-${staffId}@example.invalid`,displayName:'Setup Admin',credentialHash:'test-hash',permissions:['*'],at:new Date()};
 assert.equal(await store.createInitialAdmin({...bootstrap,setupSecretHash:'wrong-secret-hash'}),false,'incorrect bootstrap secret must not create the first admin');
 assert.equal(await store.createInitialAdmin(bootstrap),true,'first admin and resumable setup row are created together');
 await pool.query('INSERT INTO api_enrolled_devices(id,business_id,staff_id,public_key,created_at) VALUES($1,$2,$3,$4,now())',[deviceId,businessId,staffId,JSON.stringify({kty:'EC',crv:'P-256',x:'x',y:'y'})]);
 const run=(name,payload,expectedVersions={})=>executeCommand({db:store,actor,registry,command:{commandId:randomUUID(),name,payload,expectedVersions}});
 const confirmed=async(name,payload,expectedVersions={})=>{
  const outcome=await run(name,payload,expectedVersions);
  assert.equal(outcome.kind,'CONFIRMED',`${name}: ${JSON.stringify(outcome)}`);
  return outcome;
 };
 const locationId=randomUUID(),outletId=randomUUID(),cashId=randomUUID();
 const configuration={
  businessName:'Kijani Cafe',category:'FOOD_AND_BEVERAGE',contact:'0712345678',address:'Nairobi',receiptName:'Kijani Cafe',taxPin:null,footer:null,
  taxTreatment:'ZERO_RATES',vatRateBasisPoints:0,levyRateBasisPoints:0,businessType:'RESTAURANT_CAFE',
  locations:[{id:locationId,name:'Main Store',code:'MAIN_STORE',type:'STORE'}],
  outlets:[{id:outletId,name:'Main Restaurant',defaultStockLocationId:locationId}],
  payments:[{id:cashId,name:'Cash',code:'CASH',method:'CASH',referenceRequired:false}],
  optionalSteps:{products:'LATER',staff:'LATER',rooms:'LATER'},
 };
 const firstSnapshot=(await store.catalogBootstrap(businessId)).records.find(row=>row.collection==='businessSetup');
 assert.equal(firstSnapshot.data.status,'IN_PROGRESS');
 await confirmed('business.setup.configure',{configuration,currentStep:1},{[`businessSetup:${businessId}`]:firstSnapshot.version});

 const configureDefaults=async()=>{
  let records=(await store.catalogBootstrap(businessId)).records;
  let settings=records.find(row=>row.collection==='businessSettings'&&row.id===businessId);
  await confirmed('business.settings.save',{data:{businessName:configuration.receiptName,address:configuration.address,contact:configuration.contact,taxPin:'',footer:'',vatRateBasisPoints:0,levyRateBasisPoints:0},reason:'Initial business setup'},{[`businessSettings:${businessId}`]:settings?.version??0});
  records=(await store.catalogBootstrap(businessId)).records;
  let location=records.find(row=>row.collection==='stockLocations'&&row.id===locationId);
  await confirmed('stockLocation.save',{id:locationId,data:{name:'Main Store',code:'MAIN_STORE',type:'STORE'}},{[`stockLocations:${locationId}`]:location?.version??0});
  records=(await store.catalogBootstrap(businessId)).records;
  let outlet=records.find(row=>row.collection==='outlets'&&row.id===outletId);
  location=records.find(row=>row.collection==='stockLocations'&&row.id===locationId);
  await confirmed('outlet.save',{id:outletId,data:{name:'Main Restaurant',defaultStockLocationId:locationId,archived:false},reason:'Initial business setup'},{[`outlets:${outletId}`]:outlet?.version??0,[`stockLocations:${locationId}`]:location.version});
  records=(await store.catalogBootstrap(businessId)).records;
  const cash=records.find(row=>row.collection==='paymentAccounts'&&row.id===cashId);
  await confirmed('paymentAccount.save',{id:cashId,data:{name:'Cash',code:'CASH',method:'CASH',currency:'KES',referenceRequired:false,archived:false},reason:'Initial business setup'},{[`paymentAccounts:${cashId}`]:cash?.version??0});
 };

 await configureDefaults();
 let setup=(await store.catalogBootstrap(businessId)).records.find(row=>row.collection==='businessSetup');
 await confirmed('business.setup.configure',{configuration,currentStep:3},{[`businessSetup:${businessId}`]:setup.version});
 // Replaying the saved setup plan uses the same IDs and updates existing rows.
 await configureDefaults();
 setup=(await store.catalogBootstrap(businessId)).records.find(row=>row.collection==='businessSetup');
 await confirmed('business.setup.complete',{}, {[`businessSetup:${businessId}`]:setup.version});

 const completed=(await store.catalogBootstrap(businessId)).records.find(row=>row.collection==='businessSetup');
 assert.equal(completed.data.status,'COMPLETED');
 assert.equal(completed.data.configuration.businessType,'RESTAURANT_CAFE');
 for(const [table,id] of [['stock_locations',locationId],['business_outlets',outletId],['payment_accounts',cashId]]){
  const count=await pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE business_id=$1 AND id=$2`,[businessId,id]);
  assert.equal(count.rows[0].count,1,`${table} should contain exactly one saved default`);
 }
});
