'use strict';
// §0.252 - official disposable RTDB emulator, demo credentials only.
const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {PROJECT,makeEmulatorTransport}=require('./prototype-avisos-push-auth-emulator-v2.cjs');
const {ROOT,SCHEMA}=require('./prototype-riego-gateway-emulator-v3.cjs');
const {COORD,createEmulatorRevocationBarrier}=require('./prototype-revocation-barrier-emulator-v3.cjs');
const {uidForName}=require('./prototype-avisos-push-v2.cjs');
const FRAN=uidForName('FRAN'),VIGUERAS=uidForName('VIGUERAS');
let transport,barrier,env;
function aggregate(invId){
 return {schema:SCHEMA,version:1,invId,
  catalog:{active:true,managerApproved:true,sala:'sala1'},
  fence:{phase:'v3_active',epoch:1},
  acl:{
   [FRAN]:{appUser:'FRAN',role:'TECNICO',active:true,managerApproved:true,ops:['EDIT_RIEGO']},
   [VIGUERAS]:{appUser:'VIGUERAS',role:'ADMIN',active:true,managerApproved:true,grantManager:true}
  },
  grid:{CELL_1:{texto:'30 MIN',revisadoPorVigueras:false}},
  commands:{},proposals:{},receipts:{},events:{},outbox:{}
 };
}
const state=inv=>transport.retrieve([ROOT,inv]).then(x=>x.value);
const scope=(revId,invIds)=>({revId,targetUid:FRAN,invIds});
before(async()=>{
 assert.equal(process.env.FIREBASE_DATABASE_EMULATOR_HOST,'127.0.0.1:9000');
 assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON,undefined);
 assert.equal(process.env.FIREBASE_DATABASE_URL,undefined);
 transport=makeEmulatorTransport();
 barrier=createEmulatorRevocationBarrier({transport});
 env=await initializeTestEnvironment({projectId:PROJECT,database:{
  host:'127.0.0.1',port:9000,
  rules:fs.readFileSync(__dirname+'/database.rules.test.candidate.phase2-avisos-push.json','utf8')
 }});
});
after(async()=>{if(env)await env.cleanup()});
test('browser cannot access global coordinator or individual privileged authority',async()=>{
 const db=env.authenticatedContext(FRAN,{appUser:'FRAN'}).database();
 for(const dest of [COORD,COORD+'/R_BROWSER',ROOT+'/INV_BROWSER']){
  await assertFails(db.ref(dest).get());
  await assertFails(db.ref(dest).set({forged:true}));
 }
});
test('two INV durable fences, incomplete acknowledgement and idempotent recovery',async()=>{
 for(const inv of ['INV_RA','INV_RB'])
  assert.equal(await transport.insertIfMissing([ROOT,inv],aggregate(inv)),true);
 assert.equal((await barrier.begin(scope('R_ONE',['INV_RA','INV_RB']))).status,'revoking');
 assert.equal((await barrier.fence({revId:'R_ONE',invId:'INV_RA'})).status,'fenced');
 await assert.rejects(barrier.complete('R_ONE'),{code:'BARRIER_INCOMPLETE'});
 assert.deepEqual((await barrier.recover('R_ONE')).pending,['INV_RB']);
 assert.equal((await barrier.fence({revId:'R_ONE',invId:'INV_RA'})).status,'already_fenced');
 const a=await state('INV_RA');
 assert.equal(a.acl[FRAN].active,false);
 assert.equal(a.fence.epoch,2);
 await barrier.fence({revId:'R_ONE',invId:'INV_RB'});
 assert.equal((await barrier.complete('R_ONE')).status,'completed');
 assert.equal((await barrier.complete('R_ONE')).status,'already_completed');
 for(const inv of ['INV_RA','INV_RB'])
  assert.equal((await state(inv)).acl[FRAN].active,false);
});
test('crash after local CAS before global ack is resumable without second fence',async()=>{
 assert.equal(await transport.insertIfMissing([ROOT,'INV_CRASH'],aggregate('INV_CRASH')),true);
 await barrier.begin(scope('R_CRASH',['INV_CRASH']));
 let interrupted=false;
 const interruptedTransport={
  retrieve:(...args)=>transport.retrieve(...args),
  compareAndSwap:async(path,old,next)=>{
   if(path[0]===COORD&&next.acks?.INV_CRASH&&!interrupted){
    interrupted=true;
    throw new Error('SIMULATED_ACK_CRASH');
   }
   return transport.compareAndSwap(path,old,next);
  }
 };
 const crashBarrier=createEmulatorRevocationBarrier({transport:interruptedTransport});
 await assert.rejects(crashBarrier.fence({revId:'R_CRASH',invId:'INV_CRASH'}),
  /SIMULATED_ACK_CRASH/);
 assert.equal((await state('INV_CRASH')).fence.epoch,2);
 assert.deepEqual((await barrier.recover('R_CRASH')).pending,['INV_CRASH']);
 await barrier.fence({revId:'R_CRASH',invId:'INV_CRASH'});
 assert.equal((await state('INV_CRASH')).fence.epoch,2);
 assert.equal((await barrier.complete('R_CRASH')).status,'completed');
});
test('concurrent local revocation fences serialize using real ETags',async()=>{
 assert.equal(await transport.insertIfMissing([ROOT,'INV_CONCURRENT'],aggregate('INV_CONCURRENT')),true);
 await barrier.begin(scope('R_CONCURRENT',['INV_CONCURRENT']));
 const results=await Promise.all(Array.from({length:5},()=>barrier.fence({
  revId:'R_CONCURRENT',invId:'INV_CONCURRENT'
 })));
 assert.equal(results.filter(x=>x.status==='fenced').length,1);
 assert.equal(results.filter(x=>x.status==='already_fenced').length,4);
 assert.equal((await state('INV_CONCURRENT')).fence.epoch,2);
 assert.equal((await barrier.complete('R_CONCURRENT')).status,'completed');
});
