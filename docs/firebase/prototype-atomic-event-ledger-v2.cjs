'use strict';
// §0.232 — ISOLATED DEMO ONLY. No API, no Push dispatch, no real Firebase.
// One RTDB child contains BOTH immutable source evidence and pending delivery
// instructions, inserted with ETag/If-Match on that one child.
// IMPORTANT: this is NOT atomic with the original irrigation business write;
// that transaction and trusted source construction remain to be designed.
const crypto=require('node:crypto');
const {events}=require('./prototype-event-authorization-v2.cjs');
const ROOT='lasala-alert-event-ledger-v2';
const SCHEMA='lasala-event-ledger/demo-v1';
const UID=/^lasala-[a-f0-9]{40}$/;
const ID=/^[A-Za-z0-9_-]{1,140}$/;
const HASH=/^[a-f0-9]{64}$/;
const KEYS=new Set(Object.keys(events));
function reject(code){throw Object.assign(new Error(code),{code});}
function plain(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function canonical(x){
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(plain(x))return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
 if(x===null||typeof x==='string'||typeof x==='number'||typeof x==='boolean')return JSON.stringify(x);
 reject('UNSUPPORTED_SNAPSHOT_VALUE');
}
const digest=x=>crypto.createHash('sha256').update(x,'utf8').digest('hex');
function prepareEnvelope(plan,source,now){
 if(!plain(plan)||!plain(source)||!(now instanceof Date)||!Number.isFinite(now.getTime()))
  reject('INVALID_SERVER_INPUT');
 if(plan.outboxRequired!==true||!UID.test(plan.actorUid||'')||
    !Array.isArray(plan.recipientUids)||plan.recipientUids.length<1||
    plan.recipientUids.length>2||
    plan.recipientUids.some(u=>!UID.test(u))||
    new Set(plan.recipientUids).size!==plan.recipientUids.length)
  reject('INVALID_AUTHORIZED_PLAN');
 if(!KEYS.has(source.kind)||!ID.test(source.id||'')||
    !Number.isSafeInteger(source.revision)||source.revision<1||
    source.actorUid!==plan.actorUid||
    source.sourceAuthority!=='server-committed-v1'||
    source.persisted!==true||source.transitionCommitted!==true||
    source.serverVerified!==true||!HASH.test(source.businessProofDigest||''))
  reject('UNVERIFIED_BUSINESS_SOURCE');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(source.committedAtUtc||'')||
    !Number.isFinite(Date.parse(source.committedAtUtc))||
    Date.parse(source.committedAtUtc)>now.getTime()+300000)
  reject('INVALID_SOURCE_TIMESTAMP');
 const key=[source.kind,source.id,source.revision].join(':');
 if(plan.idempotencyKey!==key)reject('PLAN_SOURCE_MISMATCH');
 const eventId='evt_'+digest(key);
 const snapshot=Object.freeze({
   id:source.id,kind:source.kind,revision:source.revision,
   actorUid:source.actorUid,committedAtUtc:source.committedAtUtc,
   businessProofDigest:source.businessProofDigest,
   sourceAuthority:source.sourceAuthority
 });
 const recipients=[...plan.recipientUids].sort();
 const fingerprint=digest(canonical({key,snapshot,recipients}));
 const deliveries=Object.fromEntries(recipients.map(uid=>
  [uid,{recipientUid:uid,status:'pending',attempts:0}]));
 return Object.freeze({
   schema:SCHEMA,version:1,eventId,
   idempotencyKey:key,fingerprint,
   source:snapshot,
   outbox:{status:'pending',deliveries},
   stagedAtUtc:now.toISOString()
 });
}
function createDemoAtomicEventLedger({transport,now=()=>new Date()}={}){
 if(typeof transport?.insertIfMissing!=='function'||typeof transport?.retrieve!=='function'||
    typeof now!=='function')throw new TypeError('TRUSTED_DEMO_TRANSPORT_REQUIRED');
 async function stage(plan,source){
  // plan and source must come from trusted SERVER callbacks, never an HTTP body.
  const document=prepareEnvelope(plan,source,now());
  const path=[ROOT,document.eventId];
  const created=await transport.insertIfMissing(path,document);
  if(created===true)return {result:'staged',eventId:document.eventId,recipientCount:plan.recipientUids.length};
  if(created!==false)reject('INVALID_CAS_RESULT');
  // Another writer won. Distinguish identical retry from key reuse/tampering.
  const existing=(await transport.retrieve(path)).value;
  if(!plain(existing)||existing.schema!==SCHEMA||
     existing.eventId!==document.eventId||
     existing.idempotencyKey!==document.idempotencyKey||
     existing.fingerprint!==document.fingerprint||
     !plain(existing.source)||!plain(existing.outbox)||
     digest(canonical({key:existing.idempotencyKey,snapshot:existing.source,
       recipients:Object.keys(existing.outbox.deliveries||{}).sort()}))!==document.fingerprint)
    reject('EVENT_KEY_CONFLICT');
  return {result:'already_staged',eventId:document.eventId,
    recipientCount:plan.recipientUids.length};
 }
 async function get(eventId){
  if(typeof eventId!=='string'||!/^evt_[a-f0-9]{64}$/.test(eventId))reject('INVALID_EVENT_ID');
  const {value}=await transport.retrieve([ROOT,eventId]);
  return value;
 }
 return Object.freeze({stage,get});
}
module.exports={ROOT,SCHEMA,prepareEnvelope,createDemoAtomicEventLedger};
