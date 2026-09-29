const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Response|Promise<Response>):void};

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

Deno.serve(async (request:Request)=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL');const anon=Deno.env.get('SUPABASE_ANON_KEY');const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return reply({error:'Auth lifecycle is not configured on the server.'},503);
  const authorization=request.headers.get('Authorization')||'';if(!authorization.startsWith('Bearer '))return reply({error:'Authentication required.'},401);
  const body=await request.json().catch(()=>null) as {action?:string;email?:string;redirectTo?:string}|null;
  if(!body?.action||!body.email)return reply({error:'Action and email are required.'},400);
  const authHeaders={'apikey':anon,'Authorization':authorization,'Content-Type':'application/json'};
  const authorizationResponse=await fetch(`${url}/rest/v1/rpc/servos_v2_auth_lifecycle`,{method:'POST',headers:authHeaders,body:JSON.stringify({action:body.action,email:body.email,redirect_to:body.redirectTo||null})});
  if(!authorizationResponse.ok)return reply({error:'The signed-in operator is not authorized for Auth lifecycle actions.'},403);
  const authorized=await authorizationResponse.json();
  if(body.action==='invite'){
    const response=await fetch(`${url}/auth/v1/admin/invite`,{method:'POST',headers:{'apikey':service,'Authorization':`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({email:authorized.email,redirect_to:authorized.redirectTo||undefined})});
    if(!response.ok)return reply({error:'Supabase Auth could not create the invitation.'},502);
    return reply({message:'Invitation sent through Supabase Auth.'});
  }
  const response=await fetch(`${url}/auth/v1/recover`,{method:'POST',headers:{'apikey':anon,'Content-Type':'application/json'},body:JSON.stringify({email:authorized.email,redirect_to:authorized.redirectTo||undefined})});
  if(!response.ok)return reply({error:'Supabase Auth could not send the recovery message.'},502);
  return reply({message:'Password reset instructions requested through Supabase Auth.'});
});