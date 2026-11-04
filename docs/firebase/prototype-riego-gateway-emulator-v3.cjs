'use strict';
// §0.243 — EXECUTABLE G2 GATEWAY AGAINST DISPOSABLE LOCAL RTDB EMULATOR ONLY.
// Not a deployed API. No client writes, Push, service accounts or production URLs.
// All mutations below use one versioned RTDB document per INV. The server-issued
// intents and grants are seeded only through the privileged emulator test adapter.
const crypto=require('node:crypto');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {prepareEnvelope}=require('./prototype-atomic-event-ledger-v2.cjs');
const ROOT='lasala-riego-authority-v3';
const SCHEMA='lasala-riego-authority/v1';
const ID=/^[A-Za-z0-9_-]{1,140}$/;
const UID=/^lasala-[a-f0-9]{40}$/;
const KINDS=Object.freeze({
 EDIT_RIEGO:'riego_validado_modificado',
 ACCEPT_PROPOSAL:'riego_propuesta_aceptada',
 REJECT_PROPOSAL:'riego_propuesta_rechazada'
});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const valid=x=>typeof x==='string'&&ID.test(x)&&
 !['__proto__','prototype','constructor'].includes(x);
const err=code=>{throw Object.assign(new Error(code),{code})};
const copy=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
function strictRequest(req,keys){
 if(!plain(req)||Object.keys(req).sort().join('|')!==keys.slice().sort().join('|'))
  err('UNTRUSTED_GATEWAY_REQUEST');
}
function ensureDemo(){
 if(process.env.FIREBASE_DATABASE_EMULATOR_HOST!=='127.0.0.1:9000'||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON||
    process.env.FIREBASE_DATABASE_URL)
  err('EMULATOR_ONLY_GATEWAY');
}
function structure(state,invId){
 if(!plain(state)||state.schema!==SCHEMA||state.invId!==invId||
    !Number.isSafeInteger(state.version)||state.version<1||
    !plain(state.acl)||!plain(state.fence)||
    !Number.isSafeInteger(state.fence.epoch)||state.fence.epoch<0||
    !['legacy','freezing','frozen','v3_active','rollback_hold'].includes(state.fence.phase)||
    !plain(state.catalog)||!plain(state.grid)||
    !plain(state.commands)||
    !(plain(state.proposals)||state.proposals===undefined)||
    !(plain(state.receipts)||state.receipts===undefined)||
    !(plain(state.events)||state.events===undefined)||
    !(plain(state.outbox)||state.outbox===undefined))
  err('INVALID_AUTHORITY_AGGREGATE');
}
function caller(state,identity,{admin=false}={}){
 if(typeof identity?.appUser!=='string'||!UID.test(identity?.uid||'')||
    identity.uid!==uidForName(identity.appUser))
  err('UNVERIFIED_IDENTITY');
 const a=state.acl[identity.uid];
 if(!plain(a)||a.appUser!==identity.appUser||a.active!==true||
    a.managerApproved!==true||!['TECNICO','ADMIN','REGANTE'].includes(a.role))
  err('ACTOR_REVOKED');
 if(admin&&!(identity.appUser==='VIGUERAS'&&a.role==='ADMIN'&&
    a.grantManager===true))err('GRANT_MANAGER_REQUIRED');
 return a;
}
function commandRules(s,identity,opId){
 const actor=caller(s,identity);
 const cmd=s.commands[opId];
 if(!plain(cmd)||cmd.id!==opId||cmd.invId!==s.invId||
    cmd.actorUid!==identity.uid||!Object.hasOwn(KINDS,cmd.op)||
    !valid(cmd.cellKey)||!Number.isSafeInteger(cmd.expectedEpoch)||
    cmd.expectedEpoch<0||typeof cmd.beforeText!=='string'||
    typeof cmd.afterText!=='string'||cmd.afterText.length>250)
  err('COMMAND_NOT_TRUSTED');
 if(s.catalog.active!==true||s.catalog.managerApproved!==true||
    !/^sala[1-5]$/.test(s.catalog.sala))
  err('INV_DISABLED');
 if(s.fence.phase!=='v3_active'||cmd.expectedEpoch!==s.fence.epoch)
  err('EPOCH_OR_FENCE_REVOKED');
 if(!Array.isArray(actor.ops)||!actor.ops.includes(cmd.op))err('OP_NOT_PERMITTED');
 if(cmd.op==='EDIT_RIEGO'&&!['TECNICO','ADMIN'].includes(actor.role))
  err('ROLE_DENIED');
 if(cmd.op!=='EDIT_RIEGO'&&
    !(identity.appUser==='VIGUERAS'&&actor.role==='ADMIN'))
  err('SUPERVISOR_DENIED');
 const fingerprint=hash(JSON.stringify(cmd));
 const receipt=s.receipts?.[opId];
 if(receipt!==undefined){
  if(!plain(receipt)||receipt.type!=='command'||
     receipt.actorUid!==identity.uid||receipt.fingerprint!==fingerprint||
     receipt.op!==cmd.op||receipt.status!=='committed')
   err('RECEIPT_CONFLICT');
  if(receipt.eventId!==null&&
     (!plain(s.events?.[receipt.eventId])||
      !plain(s.outbox?.[receipt.eventId])))
   err('RECEIPT_EVENT_INTEGRITY_FAILURE');
  return {cmd,actor,receipt,already:true,fingerprint};
 }
 const cell=s.grid[cmd.cellKey];
 if(!plain(cell)||cell.texto!==cmd.beforeText)err('BUSINESS_PRECONDITION_FAILED');
 if(cmd.op==='EDIT_RIEGO'&&cmd.afterText===cmd.beforeText)
  err('NO_CHANGE');
 let proposal=null;
 if(cmd.op!=='EDIT_RIEGO'){
  proposal=s.proposals?.[cmd.proposalId];
  if(!plain(proposal)||proposal.id!==cmd.proposalId||
     proposal.cellKey!==cmd.cellKey||proposal.state!=='pendiente'||
     !UID.test(proposal.proposerUid||'')||!plain(s.acl[proposal.proposerUid]))
   err('PROPOSAL_NOT_PENDING');
  if(cmd.beforeText!=='?'||cell.texto!=='?'||
     (cmd.op==='ACCEPT_PROPOSAL'&&cmd.afterText!==proposal.proposedText)||
     (cmd.op==='REJECT_PROPOSAL'&&cmd.afterText!=='?'))
   err('PROPOSAL_DATA_CONFLICT');
 }
 return {cmd,actor,proposal,already:false,fingerprint};
}
function createLocalRiegoGateway({transport,auth,now=()=>new Date(),maxAttempts=8}={}){
 ensureDemo();
 if(typeof transport?.retrieve!=='function'||
    typeof transport?.compareAndSwap!=='function'||
    typeof auth?.verifyIdentity!=='function'||
    typeof now!=='function'||!Number.isSafeInteger(maxAttempts)||
    maxAttempts<1||maxAttempts>12)
  throw new TypeError('TRUSTED_LOCAL_DEPENDENCIES_REQUIRED');
 async function identity(token){
  if(typeof token!=='string'||token.length<20)err('UNAUTHORIZED');
  return auth.verifyIdentity(token);
 }
 async function mutate(invId,id,token,prepare){
  if(!valid(invId)||!valid(id))err('INVALID_REFERENCE');
  const actor=await identity(token);
  const path=[ROOT,invId];
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const read=await transport.retrieve(path,true);
   if(typeof read?.etag!=='string'||!read.etag)err('ETAG_REQUIRED');
   structure(read.value,invId);
   const r=prepare(read.value,actor,id);
   if(r.already)return Object.freeze({status:'already_committed',...r.output});
   const updated=r.next;
   updated.version=read.value.version+1;
   try{
    const ok=await transport.compareAndSwap(path,read.value.version,updated);
    if(ok===true)return Object.freeze({status:'committed',...r.output});
    if(ok!==false)err('INVALID_CAS_RESULT');
   }catch(error){
    // Unknown ack: only a matching durable receipt may confirm the mutation.
    const after=(await transport.retrieve(path)).value;
    structure(after,invId);
    const receipt=after.receipts?.[id];
    if(plain(receipt)&&receipt.fingerprint===r.fingerprint&&
       receipt.actorUid===actor.uid&&
       (receipt.type==='command'?receipt.status==='committed':true))
      return Object.freeze({status:'recovered',...r.output});
    throw error;
   }
  }
  err('CAS_EXHAUSTED');
 }
 async function commit(request){
  strictRequest(request,['token','invId','commandId']);
  const {token,invId,commandId}=request;
  return mutate(invId,commandId,token,(s,actor,id)=>{
   const r=commandRules(s,actor,id);
   if(r.already)return {already:true,output:{eventId:r.receipt.eventId,
      revision:r.receipt.revision}};
   const {cmd,proposal}=r,instant=now();
   if(!(instant instanceof Date)||!Number.isFinite(instant.getTime()))
    err('INVALID_SERVER_TIME');
   const next=copy(s);
   next.receipts={...(s.receipts||{})};
   next.events={...(s.events||{})};next.outbox={...(s.outbox||{})};
   next.proposals={...(s.proposals||{})};
   const wasReviewed=s.grid[cmd.cellKey].revisadoPorVigueras===true;
   if(cmd.op!=='REJECT_PROPOSAL')
    next.grid[cmd.cellKey]={...s.grid[cmd.cellKey],
      texto:cmd.afterText,revisadoPorVigueras:false};
   if(proposal)next.proposals[proposal.id]={...proposal,
    state:cmd.op==='REJECT_PROPOSAL'?'rechazada':'aceptada'};
   // A normal edit only notifies if changing a previously validated cell.
   const eventNeeded=cmd.op!=='EDIT_RIEGO'||wasReviewed;
   let eventId=null;
   if(eventNeeded){
    const recipientUid=cmd.op==='EDIT_RIEGO'?
      uidForName('VIGUERAS'):proposal.proposerUid;
    const recipient=s.acl[recipientUid];
    if(!plain(recipient)||recipient.active!==true||
       recipient.managerApproved!==true||
       recipient.appUser!== (cmd.op==='EDIT_RIEGO'?'VIGUERAS':recipient.appUser))
     err('RECIPIENT_UNAVAILABLE');
    if(cmd.op==='EDIT_RIEGO'&&recipient.role!=='ADMIN')err('SUPERVISOR_UNAVAILABLE');
    const kind=KINDS[cmd.op];
    const source={kind,id,revision:s.version+1,actorUid:actor.uid,
      sourceAuthority:'server-committed-v1',persisted:true,
      transitionCommitted:true,serverVerified:true,
      committedAtUtc:instant.toISOString(),
      businessProofDigest:hash(JSON.stringify({id,invId,actorUid:actor.uid,
        before:s.grid[cmd.cellKey],after:next.grid[cmd.cellKey],
        proposal:proposal?next.proposals[proposal.id]:null,
        expectedEpoch:s.fence.epoch}))};
    const doc=prepareEnvelope({outboxRequired:true,actorUid:actor.uid,
      recipientUids:[recipientUid],
      idempotencyKey:[kind,id,source.revision].join(':')},source,instant);
    eventId=doc.eventId;
    if(next.events[eventId]||next.outbox[eventId])err('EVENT_COLLISION');
    next.events[eventId]={source:doc.source,idempotencyKey:doc.idempotencyKey,
      fingerprint:doc.fingerprint};
    next.outbox[eventId]=doc.outbox;
   }
   next.receipts[id]={type:'command',op:cmd.op,status:'committed',
     actorUid:actor.uid,fingerprint:r.fingerprint,eventId,
     revision:s.version+1};
   return {next,fingerprint:r.fingerprint,output:{eventId,revision:s.version+1}};
  });
 }
 async function revoke(request){
  strictRequest(request,['token','invId','targetUid','referenceId']);
  const {token,invId,targetUid,referenceId}=request;
  if(!UID.test(targetUid||''))err('INVALID_TARGET');
  return mutate(invId,referenceId,token,(s,identity,id)=>{
   caller(s,identity,{admin:true});
   const fingerprint=hash(JSON.stringify(['revoke',id,targetUid,identity.uid]));
   const receipt=s.receipts?.[id];
   if(receipt){
    if(receipt.type!=='revoke'||receipt.fingerprint!==fingerprint||
       receipt.actorUid!==identity.uid)err('RECEIPT_CONFLICT');
    return {already:true,output:{epoch:receipt.epoch}};
   }
   if(!plain(s.acl[targetUid])||s.acl[targetUid].active!==true)
    err('TARGET_NOT_ACTIVE');
   if(targetUid===identity.uid)err('CANNOT_REVOKE_SELF');
   const next=copy(s);next.receipts={...(s.receipts||{})};
   next.acl[targetUid]={...s.acl[targetUid],active:false};
   next.fence.epoch++;
   next.receipts[id]={type:'revoke',actorUid:identity.uid,
     targetUid,fingerprint,epoch:next.fence.epoch};
   return {next,fingerprint,output:{epoch:next.fence.epoch}};
  });
 }
 async function freeze(request){
  strictRequest(request,['token','invId','referenceId']);
  const {token,invId,referenceId}=request;
  return mutate(invId,referenceId,token,(s,identity,id)=>{
   caller(s,identity,{admin:true});
   const fingerprint=hash(JSON.stringify(['freeze',id,identity.uid]));
   const receipt=s.receipts?.[id];
   if(receipt){
    if(receipt.type!=='freeze'||receipt.fingerprint!==fingerprint||
       receipt.actorUid!==identity.uid)err('RECEIPT_CONFLICT');
    return {already:true,output:{epoch:receipt.epoch}};
   }
   if(s.fence.phase!=='v3_active')err('WRITER_NOT_ACTIVE');
   const next=copy(s);next.receipts={...(s.receipts||{})};
   next.fence.phase='frozen';next.fence.epoch++;
   next.receipts[id]={type:'freeze',actorUid:identity.uid,
     fingerprint,epoch:next.fence.epoch};
   return {next,fingerprint,output:{epoch:next.fence.epoch}};
  });
 }
 async function getReceipt(request){
  strictRequest(request,['token','invId','commandId']);
  const {token,invId,commandId}=request;
  if(!valid(invId)||!valid(commandId))err('INVALID_REFERENCE');
  const actor=await identity(token),{value}=await transport.retrieve([ROOT,invId]);
  structure(value,invId);
  caller(value,actor);
  const receipt=value.receipts?.[commandId];
  if(!plain(receipt)||receipt.type!=='command'||receipt.actorUid!==actor.uid)
   err('RECEIPT_NOT_FOUND');
  if(receipt.eventId!==null&&(!plain(value.events?.[receipt.eventId])||
     !plain(value.outbox?.[receipt.eventId])))err('RECEIPT_EVENT_INTEGRITY_FAILURE');
  return {status:receipt.status,eventId:receipt.eventId,revision:receipt.revision};
 }
 return Object.freeze({commit,revoke,freeze,getReceipt});
}
module.exports={ROOT,SCHEMA,createLocalRiegoGateway};
