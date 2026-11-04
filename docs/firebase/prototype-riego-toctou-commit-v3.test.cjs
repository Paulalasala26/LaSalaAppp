'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {ROOT,SCHEMA,createDemoAtomicRevalidationGateway}=
 require('./prototype-riego-toctou-commit-v3.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const U=n=>uidForName(n);
const clock='2026-11-04T15:00:00Z';
function baseline(){
 return {
  schema:SCHEMA,invId:'INV_1',version:1,
  fence:{phase:'v3_active',epoch:4},
  catalog:{active:true,managerApproved:true,sala:'sala1'},
  actors:{
   FRAN:{uid:U('FRAN'),role:'TECNICO',active:true,managerApproved:true,
    canWriteRiego:true,allowedInvIds:['INV_1']},
   DENNIS:{uid:U('DENNIS'),role:'TECNICO',active:true,managerApproved:true,
    canWriteRiego:true,allowedInvIds:['INV_1']},
   VIGUERAS:{uid:U('VIGUERAS'),role:'ADMIN',active:true,managerApproved:true,
    canWriteRiego:true,allowedInvIds:['INV_1']}
  },
  grid:{CELL_1:'30 MIN',CELL_2:'?',CELL_3:'50 MIN'},
  proposals:{
   PROP_1:{state:'pendiente',invId:'INV_1',cellKey:'CELL_2',
    proposedText:'35 MIN',originalProposerName:'DENNIS',
    originalProposerUid:U('DENNIS')}
  },
  commands:{
   CMD_1:{referenceId:'CMD_1',op:'EDIT_RIEGO',invId:'INV_1',
    actorName:'FRAN',actorUid:U('FRAN'),expectedEpoch:4,
    cellKey:'CELL_1',expectedText:'30 MIN',nextText:'32 MIN'},
   CMD_2:{referenceId:'CMD_2',op:'ACCEPT_PROPOSAL',invId:'INV_1',
    actorName:'VIGUERAS',actorUid:U('VIGUERAS'),expectedEpoch:4,
    cellKey:'CELL_2',expectedText:'?',nextText:'35 MIN',proposalId:'PROP_1'},
   CMD_3:{referenceId:'CMD_3',op:'REJECT_PROPOSAL',invId:'INV_1',
    actorName:'VIGUERAS',actorUid:U('VIGUERAS'),expectedEpoch:4,
    cellKey:'CELL_2',expectedText:'?',nextText:'?',proposalId:'PROP_1'}
  },
  receipts:{},events:{}
 };
}
function fixture({fail=null,maxAttempts=6}={}){
 let state=baseline(),calls=0;
 let race=null;
 const transport={
  async retrieve(path,withEtag){
   assert.deepEqual(path,[ROOT,'INV_1']);
   return {value:clone(state),etag:withEtag?'"'+state.version+'"':null};
  },
  async compareAndSwap(path,oldVersion,next){
   assert.deepEqual(path,[ROOT,'INV_1']);
   calls++;await Promise.resolve();
   if(race){const f=race;race=null;f(state);state.version++;}
   if(fail==='before')throw Object.assign(new Error('FAILED_BEFORE_WRITE'),{code:'FAILED_BEFORE_WRITE'});
   if(fail==='always-conflict')return false;
   if(state.version!==oldVersion)return false;
   state=clone(next);
   if(fail==='after')throw Object.assign(new Error('LOST_ACK'),{code:'LOST_ACK'});
   return true;
  }
 };
 const auth={async verifyIdentity(token){
  if(!['FRAN','DENNIS','VIGUERAS'].includes(token))
   throw Object.assign(new Error('INVALID_JWT'),{code:'UNAUTHORIZED'});
  return {appUser:token,uid:U(token)};
 }};
 const gateway=createDemoAtomicRevalidationGateway({transport,auth,maxAttempts,
  now:()=>new Date(clock)});
 const mutate=f=>{f(state);state.version++;};
 return {gateway,transport,mutate,
  race:f=>{race=f},
  get state(){return clone(state)},get calls(){return calls}};
}
const deny=(task,code)=>assert.rejects(task,{code});
test('advisory preflight is not a write capability',async()=>{
 const f=fixture(),out=await f.gateway.preflight('FRAN','INV_1','CMD_1');
 assert.equal(out.authorized,true);
 assert.equal(out.advisoryOnly,true);
 assert.equal(out.cannotBeUsedAsWriteCapability,true);
 assert.equal(out.epoch,4);
 assert.equal(f.state.version,1);
});
test('single CAS commits irrigation cell, event source and pending outbox together',async()=>{
 const f=fixture(),r=await f.gateway.commit('FRAN','INV_1','CMD_1');
 assert.equal(r.status,'committed');
 assert.equal(f.state.grid.CELL_1,'32 MIN');
 assert.equal(f.state.version,2);
 assert.equal(Object.keys(f.state.receipts).length,1);
 assert.equal(Object.keys(f.state.events).length,1);
 assert.equal(f.state.events[r.eventId].outbox.status,'pending');
 assert.deepEqual(Object.keys(f.state.events[r.eventId].outbox.deliveries),[U('VIGUERAS')]);
});
test('repeating same command cannot generate a second alert',async()=>{
 const f=fixture();
 const first=await f.gateway.commit('FRAN','INV_1','CMD_1');
 const second=await f.gateway.commit('FRAN','INV_1','CMD_1');
 assert.equal(second.status,'already_committed');
 assert.equal(second.eventId,first.eventId);
 assert.equal(f.calls,1);
 assert.equal(Object.keys(f.state.events).length,1);
});
test('role revoked after successful preflight blocks commit',async()=>{
 const f=fixture();await f.gateway.preflight('FRAN','INV_1','CMD_1');
 f.mutate(s=>{s.actors.FRAN.role='PEON'});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'ACTOR_REVOKED_AT_COMMIT');
 assert.equal(f.state.grid.CELL_1,'30 MIN');
});
test('role revoked during CAS loses race and cannot write on retry',async()=>{
 const f=fixture();await f.gateway.preflight('FRAN','INV_1','CMD_1');
 f.race(s=>{s.actors.FRAN.role='PEON'});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'ACTOR_REVOKED_AT_COMMIT');
 assert.equal(Object.keys(f.state.events).length,0);
});
test('disabled account during CAS fails closed after authoritative re-read',async()=>{
 const f=fixture();f.race(s=>{s.actors.FRAN.active=false});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'ACTOR_REVOKED_AT_COMMIT');
});
test('manager assignment changed during CAS blocks command',async()=>{
 const f=fixture();f.race(s=>{s.actors.FRAN.allowedInvIds=[]});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'ACTOR_REVOKED_AT_COMMIT');
});
test('Backoffice approval revoked after preflight blocks commit',async()=>{
 const f=fixture();await f.gateway.preflight('FRAN','INV_1','CMD_1');
 f.mutate(s=>{s.actors.FRAN.managerApproved=false});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'ACTOR_REVOKED_AT_COMMIT');
});
test('invernadero revoked during CAS blocks commit',async()=>{
 const f=fixture();f.race(s=>{s.catalog.active=false});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'INVERNADERO_REVOKED_AT_COMMIT');
});
test('invernadero manager approval withdrawn blocks commit',async()=>{
 const f=fixture();f.mutate(s=>{s.catalog.managerApproved=false});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'INVERNADERO_REVOKED_AT_COMMIT');
});
test('freeze phase changed after advisory blocks write',async()=>{
 const f=fixture();await f.gateway.preflight('FRAN','INV_1','CMD_1');
 f.mutate(s=>{s.fence.phase='frozen';s.fence.epoch=5});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'FENCE_NOT_ACTIVE_AT_COMMIT');
});
test('epoch incremented while phase still v3-active blocks stale command',async()=>{
 const f=fixture();f.race(s=>{s.fence.epoch=5});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'EPOCH_CHANGED_BEFORE_COMMIT');
});
test('acceptance updates proposal, irrigation and outbox in same CAS',async()=>{
 const f=fixture();const out=await f.gateway.commit('VIGUERAS','INV_1','CMD_2');
 assert.equal(out.status,'committed');
 assert.equal(f.state.proposals.PROP_1.state,'aceptada');
 assert.equal(f.state.grid.CELL_2,'35 MIN');
 assert.deepEqual(Object.keys(f.state.events[out.eventId].outbox.deliveries),[U('DENNIS')]);
});
test('rejecting proposal leaves irrigation intact but writes one pending event',async()=>{
 const f=fixture();const out=await f.gateway.commit('VIGUERAS','INV_1','CMD_3');
 assert.equal(out.status,'committed');
 assert.equal(f.state.proposals.PROP_1.state,'rechazada');
 assert.equal(f.state.grid.CELL_2,'?');
 assert.equal(Object.keys(f.state.events).length,1);
});
test('proposal accepted by another writer between preflight and CAS is not accepted twice',async()=>{
 const f=fixture();await f.gateway.preflight('VIGUERAS','INV_1','CMD_2');
 f.race(s=>{s.proposals.PROP_1.state='aceptada'});
 await deny(f.gateway.commit('VIGUERAS','INV_1','CMD_2'),'PROPOSAL_CHANGED_BEFORE_COMMIT');
 assert.equal(Object.keys(f.state.events).length,0);
});
test('proposal rejected before acceptance is denied',async()=>{
 const f=fixture();f.mutate(s=>{s.proposals.PROP_1.state='rechazada'});
 await deny(f.gateway.commit('VIGUERAS','INV_1','CMD_2'),'PROPOSAL_CHANGED_BEFORE_COMMIT');
});
test('proposal text modified while pending is denied',async()=>{
 const f=fixture();f.race(s=>{s.proposals.PROP_1.proposedText='99 MIN'});
 await deny(f.gateway.commit('VIGUERAS','INV_1','CMD_2'),
  'PROPOSAL_BUSINESS_PRECONDITION_FAILED');
});
test('proposal proposer deactivated during CAS blocks notification and write',async()=>{
 const f=fixture();f.race(s=>{s.actors.DENNIS.active=false});
 await deny(f.gateway.commit('VIGUERAS','INV_1','CMD_2'),
  'PROPOSAL_CHANGED_BEFORE_COMMIT');
});
test('VIGUERAS supervisor role revoked between approval and commit blocks proposal',async()=>{
 const f=fixture();await f.gateway.preflight('VIGUERAS','INV_1','CMD_2');
 f.mutate(s=>{s.actors.VIGUERAS.role='TECNICO'});
 await deny(f.gateway.commit('VIGUERAS','INV_1','CMD_2'),
  'SUPERVISOR_REVOKED_AT_COMMIT');
});
test('irrigation changed under proposal cannot be overwritten',async()=>{
 const f=fixture();f.race(s=>{s.grid.CELL_2='40 MIN'});
 await deny(f.gateway.commit('VIGUERAS','INV_1','CMD_2'),
  'RIEGO_CHANGED_BEFORE_COMMIT');
});
test('two concurrent commands competing for same proposal have only one winner',async()=>{
 const f=fixture();const rs=await Promise.allSettled([
  f.gateway.commit('VIGUERAS','INV_1','CMD_2'),
  f.gateway.commit('VIGUERAS','INV_1','CMD_3')
 ]);
 assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(rs.filter(x=>x.status==='rejected').length,1);
 assert.equal(Object.keys(f.state.events).length,1);
 assert.notEqual(f.state.proposals.PROP_1.state,'pendiente');
});
test('two concurrent same commands produce one receipt and one event',async()=>{
 const f=fixture();const rs=await Promise.all(Array.from({length:9},
  ()=>f.gateway.commit('FRAN','INV_1','CMD_1')));
 assert.equal(rs.filter(x=>x.status==='committed').length,1);
 assert.equal(rs.filter(x=>x.status==='already_committed').length,8);
 assert.equal(Object.keys(f.state.events).length,1);
});
test('separate cells commit sequentially without lost updates',async()=>{
 const f=fixture();
 f.mutate(s=>{s.commands.CMD_4={
  referenceId:'CMD_4',op:'EDIT_RIEGO',invId:'INV_1',
  actorName:'FRAN',actorUid:U('FRAN'),expectedEpoch:4,
  cellKey:'CELL_3',expectedText:'50 MIN',nextText:'55 MIN'}});
 const rs=await Promise.all([
  f.gateway.commit('FRAN','INV_1','CMD_1'),
  f.gateway.commit('FRAN','INV_1','CMD_4')
 ]);
 assert.equal(rs.filter(x=>x.status==='committed').length,2);
 assert.equal(f.state.grid.CELL_1,'32 MIN');
 assert.equal(f.state.grid.CELL_3,'55 MIN');
 assert.equal(Object.keys(f.state.events).length,2);
});
test('authority changes after a committed action deny new advisory proof',async()=>{
 const f=fixture();await f.gateway.commit('FRAN','INV_1','CMD_1');
 f.mutate(s=>{s.actors.FRAN.active=false});
 await deny(f.gateway.preflight('FRAN','INV_1','CMD_1'),'ACTOR_REVOKED_AT_COMMIT');
});
test('response lost after CAS must reconcile receipt without duplicate event',async()=>{
 const f=fixture({fail:'after'});
 const out=await f.gateway.commit('FRAN','INV_1','CMD_1');
 assert.equal(out.status,'committed_recovered');
 assert.equal(Object.keys(f.state.events).length,1);
 assert.equal(f.state.grid.CELL_1,'32 MIN');
});
test('crash before CAS produces no business change or outbox',async()=>{
 const f=fixture({fail:'before'});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'FAILED_BEFORE_WRITE');
 assert.equal(f.state.grid.CELL_1,'30 MIN');
 assert.equal(Object.keys(f.state.events).length,0);
});
test('CAS conflicts exhaust bounded retries without partial data',async()=>{
 const f=fixture({fail:'always-conflict',maxAttempts:3});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'ATOMIC_CAS_RETRIES_EXHAUSTED');
 assert.equal(f.calls,3);
 assert.equal(Object.keys(f.state.events).length,0);
});
test('malformed, replayed or injected command references are denied',async()=>{
 const f=fixture();
 await deny(f.gateway.commit('FRAN','INV_1',{referenceId:'CMD_1',role:'ADMIN'}),
  'INVALID_COMMAND_REFERENCE');
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1?target=VIGUERAS'),
  'INVALID_COMMAND_REFERENCE');
 await deny(f.gateway.commit('FRAN','INV_1','NOT_PRESENT'),
  'UNTRUSTED_OR_UNKNOWN_COMMAND');
});
test('identity from one account cannot commit a command for another',async()=>{
 const f=fixture();
 await deny(f.gateway.commit('DENNIS','INV_1','CMD_1'),
  'UNTRUSTED_OR_UNKNOWN_COMMAND');
 await deny(f.gateway.commit('BAD_TOKEN','INV_1','CMD_1'),'UNAUTHORIZED');
});
test('corrupt aggregate is rejected rather than silently recreated',async()=>{
 const f=fixture();f.mutate(s=>{s.grid=null});
 await deny(f.gateway.commit('FRAN','INV_1','CMD_1'),'INVALID_ATOMIC_AUTHORITY_STATE');
});
test('no operational endpoint or Push method is exposed',()=>{
 const f=fixture();
 for(const k of ['deploy','sendPush','writeFirebaseLive','grantBrowserWrite'])
  assert.equal(typeof f.gateway[k],'undefined');
});
