'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {guardiaAt,madridParts,ROOTS,makeTrustedEventResolvers}=
 require('./prototype-event-resolvers-v2.cjs');
const {createEmulatorAuthorizationBridge}=require('./prototype-event-auth-bridge-v2.cjs');
const inverters={
 INV_1:{sala:'sala1',active:true},
 INV_2:{sala:'sala2',active:true},
 INV_3:{sala:'sala3',active:true},
 INV_4:{sala:'sala4',active:true},
 INV_5:{sala:'sala5',active:true}
};
const allowed={
 FRAN:{role:'TECNICO',approved:true,allowedInvIds:['INV_1'],allowedSalas:[],canWriteRiego:true},
 DENNIS:{role:'TECNICO',approved:true,allowedInvIds:[],allowedSalas:['sala1','sala2'],canWriteRiego:true},
 VIGUERAS:{role:'ADMIN',approved:true,allowedInvIds:[],allowedSalas:['sala1','sala2','sala3','sala4','sala5'],canWriteRiego:true},
 REGANTE1:{role:'REGANTE',approved:true,allowedInvIds:[],allowedSalas:['sala1'],canWriteRiego:true},
 REGANTE2:{role:'REGANTE',approved:true,allowedInvIds:[],allowedSalas:['sala2'],canWriteRiego:true},
 REGANTE3:{role:'REGANTE',approved:true,allowedInvIds:[],allowedSalas:['sala3','sala4','sala5'],canWriteRiego:true}
};
const roleName={FRAN:'TECNICO',DENNIS:'TECNICO',VIGUERAS:'ADMIN',
 REGANTE1:'REGANTE',REGANTE2:'REGANTE',REGANTE3:'REGANTE'};
