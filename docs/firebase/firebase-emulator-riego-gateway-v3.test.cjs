'use strict';
// §0.243 — official LOCAL RTDB emulator integration. No real Firebase or Push.
const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {PROJECT,makeEmulatorTransport,makeBackendAuth}=
 require('./prototype-avisos-push-auth-emulator-v2.cjs');
const {ROOT,SCHEMA,createLocalRiegoGateway}=
 require('./prototype-riego-gateway-emulator-v3.cjs');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const JWKS='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const UID=name=>uidForName(name);
let transport,auth,gateway,dbEnv,pub,priv,originalFetch;
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(user='FRAN',props={},key=priv){
 const t=Math.floor(Date.now()/1000);
 const h=encode({alg:'RS256',kid:'GATEWAY_LOCAL_ONLY',typ:'JWT'});
 const d=encode({iss:'https://securetoken.google.com/la-sala-app-test',
  aud:'la-sala-app-test',sub:UID(user),auth_time:t-5,exp:t+3600,
  iat:t-5,appUser:user,role:'ADMIN',...props});
 const unsigned=h+'.'+d;
 return unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url');
}
function aggregate(invId){
 const acl=Object.fromEntries(['FRAN','DENNIS','VIGUERAS'].map(name=>
 [UID(name),{appUser:name,role:name==='VIGUERAS'?'ADMIN':'TECNICO',
  active:true,managerApproved:true,grantManager:name==='VIGUERAS',
  ops:name==='VIGUERAS'?['EDIT_RIEGO','ACCEPT_PROPOSAL','REJECT_PROPOSAL']:
  ['EDIT_RIEGO']}]));
 const command=(id,op,actor,cell,beforeText,afterText,extra={})=>({
  id,op,actorUid:UID(actor),invId,cellKey:cell,expectedEpoch:1,
  beforeText,afterText,...extra
 });
 return {schema:SCHEMA,version:1,invId,
  catalog:{active:true,managerApproved:true,sala:'sala1'},
  fence:{phase:'v3_active',epoch:1},acl,
  grid:{
   CELL_1:{texto:'30 MIN',revisadoPorVigueras:true},
   CELL_2:{texto:'?',revisadoPorVigueras:false},
   CELL_3:{texto:'50 MIN',revisadoPorVigueras:false}
  },
  proposals:{PROP_1:{id:'PROP_1',cellKey:'CELL_2',state:'pendiente',
   proposerUid:UID('DENNIS'),proposedText:'35 MIN'}},
  commands:{
   CMD_EDIT:command('CMD_EDIT','EDIT_RIEGO','FRAN','CELL_1','30 MIN','32 MIN'),
   CMD_RACE:command('CMD_RACE','EDIT_RIEGO','FRAN','CELL_1','30 MIN','37 MIN'),
   CMD_RAW:command('CMD_RAW','EDIT_RIEGO','FRAN','CELL_3','50 MIN','55 MIN'),
   CMD_ACCEPT:command('CMD_ACCEPT','ACCEPT_PROPOSAL','VIGUERAS','CELL_2',
    '?','35 MIN',{proposalId:'PROP_1'}),
   CMD_REJECT:command('CMD_REJECT','REJECT_PROPOSAL','VIGUERAS','CELL_2',
    '?','?',{proposalId:'PROP_1'})
  },
  problems:{},receipts:{},events:{},outbox:{}
 };
}
const path=inv=>[ROOT,inv];
async function seed(inv){assert.equal(await transport.insertIfMissing(path(inv),aggregate(inv)),true);}
async function state(inv){return (await transport.retrieve(path(inv))).value;}
const commit=(inv,id='CMD_EDIT',user='FRAN',extra={})=>
 gateway.commit({token:jwt(user),invId:inv,commandId:id,...extra});
const revoke=(inv,target='FRAN',id='REVOKE_1',user='VIGUERAS')=>
 gateway.revoke({token:jwt(user),invId:inv,referenceId:id,targetUid:UID(target)});
const freeze=(inv,id='FREEZE_1')=>
 gateway.freeze({token:jwt('VIGUERAS'),invId:inv,referenceId:id});
