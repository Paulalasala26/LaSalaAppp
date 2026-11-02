'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
let env;
const root='https://demo-lasala-phase1-default-rtdb.firebaseio.com';
const roles=['ADMIN','TECNICO','REGANTE','PEON','CARGADOR'];
const protectedKeys=['lasala-admin-audit-v1','lasala-config-infra-v1','lasala-qc-mediciones-v1','lasala-qc-fotos-sharepoint-v1'];
before(async()=>{
  assert.ok(process.env.FIREBASE_DATABASE_EMULATOR_HOST,'Run ONLY through Firebase Database Emulator');
  env=await initializeTestEnvironment({projectId:'demo-lasala-phase1',
    database:{rules:fs.readFileSync(__dirname+'/database.rules.test.candidate.phase1.json','utf8')}});
});
after(async()=>{if(env)await env.cleanup()});
function db(role){return role?env.authenticatedContext('tester-'+role,{appUser:'tester',role}).database():env.unauthenticatedContext().database()}
for(const role of [null,...roles]){
  test('four protected RTDB keys deny GET, PUT, PATCH, DELETE: '+(role||'ANONYMOUS'),async()=>{
    const database=db(role);
    for(const key of protectedKeys){
      const r=database.ref(key);
      await assertFails(r.get());
      await assertFails(r.set({securityEmulatorTest:true}));
      await assertFails(r.update({securityEmulatorTest:true}));
      await assertFails(r.remove());
    }
  });
  test('users denied, roles read only, wildcard existing policy: '+(role||'ANONYMOUS'),async()=>{
    const database=db(role);
    await assertFails(database.ref('lasala-users-v1').get());
    await assertFails(database.ref('lasala-users-v1').set({test:true}));
    if(role)await assertSucceeds(database.ref('lasala-roles-v1').get());
    else await assertFails(database.ref('lasala-roles-v1').get());
    await assertFails(database.ref('lasala-roles-v1').set({test:true}));
    if(role){
      await assertSucceeds(database.ref('phase1-unrestricted-smoke').set({test:true}));
      await assertSucceeds(database.ref('phase1-unrestricted-smoke').get());
    }else{
      await assertFails(database.ref('phase1-unrestricted-smoke').set({test:true}));
      await assertFails(database.ref('phase1-unrestricted-smoke').get());
    }
  });
}
test('authentication without appUser cannot write wildcard',async()=>{
  const d=env.authenticatedContext('no-app-user',{role:'ADMIN'}).database();
  await assertFails(d.ref('phase1-unrestricted-smoke').set({test:true}));
});
