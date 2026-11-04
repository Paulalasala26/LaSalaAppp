'use strict';
// §0.238 — OFFICIAL FIREBASE RTDB EMULATOR ONLY. No credentials, real URL, or deploy.
// This candidate changes the broad $other rule. Deploying it as-is would
// deliberately freeze ALL legacy proposal/index/sync writes, NOT just one INV.
const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=
 require('@firebase/rules-unit-testing');
const PROJECT_ID='demo-lasala-phase2-riego-freeze';
const HOST='127.0.0.1',PORT=9000;
const ROLES=['ADMIN','TECNICO','REGANTE','PEON','CARGADOR'];
const LOCKS='lasala-riego-write-locks-v3';
const ROOT1='lasala-riego-v2-INV_1';
const ROOT2='lasala-riego-v2-INV_2';
const LEGACY_GLOBAL=[
 'lasala-riego-v1','lasala-riego-v2-index','lasala-riego-sync-v1',
 'lasala-riego-ejecutado-v1','lasala-riego-offline-v1',
 'lasala-propuestas-riego-v1'
];
const PRIVATE=[
 'lasala-users-v1','lasala-admin-audit-v1','lasala-config-infra-v1',
 'lasala-qc-mediciones-v1','lasala-qc-fotos-sharepoint-v1',
 'lasala-avisos-v2','lasala-push-subs-v2','lasala-push-outbox-v2',
 'lasala-riego-event-aggregate-demo-v2','lasala-alert-event-ledger-v2',
 'lasala-riego-authority-v3'
];
let env;
const actor=role=>role?env.authenticatedContext('u-'+role,{appUser:'TESTER',role}).database():
 env.unauthenticatedContext().database();
