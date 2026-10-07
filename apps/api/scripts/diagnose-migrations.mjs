import pg from 'pg';
import {readdir,readFile} from 'node:fs/promises';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(value=>/^\d+_[a-z0-9_-]+\.sql$/.test(value)).sort()){
 try{const client=await pool.connect();try{await client.query('BEGIN');await client.query(await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8'));await client.query('ROLLBACK')}finally{client.release()}console.log('OK',name)}
 catch(error){console.log('FAIL',name,error.message,'position',error.position);const sql=await readFile(new URL(`../migrations/${name}`,import.meta.url),'utf8');console.log(sql.slice(Number(error.position)-100,Number(error.position)+100));break}
}
await pool.end();
