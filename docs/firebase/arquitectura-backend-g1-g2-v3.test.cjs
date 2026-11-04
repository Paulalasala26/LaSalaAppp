'use strict';
// G1/G2 architecture contract checks only. Passing CI NEVER authorizes deployment.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const a=require('./arquitectura-backend-g1-g2-v3.json');
const c=require('./contrato-integracion-riego-v3.json');
const {POLICY}=require('./prototype-riego-command-authorization-v3.cjs');
const catalog=require('./avisos-event-catalog-v2.json');
const rules=require('./database.rules.test.candidate.phase2-riego-freeze.json').rules;
const exists=x=>typeof x==='string'&&x.length>8;
test('proposal cannot be mistaken for approved, deployed or production-ready',()=>{
 assert.equal(a.status,'TECHNICAL_PROPOSAL_NOT_APPROVED');
 assert.equal(a.deployable,false);
 assert.equal(a.compatibility.apiOperational,false);
 assert.equal(a.compatibility.liveFirebaseChanged,false);
 assert.equal(c.launchAuthorized,false);
 assert.equal(c.liveBackendIntegrated,false);
});
test('authority and serialization boundary is one backend-only document per INV',()=>{
 assert.equal(a.technicalDecision.option,'SERVER_ONLY_PER_INV_RTD_BOUNDED_TRANSACTION');
 assert.equal(a.aggregate.path,a.aggregate.root+'/<INV>');
 assert.equal(a.aggregate.serverOnly,true);
 assert.equal(a.aggregate.clientDirectRead,false);
 assert.equal(a.aggregate.clientDirectWrite,false);
 assert.equal(a.aggregate.dataOwner,'Trusted backend server identity');
});
test('source, authority, transition, receipts and outbox are in one transaction',()=>{
 const f=new Set(a.aggregate.fields);
 for(const k of ['fence','acl','grid','proposals','problems','commands',
  'receipts','events','outbox','catalog','version'])
  assert.ok(f.has(k),k);
 assert.ok(a.technicalDecision.singleInvAtomicity.includes('RTDB transaction'));
 assert.equal(c.invariants.outboxCommittedWithBusiness,true);
});
test('server-side ACL is authoritative only after a controlled cutover',()=>{
 assert.ok(a.aggregate.authorityNotes.acl.includes('Authoritative per-INV'));
 assert.ok(a.identity.legacyRoles.includes('until approved cutover'));
 assert.ok(a.identity.backoffice.includes('each affected INV transaction'));
});
test('no false cross-INV atomicity or global revocation promise',()=>{
 assert.equal(a.technicalDecision.multiInvAtomicityImplemented,false);
 assert.equal(a.technicalDecision.globalRevocationAtomicAcrossInv,false);
 assert.equal(a.scope.multiInv.startsWith('NO_GO'),true);
 assert.ok(a.identity.globalRevocation.includes('not instantaneous'));
});
test('all API routes are design-only, typed and not publicly deployed',()=>{
 assert.equal(a.api.plannedOnly,true);
 assert.equal(a.api.operations.length,5);
 const keys=new Set();
 for(const route of a.api.operations){
  assert.match(route.method,/^(POST|GET)$/);
  assert.ok(route.route.startsWith('/'));
  assert.ok(route.effect.length>15);
  assert.ok(!keys.has(route.method+' '+route.route));
  keys.add(route.method+' '+route.route);
 }
});
test('intent staging is not a business commit and receipts are server-owned',()=>{
 const i=a.api.operations.find(x=>x.route==='/intents');
 const commit=a.api.operations.find(x=>x.route.includes('/commit'));
 assert.ok(i.effect.includes('no business transition'));
 assert.ok(commit.effect.includes('inside transaction'));
 assert.ok(a.aggregate.authorityNotes.receipts.includes('idempotency'));
});
test('client-supplied actor, scope, recipients, or epoch cannot become trusted',()=>{
 assert.equal(a.identity.principalTrust.includes('no client flags trusted'),true);
 assert.equal(c.invariants.authoritativeInputs,'SERVER_ONLY');
 assert.deepEqual(c.invariants.commandRequest,['op','referenceId']);
 assert.ok(a.api.securityControls.includes('server-derived immutable identity'));
});
test('Firebase Admin SDK bypasses rules; application authorization is still required',()=>{
 assert.ok(a.identity.adminSdk.includes('bypasses RTDB rules'));
 assert.ok(a.api.securityControls.includes('JWT verification and revocation checks'));
 assert.ok(a.api.securityControls.includes('per-route and per-INV roles'));
});
test('private server-only root is explicitly denied in emulator candidate',()=>{
 assert.deepEqual(rules[a.aggregate.root],{'.read':false,'.write':false});
 assert.notEqual(rules.$other['.write'],true);
});
test('no direct legacy writer nor automatic offline replay permitted',()=>{
 assert.equal(a.technicalDecision.noClientCompatibilityUntilCutover,true);
 assert.ok(a.rollout.neverDo.includes('allow both legacy and v3 authoritative writers'));
 assert.ok(a.rollout.neverDo.includes('replay offline changes automatically after 403'));
 assert.equal(c.invariants.noAutomaticLegacyOfflineReplay,true);
});
test('five functional decisions remain outstanding for Backoffice',()=>{
 assert.equal(a.functionalApprovals.length,5);
 const keys=a.functionalApprovals.map(x=>x.id);
 assert.equal(new Set(keys).size,5);
 assert.ok(a.functionalApprovals.every(x=>x.status==='PENDING'&&x.owner==='Backoffice'));
});
test('six technical proof gates remain unimplemented except emulator-only policy',()=>{
 assert.equal(a.technicalGates.length,6);
 assert.equal(a.technicalGates[0].status,'DESIGN_TEST_ONLY');
 assert.ok(a.technicalGates.slice(1).every(x=>x.status==='NOT_IMPLEMENTED'));
});
test('no command from policy silently becomes authorized via the architecture plan',()=>{
 assert.equal(Object.keys(POLICY).length,12);
 assert.equal(c.operations.length,12);
 assert.ok(c.operations.every(x=>x.readyForDeployment===false));
 assert.equal(c.deliveryGates[0].status,'BLOCKED');
 assert.equal(c.deliveryGates[1].status,'BLOCKED');
});
test('all nine events remain provisional and not emitted by document-only work',()=>{
 assert.equal(catalog.events.length,9);
 assert.ok(catalog.events.every(x=>x.status==='PROVISIONAL'));
 assert.equal(a.compatibility.nineEvents,'docs/firebase/avisos-event-catalog-v2.json');
});
test('event outbox and weekly Tuta remain separate and duplicates prohibited',()=>{
 assert.ok(a.aggregate.authorityNotes.outbox.includes('Pending'));
 assert.ok(a.scope.worker.includes('no duplicate'));
});
test('security rollout requires backup, frozen legacy writers and UAT',()=>{
 const steps=a.rollout.steps.join(' | ');
 for(const term of ['emulator','backup','frozen','rollback','UAT']){
  assert.ok(steps.toLowerCase().includes(term.toLowerCase()),term);
 }
});
test('size growth and contention require evaluation before UAT',()=>{
 assert.ok(a.aggregate.scalabilityGuard.includes('size'));
 assert.ok(a.aggregate.scalabilityGuard.includes('contention'));
});
test('independent frontend QA is not counted as passed security CI',()=>{
 assert.equal(a.qa.frontendIndependent,true);
 assert.ok(a.qa.reportedFrontendTestsLowerBound>=2700);
 assert.equal(a.qa.frontendResultsNotAudited,true);
 assert.equal(a.qa.doNotSumSecurityAndFrontendCounts,true);
});
test('ADR exists and records both per-INV guarantee and global limitation',()=>{
 const doc=fs.readFileSync(path.join(__dirname,
  'ADR_G1_G2_BACKEND_AUTORIDAD_2026-11-04.md'),'utf8');
 for(const v of ['NO-GO','solo servidor','multi-INV','revocación global','G1','G2',
  'rollback','Firebase','no desplegar'])
  assert.ok(doc.toLowerCase().includes(v.toLowerCase()),v);
});
