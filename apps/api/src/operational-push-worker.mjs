import webPush from 'web-push';
import {pos2Capabilities} from './pos2-capabilities.mjs';
import {enqueuePush} from './operational-alerts.mjs';
export async function escalateOperationalTasks(pool){
 const threshold=Math.max(1,Math.min(1440,Number(process.env.OPERATIONS_ESCALATION_MINUTES)||5));
 const client=await pool.connect();try{await client.query('BEGIN');
 const {rows}=await client.query(`SELECT * FROM operational_events WHERE resolved_at IS NULL AND escalated_at IS NULL AND kind IN ('ticket.submit','ticket.revise','mpesaReference.submit') AND created_at<now()-($1::int*interval '1 minute') ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED`,[threshold]);
 for(const e of rows){
  const {rows:managers}=await client.query(`SELECT DISTINCT s.staff_id AS "staffId",s.device_id AS "deviceId",s.business_id AS "businessId",ARRAY(SELECT permission FROM api_staff_permissions p WHERE p.business_id=s.business_id AND p.staff_id=s.staff_id) AS permissions FROM api_staff_sessions s JOIN api_staff_profiles f ON f.business_id=s.business_id AND f.staff_id=s.staff_id AND f.active AND NOT f.must_change_password JOIN api_enrolled_devices d ON d.business_id=s.business_id AND d.id=s.device_id AND d.staff_id=s.staff_id AND d.revoked_at IS NULL WHERE s.business_id=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,[e.business_id]);
  let added=false;for(const a of managers){if(!pos2Capabilities(a)['operations.inbox']||!a.permissions.some(p=>p==='*'||p==='till.override_variance'))continue;
   await client.query('INSERT INTO operational_inbox(business_id,event_id,staff_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[e.business_id,e.id,a.staffId]);added=true;}
  if(added){await client.query('UPDATE operational_events SET escalated_at=now() WHERE business_id=$1 AND id=$2',[e.business_id,e.id]);await enqueuePush(client,e.business_id,e.id);}
 }
 await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function deliverOperationalPush(pool,send=webPush.sendNotification.bind(webPush)){
 const client=await pool.connect();let rows;try{await client.query('BEGIN');
 ({rows}=await client.query(`WITH due AS (SELECT business_id,event_id,subscription_id FROM operational_push_deliveries WHERE status='QUEUED' AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE operational_push_deliveries d SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes' FROM due WHERE d.business_id=due.business_id AND d.event_id=due.event_id AND d.subscription_id=due.subscription_id RETURNING d.*`));
 for(const d of rows){
  // A process may die after claiming a send. Keep that uncertainty as evidence.
  await client.query(`UPDATE operational_push_attempts SET outcome='ABANDONED',finished_at=now() WHERE business_id=$1 AND event_id=$2 AND subscription_id=$3 AND outcome='STARTED'`,[d.business_id,d.event_id,d.subscription_id]);
  await client.query(`INSERT INTO operational_push_attempts(business_id,event_id,subscription_id,attempt) VALUES($1,$2,$3,$4)`,[d.business_id,d.event_id,d.subscription_id,d.attempts]);
 }
 await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 for(const d of rows){
 const {rows:subs}=await pool.query(`SELECT s.subscription,s.business_id AS "businessId",s.staff_id AS "staffId",s.device_id AS "deviceId",e.target_type AS "targetType",e.target_id AS "targetId",e.created_at AS "createdAt",e.outlet_id,e.kind,e.resolved_at,i.device_id AS "inboxDevice",ARRAY(SELECT permission FROM api_staff_permissions p WHERE p.business_id=s.business_id AND p.staff_id=s.staff_id) AS permissions FROM operational_push_subscriptions s JOIN api_staff_sessions a ON a.id=s.session_id AND a.business_id=s.business_id AND a.staff_id=s.staff_id AND a.device_id=s.device_id AND a.revoked_at IS NULL AND a.expires_at>now() JOIN api_staff_profiles f ON f.business_id=s.business_id AND f.staff_id=s.staff_id AND f.active AND NOT f.must_change_password JOIN api_enrolled_devices dev ON dev.business_id=s.business_id AND dev.id=s.device_id AND dev.staff_id=s.staff_id AND dev.revoked_at IS NULL JOIN operational_events e ON e.business_id=s.business_id AND e.id=$2 JOIN operational_inbox i ON i.business_id=e.business_id AND i.event_id=e.id AND i.staff_id=s.staff_id AND (i.device_id IS NULL OR i.device_id=s.device_id) WHERE s.id=$1 AND s.revoked_at IS NULL AND i.read_at IS NULL`,[d.subscription_id,d.event_id]);
 let status='CANCELLED',http=null;const s=subs[0];
 if(s&&pos2Capabilities(s)['operations.push']&&pos2Capabilities(s)['operations.inbox']){
  const checkout=await pool.query('SELECT 1 FROM pos_checkout_terminals WHERE business_id=$1 AND device_id=$2 AND outlet_id=$3',[s.businessId,s.deviceId,s.outlet_id]);
  const authorized=s.inboxDevice?checkout.rows.length&&s.permissions.some(p=>p==='*'||p==='ticket.approve'):s.permissions.some(p=>p==='*'||p==='ticket.create'||p==='till.override_variance'||p==='kds.view'||p==='pos.sell');
  const stale=Date.now()-new Date(s.createdAt).getTime()>86400000||s.resolved_at&&['ticket.submit','ticket.revise','mpesaReference.submit'].includes(s.kind);
  if(authorized&&!stale){try{await send(s.subscription,JSON.stringify({eventId:d.event_id,title:'ServOS operational alert',body:'Open ServOS to review an operational update.'}),{TTL:300,timeout:5000});status='ACCEPTED';http=201;}catch(e){http=e.statusCode??null;status=[404,410].includes(http)?'EXPIRED':d.attempts>=6||http&&http>=400&&http<500&&http!==429?'FAILED':'QUEUED';if(status==='EXPIRED')await pool.query('UPDATE operational_push_subscriptions SET revoked_at=now() WHERE id=$1',[d.subscription_id]);}}
 }
 const evidence=await pool.connect();try{await evidence.query('BEGIN');
 // A late response must not overwrite a newer worker's claim/outcome.
 await evidence.query(`UPDATE operational_push_deliveries SET status=$4,last_status=$5,next_attempt_at=now()+($6::int*interval '1 second') WHERE business_id=$1 AND event_id=$2 AND subscription_id=$3 AND attempts=$7`,[d.business_id,d.event_id,d.subscription_id,status,http,Math.min(3600,15*2**d.attempts)+Math.floor(Math.random()*10),d.attempts]);
 await evidence.query(`UPDATE operational_push_attempts SET outcome=$5,provider_status=$6,finished_at=now() WHERE business_id=$1 AND event_id=$2 AND subscription_id=$3 AND attempt=$4 AND outcome='STARTED'`,[d.business_id,d.event_id,d.subscription_id,d.attempts,status,http]);
 await evidence.query('COMMIT');}catch(error){await evidence.query('ROLLBACK');throw error;}finally{evidence.release();}
 }
}
export function startOperationalWorker(pool){
 if(process.env.OPERATIONS_WORKER_ENABLED!=='true')return ()=>{};
 let pushEnabled=Boolean(process.env.WEB_PUSH_PUBLIC_KEY&&process.env.WEB_PUSH_PRIVATE_KEY&&process.env.WEB_PUSH_SUBJECT);
 if(pushEnabled){try{webPush.setVapidDetails(process.env.WEB_PUSH_SUBJECT,process.env.WEB_PUSH_PUBLIC_KEY,process.env.WEB_PUSH_PRIVATE_KEY);}catch{pushEnabled=false;console.error(JSON.stringify({event:'operational_push_configuration_invalid'}));}}
 let running=false,stopped=false;const tick=async()=>{if(running||stopped)return;running=true;try{await escalateOperationalTasks(pool);if(pushEnabled)await deliverOperationalPush(pool);}catch{console.error(JSON.stringify({event:'operational_worker_retry'}));}finally{running=false;}};
 const timer=setInterval(()=>void tick(),15000);timer.unref();return ()=>{stopped=true;clearInterval(timer);};
}