async function seed(){
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.database();
  await db.ref(LOCKS).set({[ROOT1]:'open',[ROOT2]:'frozen'});
  await db.ref(ROOT1).set(JSON.stringify({'2026-11-04':{'1':'30 MIN'}}));
  await db.ref(ROOT2).set(JSON.stringify({'2026-11-04':{'1':'45 MIN'}}));
  for(const key of LEGACY_GLOBAL)await db.ref(key).set('demo legacy');
  await db.ref('lasala-tareas-v1').set('demo tasks');
  for(const key of PRIVATE)await db.ref(key).set({secret:true});
 });
}
before(async()=>{
 assert.match(process.env.FIREBASE_DATABASE_EMULATOR_HOST||'',
  /^(127\.0\.0\.1|localhost):9000$/);
 if(process.env.GCLOUD_PROJECT)assert.equal(process.env.GCLOUD_PROJECT,PROJECT_ID);
 env=await initializeTestEnvironment({
  projectId:PROJECT_ID,
  database:{host:HOST,port:PORT,
   rules:fs.readFileSync(__dirname+'/database.rules.test.candidate.phase2-riego-freeze.json','utf8')}
 });
 await seed();
});
after(async()=>{if(env)await env.cleanup()});
test('unmodified authenticated legacy riego reading survives frozen writer rules',async()=>{
 for(const role of ROLES){
  const db=actor(role);
  for(const key of [ROOT1,ROOT2,...LEGACY_GLOBAL]){
   await assertSucceeds(db.ref(key).get());
  }
 }
});
test('all known application roles can write only explicitly open INV shard',async()=>{
 for(const role of ROLES){
  const db=actor(role);
  await assertSucceeds(db.ref(ROOT1).set(JSON.stringify({'2026-11-04':{'1':role}})));
  await assertSucceeds(db.ref(ROOT1).update({'2026-11-04':role}));
  await assertFails(db.ref(ROOT2).set(JSON.stringify({'2026-11-04':{'1':'FORGED'}})));
  await assertFails(db.ref(ROOT2+'/probe').set('FORGED'));
  await assertFails(db.ref(ROOT2).update({probe:'FORGED'}));
  await assertFails(db.ref(ROOT2).remove());
 }
});
test('unknown INV defaults to write-denied, even for ADMIN and forged sibling keys',async()=>{
 const db=actor('ADMIN');
 for(const key of ['lasala-riego-v2-INV_UNKNOWN',
  'lasala-riego-v2-INV_1-extra','lasala-riego-v2-INV_1_sibling']){
  await assertFails(db.ref(key).set('FORGED'));
  await assertFails(db.ref(key+'/x').set('FORGED'));
 }
});
test('legacy riego index, proposals and sync writes are globally frozen',async()=>{
 for(const role of ROLES){
  const db=actor(role);
  for(const key of LEGACY_GLOBAL){
   const ref=db.ref(key);
   await assertFails(ref.set('FORGED'));
   await assertFails(ref.update({x:'FORGED'}));
   await assertFails(ref.remove());
  }
 }
});
test('lock authority root is private, cannot be read, opened or removed by any client',async()=>{
 for(const role of [null,...ROLES]){
  const db=actor(role);
  for(const path of [LOCKS,LOCKS+'/'+ROOT1,LOCKS+'/'+ROOT2]){
   await assertFails(db.ref(path).get());
   await assertFails(db.ref(path).set('open'));
   await assertFails(db.ref(path).update({status:'open'}));
   await assertFails(db.ref(path).remove());
  }
 }
});
test('privileged freeze flips one INV and invalidates previously open browser sessions',async()=>{
 const oldSession=actor('TECNICO');
 await assertSucceeds(oldSession.ref(ROOT1).get());
 await env.withSecurityRulesDisabled(async context=>
  context.database().ref(LOCKS+'/'+ROOT1).set('frozen'));
 for(const role of ROLES){
  const db=actor(role);
  await assertFails(db.ref(ROOT1).set('STALE CLIENT'));
  await assertFails(db.ref(ROOT1+'/2026-11-04').update({'1':'STALE CLIENT'}));
  await assertSucceeds(db.ref(ROOT1).get());
 }
 await assertFails(oldSession.ref(ROOT1).set('CACHED SESSION'));
});
test('revoking a lock does not grant access through a less restrictive child rule',async()=>{
 const db=actor('ADMIN');
 await assertFails(db.ref(ROOT1+'/nested/path').set('FORGED'));
 await assertFails(db.ref(ROOT2+'/nested/path').set('FORGED'));
});
test('a write attempting to update frozen and unrelated paths in one multipath request fails',async()=>{
 const db=actor('REGANTE');
 await assertFails(db.ref().update({
  [ROOT1]:'FORGED','lasala-tareas-v1':'SAFE'
 }));
});
test('unrelated app paths retain wildcard read/write permissions',async()=>{
 for(const role of ROLES){
  const db=actor(role);
  await assertSucceeds(db.ref('lasala-tareas-v1').set('unrelated-'+role));
  await assertSucceeds(db.ref('lasala-tareas-v1').get());
  await assertSucceeds(db.ref('lasala-avisos-usuario-v1').set('legacy-alert'));
  await assertSucceeds(db.ref('lasala-avisos-usuario-v1').get());
 }
});
test('existing private Phase 1/Phase 2 roots remain denied, not bypassed by wildcard',async()=>{
 const db=actor('ADMIN');
 for(const key of PRIVATE){
  await assertFails(db.ref(key).get());
  await assertFails(db.ref(key).set('FORGED'));
 }
});
test('anonymous and token missing appUser cannot read or write legacy riego',async()=>{
 for(const db of [actor(null),
  env.authenticatedContext('no-appuser',{role:'ADMIN'}).database()]){
  await assertFails(db.ref(ROOT1).get());
  await assertFails(db.ref(ROOT1).set('forged'));
  await assertFails(db.ref('lasala-tareas-v1').set('forged'));
 }
});
test('server may open another INV only through privileged lock storage, for controlled pilot',async()=>{
 await env.withSecurityRulesDisabled(async context=>
  context.database().ref(LOCKS+'/'+ROOT2).set('open'));
 const db=actor('TECNICO');
 await assertSucceeds(db.ref(ROOT2).set('synthetic pilot data'));
 await env.withSecurityRulesDisabled(async context=>
  context.database().ref(LOCKS+'/'+ROOT2).set('frozen'));
 await assertFails(db.ref(ROOT2).set('stale pilot write'));
});


test('G1/G2 proposed server-only authoritative aggregate denies every browser role and child path',async()=>{
 const root='lasala-riego-authority-v3';
 await env.withSecurityRulesDisabled(async ctx=>
  ctx.database().ref(root+'/INV_1').set({
   schema:'lasala-riego-authority/v1',acl:{FRAN:{role:'TECNICO'}},
   fence:{phase:'v3_active',epoch:2},grid:{CELL_1:'30 MIN'}
  }));
 for(const role of [null,...ROLES]){
  const db=actor(role);
  for(const target of [root,root+'/INV_1',root+'/INV_1/acl',
   root+'/INV_1/grid/CELL_1',root+'/INV_UNKNOWN']){
   await assertFails(db.ref(target).get());
   await assertFails(db.ref(target).set({forged:true}));
   await assertFails(db.ref(target).remove());
  }
 }
 const unauthenticated=env.authenticatedContext('without-appuser',{role:'ADMIN'}).database();
 await assertFails(unauthenticated.ref(root+'/INV_1').get());
 await assertFails(unauthenticated.ref(root+'/INV_1').set('forged'));
});
