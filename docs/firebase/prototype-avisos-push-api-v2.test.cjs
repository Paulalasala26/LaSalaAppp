'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAvisosPushApi,REMINDER}=require('./prototype-avisos-push-api-v2.cjs');
const {uidForName,endpointId}=require('./prototype-avisos-push-v2.cjs');
const UID_A=uidForName('TECNICO_A'),UID_B=uidForName('TECNICO_B');
const UID_R=uidForName('REGANTE_A');
const SECRET='cron-secret-only-test-123456789123';
const SUB=(name='shared')=>({endpoint:'https://example.push.test/'+name,
  keys:{auth:'1234567890123456',p256dh:'1234567890abcdefghijklmnop'}});
function fixture(){
  const state={roles:{TECNICO_A:'TECNICO',TECNICO_B:'TECNICO',REGANTE_A:'REGANTE',
    ADMIN_A:'ADMIN',DENNIS:'TECNICO',FRAN:'TECNICO'},
    accounts:{TECNICO_A:true,TECNICO_B:true,REGANTE_A:true,ADMIN_A:true,DENNIS:true,FRAN:true},
    alerts:{[UID_A]:{A_1:{id:'A_1',recipientUid:UID_A,version:1,tipo:'general',visto:false,
      leido:false,evaluacion:null}},
      [UID_B]:{B_1:{id:'B_1',recipientUid:UID_B,version:1,tipo:'problema_ejecucion',visto:false,leido:false}}},
    subs:{},events:{'riego_problema:EVENT_1':{id:'EVENT_1',reporterUid:UID_R,guardUid:UID_A}},
    outbox:{},weekly:{},writes:0,dispatches:0,reads:0,auth:0};
  const store={
    async getOwnAlerts(uid){state.reads++;return state.alerts[uid]||{}},
    async getAllAlerts(){state.reads++;return JSON.parse(JSON.stringify(state.alerts))},
    async getAlert(uid,id){state.reads++;return state.alerts[uid]?.[id]||null},
    async compareAndSwapAlert(uid,id,expected,next){
      const old=state.alerts[uid]?.[id];
      if(!old||old.version!==expected)return false;
      state.alerts[uid][id]=JSON.parse(JSON.stringify(next));state.writes++;return true;
    },
    async getSubscription(id){state.reads++;return state.subs[id]||null},
    async compareAndSwapSubscription(id,expected,next){
      const current=state.subs[id]||null;
      if((current?.version??0)!==expected)return false;
      if(next===null)delete state.subs[id];else state.subs[id]=JSON.parse(JSON.stringify(next));
      state.writes++;return true;
    },
    async getSourceEvent(kind,ref){state.reads++;return state.events[kind+':'+ref]||null},
    async enqueueNotification(key,event){
      if(state.outbox[key])return false;
      state.outbox[key]=JSON.parse(JSON.stringify(event));state.writes++;return true;
    },
    async enqueueWeeklyReminder(key,events){
      if(state.weekly[key])return false;
      state.weekly[key]=JSON.parse(JSON.stringify(events));state.writes++;return true;
    }
  };
  const create=(custom={})=>createAvisosPushApi({
    verifyIdentity:async token=>{
      state.auth++;
      if(!token.startsWith('test:'))return null;
      const name=token.slice(5);
      if(!state.roles[name])return null;
      return {appUser:name,uid:uidForName(name)};
    },
    loadRole:async name=>state.roles[name]??null,
    loadAccount:async name=>state.accounts[name]===true,
    authorizeEvent:async (a,kind,record)=>!!record&&kind==='riego_problema'&&
      record.reporterUid===a.uid,
    cronSecret:()=>SECRET,
    now:()=>new Date('2026-11-05T07:00:00.000Z'),
    storage:store,...custom
  });
  return {state,store,create,handler:create()};
}
function post(name,action,fields={},query={}){
  return {method:'POST',headers:{authorization:'Bearer test:'+name},
    query,body:{action,...fields}};
}
function cron(auth='Bearer '+SECRET,headers={}){
  return {method:'GET',headers:{'user-agent':'vercel-cron/1.0',authorization:auth,...headers}};
}
function status(response,code){assert.equal(response.status,code,JSON.stringify(response.body))}
test('user can read only own alerts and sees independent data',async()=>{
 const f=fixture();
 const a=await f.handler(post('TECNICO_A','mine'));
 status(a,200);assert.deepEqual(Object.keys(a.body.avisos),['A_1']);
 assert.equal(a.body.avisos.B_1,undefined);
 const b=await f.handler(post('TECNICO_B','mine'));
 status(b,200);assert.deepEqual(Object.keys(b.body.avisos),['B_1']);
});
test('unauthenticated calls fail before storage read',async()=>{
 const f=fixture();
 const out=await f.handler({method:'POST',headers:{},body:{action:'mine'}});
 status(out,401);assert.equal(f.state.reads,0);
});
test('role is reloaded from current server store each request',async()=>{
 const f=fixture();status(await f.handler(post('TECNICO_A','mine')),200);
 f.state.roles.TECNICO_A='INVALID';
 status(await f.handler(post('TECNICO_A','mine')),403);
});
test('deactivated account is denied',async()=>{
 const f=fixture();f.state.accounts.TECNICO_A=false;
 status(await f.handler(post('TECNICO_A','mine')),403);
 assert.equal(f.state.reads,0);
});
test('client cannot inject recipient or user in mine request',async()=>{
 const f=fixture();
 status(await f.handler(post('TECNICO_A','mine',{uid:UID_B})),400);
 assert.equal(f.state.reads,0);
});
test('only ADMIN can list all alerts; no push endpoints in reply',async()=>{
 const f=fixture();
 status(await f.handler(post('TECNICO_A','admin-list')),403);
 const out=await f.handler(post('ADMIN_A','admin-list'));
 status(out,200);
 assert.equal(Object.keys(out.body.avisos).length,2);
 assert.ok(!JSON.stringify(out.body).includes('example.push.test'));
});
test('reading marks do not change sent-state flags',async()=>{
 const f=fixture();
 const out=await f.handler(post('TECNICO_A','mark-read',{id:'A_1',expectedVersion:1}));
 status(out,200);assert.equal(out.body.version,2);
 assert.equal(f.state.alerts[UID_A].A_1.leido,true);
 assert.equal(f.state.alerts[UID_A].A_1.visto,false);
});
test('CAS conflict does not overwrite an alert',async()=>{
 const f=fixture();const prior=JSON.stringify(f.state.alerts[UID_A].A_1);
 status(await f.handler(post('TECNICO_A','mark-read',{id:'A_1',expectedVersion:4})),409);
 assert.equal(JSON.stringify(f.state.alerts[UID_A].A_1),prior);
});
test('cannot mark another users alert even if id is known',async()=>{
 const f=fixture();
 status(await f.handler(post('TECNICO_A','mark-read',{id:'B_1',expectedVersion:1})),404);
 assert.equal(f.state.writes,0);
});
test('valid technician can evaluate own; REGANTE cannot',async()=>{
 const f=fixture();const out=await f.handler(post('TECNICO_A','evaluate',
   {id:'A_1',expectedVersion:1,evaluation:'bien'}));
 status(out,200);assert.equal(f.state.alerts[UID_A].A_1.deleted,true);
 const r=await f.handler(post('REGANTE_A','evaluate',
   {id:'A_1',expectedVersion:1,evaluation:'mal'}));
 status(r,404);
});
test('resolve for technical problem retains state in audit form',async()=>{
 const f=fixture();
 const out=await f.handler(post('TECNICO_B','resolve',
   {id:'B_1',expectedVersion:1,notes:'Solucionado'}));
 status(out,200);assert.equal(f.state.alerts[UID_B].B_1.solucion,'Solucionado');
 assert.equal(f.state.alerts[UID_B].B_1.deleted,true);
});
test('server-side CAS false is treated as 409',async()=>{
 const f=fixture();
 const h=f.create({storage:{...f.store,compareAndSwapAlert:async()=>false}});
 const old=JSON.stringify(f.state.alerts[UID_A].A_1);
 status(await h(post('TECNICO_A','mark-seen',{id:'A_1',expectedVersion:1})),409);
 assert.equal(JSON.stringify(f.state.alerts[UID_A].A_1),old);
});
test('push registration requires explicit user consent',async()=>{
 const f=fixture();
 status(await f.handler(post('TECNICO_A','push-register',{subscription:SUB(),consented:false})),403);
 assert.equal(f.state.writes,0);
});
test('two push devices bind to own UID, not a supplied user',async()=>{
 const f=fixture();
 status(await f.handler(post('TECNICO_A','push-register',
   {subscription:SUB('a'),consented:true})),200);
 status(await f.handler(post('TECNICO_A','push-register',
   {subscription:SUB('b'),consented:true})),200);
 assert.equal(Object.keys(f.state.subs).length,2);
 for(const item of Object.values(f.state.subs))assert.equal(item.uid,UID_A);
});
test('same browser switch requires fresh consent to reassign endpoint',async()=>{
 const f=fixture();
 status(await f.handler(post('TECNICO_A','push-register',
   {subscription:SUB(),consented:true})),200);
 status(await f.handler(post('TECNICO_B','push-status',{endpoint:SUB().endpoint})),200);
 const before=await f.handler(post('TECNICO_B','push-status',{endpoint:SUB().endpoint}));
 assert.equal(before.body.active,false);
 status(await f.handler(post('TECNICO_B','push-register',
   {subscription:SUB(),consented:false})),403);
 status(await f.handler(post('TECNICO_B','push-register',
   {subscription:SUB(),consented:true})),200);
 assert.equal(f.state.subs[endpointId(SUB().endpoint)].uid,UID_B);
 const stale=await f.handler(post('TECNICO_A','push-status',{endpoint:SUB().endpoint}));
 assert.equal(stale.body.active,false);
});
test('foreign user cannot unregister push device',async()=>{
 const f=fixture();
 status(await f.handler(post('TECNICO_A','push-register',
   {subscription:SUB(),consented:true})),200);
 status(await f.handler(post('TECNICO_B','push-unregister',{endpoint:SUB().endpoint})),403);
 assert.equal(f.state.subs[endpointId(SUB().endpoint)].uid,UID_A);
});
test('own push unregistration idempotent',async()=>{
 const f=fixture();
 const p=post('TECNICO_A','push-unregister',{endpoint:SUB().endpoint});
 status(await f.handler(p),200);
 status(await f.handler(post('TECNICO_A','push-register',{subscription:SUB(),consented:true})),200);
 status(await f.handler(p),200);
 assert.deepEqual(Object.keys(f.state.subs),[]);
});
test('push registration CAS conflict returns 409, without writes',async()=>{
 const f=fixture();
 const h=f.create({storage:{...f.store,compareAndSwapSubscription:async()=>false}});
 status(await h(post('TECNICO_A','push-register',{subscription:SUB(),consented:true})),409);
 assert.equal(f.state.writes,0);
});
test('push status always derived from server, not browser local subscription alone',async()=>{
 const f=fixture();
 const result=await f.handler(post('TECNICO_A','push-status',{endpoint:SUB().endpoint}));
 status(result,200);assert.equal(result.body.active,false);
});
test('emission refuses arbitrary target/title/body before loading event',async()=>{
 const f=fixture();const out=await f.handler(post('REGANTE_A','emit-event',{
   kind:'riego_problema',referenceId:'EVENT_1',target:UID_B,title:'Fake',body:'Hello'}));
 status(out,400);assert.equal(f.state.writes,0);
});
test('emission uses event-derived recipient and outbox deduplication',async()=>{
 const f=fixture();const request=post('REGANTE_A','emit-event',
   {kind:'riego_problema',referenceId:'EVENT_1'});
 const first=await f.handler(request);
 status(first,202);assert.equal(first.body.queued,true);
 const event=f.state.outbox['riego_problema:EVENT_1'];
 assert.equal(event.recipientUid,UID_A);
 const second=await f.handler(request);
 status(second,200);assert.equal(second.body.duplicate,true);
 assert.equal(Object.keys(f.state.outbox).length,1);
});
test('event ownership guard rejects other actor and prevents queue',async()=>{
 const f=fixture();
 const out=await f.handler(post('TECNICO_A','emit-event',
   {kind:'riego_problema',referenceId:'EVENT_1'}));
 status(out,403);assert.equal(Object.keys(f.state.outbox).length,0);
});
test('missing trusted event never sends notification',async()=>{
 const f=fixture();
 status(await f.handler(post('REGANTE_A','emit-event',
   {kind:'riego_problema',referenceId:'UNKNOWN'})),403);
 assert.equal(Object.keys(f.state.outbox).length,0);
});
test('GET endpoint accepts only authenticated Thursday Cron',async()=>{
 const f=fixture();
 status(await f.handler({method:'GET',headers:{}}),401);
 status(await f.handler(cron('Bearer WRONG')),401);
 assert.equal(Object.keys(f.state.weekly).length,0);
});
test('weekly reminder preserves Thursday 07 UTC, two recipients and text',async()=>{
 const f=fixture();
 assert.equal(REMINDER.scheduleUTC,'0 7 * * 4');
 const reply=await f.handler(cron());
 status(reply,202);
 assert.equal(reply.body.queued,2);
 const batch=f.state.weekly['weekly-tuta:2026-11-05'];
 assert.equal(batch.length,2);
 assert.deepEqual(batch.map(x=>x.recipientUid),[uidForName('DENNIS'),uidForName('FRAN')]);
 assert.ok(batch.every(x=>x.title===REMINDER.title&&x.message===REMINDER.message));
});
test('weekly reminder is queued only once per calendar Thursday',async()=>{
 const f=fixture();status(await f.handler(cron()),202);
 const duplicate=await f.handler(cron());
 status(duplicate,200);assert.equal(duplicate.body.duplicate,true);
 assert.equal(Object.keys(f.state.weekly).length,1);
});
test('weekly reminder refuses inactive recipient before writing anything',async()=>{
 const f=fixture();f.state.accounts.DENNIS=false;
 status(await f.handler(cron()),503);
 assert.equal(f.state.writes,0);
});
test('weekly reminder never runs on other weekdays',async()=>{
 const f=fixture();
 const handler=f.create({now:()=>new Date('2026-11-06T07:00:00Z')});
 status(await handler(cron()),409);assert.equal(f.state.writes,0);
});
test('user with Firebase token cannot trigger weekly Cron via POST',async()=>{
 const f=fixture();
 status(await f.handler(post('ADMIN_A','mine',{}, {cron:'tuta'})),400);
 status(await f.handler({...post('ADMIN_A','mine'),
   headers:{authorization:'Bearer test:ADMIN_A','user-agent':'vercel-cron/1.0'}}),405);
 assert.equal(Object.keys(f.state.weekly).length,0);
});
test('missing injected storage methods are refused before startup',()=>{
 assert.throws(()=>createAvisosPushApi({
   verifyIdentity:()=>{},loadRole:()=>{},loadAccount:()=>{},
   authorizeEvent:()=>{},storage:{}
 }),/MISSING_STORAGE_ADAPTER/);
});
test('unhandled storage exception returns generic 503, never token or PII',async()=>{
 const f=fixture();
 const handler=f.create({storage:{...f.store,getOwnAlerts:async()=>{throw Error('sensitive-data-dump')}}});
 const result=await handler(post('TECNICO_A','mine'));
 status(result,503);assert.deepEqual(result.body,{error:'SERVICE_UNAVAILABLE'});
});
