'use strict';
// §0.225 — ISOLATED DESIGN PROTOTYPE. Not an API and never a deployed authorization rule.
// All inputs except request must be independently sourced and verified by the backend.
const events=Object.freeze({
 riego_hojas_marcadas:{role:'TECNICO',to:'VIGUERAS',scope:true},
 riego_hojas_corregidas:{role:'VIGUERAS',to:'BOTH'},
 riego_validado_modificado:{role:'AUTHORIZED_WRITER',to:'VIGUERAS',scope:true},
 riego_propuesta_creada:{role:'TECNICO',to:'VIGUERAS',scope:true},
 riego_propuesta_aceptada:{role:'VIGUERAS',to:'PROPOSER'},
 riego_propuesta_aceptada_cambios:{role:'VIGUERAS',to:'PROPOSER'},
 riego_propuesta_rechazada:{role:'VIGUERAS',to:'PROPOSER'},
 riego_problema_reportado:{role:'REGANTE',to:'GUARD',scope:true},
 riego_problema_resuelto:{role:'ASSIGNED_TECHNICIAN',to:'REPORTER'}
});
const forbid=reason=>{const e=new Error(reason);e.code=reason;throw e;};
const validName=n=>typeof n==='string'&&/^[A-Z0-9._ -]{1,80}$/.test(n)&&n===n.trim();
function authorize({actor,request,source,accounts,scope,approval}={}){
 if(approval!==true)forbid('BUSINESS_APPROVAL_REQUIRED'); // fail closed until Backoffice approves
 if(!actor?.verified||!actor.active||!validName(actor.name)||!actor.uid||!actor.role)forbid('INVALID_ACTOR');
 if(!request||Object.keys(request).sort().join('|')!=='kind|referenceId')forbid('UNTRUSTED_REQUEST');
 const rule=events[request.kind];
 if(!rule)forbid('UNKNOWN_EVENT');
 if(typeof request.referenceId!=='string'||!/^[A-Za-z0-9_-]{1,140}$/.test(request.referenceId))forbid('INVALID_REFERENCE');
 if(!source?.serverVerified||!source.persisted||source.id!==request.referenceId||source.kind!==request.kind||source.actorUid!==actor.uid||!source.transitionCommitted||!Number.isSafeInteger(source.revision)||source.revision<1)forbid('UNVERIFIED_SOURCE');
 if(rule.role==='VIGUERAS'&&(actor.name!=='VIGUERAS'||actor.role!=='ADMIN'))forbid('SUPERVISOR_ONLY');
 if(rule.role==='TECNICO'&&actor.role!=='TECNICO')forbid('ROLE_DENIED');
 if(rule.role==='REGANTE'&&actor.role!=='REGANTE')forbid('ROLE_DENIED');
 if(rule.role==='AUTHORIZED_WRITER'&&(!source.writtenByActor||!scope?.writerAuthorized))forbid('WRITE_NOT_AUTHORIZED');
 if(rule.role==='ASSIGNED_TECHNICIAN'&&(actor.role!=='TECNICO'||source.assignedTechnicianUid!==actor.uid))forbid('NOT_ASSIGNED_TECHNICIAN');
 if(rule.scope){
  if(!scope?.serverVerified||!Array.isArray(source.invIds)||!source.invIds.length||!source.invIds.every(x=>typeof x==='string'&&scope.authorizedInvIds?.includes(x)))forbid('INV_SCOPE_DENIED');
 }
 if(request.kind==='riego_hojas_marcadas'&&(!['sala1','sala2'].includes(source.sala)||!source.markingConfirmed))forbid('MARKING_NOT_CONFIRMED');
 if(request.kind==='riego_validado_modificado'&&!source.validatedChangeCommitted)forbid('VALIDATED_CHANGE_UNCONFIRMED');
 if(request.kind==='riego_propuesta_creada'&&(source.status!=='pendiente'||!source.originalWasQuestionMark))forbid('PROPOSAL_NOT_PENDING');
 if(['riego_propuesta_aceptada','riego_propuesta_aceptada_cambios','riego_propuesta_rechazada'].includes(request.kind)){
  if(source.status!==(request.kind==='riego_propuesta_rechazada'?'rechazada':'aceptada'))forbid('INVALID_PROPOSAL_TRANSITION');
  if(request.kind!=='riego_propuesta_rechazada'&&!source.irrigationCommitted)forbid('IRRIGATION_NOT_COMMITTED');
 }
 if(request.kind==='riego_problema_reportado'&&(!source.todayConfirmedByServer||!source.guardCalculatedByServer))forbid('INVALID_PROBLEM');
 if(request.kind==='riego_problema_resuelto'&&(!source.solutionCommitted||!source.originalReporterName))forbid('SOLUTION_NOT_COMMITTED');
 const targetNames=rule.to==='BOTH'?['FRAN','DENNIS']:rule.to==='VIGUERAS'?['VIGUERAS']:rule.to==='PROPOSER'?[source.originalProposerName]:rule.to==='GUARD'?[source.serverGuardName]:[source.originalReporterName];
 const recipients=targetNames.map(name=>{
  if(!validName(name))forbid('INVALID_RECIPIENT');
  const acct=accounts?.[name];
  if(!acct?.serverVerified||!acct.active||!acct.uid||acct.name!==name)forbid('INACTIVE_RECIPIENT');
  if(name==='VIGUERAS'&&acct.role!=='ADMIN')forbid('BAD_SUPERVISOR_ROLE');
  if((name==='FRAN'||name==='DENNIS')&&acct.role!=='TECNICO')forbid('BAD_TECHNICIAN_ROLE');
  return acct.uid;
 });
 if(new Set(recipients).size!==recipients.length)forbid('DUPLICATE_RECIPIENT');
 return Object.freeze({idempotencyKey:[request.kind,source.id,source.revision].join(':'),actorUid:actor.uid,recipientUids:Object.freeze(recipients),outboxRequired:true});
}
module.exports={events,authorize};
