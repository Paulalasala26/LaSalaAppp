'use strict';
// §0.252: Firebase RTDB Emulator ONLY. Server-side two-phase revocation coordinator.
// Not a deployable API; no claims of instantaneous global Auth revocation.
const {ROOT}=require('./prototype-riego-gateway-emulator-v3.cjs');
const COORD='lasala-revocation-barrier-demo-v3';
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,140}$/.test(x)&&
 !['__proto__','prototype','constructor'].includes(x);
const err=code=>{throw Object.assign(new Error(code),{code})};
function createEmulatorRevocationBarrier({transport,maxAttempts=10}={}){
 if(process.env.FIREBASE_DATABASE_EMULATOR_HOST!=='127.0.0.1:9000'||
    process.env.FIREBASE_DATABASE_URL||process.env.FIREBASE_SERVICE_ACCOUNT_JSON||
    !transport||typeof transport.retrieve!=='function'||
    typeof transport.compareAndSwap!=='function')
  throw new Error('EMULATOR_ONLY');
 async function cas(path,prepare){
  for(let i=0;i<maxAttempts;i++){
   const read=await transport.retrieve(path,true);
   if(!read.etag)err('ETAG_REQUIRED');
   const result=prepare(read.value);
   if(result.done)return result.output;
   if(await transport.compareAndSwap(path,read.value?.version||0,result.next))
    return result.output;
  }
  err('CAS_EXHAUSTED');
 }
 const where=revId=>[COORD,revId];
 async function begin({revId,targetUid,invIds}){
  if(!id(revId)||!id(targetUid)||!Array.isArray(invIds)||!invIds.length||
     new Set(invIds).size!==invIds.length||invIds.some(x=>!id(x)))
   err('INVALID_SCOPE');
  const scope=[...invIds].sort();
  // Caller-supplied scope is synthetic: production MUST resolve trusted, complete INV roster.
  return cas(where(revId),s=>{
   if(s!==null){
    if(s.targetUid!==targetUid||JSON.stringify(s.invIds)!==JSON.stringify(scope))
     err('REVOCATION_CONFLICT');
    return {done:true,output:{status:s.phase,revId}};
   }
   return {next:{version:1,phase:'revoking',targetUid,invIds:scope,acks:{}},
     output:{status:'revoking',revId}};
  });
 }
 async function fence({revId,invId}){
  if(!id(revId)||!id(invId))err('INVALID_REFERENCE');
  const record=(await transport.retrieve(where(revId))).value;
  if(!record||!record.invIds?.includes(invId))err('INV_NOT_IN_SCOPE');
  const targetUid=record.targetUid;
  const result=await cas([ROOT,invId],s=>{
   if(!s||!s.acl?.[targetUid]||!s.fence||!Number.isInteger(s.version))
    err('INVALID_INV_AUTHORITY');
   if(s.revocationFences?.[revId]===targetUid)
    return {done:true,output:{status:'already_fenced',version:s.version}};
   const next=structuredClone(s);
   next.version++;
   next.fence.epoch++;
   next.acl[targetUid].active=false;
   next.revocationFences={...(s.revocationFences||{}),[revId]:targetUid};
   return {next,output:{status:'fenced',version:next.version}};
  });
  await cas(where(revId),s=>{
   if(!s||s.targetUid!==targetUid||!s.invIds.includes(invId))
    err('REVOCATION_CONFLICT');
   if(s.acks?.[invId])return {done:true,output:{status:'acknowledged'}};
   const next=structuredClone(s);next.version++;
   next.acks[invId]=true;
   return {next,output:{status:'acknowledged'}};
  });
  return result;
 }
 async function complete(revId){
  if(!id(revId))err('INVALID_REFERENCE');
  return cas(where(revId),s=>{
   if(!s)err('UNKNOWN_REVOCATION');
   if(s.phase==='completed')return {done:true,output:{status:'already_completed'}};
   if(s.invIds.some(inv=>s.acks?.[inv]!==true))err('BARRIER_INCOMPLETE');
   return {next:{...s,phase:'completed',version:s.version+1},
     output:{status:'completed'}};
  });
 }
 async function recover(revId){
  if(!id(revId))err('INVALID_REFERENCE');
  const s=(await transport.retrieve(where(revId))).value;
  if(!s)err('UNKNOWN_REVOCATION');
  return {phase:s.phase,pending:s.invIds.filter(inv=>!s.acks?.[inv])};
 }
 return Object.freeze({begin,fence,complete,recover});
}
module.exports={COORD,createEmulatorRevocationBarrier};
