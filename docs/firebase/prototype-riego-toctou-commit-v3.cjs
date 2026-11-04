'use strict';
// §0.240 — SYNTHETIC TOCTOU RACE PROTOTYPE ONLY: no production auth or writes.
// Security properties hold only if account/assignment/fence/proposal changes
// AND command commits are serialized through this SAME RTDB aggregate CAS.
// Real lasala-roles-v1, users, proposals and riego roots are SEPARATE.
// Therefore this MUST NEVER be deployed or claimed to fix live revocation.
const crypto=require('node:crypto');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {prepareEnvelope}=require('./prototype-atomic-event-ledger-v2.cjs');
const ROOT='lasala-riego-toctou-demo-v3';
const SCHEMA='lasala-riego-toctou/demo-v1';
const NAME=/^[A-Z0-9._ -]{1,80}$/, ID=/^[A-Za-z0-9_-]{1,140}$/;
const safeId=x=>typeof x==='string'&&ID.test(x)&&
 !['__proto__','prototype','constructor'].includes(x);
const safeName=x=>typeof x==='string'&&NAME.test(x)&&x===x.trim()&&
 !['__PROTO__','PROTOTYPE','CONSTRUCTOR'].includes(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const hash=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
const err=code=>{throw Object.assign(new Error(code),{code})};
const kind={EDIT_RIEGO:'riego_validado_modificado',
 ACCEPT_PROPOSAL:'riego_propuesta_aceptada',
 REJECT_PROPOSAL:'riego_propuesta_rechazada'};
function inspectAggregate(s,invId){
 if(!obj(s)||s.schema!==SCHEMA||s.invId!==invId||
    !Number.isSafeInteger(s.version)||s.version<1||
    !obj(s.fence)||!Number.isSafeInteger(s.fence.epoch)||
    s.fence.epoch<0||typeof s.fence.phase!=='string'||
    !obj(s.catalog)||!obj(s.actors)||!obj(s.grid)||
    !obj(s.proposals)||!obj(s.commands)||
    !(obj(s.receipts)||(s.version===1&&s.receipts===undefined))||
    !(obj(s.events)||(s.version===1&&s.events===undefined)))
  err('INVALID_ATOMIC_AUTHORITY_STATE');
}
function checkCommitted(s,actor,commandId){
 const receipt=s.receipts?.[commandId];
 if(!obj(receipt)||receipt.actorUid!==actor.uid||
    typeof receipt.eventId!=='string'||
    !obj(s.events?.[receipt.eventId])||
    s.events[receipt.eventId].source.actorUid!==actor.uid)
  err('COMMIT_RECEIPT_INVALID');
 return receipt.eventId;
}
function checkReady(s,identity,commandId){
 if(!safeName(identity?.appUser)||
    identity?.uid!==uidForName(identity.appUser))err('INVALID_VERIFIED_IDENTITY');
 const cmd=s.commands[commandId];
 if(!obj(cmd)||cmd.referenceId!==commandId||cmd.invId!==s.invId||
    cmd.actorName!==identity.appUser||cmd.actorUid!==identity.uid||
    !Object.hasOwn(kind,cmd.op)||!safeId(cmd.cellKey)||
    typeof cmd.expectedText!=='string'||
    typeof cmd.nextText!=='string'||cmd.nextText.length>250)
  err('UNTRUSTED_OR_UNKNOWN_COMMAND');
 const actor=s.actors[identity.appUser];
 if(!obj(actor)||actor.uid!==identity.uid||
    actor.active!==true||actor.managerApproved!==true||
    actor.canWriteRiego!==true||
    !Array.isArray(actor.allowedInvIds)||
    !actor.allowedInvIds.includes(s.invId)||
    !['ADMIN','TECNICO'].includes(actor.role))
   err('ACTOR_REVOKED_AT_COMMIT');
 if(cmd.op==='EDIT_RIEGO'&&
    !['ADMIN','TECNICO'].includes(actor.role))
   err('ROLE_REVOKED_AT_COMMIT');
 if(['ACCEPT_PROPOSAL','REJECT_PROPOSAL'].includes(cmd.op)&&
    !(identity.appUser==='VIGUERAS'&&actor.role==='ADMIN'))
   err('SUPERVISOR_REVOKED_AT_COMMIT');
 if(s.catalog.active!==true||s.catalog.managerApproved!==true||
    !/^sala[1-5]$/.test(s.catalog.sala))
   err('INVERNADERO_REVOKED_AT_COMMIT');
 if(s.fence.phase!=='v3_active')err('FENCE_NOT_ACTIVE_AT_COMMIT');
 if(!Number.isSafeInteger(cmd.expectedEpoch)||cmd.expectedEpoch!==s.fence.epoch)
   err('EPOCH_CHANGED_BEFORE_COMMIT');
 const receipt=s.receipts?.[commandId];
 if(receipt!==undefined){
  const eventId=checkCommitted(s,actor,commandId);
  return {cmd,actor,eventId,already:true};
 }
 const current=Object.hasOwn(s.grid,cmd.cellKey)?s.grid[cmd.cellKey]:null;
 if(current!==cmd.expectedText)err('RIEGO_CHANGED_BEFORE_COMMIT');
 if(cmd.op!=='EDIT_RIEGO'){
  const proposal=s.proposals[cmd.proposalId];
  if(!obj(proposal)||proposal.state!=='pendiente'||
     proposal.invId!==s.invId||proposal.cellKey!==cmd.cellKey||
     proposal.originalProposerUid!==uidForName(proposal.originalProposerName)||
     !safeName(proposal.originalProposerName)||
     !obj(s.actors[proposal.originalProposerName])||
     s.actors[proposal.originalProposerName].active!==true)
    err('PROPOSAL_CHANGED_BEFORE_COMMIT');
  if(cmd.op==='ACCEPT_PROPOSAL'&&
     (cmd.nextText!==proposal.proposedText||current!=='?'))
    err('PROPOSAL_BUSINESS_PRECONDITION_FAILED');
  if(cmd.op==='REJECT_PROPOSAL'&&
     (cmd.nextText!==cmd.expectedText||current!=='?'))
    err('PROPOSAL_BUSINESS_PRECONDITION_FAILED');
 }
 return {cmd,actor,already:false};
}
function createDemoAtomicRevalidationGateway({
 transport,auth,now=()=>new Date(),maxAttempts=6
}={}){
 if(typeof transport?.retrieve!=='function'||
    typeof transport?.compareAndSwap!=='function'||
    typeof auth?.verifyIdentity!=='function'||
    typeof now!=='function'||
    !Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>12)
  throw new TypeError('TRUSTED_DEMO_DEPENDENCIES_REQUIRED');
 async function identify(token){
  const identity=await auth.verifyIdentity(token);
  if(!safeName(identity?.appUser)||
     identity.uid!==uidForName(identity.appUser))
   err('INVALID_VERIFIED_IDENTITY');
  return identity;
 }
 async function preflight(token,invId,commandId){
  if(!safeId(invId)||!safeId(commandId))err('INVALID_COMMAND_REFERENCE');
  const identity=await identify(token);
  const {value}=await transport.retrieve([ROOT,invId]);
  inspectAggregate(value,invId);
  const check=checkReady(value,identity,commandId);
  return Object.freeze({advisoryOnly:true,authorized:true,
    commandId,invId,phase:value.fence.phase,epoch:value.fence.epoch,
    version:value.version,already:check.already,
    cannotBeUsedAsWriteCapability:true});
 }
 async function commit(token,invId,commandId){
  if(!safeId(invId)||!safeId(commandId))err('INVALID_COMMAND_REFERENCE');
  const identity=await identify(token);
  const path=[ROOT,invId];
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const reading=await transport.retrieve(path,true);
   if(typeof reading?.etag!=='string'||!reading.etag)err('MISSING_ATOMIC_ETAG');
   inspectAggregate(reading.value,invId);
   const s=reading.value;
   const {cmd,actor,already,eventId:existingId}=checkReady(s,identity,commandId);
   if(already)return Object.freeze({status:'already_committed',
     eventId:existingId,attempt});
   const stamp=now();
   if(!(stamp instanceof Date)||!Number.isFinite(stamp.getTime()))
    err('INVALID_SERVER_TIME');
   const next=clone(s);
   next.events={...(s.events||{})};next.receipts={...(s.receipts||{})};
   if(cmd.op==='ACCEPT_PROPOSAL')next.grid[cmd.cellKey]=cmd.nextText;
   if(cmd.op==='EDIT_RIEGO')next.grid[cmd.cellKey]=cmd.nextText;
   if(cmd.op!=='EDIT_RIEGO')next.proposals[cmd.proposalId].state=
      cmd.op==='REJECT_PROPOSAL'?'rechazada':'aceptada';
   const eventKind=kind[cmd.op];
   const proposer=s.proposals[cmd.proposalId];
   const recipient=cmd.op==='EDIT_RIEGO'?'VIGUERAS':proposer.originalProposerName;
   const recipientAccount=s.actors[recipient];
   if(!obj(recipientAccount)||recipientAccount.active!==true||
      recipientAccount.uid!==uidForName(recipient))
    err('RECIPIENT_REVOKED_AT_COMMIT');
   const proof=hash(JSON.stringify({commandId,actorUid:identity.uid,
     epoch:s.fence.epoch,version:s.version,after:next.grid[cmd.cellKey],
     proposalId:cmd.proposalId||null}));
   const src={id:commandId,kind:eventKind,revision:s.version+1,
     actorUid:identity.uid,sourceAuthority:'server-committed-v1',
     persisted:true,transitionCommitted:true,serverVerified:true,
     committedAtUtc:stamp.toISOString(),businessProofDigest:proof};
   const plan={idempotencyKey:[src.kind,src.id,src.revision].join(':'),
     actorUid:identity.uid,recipientUids:[recipientAccount.uid],outboxRequired:true};
   const event=prepareEnvelope(plan,src,stamp);
   next.events[event.eventId]=event;
   next.receipts[commandId]={eventId:event.eventId,actorUid:identity.uid};
   next.version++;
   try{
    const ok=await transport.compareAndSwap(path,s.version,next);
    if(ok===true)return Object.freeze({status:'committed',eventId:event.eventId,attempt});
    if(ok!==false)err('INVALID_ATOMIC_CAS_RESULT');
   }catch(ex){
    // A lost response after a successful write is reconciled, never re-issued blindly.
    const latest=(await transport.retrieve(path)).value;
    inspectAggregate(latest,invId);
    if(latest.receipts?.[commandId]!==undefined){
     checkReady(latest,identity,commandId);
     return Object.freeze({status:'committed_recovered',
       eventId:latest.receipts[commandId].eventId,attempt});
    }
    throw ex;
   }
  }
  err('ATOMIC_CAS_RETRIES_EXHAUSTED');
 }
 return Object.freeze({preflight,commit});
}
module.exports={ROOT,SCHEMA,createDemoAtomicRevalidationGateway};
