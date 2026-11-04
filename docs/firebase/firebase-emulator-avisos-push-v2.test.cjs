'use strict';
// OFFICIAL Firebase RTDB emulator only; never connected to live DB.
const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const PROJECT_ID='demo-lasala-phase2-alerts';
const HOST='127.0.0.1',PORT=9000;
const ROLES=['ADMIN','TECNICO','REGANTE','PEON','CARGADOR'];
const newPrivate=[
  'lasala-avisos-v2','lasala-push-subs-v2','lasala-push-endpoints-v2',
  'lasala-push-outbox-v2','lasala-push-weekly-v2','lasala-push-nonces-v2'
];
const oldPrivate=[
  'lasala-admin-audit-v1','lasala-config-infra-v1',
  'lasala-qc-mediciones-v1','lasala-qc-fotos-sharepoint-v1'
];
let env;
before(async()=>{
  assert.match(process.env.FIREBASE_DATABASE_EMULATOR_HOST||'',
    /^(127\.0\.0\.1|localhost):9000$/,'Must run on local emulator 127.0.0.1:9000');
  if(process.env.GCLOUD_PROJECT)assert.equal(process.env.GCLOUD_PROJECT,PROJECT_ID);
  env=await initializeTestEnvironment({
    projectId:PROJECT_ID,
    database:{host:HOST,port:PORT,
      rules:fs.readFileSync(__dirname+'/database.rules.test.candidate.phase2-avisos-push.json','utf8')}
  });
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.database();
    for(const key of [...newPrivate,...oldPrivate])
      await db.ref(key+'/probe').set({existing:true,secret:'synthetic-only'});
  });
});
after(async()=>{if(env)await env.cleanup()});
const db=role=>role?env.authenticatedContext('tester-'+role,{appUser:'tester',role}).database():
  env.unauthenticatedContext().database();
for(const role of [null,...ROLES]){
  test('all sensitive v2 roots deny reads/writes, including children: '+(role||'ANONYMOUS'),async()=>{
    const database=db(role);
    for(const key of newPrivate){
      for(const ref of [database.ref(key),database.ref(key+'/probe')]){
        await assertFails(ref.get());
        await assertFails(ref.set({synthetic:true}));
        await assertFails(ref.update({synthetic:true}));
        await assertFails(ref.remove());
      }
    }
  });
  test('existing phase1 private roots remain denied: '+(role||'ANONYMOUS'),async()=>{
    const database=db(role);
    for(const key of oldPrivate){
      await assertFails(database.ref(key).get());
      await assertFails(database.ref(key+'/probe').get());
      await assertFails(database.ref(key).set({synthetic:true}));
    }
  });
  test('legacy wildcard remains unchanged, NOT secured yet: '+(role||'ANONYMOUS'),async()=>{
    const database=db(role);
    const ref=database.ref('lasala-avisos-usuario-v1');
    const push=database.ref('lasala-push-subs-v1');
    if(role){
      await assertSucceeds(ref.set('synthetic-legacy-string'));
      await assertSucceeds(ref.get());
      await assertSucceeds(push.set('synthetic-legacy-string'));
      await assertSucceeds(push.get());
    }else{
      await assertFails(ref.get());await assertFails(ref.set('should-fail'));
      await assertFails(push.get());await assertFails(push.set('should-fail'));
    }
  });
}
test('account without appUser cannot exploit wildcard',async()=>{
  const database=env.authenticatedContext('no-app-user',{role:'ADMIN'}).database();
  await assertFails(database.ref('lasala-avisos-usuario-v1').get());
  await assertFails(database.ref('lasala-push-subs-v1').set({synthetic:true}));
});
test('new rules do not grant client access to user password hashes or role writes',async()=>{
  const database=db('ADMIN');
  await assertFails(database.ref('lasala-users-v1').get());
  await assertFails(database.ref('lasala-users-v1').set({synthetic:true}));
  await assertSucceeds(database.ref('lasala-roles-v1').get());
  await assertFails(database.ref('lasala-roles-v1').set({synthetic:true}));
});
