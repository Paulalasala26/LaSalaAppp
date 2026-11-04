'use strict';
// §0.231 — DEMO/PROTOTYPE ONLY. No production endpoint, writes, deployment or Push.
// These server-owned event/catalog/assignment roots do NOT yet exist in production.
// A future trusted writer must create event records only after confirming the
// business transition. Merely putting a boolean in the browser is NEVER proof.
const ROOTS=Object.freeze({
 events:'lasala-alert-event-sources-v2',
 catalog:'lasala-invernaderos-catalog-v2',
 assignments:'lasala-event-permissions-v2'
});
const REGANTES=Object.freeze({
 REGANTE1:['sala1'],REGANTE2:['sala2'],REGANTE3:['sala3','sala4','sala5']
});
const kindSet=new Set(Object.keys(require('./prototype-event-authorization-v2.cjs').events));
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,140}$/.test(x);
const validName=x=>typeof x==='string'&&/^[A-Z0-9._ -]{1,80}$/.test(x)&&x.trim()===x;
const deny=code=>{throw Object.assign(new Error(code),{code})};
const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const formatMadrid=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'
});
function madridParts(date){
 if(!(date instanceof Date)||!Number.isFinite(date.getTime()))deny('INVALID_SERVER_TIME');
 const p=Object.fromEntries(formatMadrid.formatToParts(date).filter(p=>p.type!=='literal').map(x=>[x.type,x.value]));
 const day=p.year+'-'+p.month+'-'+p.day;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].includes(p.weekday))deny('BAD_MADRID_DATE');
 return {day,weekday:p.weekday,hour:Number(p.hour),minute:Number(p.minute)};
}
function guardiaAt(instant){
 const parts=madridParts(instant);
 // Civil Madrid dates converted to UTC midnights avoid DST clock shifts in week parity.
 const [y,m,d]=parts.day.split('-').map(Number);
 const elapsed=Math.round((Date.UTC(y,m-1,d)-Date.UTC(2026,6,27))/86400000);
 const week=Math.floor(elapsed/7);
 const even=week%2===0;
 const morning=even?'FRAN':'DENNIS';
 const afternoon=even?'DENNIS':'FRAN';
 const weekend=parts.weekday==='Sat'||parts.weekday==='Sun';
 const shift=weekend||parts.hour>=14?'tarde':'manana';
 return Object.freeze({name:shift==='manana'?morning:afternoon,
  shift,day:parts.day,weekday:parts.weekday,week});
}
function committedInstant(source,now){
 if(typeof source.committedAtUtc!=='string'||
   !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(source.committedAtUtc))
   deny('INVALID_COMMIT_TIME');
 const date=new Date(source.committedAtUtc);
 if(!Number.isFinite(date.getTime())||date.getTime()>now.getTime()+300000)deny('INVALID_COMMIT_TIME');
 return date;
}
function makeTrustedEventResolvers({transport,now=()=>new Date()}={}){
 if(typeof transport?.retrieve!=='function'||typeof now!=='function')throw new TypeError('BACKEND_TRANSPORT_REQUIRED');
 const retrieve=async segments=>{
  const result=await transport.retrieve(segments);
  return result?.value;
 };
 async function loadTrustedSource(request,actor){
  if(!record(request)||Object.keys(request).sort().join('|')!=='kind|referenceId'||
     !validId(request.referenceId)||!kindSet.has(request.kind))deny('BAD_EVENT_REFERENCE');
  if(!actor?.verified||!actor?.active||!actor?.uid)deny('UNVERIFIED_ACTOR');
  const raw=await retrieve([ROOTS.events,request.referenceId]);
  if(!record(raw)||raw.id!==request.referenceId||raw.kind!==request.kind||
     raw.actorUid!==actor.uid||raw.sourceAuthority!=='server-committed-v1'||
     raw.persisted!==true||raw.transitionCommitted!==true||
     !Number.isSafeInteger(raw.revision)||raw.revision<1)deny('UNVERIFIED_EVENT_SOURCE');
  const current=now();
  if(!(current instanceof Date)||!Number.isFinite(current.getTime()))deny('INVALID_SERVER_TIME');
  const at=committedInstant(raw,current);
  // Retain only the committed server event's fields. Nothing comes from request
  // except kind/referenceId; persisted source must be produced by trusted backend.
  const source={...raw,serverVerified:true};
  if(request.kind==='riego_problema_reportado'){
   const shift=guardiaAt(at);
   if(raw.workDateMadrid!==shift.day||raw.entriesVerifiedServer!==true)deny('PROBLEM_ENTRIES_NOT_VERIFIED');
   // A future server command must validate original irrigation cells and commit atomically.
   // A manually supplied guardName/target from the browser is not authoritative.
   source.serverGuardName=shift.name;
   source.guardCalculatedByServer=true;
   source.todayConfirmedByServer=true;
  }
  return Object.freeze(source);
 }
 async function resolveTrustedScope(actor,source){
  if(!actor?.verified||!validName(actor.name)||!record(source)||!source.serverVerified)deny('UNVERIFIED_SCOPE_SOURCE');
  const invIds=source.invIds;
  if(!Array.isArray(invIds)||new Set(invIds).size!==invIds.length||
      invIds.some(id=>!validId(id)))deny('INVALID_EVENT_INVERNADEROS');
  if(invIds.length===0&&source.kind!=='riego_hojas_corregidas')deny('EVENT_INV_REQUIRED');
  const [catalog,config]=await Promise.all([retrieve([ROOTS.catalog]),retrieve([ROOTS.assignments])]);
  if(!record(catalog)||catalog.schema!=='lasala-inv-catalog-v2'||
     !record(catalog.invernaderos)||!record(config)||config.schema!=='lasala-event-permissions-v2'||
     config.approvedByBackoffice!==true||!record(config.actors))deny('UNAPPROVED_SCOPE_CATALOG');
  if(config.guardOverrides&&Object.keys(config.guardOverrides).length)deny('UNAPPROVED_GUARD_OVERRIDES');
  const conf=config.actors[actor.name];
  if(!record(conf)||conf.approved!==true||conf.role!==actor.role)deny('ACTOR_SCOPE_NOT_APPROVED');
  if(!Array.isArray(conf.allowedInvIds)||!Array.isArray(conf.allowedSalas))deny('INVALID_ACTOR_ASSIGNMENT');
  const catalogRooms=new Map();
  for(const id of invIds){
   const entry=catalog.invernaderos[id];
   if(!record(entry)||entry.active!==true||!/^sala[1-5]$/.test(entry.sala))deny('UNKNOWN_OR_INACTIVE_INV');
   catalogRooms.set(id,entry.sala);
  }
  if(actor.role==='REGANTE'){
   const rooms=REGANTES[actor.name];
   if(!rooms||catalogRooms.size===0)deny('UNKNOWN_REGANTE');
   if([...catalogRooms.values()].some(room=>!rooms.includes(room)))deny('REGANTE_OUT_OF_SCOPE');
  }else if(!['ADMIN','TECNICO'].includes(actor.role))deny('ROLE_HAS_NO_RIEGO_SCOPE');
  // The manager's explicit server-side assignments apply to all roles, regantes too.
  if(invIds.some(id=>!conf.allowedInvIds.includes(id)&&!conf.allowedSalas.includes(catalogRooms.get(id))))
   deny('INV_NOT_ASSIGNED');
  if(source.kind==='riego_hojas_marcadas'&&
     (invIds.length===0||!['sala1','sala2'].includes(source.sala)||
      [...catalogRooms.values()].some(room=>room!==source.sala)))deny('MARKED_ROOM_MISMATCH');
  return Object.freeze({serverVerified:true,authorizedInvIds:Object.freeze([...invIds]),
    writerAuthorized:conf.canWriteRiego===true});
 }
 return Object.freeze({loadTrustedSource,resolveTrustedScope});
}
module.exports={ROOTS,REGANTES,madridParts,guardiaAt,makeTrustedEventResolvers};
