'use strict';
// ISOLATED PROTOTYPE ONLY — not an API route; no HTTP, Firebase or Cloudflare calls.
// Caller MUST obtain identity and current role/account state server-side, never from request body.
const crypto=require('node:crypto');
const ROLES=new Set(['ADMIN','TECNICO','REGANTE','PEON','CARGADOR']);
const USER=/^[A-Z0-9 ._-]{1,80}$/;
const ID=/^[A-Za-z0-9_-]{1,140}$/;
function denied(status,code){return Object.assign(new Error(code),{status,code})}
function check(ok,status,code){if(!ok)throw denied(status,code)}
function uidForName(name){
  check(typeof name==='string'&&USER.test(name)&&name===name.trim(),400,'INVALID_IDENTITY');
  return 'lasala-'+crypto.createHash('sha256').update(name,'utf8').digest('hex').slice(0,40);
}
function actor(context){
  check(context?.verified===true,401,'UNAUTHORIZED');
  check(context.active===true&&ROLES.has(context.role),403,'INACTIVE_OR_INVALID_ROLE');
  check(context.uid===uidForName(context.appUser),403,'IDENTITY_MISMATCH');
  return context;
}
const clone=v=>JSON.parse(JSON.stringify(v));
function ownAlerts(data,context){
  const uid=actor(context).uid;
  const rows=data?.[uid]||{};
  check(rows&&typeof rows==='object'&&!Array.isArray(rows),409,'INVALID_STORED_ALERTS');
  return clone(Object.fromEntries(Object.entries(rows).filter(([id,v])=>
    ID.test(id)&&v&&v.deleted!==true&&v.recipientUid===uid)));
}
function editOwnAlert(data,context,input){
  const a=actor(context);
  check(input&&typeof input==='object'&&!Array.isArray(input),400,'INVALID_REQUEST');
  check(Object.keys(input).every(k=>['id','action','expectedVersion','evaluation','notes'].includes(k)),400,'UNKNOWN_FIELD');
  check(typeof input.id==='string'&&ID.test(input.id),400,'INVALID_ALERT');
  check(Number.isSafeInteger(input.expectedVersion)&&input.expectedVersion>=1,400,'INVALID_VERSION');
  const original=data?.[a.uid]?.[input.id];
  check(original&&original.recipientUid===a.uid&&original.deleted!==true,404,'ALERT_NOT_FOUND');
  check(original.version===input.expectedVersion,409,'CONCURRENT_MODIFICATION');
  const next=clone(original);
  switch(input.action){
    case 'mark-seen':next.visto=true;break;
    case 'mark-read':next.leido=true;break;
    case 'dismiss':next.deleted=true;next.deletedReason='dismissed';break;
    case 'evaluate':
      check(a.role==='TECNICO',403,'FORBIDDEN');
      check(['bien','mal'].includes(input.evaluation),400,'INVALID_EVALUATION');
      check(typeof input.notes==='string'&&input.notes.length<=700,400,'INVALID_NOTES');
      next.evaluacion=input.evaluation;
      next.observaciones=input.notes;
      next.evaluadoPor=a.appUser;
      next.deleted=true;next.deletedReason='evaluated';
      break;
    case 'resolve':
      check(a.role==='TECNICO'&&next.tipo==='problema_ejecucion',403,'FORBIDDEN');
      check(typeof input.notes==='string'&&input.notes.trim().length>=1&&input.notes.length<=700,400,'INVALID_NOTES');
      next.resuelto=true;next.solucion=input.notes.trim();
      next.deleted=true;next.deletedReason='resolved';
      break;
    default:throw denied(400,'INVALID_ACTION');
  }
  next.version++;
  // Pure reducer: callers commit with ETag/if-match. No write can occur here.
  return {uid:a.uid,id:input.id,next};
}
const endpointId=(endpoint)=>crypto.createHash('sha256').update(endpoint,'utf8').digest('hex');
function validSubscription(sub){
  check(sub&&typeof sub==='object'&&!Array.isArray(sub),400,'INVALID_SUBSCRIPTION');
  check(typeof sub.endpoint==='string'&&sub.endpoint.length<=2048&&/^https:\/\//.test(sub.endpoint),400,'INVALID_ENDPOINT');
  check(typeof sub.keys?.auth==='string'&&sub.keys.auth.length>=8&&sub.keys.auth.length<=250,400,'INVALID_KEY');
  check(typeof sub.keys?.p256dh==='string'&&sub.keys.p256dh.length>=16&&sub.keys.p256dh.length<=250,400,'INVALID_KEY');
}
function registerPush(index,context,sub,{consented=false}={}){
  const a=actor(context);
  check(consented===true,403,'CONSENT_REQUIRED');
  validSubscription(sub);
  const id=endpointId(sub.endpoint),existing=index?.[id];
  // One endpoint, one owner. Explicit consent allows a secure transfer after account switch.
  return {id,entry:{uid:a.uid,subscription:clone(sub),version:(existing?.version||0)+1}};
}
function pushStatus(index,context,endpoint){
  const a=actor(context);
  check(typeof endpoint==='string'&&/^https:\/\//.test(endpoint),400,'INVALID_ENDPOINT');
  return index?.[endpointId(endpoint)]?.uid===a.uid;
}
function unregisterPush(index,context,endpoint){
  const a=actor(context);
  check(typeof endpoint==='string'&&/^https:\/\//.test(endpoint),400,'INVALID_ENDPOINT');
  const id=endpointId(endpoint),prior=index?.[id];
  check(!prior||prior.uid===a.uid,403,'FOREIGN_SUBSCRIPTION');
  return {id,delete:!!prior};
}
const EVENTS={
  riego_problema:{sender:['REGANTE'],ownerKey:'guardUid',title:'Problema de riego'},
  riego_resuelto:{sender:['TECNICO'],ownerKey:'reporterUid',title:'Problema de riego resuelto'},
  riego_propuesta:{sender:['TECNICO'],ownerKey:'supervisorUid',title:'Propuesta de riego'}
};
function prepareNotification(context,request,serverRecord){
  const a=actor(context);
  check(request&&typeof request==='object'&&!Array.isArray(request),400,'INVALID_EVENT');
  check(Object.keys(request).sort().join('|')==='kind|referenceId',400,'UNTRUSTED_EVENT_FIELDS');
  const event=EVENTS[request.kind];
  check(event&&event.sender.includes(a.role),403,'EVENT_FORBIDDEN');
  check(serverRecord?.id===request.referenceId&&typeof request.referenceId==='string'&&ID.test(request.referenceId),404,'EVENT_SOURCE_NOT_FOUND');
  // The ONLY source for the recipient is a record fetched/authorized by the server.
  // An actual API MUST additionally verify event ownership, rate limits and event idempotency.
  const recipientUid=serverRecord[event.ownerKey];
  check(typeof recipientUid==='string'&&/^lasala-[a-f0-9]{40}$/.test(recipientUid),409,'INVALID_RECIPIENT');
  return {recipientUid,title:event.title,kind:request.kind,referenceId:request.referenceId,actorUid:a.uid};
}
function verifyInternalSecret(authHeader,secret){
  check(typeof secret==='string'&&secret.length>=32,503,'SERVICE_SECRET_NOT_CONFIGURED');
  const a=Buffer.from(String(authHeader||''),'utf8');
  const b=Buffer.from('Bearer '+secret,'utf8');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
module.exports={uidForName,actor,ownAlerts,editOwnAlert,endpointId,registerPush,pushStatus,unregisterPush,prepareNotification,verifyInternalSecret};
