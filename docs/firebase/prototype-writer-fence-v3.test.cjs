'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {ROOT,initial,createDemoFreezeProtocol}=require('./prototype-writer-fence-v3.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
const APPROVED=()=>({
 serverVerified:true,managerApproved:true,realtimeFenceEnforced:true,
 legacyRoutesBlocked:true,offlineDevicesReconciled:true,
 inFlightWritersDrained:true,sourceEtagsRechecked:true,snapshotRestorable:true,
 legacyReturnRoutesReady:true,verifiedReplayToLegacy:false,
 parityAfterReplay:false,receiptsReconciled:false
});
function fixture({phase='legacy',epoch=0,failMode=null,maxAttempts=7}={}){
 const a=initial('INV_1',{'2026-11-04|1':'30 MIN','2026-11-04|2':'40 MIN'});
 a.phase=phase;a.epoch=epoch;a.version=phase==='legacy'?1:3;
 const b=initial('INV_2',{'2026-11-04|1':'45 MIN'});
 const db=new Map([[ROOT+'/INV_1',clone(a)],[ROOT+'/INV_2',clone(b)]]);
 const proof=APPROVED(),mutations={};
 let writes=0,conflicts=0,reads=0;
 const transport={
  async retrieve(path,withEtag=false){
   reads++;const row=db.get(path.join('/'));
   return {value:row?clone(row):null,etag:withEtag?'"'+(row?.version??'null')+'"':undefined};
  },
  async compareAndSwap(path,expectedVersion,next){
   writes++;await Promise.resolve();
   if(failMode==='before')throw Object.assign(new Error('BEFORE_COMMIT'),{code:'BEFORE_COMMIT'});
   if(failMode==='always-conflict'){conflicts++;return false;}
   const key=path.join('/'),current=db.get(key);
   if(current.version!==expectedVersion){conflicts++;return false;}
   db.set(key,clone(next));
   if(failMode==='after')throw Object.assign(new Error('RESPONSE_LOST'),{code:'RESPONSE_LOST'});
   return true;
  }
 };
 const protocol=createDemoFreezeProtocol({
  transport,loadTrustedProof:async()=>clone(proof),
  loadTrustedMutation:async({commandId})=>mutations[commandId],
  maxAttempts,now:()=>new Date('2026-11-04T14:00:00Z')
 });
 const run=(op,commandId,epochNow=db.get(ROOT+'/INV_1').epoch,invId='INV_1')=>
  protocol.run({op,commandId,expectedEpoch:epochNow,invId});
 const mutation=(id,cellKey='2026-11-04|1',base='30 MIN',nextValue='35 MIN')=>{
  mutations[id]={cellKey,baseHash:digest(base),nextValue,serverVerified:true};
 };
 const state=(invId='INV_1')=>clone(db.get(ROOT+'/'+invId));
 return {proof,mutations,db,transport,protocol,run,mutation,state,
   get writes(){return writes},get conflicts(){return conflicts},get reads(){return reads}};
}
async function activated(f){
 await f.run('FREEZE','freeze_1',0);
 await f.run('CONFIRM_FROZEN','confirm_1',1);
 await f.run('ACTIVATE_V3','activate_1',1);
}
test('initial state is a per-inv legacy writer record with zero epoch',()=>{
 const s=initial('INV_1');
 assert.equal(s.phase,'legacy');assert.equal(s.epoch,0);
 assert.equal(s.v3Writes,0);assert.equal(s.version,1);
});
test('full synthetic freeze, confirm and activate follows strict state transitions',async()=>{
 const f=fixture();await activated(f);
 assert.equal(f.state().phase,'v3_active');
 assert.equal(f.state().epoch,1);
 assert.equal(f.state().v3Writes,0);
 assert.equal(f.writes,3);
});
test('freeze immediately fences gated legacy writes',async()=>{
 const f=fixture();f.mutation('legacy_1');
 await f.run('FREEZE','freeze_1',0);
 await assert.rejects(f.run('LEGACY_WRITE','legacy_1',1),{code:'FENCE_TRANSITION_DENIED'});
 assert.equal(f.state().grid['2026-11-04|1'],'30 MIN');
});
test('legacy mutation can commit only while phase is legacy',async()=>{
 const f=fixture();f.mutation('legacy_1');
 await f.run('LEGACY_WRITE','legacy_1',0);
 assert.equal(f.state().grid['2026-11-04|1'],'35 MIN');
 assert.equal(f.state().v3Writes,0);
});
test('v3 write forbidden before explicit activation',async()=>{
 const f=fixture();f.mutation('v3_1');
 await assert.rejects(f.run('WRITE_V3','v3_1',0),{code:'FENCE_TRANSITION_DENIED'});
});
test('frozen phase still blocks both legacy and v3 writes',async()=>{
 const f=fixture();
 await f.run('FREEZE','f',0);await f.run('CONFIRM_FROZEN','c',1);
 f.mutation('old');f.mutation('new');
 await assert.rejects(f.run('LEGACY_WRITE','old',1),{code:'FENCE_TRANSITION_DENIED'});
 await assert.rejects(f.run('WRITE_V3','new',1),{code:'FENCE_TRANSITION_DENIED'});
});
test('v3 writes require current epoch and update cell and receipt atomically',async()=>{
 const f=fixture();await activated(f);f.mutation('v3_1');
 const out=await f.run('WRITE_V3','v3_1',1);
 assert.equal(out.status,'committed');
 assert.equal(f.state().grid['2026-11-04|1'],'35 MIN');
 assert.equal(f.state().v3Writes,1);
 assert.ok(f.state().receipts.v3_1);
});
test('old epoch can never write after freeze',async()=>{
 const f=fixture();await activated(f);f.mutation('v3_1');
 await assert.rejects(f.run('WRITE_V3','v3_1',0),{code:'STALE_FENCE_EPOCH'});
});
test('fence epoch cannot be guessed or force-changed by extra request fields',async()=>{
 const f=fixture();
 await assert.rejects(f.protocol.run({
  op:'FREEZE',commandId:'f',invId:'INV_1',expectedEpoch:0,force:true
 }),{code:'INVALID_FENCE_COMMAND'});
});
test('unapproved manager never starts freeze',async()=>{
 const f=fixture();f.proof.managerApproved=false;
 await assert.rejects(f.run('FREEZE','f'),{code:'WRITER_FENCE_NOT_VERIFIED'});
 assert.equal(f.writes,0);
});
test('missing proof of enforced backend writer fence denies all operations',async()=>{
 const f=fixture();f.proof.realtimeFenceEnforced=false;
 await assert.rejects(f.run('FREEZE','f'),{code:'WRITER_FENCE_NOT_VERIFIED'});
});
test('stale legacy routes block freeze confirmation',async()=>{
 const f=fixture();await f.run('FREEZE','f',0);
 f.proof.legacyRoutesBlocked=false;
 await assert.rejects(f.run('CONFIRM_FROZEN','c',1),{code:'CUTOVER_GATES_NOT_VERIFIED'});
 assert.equal(f.state().phase,'freezing');
});
test('pending offline clients block freeze confirmation',async()=>{
 const f=fixture();await f.run('FREEZE','f',0);
 f.proof.offlineDevicesReconciled=false;
 await assert.rejects(f.run('CONFIRM_FROZEN','c',1),{code:'CUTOVER_GATES_NOT_VERIFIED'});
});
test('unsettled in-flight requests block freeze confirmation',async()=>{
 const f=fixture();await f.run('FREEZE','f',0);
 f.proof.inFlightWritersDrained=false;
 await assert.rejects(f.run('CONFIRM_FROZEN','c',1),{code:'CUTOVER_GATES_NOT_VERIFIED'});
});
test('stale ETags and missing backup block freeze confirmation',async()=>{
 const f=fixture();await f.run('FREEZE','f',0);
 f.proof.sourceEtagsRechecked=false;
 await assert.rejects(f.run('CONFIRM_FROZEN','c',1),{code:'CUTOVER_GATES_NOT_VERIFIED'});
 f.proof.sourceEtagsRechecked=true;f.proof.snapshotRestorable=false;
 await assert.rejects(f.run('CONFIRM_FROZEN','c2',1),{code:'CUTOVER_GATES_NOT_VERIFIED'});
});
test('cutover activation rechecks proof instead of trusting previous confirmation',async()=>{
 const f=fixture();await f.run('FREEZE','f',0);
 await f.run('CONFIRM_FROZEN','c',1);
 f.proof.legacyRoutesBlocked=false;
 await assert.rejects(f.run('ACTIVATE_V3','a',1),{code:'CUTOVER_GATES_NOT_VERIFIED'});
});
test('two concurrent same freeze command use one CAS and idempotent receipt',async()=>{
 const f=fixture();
 const rs=await Promise.all(Array.from({length:10},()=>f.run('FREEZE','f',0)));
 assert.equal(rs.filter(x=>x.status==='committed').length,1);
 assert.equal(rs.filter(x=>x.status==='already_committed').length,9);
 assert.equal(f.state().epoch,1);
 assert.equal(f.state().version,2);
});
test('two different concurrent freeze attempts cannot both win',async()=>{
 const f=fixture();
 const rs=await Promise.allSettled([
  f.run('FREEZE','f1',0),f.run('FREEZE','f2',0)
 ]);
 assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(rs.filter(x=>x.status==='rejected').length,1);
 assert.equal(f.state().epoch,1);
});
test('v3 command same ID retries without duplicate cell writes',async()=>{
 const f=fixture();await activated(f);f.mutation('w');
 await f.run('WRITE_V3','w',1);
 const count=f.writes,again=await f.run('WRITE_V3','w',1);
 assert.equal(again.status,'already_committed');
 assert.equal(f.writes,count);assert.equal(f.state().v3Writes,1);
});
test('same command ID with different cell content fails closed',async()=>{
 const f=fixture();await activated(f);f.mutation('w');
 await f.run('WRITE_V3','w',1);
 f.mutation('w','2026-11-04|1','30 MIN','99 MIN');
 await assert.rejects(f.run('WRITE_V3','w',1),{code:'FENCE_COMMAND_REUSE'});
});
test('two different writers racing on same cell cannot overwrite winner',async()=>{
 const f=fixture();await activated(f);
 f.mutation('w1','2026-11-04|1','30 MIN','35 MIN');
 f.mutation('w2','2026-11-04|1','30 MIN','38 MIN');
 const rs=await Promise.allSettled([
  f.run('WRITE_V3','w1',1),f.run('WRITE_V3','w2',1)
 ]);
 assert.equal(rs.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(rs.filter(x=>x.status==='rejected'&&x.reason.code==='FENCE_CELL_CONFLICT').length,1);
 assert.equal(f.state().v3Writes,1);
});
test('independent cells serialize via CAS without losing either write',async()=>{
 const f=fixture();await activated(f);
 f.mutation('w1','2026-11-04|1','30 MIN','35 MIN');
 f.mutation('w2','2026-11-04|2','40 MIN','45 MIN');
 const rs=await Promise.all([
  f.run('WRITE_V3','w1',1),f.run('WRITE_V3','w2',1)
 ]);
 assert.ok(rs.every(x=>x.status==='committed'));
 assert.equal(f.state().v3Writes,2);
 assert.equal(f.state().grid['2026-11-04|2'],'45 MIN');
});
test('freeze scope is isolated across invernaderos',async()=>{
 const f=fixture();await f.run('FREEZE','f',0);
 f.mutation('legacy_b','2026-11-04|1','45 MIN','50 MIN');
 await f.run('LEGACY_WRITE','legacy_b',0,'INV_2');
 assert.equal(f.state('INV_1').phase,'freezing');
 assert.equal(f.state('INV_2').grid['2026-11-04|1'],'50 MIN');
});
test('return to legacy before v3 activation requires rollback proof and increments epoch',async()=>{
 const f=fixture();await f.run('FREEZE','f',0);
 await f.run('CONFIRM_FROZEN','c',1);
 await f.run('RETURN_LEGACY','return',1);
 assert.equal(f.state().phase,'legacy');
 assert.equal(f.state().epoch,2);
 assert.equal(f.state().v3Writes,0);
});
test('direct return to legacy from active v3 is forbidden',async()=>{
 const f=fixture();await activated(f);
 await assert.rejects(f.run('RETURN_LEGACY','return',1),{code:'FENCE_TRANSITION_DENIED'});
});
test('rollback hold stops new v3 writes',async()=>{
 const f=fixture();await activated(f);
 await f.run('ROLLBACK_HOLD','hold',1);
 f.mutation('w');
 await assert.rejects(f.run('WRITE_V3','w',1),{code:'FENCE_TRANSITION_DENIED'});
});
test('v3 changes prohibit simple rollback without replay and parity attestation',async()=>{
 const f=fixture();await activated(f);f.mutation('w');
 await f.run('WRITE_V3','w',1);await f.run('ROLLBACK_HOLD','hold',1);
 await assert.rejects(f.run('RETURN_LEGACY','ret',1),{code:'ROLLBACK_REPLAY_REQUIRED'});
 assert.equal(f.state().phase,'rollback_hold');
});
test('rollback still denied when any one reconciliation proof is missing',async()=>{
 const f=fixture();await activated(f);f.mutation('w');
 await f.run('WRITE_V3','w',1);await f.run('ROLLBACK_HOLD','hold',1);
 f.proof.verifiedReplayToLegacy=true;
 f.proof.parityAfterReplay=true;
 await assert.rejects(f.run('RETURN_LEGACY','ret',1),{code:'ROLLBACK_REPLAY_REQUIRED'});
});
test('synthetic replay, parity and receipt proofs allow rollback while fencing old epoch',async()=>{
 const f=fixture();await activated(f);f.mutation('w');
 await f.run('WRITE_V3','w',1);await f.run('ROLLBACK_HOLD','hold',1);
 f.proof.verifiedReplayToLegacy=true;
 f.proof.parityAfterReplay=true;
 f.proof.receiptsReconciled=true;
 const done=await f.run('RETURN_LEGACY','ret',1);
 assert.equal(done.status,'committed');assert.equal(f.state().phase,'legacy');
 assert.equal(f.state().epoch,2);
 f.mutation('old','2026-11-04|2','40 MIN','60 MIN');
 await assert.rejects(f.run('LEGACY_WRITE','old',1),{code:'STALE_FENCE_EPOCH'});
 await f.run('LEGACY_WRITE','old',2);
 assert.equal(f.state().grid['2026-11-04|2'],'60 MIN');
});
test('rollback refuses outdated source ETag and unresolved offline reports',async()=>{
 const f=fixture();await activated(f);await f.run('ROLLBACK_HOLD','hold',1);
 f.proof.sourceEtagsRechecked=false;
 await assert.rejects(f.run('RETURN_LEGACY','ret',1),{code:'ROLLBACK_GATES_NOT_VERIFIED'});
 f.proof.sourceEtagsRechecked=true;
 f.proof.offlineDevicesReconciled=false;
 await assert.rejects(f.run('RETURN_LEGACY','ret2',1),{code:'ROLLBACK_GATES_NOT_VERIFIED'});
});
test('response lost after CAS is reconciled without repeating freeze',async()=>{
 const f=fixture({failMode:'after'});
 const r=await f.run('FREEZE','f',0);
 assert.equal(r.status,'recovered');
 assert.equal(f.state().phase,'freezing');assert.equal(f.state().epoch,1);
 const again=await f.run('FREEZE','f',0);
 assert.equal(again.status,'already_committed');assert.equal(f.state().version,2);
});
test('crash before CAS leaves state untouched',async()=>{
 const f=fixture({failMode:'before'});
 await assert.rejects(f.run('FREEZE','f',0),{code:'BEFORE_COMMIT'});
 assert.equal(f.state().phase,'legacy');assert.equal(f.state().epoch,0);
});
test('bounded ETag conflict retries fail without changing a state',async()=>{
 const f=fixture({failMode:'always-conflict',maxAttempts:3});
 await assert.rejects(f.run('FREEZE','f',0),{code:'FENCE_CAS_RETRIES_EXHAUSTED'});
 assert.equal(f.writes,3);assert.equal(f.state().version,1);
});
test('untrusted mutation and prototype key are rejected before any write',async()=>{
 const f=fixture();f.mutation('w');f.mutations.w.serverVerified=false;
 await assert.rejects(f.run('LEGACY_WRITE','w',0),{code:'UNVERIFIED_MUTATION'});
 f.mutation('w','__proto__','30 MIN','X');
 await assert.rejects(f.run('LEGACY_WRITE','w',0),{code:'UNVERIFIED_MUTATION'});
});
test('invalid request, ID or missing state fails closed',async()=>{
 const f=fixture();
 await assert.rejects(f.protocol.run({}),{code:'INVALID_FENCE_COMMAND'});
 await assert.rejects(f.run('FREEZE','f',0,'INV_MISSING'),{code:'INVALID_FENCE_STATE'});
});
test('no production actions, unfreeze API or Push dispatch are exposed',()=>{
 const f=fixture();
 assert.equal(typeof f.protocol.deploy,'undefined');
 assert.equal(typeof f.protocol.unfreezeRealRiego,'undefined');
 assert.equal(typeof f.protocol.sendPush,'undefined');
});
