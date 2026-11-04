'use strict';
// §0.237 — PURE SYNTHETIC PER-INV WRITER FENCE; NEVER DEPLOY AS-IS.
// IMPORTANT: legacy index.html writes directly to lasala-riego-v2-<INV>.
// A separate fence token CANNOT block legacy browser writers. Before any
// real migration all old paths must be made read-only and old/offline clients
// rejected at the enforced write boundary; this prototype provides NO such gate.
const crypto=require('node:crypto');
const ROOT='lasala-riego-freeze-demo-v3';
const SCHEMA='lasala-freeze/demo-v1';
const PHASES=Object.freeze(['legacy','freezing','frozen','v3_active','rollback_hold']);
const OPS=Object.freeze(['FREEZE','CONFIRM_FROZEN','ACTIVATE_V3','WRITE_V3',
  'LEGACY_WRITE','ROLLBACK_HOLD','RETURN_LEGACY']);
const ID=/^[A-Za-z0-9_-]{1,140}$/;
const HASH=/^[a-f0-9]{64}$/;
const KEY=/^[A-Za-z0-9_|-]{1,140}$/;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const valid=x=>typeof x==='string'&&ID.test(x)&&
 !['__proto__','constructor','prototype'].includes(x);
const fail=code=>{throw Object.assign(new Error(code),{code})};
const copy=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
function initial(invId,grid={}){
 if(!valid(invId)||!plain(grid)||Object.keys(grid).some(k=>
    !KEY.test(k)||typeof grid[k]!=='string'))
  fail('INVALID_INITIAL_STATE');
 return {schema:SCHEMA,invId,phase:'legacy',version:1,epoch:0,
   v3Writes:0,grid:copy(grid),receipts:{}};
}
function check(s,invId){
 if(!plain(s)||s.schema!==SCHEMA||s.invId!==invId||
   !PHASES.includes(s.phase)||!Number.isSafeInteger(s.version)||s.version<1||
   !Number.isSafeInteger(s.epoch)||s.epoch<0||
   !Number.isSafeInteger(s.v3Writes)||s.v3Writes<0||
   !plain(s.grid)||
   !(plain(s.receipts)||(s.version===1&&s.receipts===undefined)))
    fail('INVALID_FENCE_STATE');
}
function validateRequest(request){
 if(!plain(request)||Object.keys(request).sort().join('|')!==
   'commandId|expectedEpoch|invId|op'||!valid(request.invId)||
   !valid(request.commandId)||!OPS.includes(request.op)||
   !Number.isSafeInteger(request.expectedEpoch)||request.expectedEpoch<0)
   fail('INVALID_FENCE_COMMAND');
}
function requireProof(p){
 if(!plain(p)||p.serverVerified!==true||p.managerApproved!==true||
    p.realtimeFenceEnforced!==true)fail('WRITER_FENCE_NOT_VERIFIED');
}
function readiness(p,op){
 // All flags here are MOCK server evidence, not client-provided authorization.
 if(op==='CONFIRM_FROZEN'||op==='ACTIVATE_V3'){
  if(p.legacyRoutesBlocked!==true||p.offlineDevicesReconciled!==true||
    p.inFlightWritersDrained!==true||p.sourceEtagsRechecked!==true||
    p.snapshotRestorable!==true)fail('CUTOVER_GATES_NOT_VERIFIED');
 }
 if(op==='RETURN_LEGACY'){
  if(p.legacyReturnRoutesReady!==true||p.inFlightWritersDrained!==true||
      p.offlineDevicesReconciled!==true||p.sourceEtagsRechecked!==true)
   fail('ROLLBACK_GATES_NOT_VERIFIED');
 }
}
function allowed(phase,op){
 const transition={
  legacy:['FREEZE','LEGACY_WRITE'],
  freezing:['CONFIRM_FROZEN','RETURN_LEGACY'],
  frozen:['ACTIVATE_V3','RETURN_LEGACY'],
  v3_active:['WRITE_V3','ROLLBACK_HOLD'],
  rollback_hold:['RETURN_LEGACY']
 };
 return transition[phase].includes(op);
}
function createDemoFreezeProtocol({
 transport,loadTrustedProof,loadTrustedMutation,now=()=>new Date(),maxAttempts=7
}={}){
 if(typeof transport?.retrieve!=='function'||
    typeof transport?.compareAndSwap!=='function'||
    typeof loadTrustedProof!=='function'||
    typeof loadTrustedMutation!=='function'||
    typeof now!=='function'||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>15)
   throw new TypeError('TRUSTED_SYNTHETIC_DEPENDENCIES_REQUIRED');
 async function run(request){
  validateRequest(request);
  const {invId,op,commandId,expectedEpoch}=request;
  const path=[ROOT,invId];
  // Trust proof MUST be fetched afresh for each attempt, including retries.
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const read=await transport.retrieve(path,true);
   if(!read||typeof read.etag!=='string'||!read.etag)
    fail('MISSING_FENCE_ETAG');
   check(read.value,invId);
   const state=read.value;
   const proof=await loadTrustedProof({invId,op,commandId,epoch:state.epoch});
   requireProof(proof);
   // Never trust mutation payload supplied as an extra request parameter.
   let mutation;
   if(op==='WRITE_V3'||op==='LEGACY_WRITE'){
    mutation=await loadTrustedMutation({invId,commandId,op});
    if(!plain(mutation)||!KEY.test(mutation.cellKey||'')||
       !HASH.test(mutation.baseHash||'')||typeof mutation.nextValue!=='string'||
       mutation.nextValue.length>250||
       mutation.nextValue.length===0||mutation.serverVerified!==true)
      fail('UNVERIFIED_MUTATION');
   }
   const fingerprint=hash(JSON.stringify([invId,op,commandId,expectedEpoch,
     mutation?[mutation.cellKey,mutation.baseHash,mutation.nextValue]:null]));
   const receipt=state.receipts?.[commandId];
   if(receipt!==undefined){
    if(!plain(receipt)||receipt.fingerprint!==fingerprint||
       typeof receipt.resultPhase!=='string')fail('FENCE_COMMAND_REUSE');
    return {status:'already_committed',phase:state.phase,epoch:state.epoch,
      attempt,commandId};
   }
   if(state.epoch!==expectedEpoch)fail('STALE_FENCE_EPOCH');
   if(!allowed(state.phase,op))fail('FENCE_TRANSITION_DENIED');
   readiness(proof,op);
   if(op==='RETURN_LEGACY'&&state.v3Writes>0&&
      !(state.phase==='rollback_hold'&&proof.verifiedReplayToLegacy===true&&
        proof.parityAfterReplay===true&&proof.receiptsReconciled===true))
    fail('ROLLBACK_REPLAY_REQUIRED');
   const next=copy(state);
   next.receipts={...(state.receipts||{})};
   if(op==='FREEZE'){next.phase='freezing';next.epoch++;}
   else if(op==='CONFIRM_FROZEN')next.phase='frozen';
   else if(op==='ACTIVATE_V3')next.phase='v3_active';
   else if(op==='ROLLBACK_HOLD')next.phase='rollback_hold';
   else if(op==='RETURN_LEGACY'){next.phase='legacy';next.epoch++;}
   else {
    const current=Object.hasOwn(next.grid,mutation.cellKey)?
      next.grid[mutation.cellKey]:null;
    if(hash(JSON.stringify(current))!==mutation.baseHash)
      fail('FENCE_CELL_CONFLICT');
    next.grid[mutation.cellKey]=mutation.nextValue;
    if(op==='WRITE_V3')next.v3Writes++;
   }
   next.version++;
   next.receipts[commandId]={fingerprint,resultPhase:next.phase,
     resultEpoch:next.epoch};
   const instant=now();
   if(!(instant instanceof Date)||!Number.isFinite(instant.getTime()))
     fail('INVALID_SYNTHETIC_TIME');
   next.changedAtUtc=instant.toISOString();
   try{
    const ok=await transport.compareAndSwap(path,state.version,next);
    if(ok===true)return {status:'committed',phase:next.phase,
      epoch:next.epoch,attempt,commandId};
    if(ok!==false)fail('INVALID_FENCE_CAS_RESULT');
   }catch(error){
    // A lost commit response must never trigger another transition or write.
    const fresh=(await transport.retrieve(path)).value;
    check(fresh,invId);
    if(fresh.receipts?.[commandId]?.fingerprint===fingerprint)
     return {status:'recovered',phase:fresh.phase,epoch:fresh.epoch,
       attempt,commandId};
    throw error;
   }
  }
  fail('FENCE_CAS_RETRIES_EXHAUSTED');
 }
 async function snapshot(invId){
  if(!valid(invId))fail('INVALID_INV');
  const data=(await transport.retrieve([ROOT,invId])).value;
  check(data,invId);
  return copy(data);
 }
 return Object.freeze({run,snapshot});
}
module.exports={ROOT,SCHEMA,PHASES,OPS,initial,createDemoFreezeProtocol};
