'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {authorize,events}=require('./prototype-event-authorization-v2.cjs');
const catalog=require('./avisos-event-catalog-v2.json');
const accounts=Object.fromEntries([
 ['VIGUERAS','ADMIN'],['FRAN','TECNICO'],['DENNIS','TECNICO'],
 ['REGANTE1','REGANTE'],['REGANTE2','REGANTE'],['REGANTE3','REGANTE']
].map(([name,role])=>[name,{name,role,uid:'uid-'+name,active:true,serverVerified:true}]));
const actor=name=>({name,role:accounts[name].role,uid:accounts[name].uid,active:true,verified:true});
function fixture(kind){
 const role=events[kind].role;
 const a=actor(role==='VIGUERAS'?'VIGUERAS':role==='REGANTE'?'REGANTE1':role==='AUTHORIZED_WRITER'?'REGANTE1':'FRAN');
 const source={id:'event_1',kind,actorUid:a.uid,persisted:true,serverVerified:true,transitionCommitted:true,revision:1,
 invIds:['INV_1'],sala:'sala1',markingConfirmed:true,validatedChangeCommitted:true,writtenByActor:true,
 status:kind==='riego_propuesta_creada'?'pendiente':kind==='riego_propuesta_rechazada'?'rechazada':'aceptada',
 originalWasQuestionMark:true,irrigationCommitted:true,todayConfirmedByServer:true,guardCalculatedByServer:true,
 serverGuardName:'DENNIS',originalProposerName:'FRAN',originalReporterName:'REGANTE1',
 assignedTechnicianUid:a.uid,solutionCommitted:true};
 return {actor:a,request:{kind,referenceId:source.id},source,accounts,scope:{serverVerified:true,authorizedInvIds:['INV_1'],writerAuthorized:true},approval:true};
}
function blocked(f,change,code){const p=f();change(p);assert.throws(()=>authorize(p),e=>e.code===code,code);}
test('all nine inventoried events are covered by prototype, with no extras',()=>{
 assert.deepEqual(Object.keys(events).sort(),catalog.events.map(x=>x.id).sort());
});
for(const kind of Object.keys(events)){
 test(kind+' — authorized server-confirmed event yields outbox plan',()=>{
  const f=fixture(kind),result=authorize(f);
  assert.equal(result.idempotencyKey,kind+':event_1:1');
  assert.equal(result.outboxRequired,true);
  assert.deepEqual(result.recipientUids,
   kind==='riego_hojas_corregidas'?['uid-FRAN','uid-DENNIS']:
   ['riego_propuesta_aceptada','riego_propuesta_aceptada_cambios','riego_propuesta_rechazada'].includes(kind)?['uid-FRAN']:
   kind==='riego_problema_reportado'?['uid-DENNIS']:
   kind==='riego_problema_resuelto'?['uid-REGANTE1']:['uid-VIGUERAS']);
 });
 test(kind+' — reject unapproved business policy',()=>{
  blocked(()=>fixture(kind),p=>{p.approval=false;},'BUSINESS_APPROVAL_REQUIRED');
 });
 test(kind+' — reject unverified business source',()=>{
  blocked(()=>fixture(kind),p=>{p.source.serverVerified=false;},'UNVERIFIED_SOURCE');
 });
 test(kind+' — reject actor impersonation in source',()=>{
  blocked(()=>fixture(kind),p=>{p.source.actorUid='uid-attacker';},'UNVERIFIED_SOURCE');
 });
 test(kind+' — reject untrusted recipient injection',()=>{
  blocked(()=>fixture(kind),p=>{p.request.target='uid-attacker';},'UNTRUSTED_REQUEST');
 });
}
test('only exact VIGUERAS may act as supervisor; ADMIN alone is insufficient',()=>{
 const p=fixture('riego_propuesta_rechazada');
 p.actor={...p.actor,name:'OTHER_ADMIN'};
 p.source.actorUid=p.actor.uid;
 assert.throws(()=>authorize(p),e=>e.code==='SUPERVISOR_ONLY');
});
test('REGANTE1 cannot send a problem for another INV',()=>{
 blocked(()=>fixture('riego_problema_reportado'),p=>{p.source.invIds=['INV_2'];},'INV_SCOPE_DENIED');
});
test('unknown regante never falls back to sala1',()=>{
 blocked(()=>fixture('riego_problema_reportado'),p=>{p.scope={serverVerified:false,authorizedInvIds:[]};},'INV_SCOPE_DENIED');
});
test('marked leaves restricted to sala1 or sala2',()=>{
 blocked(()=>fixture('riego_hojas_marcadas'),p=>{p.source.sala='sala3';},'MARKING_NOT_CONFIRMED');
});
test('problem resolution only by original assigned technician',()=>{
 blocked(()=>fixture('riego_problema_resuelto'),p=>{p.source.assignedTechnicianUid='uid-DENNIS';},'NOT_ASSIGNED_TECHNICIAN');
});
test('rejected proposal cannot claim accepted status',()=>{
 blocked(()=>fixture('riego_propuesta_rechazada'),p=>{p.source.status='aceptada';},'INVALID_PROPOSAL_TRANSITION');
});
test('no alert for uncommitted validated irrigation change',()=>{
 blocked(()=>fixture('riego_validado_modificado'),p=>{p.source.validatedChangeCommitted=false;},'VALIDATED_CHANGE_UNCONFIRMED');
});
test('inactive recipient blocks notification',()=>{
 blocked(()=>fixture('riego_problema_reportado'),p=>{p.accounts={...p.accounts,DENNIS:{...p.accounts.DENNIS,active:false}};},'INACTIVE_RECIPIENT');
});
test('retry on same business revision yields same deduplication key',()=>{
 const p=fixture('riego_propuesta_creada');
 assert.equal(authorize(p).idempotencyKey,authorize(p).idempotencyKey);
 p.source.revision=2;
 assert.notEqual(authorize(p).idempotencyKey,'riego_propuesta_creada:event_1:1');
});
