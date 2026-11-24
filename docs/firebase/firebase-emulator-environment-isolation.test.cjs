'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');

let env;
const PROJECT_ID='demo-lasala-env-isolation';
const EMULATOR_HOST='127.0.0.1';
const EMULATOR_PORT=9000;
const CANDIDATE='database.rules.environment-isolation.candidate.json';

before(async()=>{
  assert.ok(['127.0.0.1:9000','localhost:9000'].includes(process.env.FIREBASE_DATABASE_EMULATOR_HOST||''),
    'Run ONLY against the local RTDB emulator at 127.0.0.1:9000');
  if(process.env.GCLOUD_PROJECT)assert.equal(process.env.GCLOUD_PROJECT,PROJECT_ID);
  env=await initializeTestEnvironment({projectId:PROJECT_ID,
    database:{host:EMULATOR_HOST,port:EMULATOR_PORT,
      rules:fs.readFileSync(__dirname+'/'+CANDIDATE,'utf8')}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.database();
    await Promise.all([
      db.ref('test-operational/probe').set({seeded:true}),
      db.ref('prd/operational/probe').set({seeded:true}),
      db.ref('lasala-config-riego-opciones-v1/probe').set({seeded:true}),
      db.ref('lasala-gs-partes-v1/probe').set({seeded:true}),
      db.ref('lasala-tareas-v1/probe').set({seeded:true}),
      db.ref('prd/lasala-tareas-v1/probe').set({seeded:true}),
      db.ref('lasala-users-v1/probe').set({seeded:true}),
      db.ref('lasala-roles-v1/probe').set({seeded:true})
    ]);
  });
});
after(async()=>{if(env)await env.cleanup()});

function db(environment){
  return env.authenticatedContext('user-'+environment,{
    appUser:'operator',
    role:'ADMIN',
    viguerappEnv:environment
  }).database();
}
const testDb=()=>db('test');
const prdDb=()=>db('prd');

test('TEST can access its root operational data; PRD cannot',async()=>{
  await assertSucceeds(testDb().ref('test-operational/probe').get());
  await assertSucceeds(testDb().ref('test-operational/new').set({ok:true}));
  await assertFails(prdDb().ref('test-operational/probe').get());
  await assertFails(prdDb().ref('test-operational/new').set({ok:true}));
});

test('PRD can access only operational data under /prd; TEST cannot',async()=>{
  await assertSucceeds(prdDb().ref('prd/operational/probe').get());
  await assertSucceeds(prdDb().ref('prd/operational/new').set({ok:true}));
  await assertFails(testDb().ref('prd/operational/probe').get());
  await assertFails(testDb().ref('prd/operational/new').set({ok:true}));
  await assertFails(prdDb().ref('test-operational/probe').get());
});

test('shared configuration and GS feeds remain available to both environments',async()=>{
  for(const database of [testDb(),prdDb()]){
    await assertSucceeds(database.ref('lasala-config-riego-opciones-v1/probe').get());
    await assertSucceeds(database.ref('lasala-config-riego-opciones-v1/new').set({ok:true}));
    await assertSucceeds(database.ref('lasala-gs-partes-v1/probe').get());
    await assertSucceeds(database.ref('lasala-gs-partes-v1/new').set({ok:true}));
  }
});

test('shared roles are readable only; user credential node stays private',async()=>{
  for(const database of [testDb(),prdDb()]){
    await assertSucceeds(database.ref('lasala-roles-v1/probe').get());
    await assertFails(database.ref('lasala-roles-v1/new').set({ok:true}));
    await assertFails(database.ref('lasala-users-v1/probe').get());
    await assertFails(database.ref('lasala-users-v1/new').set({ok:true}));
  }
});

test('root tasks remain TEST-only; PRD tasks live under /prd',async()=>{
  await assertSucceeds(testDb().ref('lasala-tareas-v1/probe').get());
  await assertFails(testDb().ref('lasala-tareas-v1/new').set({ok:true}));
  await assertFails(prdDb().ref('lasala-tareas-v1/probe').get());
  await assertSucceeds(prdDb().ref('prd/lasala-tareas-v1/probe').get());
  await assertSucceeds(prdDb().ref('prd/lasala-tareas-v1/new').set({ok:true}));
});

test('missing or invalid environment claims cannot access app data',async()=>{
  const noClaim=env.authenticatedContext('no-env',{appUser:'operator',role:'ADMIN'}).database();
  const invalid=env.authenticatedContext('invalid-env',{
    appUser:'operator',role:'ADMIN',viguerappEnv:'dev'
  }).database();
  const anonymous=env.unauthenticatedContext().database();
  for(const database of [noClaim,invalid,anonymous]){
    await assertFails(database.ref('test-operational/probe').get());
    await assertFails(database.ref('prd/operational/probe').get());
    await assertFails(database.ref('lasala-config-riego-opciones-v1/probe').get());
  }
});
