'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const {POLICY,HARD_DENY,classifyWriteFailure,inspectLegacyOfflineEntry,
 createDemoRiegoCommandAuthorizer}=require('./prototype-riego-command-authorization-v3.cjs');
const validHash='a'.repeat(64);
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(op='EDIT_RIEGO',name='FRAN'){
 const users={FRAN:validHash,DENNIS:validHash,VIGUERAS:validHash,
  PAULA:validHash,REGANTE1:validHash,REGANTE2:validHash,REGANTE3:validHash,
  PEON1:validHash,JULIO:validHash};
 const roles={FRAN:'TECNICO',DENNIS:'TECNICO',VIGUERAS:'ADMIN',
  PAULA:'ADMIN',REGANTE1:'REGANTE',REGANTE2:'REGANTE',REGANTE3:'REGANTE',
  PEON1:'PEON',JULIO:'CARGADOR'};
 const invs={INV_1:{sala:'sala1',active:true},INV_2:{sala:'sala2',active:true},
  INV_3:{sala:'sala3',active:true}};
 const assignments=Object.fromEntries(Object.entries(roles).map(([n,r])=>
  [n,{role:r,approved:true,canReadRiego:true,canWriteRiego:true,
   allowedInvIds:[],allowedSalas:['sala1','sala2','sala3']}]));
 const config={schema:'lasala-event-permissions-v2',approvedByBackoffice:true,
  actors:assignments};
 const catalog={schema:'lasala-inv-catalog-v2',invernaderos:invs};
 const source={referenceId:'CMD_1',op,serverVerified:true,persisted:true,
  actorUid:uidForName(name),invIds:['INV_1'],
  proposalState:'pendiente',proposalPersisted:true,
  originalCellWasQuestion:true,riegoDayConfirmedByServer:true,
  problemPersisted:true,assignedTechnician:'FRAN'};
 const fences={INV_1:{epoch:3,phase:'v3_active',serverVerified:true,
  enforcedByBackend:true},
  INV_2:{epoch:4,phase:'v3_active',serverVerified:true,enforcedByBackend:true},
  INV_3:{epoch:5,phase:'v3_active',serverVerified:true,enforcedByBackend:true}};
 const calls=[],identity={appUser:name,uid:uidForName(name)};
 const transport={async retrieve(path){
  calls.push(path.join('/'));
  const d={'lasala-roles-v1':roles,'lasala-users-v1':users,
   'lasala-invernaderos-catalog-v2':catalog,
   'lasala-event-permissions-v2':config};
  return {value:d[path.join('/')]??null};
 }};
 const auth={verifyIdentity:async()=>identity};
 const make=(approved=true)=>createDemoRiegoCommandAuthorizer({
  auth,transport,approved,loadTrustedCommand:async()=>source,
  loadTrustedFence:async inv=>fences[inv]
 });
 const request={op,referenceId:'CMD_1'};
 const run=(approved=true)=>make(approved)('synthetic-signed-identity',request);
 return {users,roles,config,catalog,assignments,source,fences,calls,identity,transport,
  make,request,run};
}
const err=async(task,code)=>assert.rejects(task,{code});
test('authorization matrix is explicit and no generic global writer operation exists',()=>{
 assert.equal(Object.keys(POLICY).length,12);
 assert.equal(HARD_DENY.has('LEGACY_DIRECT_WRITE'),true);
 assert.ok(!Object.hasOwn(POLICY,'LEGACY_DIRECT_WRITE'));
});
test('technician with confirmed scope can edit irrigation in active epoch',async()=>{
 const f=fixture();const r=await f.run();
 assert.equal(r.authorized,true);assert.equal(r.operation,'EDIT_RIEGO');
 assert.equal(r.fenceEpochs.INV_1,3);
 assert.equal(r.serverRevalidationRequiredAtCommit,true);
 assert.equal(r.outboxNotAuthorizedByThisResult,true);
});
test('backend roles and account state are retrieved on each command',async()=>{
 const f=fixture();await f.run();await f.run();
 assert.equal(f.calls.filter(x=>x==='lasala-roles-v1').length,2);
 assert.equal(f.calls.filter(x=>x==='lasala-users-v1').length,2);
});
test('business approval defaults to false and fail-closed',async()=>{
 const f=fixture();await err(f.run(false),'MANAGER_APPROVAL_REQUIRED');
});
test('a request cannot provide role, inv, epoch or target',async()=>{
 const f=fixture();
 for(const injected of [{invIds:['INV_2']},{role:'ADMIN'},
  {expectedEpoch:999},{recipientUid:'FRAN'},{owner:'VIGUERAS'}]){
  await err(f.make()('token',{...f.request,...injected}),'UNTRUSTED_COMMAND_REQUEST');
 }
});
test('unexpected operation is rejected',async()=>{
 const f=fixture();f.request.op='PUBLISH_ANY_ALERT';
 await err(f.run(),'UNKNOWN_RIEGO_OPERATION');
});
test('legacy direct, index, global proposals and offline replays are always denied',async()=>{
 for(const op of HARD_DENY){
  const f=fixture(op);await err(f.run(),'LEGACY_WRITER_UNSUPPORTED');
 }
});
test('a forged ADMIN token cannot elevate stored technician role',async()=>{
 const f=fixture('ACCEPT_PROPOSAL','FRAN');
 await err(f.run(),'ROLE_NOT_ALLOWED_FOR_OPERATION');
});
test('backend identity appUser and UID must match deterministically',async()=>{
 const f=fixture();f.identity.uid=uidForName('VIGUERAS');
 await err(f.run(),'INVALID_BACKEND_IDENTITY');
});
test('invalid/expired signed identity propagates authentication failure',async()=>{
 const f=fixture(),a=createDemoRiegoCommandAuthorizer({
  auth:{verifyIdentity:async()=>{throw Object.assign(new Error('EXP'),{code:'UNAUTHORIZED'})}},
  transport:f.transport,approved:true,
  loadTrustedCommand:async()=>f.source,loadTrustedFence:async inv=>f.fences[inv]});
 await err(a('invalid',f.request),'UNAUTHORIZED');
});
test('disabled user and unknown role are denied',async()=>{
 const f=fixture();f.users.FRAN='disabled:'+validHash;
 await err(f.run(),'ACTOR_DISABLED_OR_ROLE_INVALID');
 f.users.FRAN=validHash;f.roles.FRAN='SUPERADMIN';
 await err(f.run(),'ACTOR_DISABLED_OR_ROLE_INVALID');
});
test('role revocation takes effect on the next authorization',async()=>{
 const f=fixture();await f.run();f.roles.FRAN='PEON';
 await err(f.run(),'ROLE_NOT_ALLOWED_FOR_OPERATION');
});
test('unapproved Backoffice scope is denied even for VIGUERAS',async()=>{
 const f=fixture('ACCEPT_PROPOSAL','VIGUERAS');
 f.config.approvedByBackoffice=false;
 await err(f.run(),'UNAPPROVED_RIEGO_ASSIGNMENTS');
 f.config.approvedByBackoffice=true;f.assignments.VIGUERAS.approved=false;
 await err(f.run(),'ACTOR_SCOPE_NOT_APPROVED');
});
test('missing canWriteRiego flag denies edits',async()=>{
 const f=fixture();f.assignments.FRAN.canWriteRiego=false;
 await err(f.run(),'ACTOR_SCOPE_NOT_APPROVED');
});
test('read requires canReadRiego but is permitted in frozen phases',async()=>{
 const f=fixture('READ_RIEGO','REGANTE1');
 f.fences.INV_1.phase='frozen';
 assert.equal((await f.run()).authorized,true);
 f.assignments.REGANTE1.canReadRiego=false;
 await err(f.run(),'ACTOR_SCOPE_NOT_APPROVED');
});
test('unknown invernadero never defaults to Sala 1',async()=>{
 const f=fixture('READ_RIEGO','REGANTE1');f.source.invIds=['INV_UNKNOWN'];
 await err(f.run(),'UNKNOWN_OR_INACTIVE_INV');
});
test('inactive greenhouse is denied',async()=>{
 const f=fixture();f.catalog.invernaderos.INV_1.active=false;
 await err(f.run(),'UNKNOWN_OR_INACTIVE_INV');
});
test('technician not assigned to this INV is denied',async()=>{
 const f=fixture();f.assignments.FRAN.allowedSalas=[];
 await err(f.run(),'INV_NOT_ASSIGNED');
});
test('regante1 cannot write or read Sala 2 even with broad manager assignment',async()=>{
 const f=fixture('REPORT_RIEGO_PROBLEM','REGANTE1');
 f.source.invIds=['INV_2'];
 await err(f.run(),'REGANTE_OUT_OF_SCOPE');
 f.request.op='READ_RIEGO';f.source.op='READ_RIEGO';
 await err(f.run(),'REGANTE_OUT_OF_SCOPE');
});
test('regante3 may access assigned Sala 3 but not Sala 1',async()=>{
 const f=fixture('READ_RIEGO','REGANTE3');
 f.source.invIds=['INV_3'];
 assert.equal((await f.run()).fenceEpochs.INV_3,5);
 f.source.invIds=['INV_1'];await err(f.run(),'REGANTE_OUT_OF_SCOPE');
});
test('unknown REGANTE has no silent default room',async()=>{
 const f=fixture('READ_RIEGO','REGANTE_X');
 f.roles.REGANTE_X='REGANTE';f.users.REGANTE_X=validHash;
 f.assignments.REGANTE_X=copy(f.assignments.REGANTE1);
 f.identity.appUser='REGANTE_X';f.identity.uid=uidForName('REGANTE_X');
 f.source.actorUid=f.identity.uid;
 await err(f.run(),'REGANTE_OUT_OF_SCOPE');
});
test('PEON and CARGADOR have no irrigation write policy grants',async()=>{
 for(const name of ['PEON1','JULIO']){
  const f=fixture('EDIT_RIEGO',name);
  await err(f.run(),'ROLE_NOT_ALLOWED_FOR_OPERATION');
 }
});
test('proposal creation is technician-only and requires original question mark',async()=>{
 const f=fixture('CREATE_PROPOSAL');
 assert.equal((await f.run()).authorized,true);
 f.source.originalCellWasQuestion=false;
 await err(f.run(),'INVALID_PROPOSAL_ORIGIN');
});
test('only VIGUERAS may accept, edit-accept or reject a pending proposal',async()=>{
 for(const op of ['ACCEPT_PROPOSAL','ACCEPT_PROPOSAL_EDITED','REJECT_PROPOSAL']){
  const f=fixture(op,'VIGUERAS');
  assert.equal((await f.run()).authorized,true);
  f.source.proposalState='aceptada';
  await err(f.run(),'PROPOSAL_STATE_NOT_PENDING');
 }
});
test('another ADMIN cannot resolve VIGUERAS proposals',async()=>{
 const f=fixture('REJECT_PROPOSAL','PAULA');
 await err(f.run(),'ROLE_NOT_ALLOWED_FOR_OPERATION');
});
test('mark leaves is technician-only; correct leaves only VIGUERAS',async()=>{
 const tech=fixture('MARK_LEAVES','FRAN');
 assert.equal((await tech.run()).authorized,true);
 const correct=fixture('CORRECT_LEAVES','VIGUERAS');
 assert.equal((await correct.run()).authorized,true);
 await err(fixture('CORRECT_LEAVES','FRAN').run(),'ROLE_NOT_ALLOWED_FOR_OPERATION');
});
test('regante execution mark and report require confirmed irrigation day',async()=>{
 for(const op of ['MARK_RIEGO_EXECUTED','REPORT_RIEGO_PROBLEM']){
  const f=fixture(op,'REGANTE1');
  assert.equal((await f.run()).authorized,true);
  f.source.riegoDayConfirmedByServer=false;
  await err(f.run(),'UNVERIFIED_RIEGO_DAY');
 }
});
test('resolving irrigation problem requires matching assigned technician',async()=>{
 const f=fixture('RESOLVE_RIEGO_PROBLEM','FRAN');
 assert.equal((await f.run()).authorized,true);
 f.source.assignedTechnician='DENNIS';
 await err(f.run(),'PROBLEM_NOT_ASSIGNED');
});
test('command source cannot self-assign actor or forged INV list',async()=>{
 const f=fixture();
 f.source.actorUid=uidForName('VIGUERAS');
 await err(f.run(),'COMMAND_ACTOR_MISMATCH');
 f.source.actorUid=f.identity.uid;f.source.serverVerified=false;
 await err(f.run(),'UNVERIFIED_COMMAND_SOURCE');
});
test('fence phase denies writes in legacy, freezing, frozen and rollback hold',async()=>{
 for(const phase of ['legacy','freezing','frozen','rollback_hold']){
  const f=fixture();f.fences.INV_1.phase=phase;
  await err(f.run(),'INV_WRITES_FROZEN');
 }
});
test('fence with missing server proof/epoch fails closed',async()=>{
 const f=fixture();f.fences.INV_1.enforcedByBackend=false;
 await err(f.run(),'UNVERIFIED_WRITER_FENCE');
 f.fences.INV_1.enforcedByBackend=true;delete f.fences.INV_1.epoch;
 await err(f.run(),'UNVERIFIED_WRITER_FENCE');
});
test('multi greenhouse request is blocked if any INV is frozen',async()=>{
 const f=fixture();f.source.invIds=['INV_1','INV_2'];
 f.fences.INV_2.phase='frozen';
 await err(f.run(),'INV_WRITES_FROZEN');
});
test('multi greenhouse command gets one backend epoch per INV, not client claims',async()=>{
 const f=fixture();f.source.invIds=['INV_1','INV_2'];
 const x=await f.run();
 assert.deepEqual(x.fenceEpochs,{INV_1:3,INV_2:4});
});
test('source requests cannot contain duplicates or unknown INV, and never authorize empty scope',async()=>{
 const f=fixture();f.source.invIds=['INV_1','INV_1'];
 await err(f.run(),'UNVERIFIED_COMMAND_SOURCE');
 f.source.invIds=[];
 await err(f.run(),'UNVERIFIED_COMMAND_SOURCE');
});
test('403 and PERMISSION_DENIED are a permanent hold, never an offline network retry',()=>{
 for(const e of [{status:403},{code:'PERMISSION_DENIED'},
  {response:{status:403}},{code:'FROZEN'}]){
  const x=classifyWriteFailure(e);
  assert.equal(x.action,'DENIED_HOLD');assert.equal(x.retry,false);
  assert.equal(x.markSaved,false);assert.equal(x.retainLocal,true);
 }
});
test('401 requires reauthentication and preserves local intent',()=>{
 assert.deepEqual(classifyWriteFailure({status:401}),{
  action:'REAUTH_HOLD',retry:false,retainLocal:true,markSaved:false
 });
});
test('412 and 409 cause reconciliation, never an unguarded replay',()=>{
 for(const e of [{status:412},{status:409},{code:'ETAG_CONFLICT'}]){
  assert.equal(classifyWriteFailure(e).action,'RECONCILE_HOLD');
 }
});
test('network failures and 503 backoff but do not mark Firebase commit',()=>{
 for(const e of [{status:503},{code:'NETWORK_ERROR'},{code:'ETIMEDOUT'},
  {status:429}]){
  const x=classifyWriteFailure(e);
  assert.equal(x.action,'TRANSIENT_BACKOFF');assert.equal(x.retry,true);
  assert.equal(x.markSaved,false);
 }
});
test('malformed and unknown errors hold without retrying',()=>{
 assert.equal(classifyWriteFailure({status:400}).action,'INVALID_HOLD');
 assert.equal(classifyWriteFailure(new Error('unexpected')).action,'UNKNOWN_HOLD');
 assert.equal(classifyWriteFailure({status:500}).action,'TRANSIENT_BACKOFF');
});
test('real-shape legacy localStorage entry cannot be replayed without backend epoch/receipt',()=>{
 const x=inspectLegacyOfflineEntry({
  clave:'FRAN|1A|2026-11-04|1',usuario:'FRAN',invId:'1A',
  dia:'2026-11-04',calle:'1',base:'30',deseado:'35'
 });
 assert.deepEqual(x,{action:'RECONCILE_LEGACY_OFFLINE',
  automaticReplay:false,retainLocal:true});
});
test('unsafe or malformed offline queue entry is retained in quarantine, not deleted',()=>{
 const x=inspectLegacyOfflineEntry({invId:'__proto__',usuario:'FRAN',dia:'2026-11-04',calle:'1'});
 assert.equal(x.action,'INVALID_HOLD');assert.equal(x.automaticReplay,false);
 assert.equal(x.retainLocal,true);
});