before(async()=>{
 assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST,'127.0.0.1:9000');
 assert.equal(process.env.GCLOUD_PROJECT||PROJECT,PROJECT);
 assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON,undefined);
 assert.equal(process.env.FIREBASE_DATABASE_URL,undefined);
 originalFetch=global.fetch;
 ({publicKey:pub,privateKey:priv}=crypto.generateKeyPairSync('rsa',{modulusLength:2048}));
 const jwk=pub.export({format:'jwk'});
 Object.assign(jwk,{kid:'GATEWAY_LOCAL_ONLY',kty:'RSA',alg:'RS256',use:'sig'});
 global.fetch=async(input,options={})=>{
  const u=typeof input==='string'?input:input instanceof URL?input.href:
    typeof input?.url==='string'?input.url:String(input);
  if(u===JWKS)return new Response(JSON.stringify({keys:[jwk]}),
    {status:200,headers:{'content-type':'application/json'}});
  if(/^http:\/\/(?:127\.0\.0\.1|localhost):(?:9000|4400)(?:\/|\?)/.test(u))
   return originalFetch(input,options);
  throw new Error('EXTERNAL_FETCH_BLOCKED');
 };
 transport=makeEmulatorTransport({fetchImpl:originalFetch});
 auth=makeBackendAuth(transport);
 gateway=createLocalRiegoGateway({transport,auth,
  now:()=>new Date('2026-11-04T15:00:00Z')});
 dbEnv=await initializeTestEnvironment({projectId:PROJECT,database:{
  host:'127.0.0.1',port:9000,
  rules:fs.readFileSync(__dirname+'/database.rules.test.candidate.phase2-avisos-push.json','utf8')
 }});
});
after(async()=>{
 try{if(dbEnv)await dbEnv.cleanup();}
 finally{if(originalFetch)global.fetch=originalFetch;}
});
test('authenticated browsers cannot read or write aggregate root or its children',async()=>{
 await seed('INV_PRIV');
 for(const user of [null,'FRAN','VIGUERAS','DENNIS']){
  const context=user?dbEnv.authenticatedContext(UID(user),{appUser:user,role:'ADMIN'}):
   dbEnv.unauthenticatedContext();
  const db=context.database();
  for(const dest of [ROOT,ROOT+'/INV_PRIV',ROOT+'/INV_PRIV/acl',
   ROOT+'/INV_PRIV/grid/CELL_1',ROOT+'/INV_PRIV/outbox']){
   await assertFails(db.ref(dest).get());
   await assertFails(db.ref(dest).set({forged:true}));
  }
 }
});
test('real signed Firebase JWT commits a validated cell and pending outbox with one CAS',async()=>{
 await seed('INV_COMMIT');
 const outcome=await commit('INV_COMMIT');
 assert.equal(outcome.status,'committed');
 assert.match(outcome.eventId,/^evt_[a-f0-9]{64}$/);
 const s=await state('INV_COMMIT');
 assert.equal(s.grid.CELL_1.texto,'32 MIN');
 assert.equal(s.grid.CELL_1.revisadoPorVigueras,false);
 assert.equal(s.version,2);
 assert.equal(s.receipts.CMD_EDIT.eventId,outcome.eventId);
 assert.equal(s.events[outcome.eventId].source.actorUid,UID('FRAN'));
 assert.equal(s.outbox[outcome.eventId].status,'pending');
 assert.deepEqual(Object.keys(s.outbox[outcome.eventId].deliveries),[UID('VIGUERAS')]);
});
test('same signed command executed concurrently commits one change and one event',async()=>{
 await seed('INV_IDEMP');
 const rs=await Promise.all(Array.from({length:7},()=>commit('INV_IDEMP')));
 assert.equal(rs.filter(x=>x.status==='committed').length,1);
 assert.equal(rs.filter(x=>x.status==='already_committed').length,6);
 const s=await state('INV_IDEMP');
 assert.equal(s.version,2);
 assert.equal(Object.keys(s.outbox).length,1);
 assert.equal(Object.keys(s.receipts).length,1);
});
test('unvalidated irrigation edit persists data but emits no supervisor event',async()=>{
 await seed('INV_RAW');
 const result=await commit('INV_RAW','CMD_RAW');
 assert.equal(result.eventId,null);
 const s=await state('INV_RAW');
 assert.equal(s.grid.CELL_3.texto,'55 MIN');
 // RTDB omits null-valued fields when storing objects; no event is persisted.
 assert.equal(Object.hasOwn(s.receipts.CMD_RAW,'eventId'),false);
 assert.equal(s.events,undefined);
 assert.equal(s.outbox,undefined);
 const again=await commit('INV_RAW','CMD_RAW');
 assert.equal(again.status,'already_committed');
 assert.equal(again.eventId,null);
 assert.equal(again.revision,2);
});
test('signed actor issues a new edit intent with one server-side CAS',async()=>{
 await seed('INV_INTENT');
 const request={token:jwt('FRAN'),invId:'INV_INTENT',
  commandId:'CMD_NEW',cellKey:'CELL_1',afterText:'36 MIN'};
 const issued=await gateway.issueIntent(request);
 assert.equal(issued.status,'committed');
 assert.equal(issued.commandId,'CMD_NEW');
 assert.equal(issued.epoch,1);
 const s=await state('INV_INTENT');
 assert.equal(s.commands.CMD_NEW.actorUid,UID('FRAN'));
 assert.equal(s.commands.CMD_NEW.beforeText,'30 MIN');
 assert.equal(s.commands.CMD_NEW.expectedEpoch,1);
 assert.equal(s.grid.CELL_1.texto,'30 MIN');
 const duplicate=await gateway.issueIntent(request);
 assert.equal(duplicate.status,'already_committed');
 await assert.rejects(gateway.issueIntent({...request,afterText:'40 MIN'}),
  {code:'INTENT_ID_CONFLICT'});
 const committed=await commit('INV_INTENT','CMD_NEW');
 assert.equal(committed.status,'committed');
 assert.equal((await state('INV_INTENT')).grid.CELL_1.texto,'36 MIN');
});
test('intent issuer enforces JWT actor ACL frozen INV and strict payload',async()=>{
 await seed('INV_INTENT_DENY');
 const base={token:jwt('FRAN'),invId:'INV_INTENT_DENY',
  commandId:'CMD_NEW',cellKey:'CELL_1',afterText:'36 MIN'};
 await assert.rejects(gateway.issueIntent({...base,token:'fake'}),
  {code:'UNAUTHORIZED'});
 await assert.rejects(gateway.issueIntent({...base,actorUid:UID('VIGUERAS')}),
  {code:'UNTRUSTED_GATEWAY_REQUEST'});
 await assert.rejects(gateway.issueIntent({...base,cellKey:'INVALID'}),
  {code:'CELL_NOT_FOUND'});
 await assert.rejects(gateway.issueIntent({...base,afterText:'30 MIN'}),
  {code:'NO_CHANGE'});
 await revoke('INV_INTENT_DENY','FRAN');
 await assert.rejects(gateway.issueIntent(base),{code:'ACTOR_REVOKED'});
 await seed('INV_INTENT_FROZEN');
 await freeze('INV_INTENT_FROZEN');
 await assert.rejects(gateway.issueIntent({...base,invId:'INV_INTENT_FROZEN'}),
  {code:'WRITER_NOT_ACTIVE'});
});
test('accept proposal and irrigation within same official RTDB compare-and-swap',async()=>{
 await seed('INV_ACCEPT');
 const r=await commit('INV_ACCEPT','CMD_ACCEPT','VIGUERAS');
 assert.equal(r.status,'committed');
 const s=await state('INV_ACCEPT');
 assert.equal(s.proposals.PROP_1.state,'aceptada');
 assert.equal(s.grid.CELL_2.texto,'35 MIN');
 assert.deepEqual(Object.keys(s.outbox[r.eventId].deliveries),[UID('DENNIS')]);
 assert.equal(Object.keys(s.events).length,1);
});
test('reject proposal changes its state but leaves irrigation question mark',async()=>{
 await seed('INV_REJECT');
 const r=await commit('INV_REJECT','CMD_REJECT','VIGUERAS');
 const s=await state('INV_REJECT');
 assert.equal(s.proposals.PROP_1.state,'rechazada');
 assert.equal(s.grid.CELL_2.texto,'?');
 assert.equal(s.outbox[r.eventId].status,'pending');
});
test('two competing proposal outcomes cannot both commit',async()=>{
 await seed('INV_COMPETE');
 const rs=await Promise.allSettled([
  commit('INV_COMPETE','CMD_ACCEPT','VIGUERAS'),
  commit('INV_COMPETE','CMD_REJECT','VIGUERAS')
 ]);
 assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(rs.filter(x=>x.status==='rejected').length,1);
 const s=await state('INV_COMPETE');
 assert.equal(Object.keys(s.events).length,1);
 assert.equal(s.version,2);
});
test('server ignores forged client token role, disallows mismatched command owner',async()=>{
 await seed('INV_OWNER');
 await assert.rejects(commit('INV_OWNER','CMD_EDIT','DENNIS'),{code:'COMMAND_NOT_TRUSTED'});
 await assert.rejects(gateway.commit({
  token:jwt('FRAN',{role:'ADMIN',admin:true}),invId:'INV_OWNER',
  commandId:'CMD_EDIT',recipientUid:UID('DENNIS')
 }),{code:'UNTRUSTED_GATEWAY_REQUEST'});
 assert.equal((await state('INV_OWNER')).version,1);
});
test('bad signature, expired token, incorrect audience and unsigned identity fail',async()=>{
 await seed('INV_JWT');
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 for(const bad of [jwt('FRAN',{},keys.privateKey),
  jwt('FRAN',{exp:Math.floor(Date.now()/1000)-50}),
  jwt('FRAN',{aud:'forged-project'}),'not-a-token']){
  await assert.rejects(gateway.commit({
   token:bad,invId:'INV_JWT',commandId:'CMD_EDIT'
  }));
 }
 assert.equal((await state('INV_JWT')).version,1);
});
test('signed active Backoffice revocation is serialized with invernadero authority CAS',async()=>{
 await seed('INV_REVOKE');
 const r=await revoke('INV_REVOKE');
 assert.equal(r.status,'committed');
 assert.equal(r.epoch,2);
 const s=await state('INV_REVOKE');
 assert.equal(s.acl[UID('FRAN')].active,false);
 assert.equal(s.fence.epoch,2);
 await assert.rejects(commit('INV_REVOKE'),{code:'ACTOR_REVOKED'});
 const again=await revoke('INV_REVOKE');
 assert.equal(again.status,'already_committed');
});
test('a technician cannot revoke another actor and manager cannot self-revoke',async()=>{
 await seed('INV_DENY');
 await assert.rejects(revoke('INV_DENY','DENNIS','REVOKE_1','FRAN'),
  {code:'GRANT_MANAGER_REQUIRED'});
 await assert.rejects(revoke('INV_DENY','VIGUERAS','REVOKE_2'),
  {code:'CANNOT_REVOKE_SELF'});
 assert.equal((await state('INV_DENY')).version,1);
});
test('privileged freeze increments epoch and prevents subsequent signed edit',async()=>{
 await seed('INV_FREEZE');
 const result=await freeze('INV_FREEZE');
 assert.equal(result.epoch,2);
 const s=await state('INV_FREEZE');
 assert.equal(s.fence.phase,'frozen');
 await assert.rejects(commit('INV_FREEZE'),{code:'EPOCH_OR_FENCE_REVOKED'});
 assert.equal((await freeze('INV_FREEZE')).status,'already_committed');
});
test('if revocation wins during CAS, retry rechecks stored ACL and rejects stale edit',async()=>{
 await seed('INV_RACE');
 let inserted=false;
 const interfering={
  retrieve:(...args)=>transport.retrieve(...args),
  compareAndSwap:async (where,version,next)=>{
   if(!inserted&&next.receipts?.CMD_RACE){
    inserted=true;
    const r=await revoke('INV_RACE','FRAN','REVOKE_RACE');
    assert.equal(r.status,'committed');
    return false;
   }
   return transport.compareAndSwap(where,version,next);
  }
 };
 const candidate=createLocalRiegoGateway({transport:interfering,auth,
  now:()=>new Date('2026-11-04T15:00:00Z')});
 await assert.rejects(candidate.commit({
  token:jwt('FRAN'),invId:'INV_RACE',commandId:'CMD_RACE'
 }),{code:'ACTOR_REVOKED'});
 const s=await state('INV_RACE');
 assert.equal(s.grid.CELL_1.texto,'30 MIN');
 assert.equal(s.outbox,undefined);
 assert.equal(s.fence.epoch,2);
});
test('a new write after an earlier edit detects changed business precondition',async()=>{
 await seed('INV_PRECON');
 await commit('INV_PRECON');
 await assert.rejects(commit('INV_PRECON','CMD_RACE'),
  {code:'BUSINESS_PRECONDITION_FAILED'});
 assert.equal((await state('INV_PRECON')).grid.CELL_1.texto,'32 MIN');
});
test('only original actor may obtain a committed receipt, including event integrity',async()=>{
 await seed('INV_RECEIPT');
 const r=await commit('INV_RECEIPT');
 const mine=await gateway.getReceipt({
  token:jwt('FRAN'),invId:'INV_RECEIPT',commandId:'CMD_EDIT'
 });
 assert.equal(mine.eventId,r.eventId);
 await assert.rejects(gateway.getReceipt({
  token:jwt('DENNIS'),invId:'INV_RECEIPT',commandId:'CMD_EDIT'
 }),{code:'RECEIPT_NOT_FOUND'});
});
test('no Push dispatcher, external network or live deployment API is exposed',()=>{
 for(const method of ['sendPush','deploy','connectProduction','writeLegacy',
   'getUnfilteredAggregate']){
  assert.equal(typeof gateway[method],'undefined');
 }
});
