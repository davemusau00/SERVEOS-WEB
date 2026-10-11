import {Pool} from 'pg';
import {migrate} from '../src/migrate.mjs';
import {randomUUID} from 'node:crypto';
import {salesSummary,salesRegister} from '../src/reports.mjs';

const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL,max:2});
const schema='minimal_'+randomUUID().replaceAll('-','');
await pool.query(`CREATE SCHEMA "${schema}"`);
await pool.query(`SET search_path TO "${schema}",public`);
await migrate(pool);
const businessId=randomUUID();
await pool.query('INSERT INTO businesses(id,name) VALUES($1,$2)',[businessId,'Test']);
const manager={businessId,staffId:randomUUID(),deviceId:randomUUID(),permissions:['*']};

const period={start:'2020-01-01',end:'2030-12-31'};
const summary=await salesSummary(pool,manager,period);
console.log('salesSummary result:',JSON.stringify(summary.totals,null,2));

const register=await salesRegister(pool,manager,{...period,limit:1});
console.log('salesRegister result:',JSON.stringify(register.totals,null,2));

await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
await pool.end();
console.log('Done');