function fixture(kind='riego_problema_reportado',name='REGANTE1'){
 const source={id:'EV_1',kind,actorUid:uidForName(name),
  sourceAuthority:'server-committed-v1',persisted:true,transitionCommitted:true,
  revision:1,committedAtUtc:'2026-07-27T11:59:59Z',
  workDateMadrid:'2026-07-27',entriesVerifiedServer:true,
  invIds:['INV_1'],sala:'sala1',markingConfirmed:true,originalWasQuestionMark:true,
  status:'pendiente',writtenByActor:true,validatedChangeCommitted:true,
  originalProposerName:'FRAN',originalReporterName:'REGANTE1',
  assignedTechnicianUid:uidForName('FRAN'),solutionCommitted:true,
  irrigationCommitted:true};
 const catalog={schema:'lasala-inv-catalog-v2',invernaderos:JSON.parse(JSON.stringify(inverters))};
 const config={schema:'lasala-event-permissions-v2',approvedByBackoffice:true,actors:JSON.parse(JSON.stringify(allowed))};
 const roles={...roleName},users=Object.fromEntries(Object.keys(roles).map(n=>[n,'a'.repeat(64)]));
 const requests=[];
 const transport={retrieve:async path=>{
  requests.push([...path]);
  const root=path[0];
  const data=root===ROOTS.events?source:root===ROOTS.catalog?catalog:
    root===ROOTS.assignments?config:root==='lasala-roles-v1'?roles:
    root==='lasala-users-v1'?users:null;
  return {value:data};
 }};
 const resolvers=makeTrustedEventResolvers({
  transport,now:()=>new Date('2026-11-04T13:00:00Z')
 });
 const actor={name,role:roles[name],uid:uidForName(name),verified:true,active:true};
 const request={kind,referenceId:'EV_1'};
 return {source,catalog,config,roles,users,transport,resolvers,actor,request,requests};
}
async function resolved(f){
 const source=await f.resolvers.loadTrustedSource(f.request,f.actor);
 const scope=await f.resolvers.resolveTrustedScope(f.actor,source);
 return {source,scope};
}
test('Madrid guard changes at 14:00 on the reference Monday',()=>{
 assert.equal(guardiaAt(new Date('2026-07-27T11:59:59Z')).name,'FRAN');
 assert.equal(guardiaAt(new Date('2026-07-27T12:00:00Z')).name,'DENNIS');
 assert.equal(guardiaAt(new Date('2026-07-27T12:00:00Z')).shift,'tarde');
});
test('weekly rotation alternates FRAN/DENNIS without local DST arithmetic',()=>{
 assert.equal(guardiaAt(new Date('2026-08-03T11:59:59Z')).name,'DENNIS');
 assert.equal(guardiaAt(new Date('2026-08-03T12:00:00Z')).name,'FRAN');
 assert.equal(guardiaAt(new Date('2026-08-10T11:59:59Z')).name,'FRAN');
});
test('weekends always use the afternoon technician',()=>{
 const sat=guardiaAt(new Date('2026-08-01T07:30:00Z'));
 const sun=guardiaAt(new Date('2026-08-02T07:30:00Z'));
 assert.equal(sat.name,'DENNIS');assert.equal(sun.name,'DENNIS');
 assert.equal(sat.shift,'tarde');assert.equal(sun.shift,'tarde');
});
test('DST changes in March and October honor Madrid local clock',()=>{
 const prev=madridParts(new Date('2026-03-29T00:30:00Z'));
 const after=madridParts(new Date('2026-03-29T01:30:00Z'));
 assert.equal(prev.hour,1);assert.equal(after.hour,3);
 const summer=madridParts(new Date('2026-10-25T00:30:00Z'));
 const winter=madridParts(new Date('2026-10-25T01:30:00Z'));
 assert.equal(summer.hour,2);assert.equal(winter.hour,2);
 assert.equal(guardiaAt(new Date('2026-10-26T12:59:59Z')).shift,'manana');
 assert.equal(guardiaAt(new Date('2026-10-26T13:00:00Z')).shift,'tarde');
});
test('cannot calculate guard from missing or malformed time',()=>{
 assert.throws(()=>guardiaAt(new Date('bad')),{code:'INVALID_SERVER_TIME'});
});
test('trusted event and own approved greenhouse return server-derived guard',async()=>{
 const f=fixture(),{source,scope}=await resolved(f);
 assert.equal(source.serverGuardName,'FRAN');
 assert.equal(source.guardCalculatedByServer,true);
 assert.equal(source.todayConfirmedByServer,true);
 assert.deepEqual(scope.authorizedInvIds,['INV_1']);
 assert.equal(scope.writerAuthorized,true);
 assert.deepEqual(f.requests.slice(0,3),[
  [ROOTS.events,'EV_1'],[ROOTS.catalog],[ROOTS.assignments]
 ]);
});
test('no client-supplied guard can override the server calculation',async()=>{
 const f=fixture();f.source.serverGuardName='DENNIS';
 const source=await f.resolvers.loadTrustedSource(f.request,f.actor);
 assert.equal(source.serverGuardName,'FRAN');
});
test('future server event timestamp denied',async()=>{
 const f=fixture();f.source.committedAtUtc='2099-07-27T11:59:59Z';
 await assert.rejects(f.resolvers.loadTrustedSource(f.request,f.actor),{code:'INVALID_COMMIT_TIME'});
});
test('a report for a date other than commit day is denied',async()=>{
 const f=fixture();f.source.workDateMadrid='2026-07-26';
 await assert.rejects(f.resolvers.loadTrustedSource(f.request,f.actor),{code:'PROBLEM_ENTRIES_NOT_VERIFIED'});
});
test('unverified irrigation entries are denied',async()=>{
 const f=fixture();f.source.entriesVerifiedServer=false;
 await assert.rejects(f.resolvers.loadTrustedSource(f.request,f.actor),{code:'PROBLEM_ENTRIES_NOT_VERIFIED'});
});
test('missing or uncommitted source cannot gain authority through request',async()=>{
 const f=fixture();f.source.sourceAuthority='client';
 await assert.rejects(f.resolvers.loadTrustedSource(f.request,f.actor),{code:'UNVERIFIED_EVENT_SOURCE'});
 f.source.sourceAuthority='server-committed-v1';f.source.transitionCommitted=false;
 await assert.rejects(f.resolvers.loadTrustedSource(f.request,f.actor),{code:'UNVERIFIED_EVENT_SOURCE'});
});
test('cross-user event and injected target are rejected',async()=>{
 const f=fixture();f.source.actorUid=uidForName('REGANTE2');
 await assert.rejects(f.resolvers.loadTrustedSource(f.request,f.actor),{code:'UNVERIFIED_EVENT_SOURCE'});
 f.source.actorUid=f.actor.uid;
 await assert.rejects(f.resolvers.loadTrustedSource({...f.request,target:'DENNIS'},f.actor),{code:'BAD_EVENT_REFERENCE'});
});
test('unknown or disabled greenhouse is denied, never default to sala1',async()=>{
 const f=fixture();f.source.invIds=['INV_DOES_NOT_EXIST'];
 const source=await f.resolvers.loadTrustedSource(f.request,f.actor);
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,source),{code:'UNKNOWN_OR_INACTIVE_INV'});
 f.source.invIds=['INV_1'];f.catalog.invernaderos.INV_1.active=false;
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'UNKNOWN_OR_INACTIVE_INV'});
});
test('REGANTE1 cannot access sala2 even if manager assignment is broad',async()=>{
 const f=fixture();f.source.invIds=['INV_2'];
 f.config.actors.REGANTE1={...allowed.REGANTE1,allowedSalas:['sala1','sala2']};
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'REGANTE_OUT_OF_SCOPE'});
});
test('REGANTE3 may access salas 3,4,5 when explicitly assigned',async()=>{
 const f=fixture('riego_problema_reportado','REGANTE3');
 f.source.invIds=['INV_3','INV_4','INV_5'];
 const out=await resolved(f);
 assert.deepEqual(out.scope.authorizedInvIds,['INV_3','INV_4','INV_5']);
});
test('unknown regante is denied without fallback',async()=>{
 const f=fixture();f.actor.name='REGANTE_X';f.actor.uid=uidForName('REGANTE_X');
 f.source.actorUid=f.actor.uid;
 f.config.actors.REGANTE_X={...allowed.REGANTE1};
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'UNKNOWN_REGANTE'});
});
test('manager assignment cannot be omitted even for known REGANTE',async()=>{
 const f=fixture();f.config.actors.REGANTE1.allowedSalas=[];
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'INV_NOT_ASSIGNED'});
});
test('technician cannot claim an INV outside approved list',async()=>{
 const f=fixture('riego_hojas_marcadas','FRAN');
 f.source.invIds=['INV_2'];f.source.sala='sala2';
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'INV_NOT_ASSIGNED'});
});
test('marked leaves require exact matching room, restricted to sala1/2',async()=>{
 const f=fixture('riego_hojas_marcadas','DENNIS');
 f.source.sala='sala2';
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'MARKED_ROOM_MISMATCH'});
});
test('unapproved catalog and unapproved actor scope both fail closed',async()=>{
 const f=fixture();f.config.approvedByBackoffice=false;
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'UNAPPROVED_SCOPE_CATALOG'});
 f.config.approvedByBackoffice=true;f.config.actors.REGANTE1.approved=false;
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'ACTOR_SCOPE_NOT_APPROVED'});
});
test('manual guard override blocks until reviewed by Backoffice',async()=>{
 const f=fixture();f.config.guardOverrides={FRAN:'DENNIS'};
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'UNAPPROVED_GUARD_OVERRIDES'});
});
test('zero or duplicate invIds cannot be accepted for problem reporting',async()=>{
 const f=fixture();f.source.invIds=[];
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'EVENT_INV_REQUIRED'});
 f.source.invIds=['INV_1','INV_1'];
 await assert.rejects(f.resolvers.resolveTrustedScope(f.actor,await f.resolvers.loadTrustedSource(f.request,f.actor)),{code:'INVALID_EVENT_INVERNADEROS'});
});
test('approved supervisor may emit general hojas corregidas with no INV',async()=>{
 const f=fixture('riego_hojas_corregidas','VIGUERAS');f.source.invIds=[];
 const out=await resolved(f);assert.deepEqual(out.scope.authorizedInvIds,[]);
});
test('bridge connects verified mock backend source, INV scope and server guard',async()=>{
 const f=fixture();
 const bridge=createEmulatorAuthorizationBridge({
  auth:{verifyIdentity:async()=>({appUser:'REGANTE1',uid:uidForName('REGANTE1')})},
  transport:f.transport,approved:true,
  loadTrustedSource:f.resolvers.loadTrustedSource,
  resolveTrustedScope:f.resolvers.resolveTrustedScope
 });
 const out=await bridge('synthetic-jwt',f.request);
 assert.deepEqual(out.recipientUids,[uidForName('FRAN')]);
 assert.equal(out.outboxRequired,true);
});
test('bridge rejects missing approval even when event and INV are sound',async()=>{
 const f=fixture();
 const bridge=createEmulatorAuthorizationBridge({
  auth:{verifyIdentity:async()=>({appUser:'REGANTE1',uid:uidForName('REGANTE1')})},
  transport:f.transport,approved:false,
  loadTrustedSource:f.resolvers.loadTrustedSource,
  resolveTrustedScope:f.resolvers.resolveTrustedScope
 });
 await assert.rejects(bridge('synthetic-jwt',f.request),{code:'BUSINESS_APPROVAL_REQUIRED'});
});
