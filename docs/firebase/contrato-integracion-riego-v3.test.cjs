'use strict';
// §0.241 — CONSOLIDATED CONTRACT GUARD. No network, writes, deploy or migration.
// A green CI test means contract consistency only, NEVER production readiness.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const c=require('./contrato-integracion-riego-v3.json');
const catalog=require('./avisos-event-catalog-v2.json');
const {POLICY,HARD_DENY,classifyWriteFailure}=
 require('./prototype-riego-command-authorization-v3.cjs');
const {events}=require('./prototype-event-authorization-v2.cjs');
const {REGANTES}=require('./prototype-event-resolvers-v2.cjs');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const rules=JSON.parse(fs.readFileSync(
 path.join(__dirname,'database.rules.test.candidate.phase2-riego-freeze.json'),'utf8'));
const names=x=>Object.keys(x).sort();
const namesOf=x=>x.map(y=>y.op).sort();
test('contract is explicitly design-only and never authorizes deployment',()=>{
 assert.equal(c.schema,'lasala-riego-integration-contract/v1');
 assert.equal(c.referenceBranch,'test/v1.0');
 assert.equal(c.status,'DESIGN_ONLY_NOT_APPROVED');
 assert.equal(c.launchAuthorized,false);
 assert.equal(c.liveBackendIntegrated,false);
 assert.equal(c.invariants.noProductionAccess,true);
});
test('every command from backend policy is represented exactly once',()=>{
 assert.equal(c.operations.length,12);
 assert.equal(new Set(c.operations.map(o=>o.op)).size,12);
 assert.deepEqual(namesOf(c.operations),names(POLICY));
});
test('all nine event origins exist once and match both source catalogs',()=>{
 const mapped=c.operations.filter(o=>o.eventKind).map(o=>o.eventKind).sort();
 assert.equal(mapped.length,9);
 assert.equal(new Set(mapped).size,9);
 assert.deepEqual(mapped,names(events));
 assert.deepEqual(mapped,catalog.events.map(e=>e.id).sort());
});
test('every event retains provisional functional approval status',()=>{
 assert.equal(catalog.status,'PROVISIONAL_DESIGN_ONLY');
 assert.ok(catalog.events.every(e=>e.status==='PROVISIONAL'));
 assert.equal(c.invariants.guardSubstitutionPolicyApproved,false);
});
test('read, delete and mark executed are explicitly NOT assigned an arbitrary Push event',()=>{
 for(const op of ['READ_RIEGO','DELETE_RIEGO','MARK_RIEGO_EXECUTED']){
  const item=c.operations.find(x=>x.op===op);
  assert.equal(item.eventKind,null);
 }
 assert.equal(c.operations.find(x=>x.op==='DELETE_RIEGO').emission,'decisión_pendiente');
 assert.equal(c.operations.find(x=>x.op==='MARK_RIEGO_EXECUTED').emission,'decisión_pendiente');
});
test('ordinary editing may notify only conditionally after validated change',()=>{
 const edit=c.operations.find(x=>x.op==='EDIT_RIEGO');
 assert.equal(edit.eventKind,'riego_validado_modificado');
 assert.equal(edit.emission,'condicional');
});
test('all operations have frontend evidence, business notes and no deployment clearance',()=>{
 for(const op of c.operations){
  assert.ok(Array.isArray(op.frontendEvidence)&&op.frontendEvidence.length>0,op.op);
  assert.ok(op.notes.length>15,op.op);
  assert.equal(op.readyForDeployment,false,op.op);
 }
});
for(const op of c.operations){
 test('frontend function symbols still exist for '+op.op,()=>{
  for(const fn of op.frontendEvidence){
   assert.match(fn,/^[A-Za-z_$][A-Za-z0-9_$]*$/);
   assert.ok(html.includes('function '+fn+'('),fn+' missing');
  }
 });
}
test('four proposal operations map to distinct confirmed event classes',()=>{
 const list=['CREATE_PROPOSAL','ACCEPT_PROPOSAL','ACCEPT_PROPOSAL_EDITED','REJECT_PROPOSAL'];
 assert.equal(new Set(list.map(op=>c.operations.find(x=>x.op===op).eventKind)).size,4);
 assert.equal(POLICY.ACCEPT_PROPOSAL.user,'VIGUERAS');
 assert.equal(POLICY.ACCEPT_PROPOSAL_EDITED.user,'VIGUERAS');
 assert.equal(POLICY.REJECT_PROPOSAL.user,'VIGUERAS');
});
test('report and resolve problems map to separate persisted event obligations',()=>{
 assert.equal(c.operations.find(x=>x.op==='REPORT_RIEGO_PROBLEM').eventKind,
  'riego_problema_reportado');
 assert.equal(c.operations.find(x=>x.op==='RESOLVE_RIEGO_PROBLEM').eventKind,
  'riego_problema_resuelto');
});
test('regante sala limits have no implicit Sala 1 fallback',()=>{
 assert.deepEqual(REGANTES.REGANTE1,['sala1']);
 assert.deepEqual(REGANTES.REGANTE2,['sala2']);
 assert.deepEqual(REGANTES.REGANTE3,['sala3','sala4','sala5']);
 assert.equal(REGANTES.REGANTE_X,undefined);
});
test('permitted legacy UI paths are documented and not misrepresented as v3',()=>{
 assert.ok(html.includes("const RIEGO_V2_PREFIX = 'lasala-riego-v2-'"));
 assert.ok(html.includes("const PROPUESTAS_RIEGO_KEY = 'lasala-propuestas-riego-v1'"));
 assert.ok(html.includes("const AVISOS_USUARIO_KEY = 'lasala-avisos-usuario-v1'"));
 assert.ok(html.includes("const RIEGO_OFFLINE_KEY = 'lasala-riego-offline-v1'"));
 assert.ok(c.routes.irrigationShard.includes('JSON string'));
 assert.ok(c.routes.problems.includes('not established'));
});
test('two writer privileges are not silently treated as an authorized gateway',()=>{
 assert.equal(POLICY.READ_RIEGO.read,true);
 for(const op of HARD_DENY)assert.ok(!c.operations.some(x=>x.op===op));
 assert.equal(c.invariants.authorizationAtCommitRequired,true);
 assert.equal(c.invariants.authoritativeInputs,'SERVER_ONLY');
 assert.deepEqual(c.invariants.commandRequest,['op','referenceId']);
});
test('legacy freeze test candidate still restricts proposal and index writes globally',()=>{
 const write=rules.rules.$other['.write'];
 assert.ok(write.includes("lasala-propuestas-riego-v1"));
 assert.ok(write.includes("lasala-riego-v2-index"));
 assert.equal(rules.rules['lasala-riego-write-locks-v3']['.write'],false);
 assert.equal(c.invariants.noClientFirebaseWriteDuringCutover,true);
});
test('403 and 412 are not classified as offline retry',()=>{
 assert.deepEqual([classifyWriteFailure({status:403}).action,
  classifyWriteFailure({status:412}).action],
  [c.invariants.error403,c.invariants.error412]);
 assert.equal(classifyWriteFailure({status:403}).retry,false);
});
test('no offline replay or unrelated worker dispatch is authorized by contract',()=>{
 assert.equal(c.invariants.noAutomaticLegacyOfflineReplay,true);
 assert.equal(c.invariants.outboxCommittedWithBusiness,true);
});
test('multi-INV and guard substitutions remain unresolved limitations',()=>{
 assert.equal(c.invariants.multiInvAtomicityImplemented,false);
 assert.equal(c.invariants.guardSubstitutionPolicyApproved,false);
});
test('all eight high-impact blockers have owners and explicit completion criteria',()=>{
 assert.equal(c.blockingDecisions.length,8);
 const seen=new Set();
 for(const b of c.blockingDecisions){
  assert.match(b.id,/^B0[1-8]$/);
  assert.ok(!seen.has(b.id));seen.add(b.id);
  assert.equal(b.status,'BLOCKED');
  assert.equal(b.evidenceRequired,true);
  assert.ok(b.owner.length>3);
  assert.ok(b.exitCriteria.length>25);
 }
});
test('six delivery gates remain blocked and cannot be auto-approved by tests',()=>{
 assert.equal(c.deliveryGates.length,6);
 assert.ok(c.deliveryGates.every(x=>x.status==='BLOCKED'));
 assert.ok(c.deliveryGates.every(x=>x.owner&&x.title));
 assert.equal(c.launchAuthorized,false);
});
test('the independent 2700+ frontend QA work is not summed with security CI',()=>{
 assert.equal(c.frontendQA.separatelyExecuted,true);
 assert.ok(c.frontendQA.reportedTestsLowerBound>=2700);
 assert.equal(c.frontendQA.exactExecutedAndPassedNotVerified,true);
 assert.equal(c.frontendQA.doNotSumWithSecurityTests,true);
 assert.equal(c.frontendQA.preserveIndependentEvidence,true);
 assert.equal(c.frontendQA.doNotModifyFrontendDuringSecurityAudit,true);
});
