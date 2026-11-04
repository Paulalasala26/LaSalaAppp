'use strict';
// §0.233 — DEMO AGGREGATE ONLY. DO NOT DEPLOY.
// The active frontend stores lasala-riego-v2-<INV> as a JSON STRING and
// proposals/alerts at other paths. This synthetic object is NOT drop-in
// compatible with those roots. It demonstrates one CAS boundary for the
// business cell, committed source evidence and pending outbox together.
const crypto=require('node:crypto');
const {prepareEnvelope}=require('./prototype-atomic-event-ledger-v2.cjs');
const ROOT='lasala-riego-event-aggregate-demo-v2';
const SCHEMA='lasala-riego-command-aggregate/demo-v1';
const ID=/^[A-Za-z0-9_-]{1,140}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const UID=/^lasala-[a-f0-9]{40}$/;
const reject=code=>{throw Object.assign(new Error(code),{code})};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const sha=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
const canonical=x=>{
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(plain(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
 if(x===null||['string','number','boolean'].includes(typeof x))return JSON.stringify(x);
 reject('INVALID_CANONICAL_VALUE');
};
function checkAggregate(value,invId){
 if(!plain(value)||value.schema!==SCHEMA||value.invId!==invId||
   !Number.isSafeInteger(value.version)||value.version<1||
   !plain(value.grid)||
   !(plain(value.events)||(value.version===1&&value.events===undefined))||
   !(plain(value.commands)||(value.version===1&&value.commands===undefined)))
   reject('INVALID_AGGREGATE');
}
function trustedMutation(ref,cmd,permit){
 if(!ID.test(ref||'')||!plain(cmd)||cmd.id!==ref||
   cmd.kind!=='riego_validado_modificado'||!ID.test(cmd.invId||'')||
   !DAY.test(cmd.day||'')||!ID.test(cmd.lane||'')||
   typeof cmd.expectedText!=='string'||typeof cmd.nextText!=='string'||
   cmd.expectedText.length>250||cmd.nextText.length<1||
   cmd.nextText.length>250||cmd.expectedText===cmd.nextText)
   reject('INVALID_TRUSTED_COMMAND');
 if(!plain(permit)||permit.authorized!==true||permit.businessApproved!==true||
   !UID.test(permit.actorUid||'')||
   permit.actorUid!==cmd.actorUid||
   !Array.isArray(permit.authorizedInvIds)||
   !permit.authorizedInvIds.includes(cmd.invId)||
   !Array.isArray(permit.recipientUids)||
   permit.recipientUids.length!==1||
   permit.recipientUids.some(u=>!UID.test(u)))
   reject('COMMAND_NOT_AUTHORIZED');
 return sha(canonical({id:cmd.id,kind:cmd.kind,invId:cmd.invId,
   day:cmd.day,lane:cmd.lane,expectedText:cmd.expectedText,
   nextText:cmd.nextText,actorUid:cmd.actorUid,
   recipients:[...permit.recipientUids].sort()}));
}
function createDemoBusinessEventTransaction({
 transport,loadTrustedCommand,authorizeTrustedCommand,
 now=()=>new Date(),maxAttempts=5
}={}){
 if(!transport||typeof transport.retrieve!=='function'||
    typeof transport.compareAndSwap!=='function'||
    typeof loadTrustedCommand!=='function'||
    typeof authorizeTrustedCommand!=='function'||typeof now!=='function'||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)
    throw new TypeError('DEMO_TRUSTED_DEPENDENCIES_REQUIRED');
 async function execute(commandRef){
  if(!ID.test(commandRef||''))reject('INVALID_COMMAND_REFERENCE');
  // Only referenceId comes from requester. Identity, permissions, cell
  // mutation and destinations are produced by trusted backend collaborators.
  const cmd=await loadTrustedCommand(commandRef);
  const permit=await authorizeTrustedCommand(cmd);
  const fingerprint=trustedMutation(commandRef,cmd,permit);
  const path=[ROOT,cmd.invId];
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const read=await transport.retrieve(path,true);
   if(typeof read.etag!=='string'||!read.etag)reject('MISSING_ETAG');
   checkAggregate(read.value,cmd.invId);
   const existing=read.value.commands[cmd.id];
   if(existing!==undefined){
    if(!plain(existing)||existing.fingerprint!==fingerprint)reject('COMMAND_ID_REUSE');
    if(!ID.test(existing.eventId||'')||!plain(read.value.events[existing.eventId])||
       read.value.events[existing.eventId].idempotencyKey!==
       [cmd.kind,cmd.id,existing.eventRevision].join(':'))
      reject('BROKEN_COMMITTED_EVENT');
    return {status:'already_committed',eventId:existing.eventId,attempt};
   }
   const before=read.value.grid?.[cmd.day]?.[cmd.lane];
   if(!plain(before)||before.revisadoPorVigueras!==true||
      before.texto!==cmd.expectedText)
      reject('BUSINESS_PRECONDITION_FAILED');
   const instant=now();
   if(!(instant instanceof Date)||!Number.isFinite(instant.getTime()))
     reject('INVALID_SERVER_TIME');
   // RTDB removes empty object children, including events:{} and commands:{}.\n   // Only a pristine v1 aggregate may omit these; after first commit both must exist.\n   const next={...clone(read.value),events:clone(read.value.events||{}),\n     commands:clone(read.value.commands||{})};\n   const after={...before,texto:cmd.nextText,revisadoPorVigueras:false};
   next.grid[cmd.day]={...(next.grid[cmd.day]||{}),[cmd.lane]:after};
   const revision=next.version+1;
   // Source and envelope are built in-memory, BEFORE the single CAS. No
   // external call may publish this source before the CAS succeeds.
   const proof=sha(canonical({invId:cmd.invId,day:cmd.day,lane:cmd.lane,
      commandId:cmd.id,actorUid:cmd.actorUid,before,after}));
   const source={
    kind:cmd.kind,id:cmd.id,revision,actorUid:cmd.actorUid,
    sourceAuthority:'server-committed-v1',serverVerified:true,
    persisted:true,transitionCommitted:true,
    committedAtUtc:instant.toISOString(),businessProofDigest:proof
   };
   const plan={outboxRequired:true,actorUid:cmd.actorUid,
    recipientUids:[...permit.recipientUids],
    idempotencyKey:[source.kind,source.id,source.revision].join(':')};
   const event=prepareEnvelope(plan,source,instant);
   next.version=revision;
   if(next.events[event.eventId]!==undefined)reject('EVENT_COLLISION');
   next.events[event.eventId]=event;
   next.commands[cmd.id]={fingerprint,eventId:event.eventId,
     eventRevision:revision,actorUid:cmd.actorUid};
   try{
    const ok=await transport.compareAndSwap(path,read.value.version,next);
    if(ok===true)return {status:'committed',eventId:event.eventId,attempt};
    if(ok!==false)reject('INVALID_CAS_RESPONSE');
   }catch(error){
    // Unknown response after a write: read durable state. A post-commit
    // crash must not cause a second mutation or second alert on retry.
    const latest=await transport.retrieve(path);
    checkAggregate(latest.value,cmd.invId);
    const recovered=latest.value.commands[cmd.id];
    if(recovered){
     if(recovered.fingerprint!==fingerprint)reject('COMMAND_ID_REUSE');
     const saved=latest.value.events[recovered.eventId];
     if(!plain(saved)||saved.idempotencyKey!==
        [cmd.kind,cmd.id,recovered.eventRevision].join(':'))
       reject('BROKEN_COMMITTED_EVENT');
     return {status:'committed_recovered',eventId:recovered.eventId,attempt};
    }
    throw error;
   }
  }
  reject('CAS_RETRIES_EXHAUSTED');
 }
 return Object.freeze({execute});
}
module.exports={ROOT,SCHEMA,createDemoBusinessEventTransaction};
